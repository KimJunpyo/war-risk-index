"""15분 배치 진입점(#51): R2 받기 → live.update → 일별 갱신 → 응답 JSON 생성(publish) → R2 올리기.

GitHub Actions 러너처럼 실행마다 비어 있는 환경에서 돈다. 상태(data/·out/)는 R2 state/ 에서 받고, 끝나면 바뀐 파일만
다시 올린다(R2 무료 쓰기 월 100만 회). 응답 JSON(out/api)은 R2 api/ 로 올리고 Worker(#53)가 읽는다.

R2 키
- data/… → state/data/…, out/…(out/api 제외) → state/out/…, out/api/… → api/…
- 버킷 루트 manifest.json = {키: {"sha256": 16진수, "mtime": st_mtime_ns}}. 바뀐 파일 판정과 mtime 복원에 쓴다.
  받은 파일의 mtime 을 되돌리는 까닭: 여행경보·대피소·하루 재계산의 "하루 1회" 판단이 파일 mtime 에 기댄다.
- manifest 가 없으면(첫 업로드 전) 받기 실패로 끝난다. 첫 업로드는 #55.
- 배치는 state/ 를 지우지 않는다. 지우는 것은 publish 가 성공했을 때 사라진 api/ 키뿐이다.

환경변수: R2_ENDPOINT_URL, R2_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY(루트 .env 도 읽는다).
aws CLI 가 PATH 에 있어야 한다(Actions 러너에는 기본으로 깔려 있다). Python 의존성은 늘지 않는다.

프로젝트 루트에서 실행: python batch.py [--no-sync]
--no-sync 는 R2 없이 로컬 data/·out/ 만으로 돈다. 환경변수가 없는데 --no-sync 도 없으면 오류로 끝난다.
"""

import argparse
import hashlib
import json
import logging
import os
import shutil
import subprocess
import sys
import tempfile
import time
from fnmatch import fnmatchcase
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import live
import publish
from backend.app import main

ROOT = main.ROOT
# 상태로 올리는 폴더 → 올리지도 받지도 않는 것. 패턴은 그 폴더 기준 경로에 fnmatch 로 맞춘다(* 는 / 도 넘는다).
# aws --exclude 도 sync 원본 접두사(state/<폴더>/) 기준이라 같은 패턴을 그대로 넘긴다.
# 다시 받는 캐시·임시 다운로드 폴더, 원자적 쓰기·UCDP 다운로드(*.part)와 live.py(*.tmp)의 임시 파일.
# 두 폴더 밖(루트 .env·.git·.venv 등)은 보지도 받지도 않는다
TEMP_FILES = ("*.part", "*.tmp")
STATE_DIRS = {"data": ("gdelt_tmp/*", "npm_cache/*", *TEMP_FILES), "out": TEMP_FILES}
API_DIR = publish.OUT_DIR.relative_to(ROOT).as_posix()  # out/api: 응답 JSON. R2 에서는 api/ 아래
STATE_PREFIX, API_PREFIX = "state/", "api/"
MANIFEST_KEY = "manifest.json"
# 받기 때 out/api 로 미리 받는 지난 응답(available 값이 있는 것). 빈 러너에서도 publish 의 공공데이터 유실 가드가 작동하게
GUARDED_API = ("shelters/meta.json", "shelters/regions.json", "countries/*/embassies.json")
ENDPOINT_ENV, BUCKET_ENV = "R2_ENDPOINT_URL", "R2_BUCKET"
R2_ENV = (ENDPOINT_ENV, BUCKET_ENV, "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY")  # 키 두 개는 aws CLI 가 직접 읽는다
REGION = "auto"  # R2 는 region 을 auto 로 받는다
# aws CLI 의 새 기본 체크섬 동작을 필요할 때만으로 되돌린다. R2 에 꼭 필요한지는 확실하지 않음(조사 중이라 바뀔 수 있음)
AWS_ENV = {"AWS_REQUEST_CHECKSUM_CALCULATION": "when_required", "AWS_RESPONSE_CHECKSUM_VALIDATION": "when_required"}
DELETE_BATCH = 1000  # s3api delete-objects 한 번에 지울 수 있는 최대 키 수
AWS_TIMEOUT_SECONDS = 600  # aws 호출 하나의 제한 시간. 넘기면 실패로 친다

Manifest = dict[str, dict[str, Any]]  # {R2 키: {"sha256": 16진수, "mtime": st_mtime_ns}}
log = main.log
_aws_calls = 0  # 이번 실행의 aws 호출 수(측정 출력용)


def r2_key(rel: str) -> str:
    """저장소 기준 경로(data/…, out/…) → R2 키."""
    if rel.startswith(f"{API_DIR}/"):
        return API_PREFIX + rel.removeprefix(f"{API_DIR}/")
    return STATE_PREFIX + rel


def local_path(root: Path, key: str) -> Path:
    """R2 키 → 로컬 파일 경로(r2_key 의 반대)."""
    if key.startswith(API_PREFIX):
        return root / API_DIR / key.removeprefix(API_PREFIX)
    return root / key.removeprefix(STATE_PREFIX)


def build_manifest(root: Path) -> Manifest:
    """로컬 data/·out/ 의 파일별 sha256·mtime. mtime 은 정수 ns 다(float 초는 되돌릴 때 끝자리가 달라질 수 있음)."""
    manifest: Manifest = {}
    for top, excludes in STATE_DIRS.items():
        for path in (root / top).rglob("*"):
            rel = path.relative_to(root / top).as_posix()
            if path.is_file() and not any(fnmatchcase(rel, pattern) for pattern in excludes):
                with path.open("rb") as f:
                    digest = hashlib.file_digest(f, "sha256").hexdigest()
                manifest[r2_key(f"{top}/{rel}")] = {"sha256": digest, "mtime": path.stat().st_mtime_ns}
    return manifest


def restore_mtimes(root: Path, manifest: Manifest) -> None:
    """받은 파일의 mtime 을 manifest 값으로 되돌린다(aws 는 R2 의 LastModified 로 맞춘다)."""
    for key, entry in manifest.items():
        path = local_path(root, key)
        if path.is_file():
            os.utime(path, ns=(entry["mtime"], entry["mtime"]))


def _mask(text: str) -> str:
    """aws 오류 문구에서 엔드포인트(URL 전체와 호스트)와 키 값을 가린다."""
    endpoint = os.environ.get(ENDPOINT_ENV, "")
    for value, label in ((endpoint, f"${ENDPOINT_ENV}"), (urlparse(endpoint).netloc, "<R2 호스트>"),
                         (os.environ.get("AWS_ACCESS_KEY_ID", ""), "$AWS_ACCESS_KEY_ID"),
                         (os.environ.get("AWS_SECRET_ACCESS_KEY", ""), "$AWS_SECRET_ACCESS_KEY")):
        if value:  # 빈 문자열로 replace 하면 글자 사이마다 끼워 넣는다
            text = text.replace(value, label)
    return text


def _aws(*args: str) -> str:
    """aws CLI 를 R2 에 대고 부르고 표준 출력을 돌려준다. 실패·시간 초과는 RuntimeError.

    명령줄(엔드포인트가 들어 있음)은 메시지에 넣지 않고 aws 오류 문구도 _mask 로 가린다(비밀값을 출력·로그에 남기지 않도록).
    """
    global _aws_calls
    _aws_calls += 1
    name = " ".join(args[:2])  # 예: s3 cp
    try:
        proc = subprocess.run(["aws", *args, "--endpoint-url", os.environ[ENDPOINT_ENV], "--region", REGION],
                              env={**os.environ, **AWS_ENV}, capture_output=True, encoding="utf-8", errors="replace",
                              timeout=AWS_TIMEOUT_SECONDS)
    except subprocess.TimeoutExpired:
        # from None: TimeoutExpired 메시지의 명령줄이 로그 traceback 에 남지 않게 한다
        raise RuntimeError(f"aws {name} 시간 초과({AWS_TIMEOUT_SECONDS}초)") from None
    if proc.returncode:
        raise RuntimeError(f"aws {name} 실패(종료 코드 {proc.returncode}): {_mask(proc.stderr.strip())}")
    return proc.stdout


def _filter_args(option: str, patterns: tuple[str, ...]) -> list[str]:
    """("--exclude", ("a", "b")) → ["--exclude", "a", "--exclude", "b"]"""
    return [arg for pattern in patterns for arg in (option, pattern)]


def download(root: Path) -> Manifest:
    """R2 → 로컬: manifest, state/data/·state/out/(→ data/·out/), 공공데이터 응답(GUARDED_API).

    sync 가 0 으로 끝나도 manifest 의 state/ 키가 하나라도 로컬에 없으면 받기 실패다(덜 받은 상태로 돌고 올리지 않도록).
    받은 파일의 mtime 은 manifest 값으로 되돌린다.
    """
    bucket = f"s3://{os.environ[BUCKET_ENV]}/"
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp, MANIFEST_KEY)
        _aws("s3", "cp", bucket + MANIFEST_KEY, str(path))
        manifest: Manifest = json.loads(path.read_text(encoding="utf-8"))
    for top, excludes in STATE_DIRS.items():  # 저장소 루트 전체(.git·.venv 등)를 훑지 않도록 폴더별로 받는다
        _aws("s3", "sync", f"{bucket}{STATE_PREFIX}{top}/", str(root / top), *_filter_args("--exclude", excludes))
    missing = sorted(k for k in manifest if k.startswith(STATE_PREFIX) and not local_path(root, k).is_file())
    if missing:
        raise RuntimeError(f"R2 받기가 덜 끝남: manifest 의 state/ 키 {len(missing)}개가 로컬에 없음({missing[0]} 등)")
    _aws("s3", "cp", bucket + API_PREFIX, str(root / API_DIR), "--recursive", "--exclude", "*",
         *_filter_args("--include", GUARDED_API))
    restore_mtimes(root, manifest)
    return manifest


def upload(root: Path, remote: Manifest, include_api: bool) -> None:
    """로컬 → R2: 새 파일·내용이 바뀐 파일만 aws 한 번으로 올리고, 로컬에 없는 api/ 키는 지운 뒤, manifest 를 마지막에 올린다.

    내용이 같고 mtime 만 바뀐 파일은 올리지 않고 manifest 의 mtime 만 고친다.
    state/ 는 지우지 않는다. 로컬에 없으면 R2 객체와 manifest 항목을 그대로 두고 경고만 남긴다(다음 받기 때 다시 내려온다).
    include_api=False(publish 실패)면 api/ 도 올리지도 지우지도 않고 manifest 의 api/ 항목도 그대로 둔다.
    그때 out/api 에는 받아 둔 공공데이터 응답만 있거나 아무것도 없을 수 있다.
    중간에 실패하면 manifest 를 올리지 않으므로 다음 실행이 같은 파일을 다시 올리고 지운다.
    """
    local = build_manifest(root)
    if not include_api:
        local = {k: v for k, v in local.items() if not k.startswith(API_PREFIX)}
        local |= {k: v for k, v in remote.items() if k.startswith(API_PREFIX)}
    kept = {k: v for k, v in remote.items() if k not in local and not k.startswith(API_PREFIX)}
    if kept:
        log.warning("로컬에 없는 state/ 키 %d개(%s 등)는 지우지 않고 R2 에 둔다", len(kept), min(kept))
        local |= kept
    changed = [k for k, v in local.items() if remote.get(k, {}).get("sha256") != v["sha256"]]
    gone = [k for k in remote if k not in local]  # api/ 키만 남는다
    bucket = os.environ[BUCKET_ENV]
    with tempfile.TemporaryDirectory() as tmp:
        if changed:
            staging = Path(tmp, "files")
            for key in changed:
                dest = staging / key
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(local_path(root, key), dest)
            # 버킷 루트로 sync 하면 버킷 전체를 나열(List, Class A)하므로 cp --recursive 로 올린다
            _aws("s3", "cp", str(staging), f"s3://{bucket}/", "--recursive")
        request = Path(tmp, "delete.json")
        for i in range(0, len(gone), DELETE_BATCH):
            # ensure_ascii 기본값: aws CLI 가 로케일 인코딩으로 읽어도 한글 키가 깨지지 않게
            request.write_text(json.dumps({"Objects": [{"Key": k} for k in gone[i:i + DELETE_BATCH]], "Quiet": True}),
                               encoding="utf-8")
            out = _aws("s3api", "delete-objects", "--bucket", bucket, "--delete", f"file://{request}",
                       "--output", "json")
            errors = json.loads(out or "{}").get("Errors")
            if errors:  # 종료 코드가 0 이어도 키별 실패가 올 수 있다. manifest 를 올리지 않아 다음 실행이 다시 지운다
                raise RuntimeError(f"R2 삭제 실패 {len(errors)}건: {errors[0].get('Key')} 외")
        if local != remote:
            path = Path(tmp, MANIFEST_KEY)
            path.write_text(json.dumps(local, ensure_ascii=False, sort_keys=True, separators=(",", ":")),
                            encoding="utf-8")
            _aws("s3", "cp", str(path), f"s3://{bucket}/{MANIFEST_KEY}")
    print(f"R2 올리기: 올린 키 {len(changed)}개, 지운 키 {len(gone)}개, manifest {'올림' if local != remote else '그대로'}")


def run(sync: bool = True) -> int:
    """배치 한 번. 종료 코드를 돌려준다: 0 성공, 1 실패.

    단계 실패는 main._updater 와 같이 기록하고 다음 단계로 가며, 올리기까지 마친 뒤 1 을 돌려준다.
    받기가 실패하면 아무것도 돌리지 않는다. 덜 받은 상태로 돌고 올리면 R2 의 상태를 덮어쓰고 응답(api/)을 지우게 된다.
    """
    global _aws_calls
    started, _aws_calls = time.perf_counter(), 0
    missing = [name for name in R2_ENV if not os.environ.get(name)]
    if sync and missing:
        log.error("R2 환경변수 없음: %s. R2 없이 돌리려면 --no-sync", ", ".join(missing))
        return 1
    remote: Manifest = {}
    if sync:
        try:
            remote = download(ROOT)
        except Exception:
            log.exception("R2 받기 실패: 아무것도 돌리지 않고 끝냄")
            return 1
    # shortcut: _daily_refresh 는 아직 main.py 에 있다(_updater 도 부름), #55 에서 스레드를 지울 때 이 모듈로 옮길 것
    steps = {"live.update": live.update, "_daily_refresh": main._daily_refresh,
             "publish.run": lambda: publish.run(ROOT / API_DIR)}
    failed = []
    for name, job in steps.items():
        try:
            job()
        except Exception:  # 한 단계 실패가 다음 단계와 올리기를 막지 않도록(_updater 와 같음)
            log.exception("갱신 실패: %s", name)
            failed.append(name)
    if sync:
        try:
            upload(ROOT, remote, include_api="publish.run" not in failed)
        except Exception:
            log.exception("R2 올리기 실패")
            failed.append("R2 올리기")
    print(f"배치 끝: {time.perf_counter() - started:.1f}초, aws 호출 {_aws_calls}번"
          + (f", 실패: {', '.join(failed)}" if failed else ""))
    return 1 if failed else 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="15분 배치: R2 받기 → 갱신 → 응답 생성 → R2 올리기")
    parser.add_argument("--no-sync", action="store_true", help="R2 받기·올리기 없이 로컬 data/·out/ 만으로 돈다")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    sys.exit(run(sync=not args.no_sync))

"""M12 이슈 #51 배치 진입점(batch.py)과 R2 상태 동기화 테스트.

네트워크와 실제 aws CLI 는 쓰지 않는다. subprocess.run 을 메모리 버킷({키: 바이트})을 쓰는 가짜 aws(FakeAws)로 바꾸고,
batch.ROOT 는 tmp 폴더로 옮긴다. 갱신 단계(live.update, main._daily_refresh, publish.run)도 가짜다.

계약 (구현은 이 계약을 따른다)
- 키: data/… → state/data/…, out/…(out/api 제외) → state/out/…, out/api/… → api/…, 버킷 루트 manifest.json.
  manifest = {키: {"sha256": 16진수, "mtime": st_mtime_ns}}.
- 제외: data/gdelt_tmp/, data/npm_cache/, *.part, *.tmp. data/·out/ 밖(루트 .env·.git·.venv 등)은 보지도 받지도 않는다.
- 받기: manifest → state/data/ → data/, state/out/ → out/ (sync 두 번, 제외 패턴은 원본 접두사 기준)
  → out/api 로 공공데이터 응답(shelters/meta·regions, countries/*/embassies)만. 받은 파일 mtime 은 manifest 값으로 되돌린다.
  sync 가 0 으로 끝나도 manifest 의 state/ 키가 하나라도 로컬에 없으면 받기 실패다.
  받기가 실패하면(시간 초과 포함) 아무것도 돌리지 않고, 아무것도 올리지 않고, 0 이 아닌 종료 코드.
- 올리기: sha256 이 manifest 와 다른 파일(새 파일 포함)만 aws s3 cp --recursive 한 번으로 올리고, manifest 는 바뀌었을 때만
  맨 마지막에 올린다. mtime 만 바뀐 파일은 manifest 만 고친다.
  지우기는 로컬에 없는 api/ 키에만, publish 가 성공했을 때만 한다(s3api delete-objects, 1000개씩).
  로컬에 없는 state/ 키는 R2 객체와 manifest 항목을 그대로 두고 경고만 남긴다(다음 받기 때 다시 내려온다).
  publish 가 실패하면 api/ 는 올리지도 지우지도 않고 manifest 의 api/ 항목도 그대로 둔다(state/ 는 올린다).
- 단계 실패는 main._updater 처럼 기록하고 다음 단계·올리기로 간다. 실패가 있으면 종료 코드 1.
- 모든 aws 호출: --endpoint-url $R2_ENDPOINT_URL --region auto, 환경에 체크섬 변수 2개(when_required),
  subprocess.run 의 timeout=batch.AWS_TIMEOUT_SECONDS. 넘기면 실패로 친다.
  출력·로그에 엔드포인트(URL 전체와 호스트), 키 ID, 비밀 키를 남기지 않는다(시간 초과 때의 명령줄 포함).
- R2 환경변수가 없으면 run(sync=False)(--no-sync) 가 아닌 한 아무것도 하지 않고 실패한다.

가짜 aws 가 흉내 내는 것 (실제 aws CLI·R2 동작은 테스트 버킷에서 따로 확인한다)
- s3 cp/sync 받기: 버킷 → 로컬. 받은 파일 mtime 은 지금(실제 aws 는 LastModified). 없는 단일 키는 종료 코드 1.
  --exclude·--include 는 원본 기준 상대 경로에 fnmatch 로 맞추고 뒤에 온 것이 이긴다(aws 와 같음, * 는 / 도 넘는다).
- s3 cp 올리기: 로컬 → 버킷. s3api delete-objects: --delete file://<JSON> 의 키를 지우고, delete_errors 의 키는 Errors 로 돌려준다.
- 실패(fail)의 stderr 에는 엔드포인트·호스트·키 ID·비밀 키를 넣고, 시간 초과(timeout)는 명령줄을 담은 TimeoutExpired 를 낸다.
- 계약 위반 호출(엔드포인트·region·체크섬 변수·제한 시간 없음)은 pytest.fail
  (BaseException 이라 배치의 except Exception 에 묻히지 않음).

인수 조건 → 테스트
- 키 매핑과 제외 규칙: test_keys_and_excludes
- 새 파일·같은 파일·바뀐 파일·지운 파일(state/ 는 남기고 경고, api/ 는 지움)·mtime 만 바뀐 파일:
  test_upload_compares_with_manifest, test_upload_nothing_when_unchanged
- 1000개씩 지우기, 지우기 일부 실패: test_delete_in_batches, test_delete_errors_keep_old_manifest
- mtime 복원, 폴더별 sync와 원본 기준 제외, 받는 범위: test_download_restores_mtime_and_guarded_api
- 받기 실패(manifest 없음·sync 실패·시간 초과·덜 받음)면 중단하고 아무것도 올리지 않음, 비밀값 가림: test_download_failure_stops
- publish 실패면 api/ 를 올리지도 지우지도 않음: test_publish_failure_keeps_api
- 두 번째 실행은 바뀐 파일만 올림(명령 인수 조건의 가짜 버킷 판): test_run_uploads_only_changes
- 단계 실패에도 계속: test_step_failure_continues / 환경변수 없음: test_missing_env_needs_no_sync
"""

import hashlib
import json
import os
import subprocess
from fnmatch import fnmatchcase
from pathlib import Path

import pytest

import batch
import live
import publish
from backend.app import main

ENDPOINT = "https://r2.example.test"  # 가짜 엔드포인트. URL 도 호스트(HOST)도 출력·로그에 나오면 안 된다
HOST = "r2.example.test"
BUCKET = "war-risk-test"
KEY_ID, SECRET = "fake-key-id", "fake-secret-value"  # 가짜 키 ID·비밀 키. 출력·로그에 나오면 안 된다
HIDDEN = (ENDPOINT, HOST, KEY_ID, SECRET)
R2_ENV = {"R2_ENDPOINT_URL": ENDPOINT, "R2_BUCKET": BUCKET, "AWS_ACCESS_KEY_ID": KEY_ID,
          "AWS_SECRET_ACCESS_KEY": SECRET}
CHECKSUM_ENV = {"AWS_REQUEST_CHECKSUM_CALCULATION": "when_required",
                "AWS_RESPONSE_CHECKSUM_VALIDATION": "when_required"}
S3 = f"s3://{BUCKET}/"
OLD_NS = 1_700_000_000_000_000_000  # 지난 상태 파일의 mtime(ns, NTFS 100ns 단위). 받은 직후(지금)와 다르다
DAY_NS = 86_400 * 10**9
# 지난 실행(VM)이 남긴 상태와 응답(out/api 기준)
STATE_FILES = {"data/live/country_15min.csv": "key\n1\n", "data/travel_advisory.csv": "iso3\nKOR\n",
               "out/country_meta.csv": "code\nKOR\n"}
API_FILES = {"pairs.json": "[]", "shelters/meta.json": '{"available":true}',
             "shelters/regions.json": '{"available":true,"regions":[]}',
             "countries/KOR/embassies.json": '{"available":true}', "countries/KOR/index.json": "[]",
             "shelters/tiles/1_2.json": "[]"}
VM_FILES = {**STATE_FILES, **{f"out/api/{rel}": text for rel, text in API_FILES.items()}}
# 받기 때 out/api 로 받는 응답(available 값이 있는 것)
GUARDED = ["out/api/countries/KOR/embassies.json", "out/api/shelters/meta.json", "out/api/shelters/regions.json"]
NEW_LIVE = "key\n2\n"  # 가짜 live.update 가 쓰는 내용
STALE_TILE = "shelters/tiles/1_2.json"
# 가짜 publish 가 쓰는 응답: pairs.json 만 바뀌고 대피소 타일 하나가 없어졌다
PUBLISHED = {**{k: v for k, v in API_FILES.items() if k != STALE_TILE}, "pairs.json": "[1]"}
STEPS = ["live.update", "_daily_refresh", "publish"]


def _parse(tokens: list[str]) -> tuple[list[str], dict[str, str], list[tuple[str, str]]]:
    """aws 인자 → (위치 인자, 옵션 값, --exclude·--include 를 나온 순서대로)."""
    args: list[str] = []
    opts: dict[str, str] = {}
    filters: list[tuple[str, str]] = []
    it = iter(tokens)
    for tok in it:
        if tok == "--recursive":
            opts[tok] = ""
        elif tok in ("--exclude", "--include"):
            filters.append((tok, next(it)))
        elif tok.startswith("--"):
            opts[tok] = next(it)
        else:
            args.append(tok)
    return args, opts, filters


def _selected(rel: str, filters: list[tuple[str, str]]) -> bool:
    """aws 필터: 처음엔 모두 포함하고, 맞는 필터 중 뒤에 온 것이 이긴다."""
    keep = True
    for option, pattern in filters:
        if fnmatchcase(rel, pattern):
            keep = option == "--include"
    return keep


def _put(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)


class FakeAws:
    """subprocess.run 대신 불리는 가짜 aws. calls 에 aws 뒤 위치 인자(하위 명령·원본·대상)를 남긴다."""

    def __init__(self) -> None:
        self.bucket: dict[str, bytes] = {}
        self.calls: list[list[str]] = []
        self.uploaded: list[str] = []  # 올린 키(순서대로)
        self.deleted: list[list[str]] = []  # delete-objects 한 번마다 지우라고 한 키
        self.fail: str | None = None  # 이 하위 명령("cp"·"sync" 등)이 오면 종료 코드 1
        self.timeout: str | None = None  # 이 하위 명령이 오면 TimeoutExpired
        self.delete_errors: set[str] = set()  # delete-objects 가 Errors 로 돌려줄 키

    def __call__(self, cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess:
        env = kwargs.get("env") or {}
        args, opts, filters = _parse(cmd[1:])
        if cmd[0] != "aws" or opts.get("--endpoint-url") != ENDPOINT or opts.get("--region") != "auto":
            pytest.fail(f"엔드포인트·region 없는 aws 호출: {args}")
        if any(env.get(name) != value for name, value in CHECKSUM_ENV.items()):
            pytest.fail(f"체크섬 환경변수 없는 aws 호출: {args}")
        if not kwargs.get("timeout") or kwargs["timeout"] != getattr(batch, "AWS_TIMEOUT_SECONDS", None):
            pytest.fail(f"제한 시간(AWS_TIMEOUT_SECONDS) 없는 aws 호출: {args}")
        self.calls.append(args)
        if args[1] == self.timeout:
            raise subprocess.TimeoutExpired(cmd, kwargs["timeout"])  # 메시지에 명령줄(엔드포인트 포함)이 든다
        if args[1] == self.fail:
            return subprocess.CompletedProcess(cmd, 1, "", f"가짜 실패: {ENDPOINT} 연결 안 됨(호스트 {HOST}, "
                                                           f"키 {KEY_ID}, 서명 {SECRET})")
        if args[0] == "s3api":
            return self._delete(cmd, opts)
        src, dst = args[2], args[3]
        if src.startswith(S3) and args[1] == "cp" and "--recursive" not in opts:  # 키 하나 받기
            key = src.removeprefix(S3)
            if key not in self.bucket:
                return subprocess.CompletedProcess(cmd, 1, "", f"(404) {key} 없음")
            _put(Path(dst), self.bucket[key])
        elif src.startswith(S3):  # sync·cp --recursive 받기
            prefix = src.removeprefix(S3)
            for key, data in list(self.bucket.items()):
                if key.startswith(prefix) and _selected(key.removeprefix(prefix), filters):
                    _put(Path(dst) / key.removeprefix(prefix), data)
        else:  # 올리기
            prefix = dst.removeprefix(S3)
            files = ([(p, prefix + p.relative_to(src).as_posix()) for p in Path(src).rglob("*") if p.is_file()]
                     if "--recursive" in opts else [(Path(src), prefix)])
            for path, key in files:
                self.bucket[key] = path.read_bytes()
                self.uploaded.append(key)
        return subprocess.CompletedProcess(cmd, 0, "", "")

    def _delete(self, cmd: list[str], opts: dict[str, str]) -> subprocess.CompletedProcess:
        if opts.get("--bucket") != BUCKET:
            pytest.fail(f"다른 버킷 지우기: {opts.get('--bucket')}")
        request = json.loads(Path(opts["--delete"].removeprefix("file://")).read_text(encoding="utf-8"))
        keys = [obj["Key"] for obj in request["Objects"]]
        self.deleted.append(keys)
        for key in keys:
            if key not in self.delete_errors:
                self.bucket.pop(key, None)
        errors = [{"Key": key, "Code": "InternalError"} for key in keys if key in self.delete_errors]
        return subprocess.CompletedProcess(cmd, 0, json.dumps({"Errors": errors}) if errors else "", "")


@pytest.fixture
def aws(monkeypatch: pytest.MonkeyPatch) -> FakeAws:
    """가짜 aws 와 R2 환경변수(가짜 값)."""
    fake = FakeAws()
    monkeypatch.setattr(subprocess, "run", fake)  # batch 는 subprocess.run 을 모듈 속성으로 부른다
    for name, value in R2_ENV.items():
        monkeypatch.setenv(name, value)
    return fake


@pytest.fixture
def runner(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """빈 러너: batch.ROOT 를 비어 있는 tmp 폴더로 옮긴다."""
    root = tmp_path / "runner"
    root.mkdir()
    monkeypatch.setattr(batch, "ROOT", root)
    return root


def _write(root: Path, rel: str, text: str, mtime_ns: int | None = None) -> Path:
    """줄바꿈을 바꾸지 않도록 바이트로 쓴다."""
    path = root / rel
    _put(path, text.encode("utf-8"))
    if mtime_ns is not None:
        os.utime(path, ns=(mtime_ns, mtime_ns))
    return path


def _files(root: Path) -> list[str]:
    return sorted(p.relative_to(root).as_posix() for p in root.rglob("*") if p.is_file())


def _api(entries: dict) -> dict:
    return {k: v for k, v in entries.items() if k.startswith("api/")}


def _seed(aws: FakeAws, tmp_path: Path) -> dict:
    """지난 실행(VM)의 상태와 응답을 버킷에 올려 두고 그 manifest 를 돌려준다. 가짜 aws 기록은 비운다."""
    vm = tmp_path / "vm"
    for rel, text in VM_FILES.items():
        _write(vm, rel, text, OLD_NS)
    batch.upload(vm, {}, include_api=True)
    aws.calls.clear()
    aws.uploaded.clear()
    return json.loads(aws.bucket["manifest.json"])


def _fake_steps(monkeypatch: pytest.MonkeyPatch, publish_error: Exception | None = None) -> list[str]:
    """세 단계를 가짜로 바꾸고, 부른 순서를 담을 목록을 돌려준다.

    live.update 는 상태 파일 하나를 바꾸고, publish.run(out_dir) 은 PUBLISHED 를 쓰거나 publish_error 를 낸다.
    """
    calls: list[str] = []

    def update() -> None:
        calls.append("live.update")
        _write(batch.ROOT, "data/live/country_15min.csv", NEW_LIVE)

    def daily_refresh() -> None:
        calls.append("_daily_refresh")

    def run(out_dir: Path) -> None:
        calls.append("publish")
        if publish_error is not None:
            raise publish_error
        for rel, text in PUBLISHED.items():
            _write(out_dir, rel, text)

    monkeypatch.setattr(live, "update", update)
    monkeypatch.setattr(main, "_daily_refresh", daily_refresh)
    monkeypatch.setattr(publish, "run", run)
    return calls


# ---------- 키와 manifest ----------

def test_keys_and_excludes(tmp_path: Path) -> None:
    """data/·out/ 의 파일만 키로 바꾸고, 임시 폴더·임시 파일과 그 밖의 파일(루트 .env 등)은 뺀다. 키 → 경로가 되돌아온다."""
    kept = {"data/shelters.csv": "state/data/shelters.csv",
            "data/live/country_15min.csv": "state/data/live/country_15min.csv",
            "data/ucdp/ged.zip": "state/data/ucdp/ged.zip",
            "out/index_v1.csv": "state/out/index_v1.csv",
            "out/api.csv": "state/out/api.csv",  # out/api 폴더가 아니다
            "out/api/pairs.json": "api/pairs.json",
            "out/api/shelters/region/서울특별시.json": "api/shelters/region/서울특별시.json"}
    dropped = ["data/gdelt_tmp/v2_20261113.zip", "data/npm_cache/_cacache/index-v5/00", "out/index_v1.csv.part",
               "data/ucdp/ged.zip.part", "data/live/country_15min.tmp", ".env", "backend/app/main.py"]
    for rel in [*kept, *dropped]:
        _write(tmp_path, rel, rel)
    manifest = batch.build_manifest(tmp_path)
    assert sorted(manifest) == sorted(kept.values())
    for rel, key in kept.items():
        assert batch.local_path(tmp_path, key) == tmp_path / rel
        assert manifest[key] == {"sha256": hashlib.sha256(rel.encode()).hexdigest(),
                                 "mtime": (tmp_path / rel).stat().st_mtime_ns}


# ---------- 올리기 ----------

def test_upload_compares_with_manifest(aws: FakeAws, tmp_path: Path, caplog: pytest.LogCaptureFixture) -> None:
    """새 파일·바뀐 파일만 올리고, mtime 만 바뀐 파일은 manifest 만 고친다. manifest 는 맨 마지막.
    없어진 api/ 키는 지우고, 없어진 state/ 키는 지우지 않는다(R2 객체·manifest 항목을 그대로 두고 경고)."""
    root = tmp_path / "vm"
    for rel in ("data/same.csv", "data/changed.csv", "data/gone.csv", "data/touched.csv", "out/api/gone.json"):
        _write(root, rel, rel, OLD_NS)
    remote = batch.build_manifest(root)
    _write(root, "data/changed.csv", "바뀐 내용")
    (root / "data/gone.csv").unlink()
    (root / "out/api/gone.json").unlink()
    os.utime(root / "data/touched.csv", ns=(OLD_NS + DAY_NS, OLD_NS + DAY_NS))
    _write(root, "data/new.csv", "새 파일")
    batch.upload(root, remote, include_api=True)
    assert sorted(aws.uploaded[:-1]) == ["state/data/changed.csv", "state/data/new.csv"]
    assert aws.bucket["state/data/changed.csv"] == "바뀐 내용".encode()
    assert aws.deleted == [["api/gone.json"]]
    assert [c[1] for c in aws.calls] == ["cp", "delete-objects", "cp"]  # 파일은 aws 한 번, manifest 는 맨 마지막
    assert aws.calls[-1][3] == S3 + "manifest.json"
    manifest = json.loads(aws.bucket["manifest.json"])
    assert manifest == {**batch.build_manifest(root), "state/data/gone.csv": remote["state/data/gone.csv"]}
    assert [r.levelname for r in caplog.records if "state/data/gone.csv" in r.getMessage()] == ["WARNING"]
    assert manifest["state/data/same.csv"] == remote["state/data/same.csv"]
    assert manifest["state/data/touched.csv"] == {**remote["state/data/touched.csv"], "mtime": OLD_NS + DAY_NS}
    assert manifest["state/data/new.csv"]["sha256"] == hashlib.sha256("새 파일".encode()).hexdigest()


def test_upload_nothing_when_unchanged(aws: FakeAws, tmp_path: Path) -> None:
    """내용·mtime 이 manifest 와 같으면 aws 를 부르지 않는다(manifest 도 다시 올리지 않음)."""
    _write(tmp_path, "data/a.csv", "a", OLD_NS)
    batch.upload(tmp_path, batch.build_manifest(tmp_path), include_api=True)
    assert aws.calls == []


def test_delete_in_batches(aws: FakeAws, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """api/ 키 지우기: delete-objects 는 한 번에 1000개까지라 나눠 지운다(여기서는 2개씩으로 줄여 본다)."""
    assert batch.DELETE_BATCH == 1000
    monkeypatch.setattr(batch, "DELETE_BATCH", 2)
    remote = {f"api/countries/X{i}/index.json": {"sha256": "x", "mtime": 0} for i in range(5)}
    batch.upload(tmp_path, remote, include_api=True)
    assert [len(keys) for keys in aws.deleted] == [2, 2, 1]
    assert sorted(k for keys in aws.deleted for k in keys) == sorted(remote)
    assert json.loads(aws.bucket["manifest.json"]) == {}


def test_delete_errors_keep_old_manifest(aws: FakeAws, tmp_path: Path) -> None:
    """지우기가 일부 실패하면(종료 코드 0 + Errors) 예외로 끝나고 manifest 를 올리지 않는다(다음 실행이 다시 지움)."""
    remote = {"api/pairs.json": {"sha256": "x", "mtime": 0}}
    aws.delete_errors = {"api/pairs.json"}
    with pytest.raises(RuntimeError):
        batch.upload(tmp_path, remote, include_api=True)
    assert "manifest.json" not in aws.bucket


# ---------- 받기 ----------

def test_download_restores_mtime_and_guarded_api(aws: FakeAws, runner: Path, tmp_path: Path) -> None:
    """state/data/·state/out/ 와 공공데이터 응답만 받고, 받은 파일 mtime 을 manifest 값(VM 의 mtime)으로 되돌린다."""
    manifest = _seed(aws, tmp_path)
    # 손으로 올라간 임시 파일도 받지 않는다. 제외 패턴이 sync 원본 접두사(state/data/·state/out/) 기준인지 본다
    aws.bucket["state/data/gdelt_tmp/v2_x.zip"] = b"tmp"
    aws.bucket["state/out/index_v1.csv.part"] = b"part"
    assert batch.download(runner) == manifest
    assert _files(runner) == sorted([*STATE_FILES, *GUARDED])
    for rel in _files(runner):
        assert (runner / rel).stat().st_mtime_ns == OLD_NS, rel  # 받은 시각(LastModified)이 아니다
    assert [c[1] for c in aws.calls] == ["cp", "sync", "sync", "cp"]  # manifest, data/, out/, 공공데이터 응답
    # 저장소 루트 전체(.git·.venv 등)를 훑지 않도록 폴더별로 받는다
    assert [c[2:] for c in aws.calls if c[1] == "sync"] == [[S3 + "state/data/", str(runner / "data")],
                                                          [S3 + "state/out/", str(runner / "out")]]


@pytest.mark.parametrize("failing", ["manifest", "sync", "timeout", "incomplete"])
def test_download_failure_stops(aws: FakeAws, runner: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
                                capsys: pytest.CaptureFixture[str], caplog: pytest.LogCaptureFixture,
                                failing: str) -> None:
    """받기가 실패하면 갱신·응답 생성을 하나도 부르지 않고, 아무것도 올리거나 지우지 않고, 0 이 아닌 종료 코드다.
    출력·로그에 엔드포인트(URL·호스트)·키 ID·비밀 키가 없다.

    manifest: 빈 버킷(첫 업로드 전)이라 manifest.json 이 없다. sync: state/ 받기 중 연결 실패(stderr 에 비밀값).
    timeout: sync 가 제한 시간을 넘김(TimeoutExpired 메시지에 명령줄). incomplete: sync 는 0 으로 끝났지만
    manifest 의 state/ 키 하나가 R2 에 없어 로컬에도 없다.
    """
    if failing != "manifest":
        _seed(aws, tmp_path)
    if failing == "sync":
        aws.fail = "sync"
    elif failing == "timeout":
        aws.timeout = "sync"
    elif failing == "incomplete":
        del aws.bucket["state/out/country_meta.csv"]
    bucket = dict(aws.bucket)
    steps = _fake_steps(monkeypatch)
    assert batch.run() != 0
    assert steps == []
    assert aws.bucket == bucket
    assert not any(c[0] == "s3api" or c[3].startswith(S3) for c in aws.calls)  # 올리기·지우기 호출 없음
    out, err = capsys.readouterr()
    for hidden in HIDDEN:
        assert hidden not in out + err + caplog.text


# ---------- 배치 한 번 ----------

def test_publish_failure_keeps_api(aws: FakeAws, runner: Path, tmp_path: Path,
                                   monkeypatch: pytest.MonkeyPatch) -> None:
    """publish 가 실패하면(공공데이터 유실 가드 등) api/ 는 올리지도 지우지도 않고 state/ 만 올린다. 종료 코드는 0 이 아니다.
    out/api 에는 받아 둔 공공데이터 응답 3개뿐이라, 이 규칙이 없으면 나머지 api/ 키를 지우게 된다."""
    manifest = _seed(aws, tmp_path)
    api_objects = _api(aws.bucket)
    steps = _fake_steps(monkeypatch, publish_error=RuntimeError("공공데이터가 빠져 지난 응답을 지우게 됨"))
    assert batch.run() != 0
    assert steps == STEPS
    assert _api(aws.bucket) == api_objects
    assert aws.uploaded == ["state/data/live/country_15min.csv", "manifest.json"]
    assert aws.deleted == []
    assert _api(json.loads(aws.bucket["manifest.json"])) == _api(manifest)


def test_run_uploads_only_changes(aws: FakeAws, runner: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """정상 실행: 바뀐 상태·응답만 올리고 사라진 응답은 지운다. 새 빈 러너에서 한 번 더 돌리면 파일은 하나도 올리지 않는다."""
    _seed(aws, tmp_path)
    steps = _fake_steps(monkeypatch)
    assert batch.run() == 0
    assert steps == STEPS
    assert sorted(aws.uploaded[:-1]) == ["api/pairs.json", "state/data/live/country_15min.csv"]
    assert aws.uploaded[-1] == "manifest.json"
    assert aws.deleted == [[f"api/{STALE_TILE}"]]
    second = tmp_path / "runner2"
    second.mkdir()
    monkeypatch.setattr(batch, "ROOT", second)
    aws.uploaded.clear()
    aws.deleted.clear()
    assert batch.run() == 0
    # 같은 내용을 다시 썼을 뿐이라 파일은 올리지 않는다(바뀐 mtime 은 manifest 에만 반영)
    assert [key for key in aws.uploaded if key != "manifest.json"] == []
    assert aws.deleted == []


def test_step_failure_continues(aws: FakeAws, runner: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
                                caplog: pytest.LogCaptureFixture) -> None:
    """한 단계가 실패해도 _updater 처럼 기록하고 다음 단계와 올리기를 한다. 실패가 있었으니 종료 코드 1."""
    _seed(aws, tmp_path)
    steps = _fake_steps(monkeypatch)

    def broken() -> None:
        steps.append("live.update")
        raise OSError("가짜 GDELT 응답 없음")

    monkeypatch.setattr(live, "update", broken)
    assert batch.run() == 1
    assert steps == STEPS
    assert "api/pairs.json" in aws.uploaded
    assert "갱신 실패: live.update" in caplog.text


def test_missing_env_needs_no_sync(aws: FakeAws, runner: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """R2 환경변수가 없으면 --no-sync 없이는 아무것도 하지 않고 실패하고, --no-sync 면 R2 없이 세 단계를 돈다."""
    monkeypatch.delenv("R2_BUCKET")
    steps = _fake_steps(monkeypatch)
    assert batch.run() != 0
    assert steps == [] and aws.calls == []
    assert batch.run(sync=False) == 0
    assert steps == STEPS and aws.calls == []

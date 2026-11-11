"""이슈 #35(1-2 GDELT·UCDP 다운로드 타임아웃) 인수 테스트.

실제 네트워크·data/·out/ 는 쓰지 않는다. 127.0.0.1 의 테스트용 서버와 가짜 urlopen 만 쓰고,
상대 경로(ucdp 의 data/...)는 tmp_path 로 chdir 해서 격리한다.

계약 (구현은 이 계약을 따른다)

[gdelt_collect.py]
- 새 모듈 상수 DOWNLOAD_TIMEOUT_SECONDS = 120. 맨 위 상수 묶음(BASE_URL 등) 곁에 둔다.
- load_events(url, tmp): urllib.request.urlopen(url, timeout=DOWNLOAD_TIMEOUT_SECONDS) 로 받아
    shutil.copyfileobj 로 tmp 에 쓴다.
    시그니처, pd.read_csv 인자, finally 의 tmp.unlink(missing_ok=True) 는 그대로라 결과 표도 지금과 같다(열 6개, 열 이름 = COL_* 위치).
    실패하면 tmp 를 지우고 예외를 그대로 올린다. tmp 말고 다른 파일을 만들지 않는다.
    잘린 응답도 실패다. 크기 검사는 없어도 된다: 잘린 zip 은 read_csv 가 zipfile.BadZipFile 로 실패하고 finally 가 tmp 를 지운다.
    예전 urlretrieve 는 ContentTooShortError 였지만 호출부가 모두 except Exception 으로 받아 다음에 다시 시도하므로 동작은 같다.
    크기 검사를 넣는다면 ucdp 와 같은 ContentTooShortError 를 낸다.
    호출부(process, country_collect, live.fetch_slot·day_rows)는 바꾸지 않는다.
[ucdp.py]
- 기존 TIMEOUT_SECONDS = 60 을 쓴다(새 상수 없음).
- update(): 새 파일마다 urllib.request.urlopen(u, timeout=TIMEOUT_SECONDS) 로 받아 지금처럼 <파일>.part 에 쓰고 <파일> 로 교체한다.
    받을 URL 은 지금처럼 latest_urls() 로 얻는다(테스트는 latest_urls 를 바꿔 끼워 ucdp.uu.se 에 접속하지 않는다).
    실패하면 예외를 올리고 <파일> 은 생기지 않는다. 남은 .part 는 다음 실행이 덮어쓴다.
    잘린 응답이면 urllib.error.ContentTooShortError 를 내고 <파일> 로 교체하지 않는다(urlretrieve 와 같은 동작).
    교체해 버리면 다음 실행부터 p.exists() 라서 다시 받지 않는다. Content-Length 가 없으면 비교하지 않는다(urlretrieve 와 같음).
[공통]
- urllib.request.urlopen 으로 부른다. from urllib.request import urlopen 은 쓰지 않는다(테스트가 urllib.request.urlopen 을 바꿔 끼운다).
- timeout 은 키워드로 넘기고, 상수는 호출할 때 모듈 전역에서 읽는다(기본 인자로 굳히면 테스트의 상수 교체가 먹지 않는다).
- 다운로드 하나에 urlopen 을 한 번 부른다.
- 루트 *.py 와 backend/ 아래 *.py 에 urlretrieve·setdefaulttimeout 이 0건이다. 바이트 검색이라 주석·문자열도 센다.
  전역 socket.setdefaulttimeout 은 uvicorn 소켓에도 영향을 줄 수 있어 쓰지 않는다.
- 타임아웃의 뜻: 연결과 읽기가 각각 이 시간 동안 데이터 없이 멈추면 실패한다. 전체 다운로드 시간의 상한은 아니다.
- 잘린 응답(Content-Length 보다 덜 받고 연결이 닫힘)은 실패다. urlopen + copyfileobj 는 이때 예외 없이 끝난다
  (http.client HTTPResponse.read 가 IncompleteRead 대신 빈 바이트를 돌려줌). 그래서 모듈별로 위처럼 실패시킨다.

테스트 서버와 안전장치
- 잘린 응답: http_serve 에 보낼 바이트 수를 주면 Content-Length 는 전체 길이로 알리고 그만큼만 보낸 뒤 연결을 닫는다.
- 127.0.0.1 빈 포트에 listen 만 하는 소켓. 연결은 OS 대기열이 받지만 accept 도 응답도 하지 않는다.
- 상수를 1초로 바꾸고 다운로드를 데몬 스레드에서 부른 뒤 5초(인수 조건)만 join 한다. 그 안에 끝나지 않으면 실패.
  지금 코드(urlretrieve)는 타임아웃이 없어 여기서 실패한다. 남은 스레드는 테스트가 끝나며 소켓을 닫을 때
  연결이 끊겨(ConnectionResetError) 끝나고, 데몬이라 pytest 종료도 막지 않는다.
- 예외는 OSError 로 넓게 받는다. 응답 대기 중 시간 초과는 TimeoutError 가 그대로 오고, 연결·요청 전송 중이면 urllib 이
  URLError 로 감싸 올린다. 둘 다 OSError 다. TypeError 같은 구현 실수는 통과시키지 않는다.

수동(이 파일 밖): 백엔드를 멈춘 상태에서 .venv\\Scripts\\python.exe live.py 실행(실제 GDELT) → 새 슬롯 N개 출력.
"""

import http.server
import io
import socket
import threading
import urllib.error
import urllib.request
import zipfile
from collections.abc import Callable, Iterator
from http import HTTPStatus
from pathlib import Path
from types import ModuleType
from typing import NoReturn

import pandas as pd
import pytest

import gdelt_collect
import ucdp

ROOT = Path(__file__).resolve().parents[1]
HOST = "127.0.0.1"
FORBIDDEN = ["urlretrieve", "setdefaulttimeout"]  # 타임아웃 없는 다운로드, 전역 소켓 설정
GDELT_CONST, GDELT_SECONDS = "DOWNLOAD_TIMEOUT_SECONDS", 120  # gdelt_collect 에 새로 둔다
UCDP_CONST, UCDP_SECONDS = "TIMEOUT_SECONDS", 60  # ucdp 에 이미 있다
TEST_TIMEOUT_SECONDS = 1  # 응답 없는 서버 테스트에서 상수를 이 값으로 바꾼다
LIMIT_SECONDS = 5  # 인수 조건: 이 안에 예외로 끝난다. 안전장치의 join 제한 시간이기도 하다
ODD_TIMEOUT = 7.5  # 120·60·1 과 다른 값: 호출할 때 모듈 상수를 읽어 넘기는지 본다
FAKE_URL = "fake://download/events.csv"  # 가짜 urlopen 이 안 불려도(계약 위반) 접속 없이 바로 실패하는 scheme
UCDP_FILE = "GEDEvent_test.csv"  # latest_urls 가 돌려줄 URL 의 파일 이름 → data/ucdp/<이름>
# update 가 읽는 열(ucdp.COLUMNS)만 있는 최소 GED 파일. 잘린 응답 테스트는 UCDP_FIRST(머리줄+첫 행)까지만 보낸다.
# 행 경계에서 잘려, 크기 검사가 없으면 마지막 행이 빠진 채 집계가 성공해 버린다
UCDP_FIRST = (b"id,type_of_violence,country,date_start,date_end,best,side_a,side_b\n"
              b"1,1,Ukraine,2026-01-05,2026-01-05,10,Government of Russia (Soviet Union),Government of Ukraine\n")
UCDP_CSV = (UCDP_FIRST
            + b"2,1,Ukraine,2026-02-03,2026-02-03,5,Government of Russia (Soviet Union),Government of Ukraine\n")
GDELT_MEMBER = "20261110.export.CSV"  # zip 안 파일 이름(url_for 의 일별 파일 모양)
STALE_TMP_BYTES = b"partial zip"  # 지난 실행이 받다 만 임시 zip 내용
# load_events 가 읽는 6개 열 위치
GDELT_COLS = [gdelt_collect.COL_A1, gdelt_collect.COL_A2, gdelt_collect.COL_CODE, gdelt_collect.COL_ROOT,
              gdelt_collect.COL_QUAD, gdelt_collect.COL_MENTIONS]
N_COLUMNS = 40  # 읽는 열(최대 31번) 뒤에도 열이 더 있는 파일. 읽지 않는 칸은 열 번호로 채운다
GDELT_ROWS = [  # GDELT_COLS 순서의 값
    ("RUS", "UKR", "190", "19", "4", "12"),
    ("KOR", "", "1381", "13", "3", "2"),  # 빈 칸은 "" 로 읽는다(fillna)
    ("USA", "IRN", "150", "15", "4", "5"),
]


@pytest.fixture(autouse=True)
def _isolate(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """상대 경로(ucdp 의 data/...)는 tmp_path 아래로, 127.0.0.1 요청은 시스템 프록시를 거치지 않게 한다."""
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("no_proxy", HOST)


Serve = Callable[..., str]  # serve(경로, 바이트, 보낼 바이트 수=None) → URL


class _FileHandler(http.server.BaseHTTPRequestHandler):
    """server.files[경로] = (바이트, 보낼 바이트 수). Content-Length 는 전체 길이로 알리고 보낼 만큼만 200 으로 보낸다.

    HTTP/1.0 이라 보낸 뒤 연결을 닫으므로, 덜 보내면 잘린 응답이 된다. 없는 경로는 404.
    """

    def do_GET(self) -> None:
        if self.path not in self.server.files:
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        body, sent = self.server.files[self.path]
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body[:sent])  # sent 가 None 이면 전부

    def log_message(self, format: str, *args: object) -> None:
        """요청마다 stderr 에 찍는 접근 로그를 끈다."""


@pytest.fixture
def http_serve() -> Iterator[Serve]:
    """로컬 HTTP 서버(스레드). serve(경로, 바이트, 보낼 바이트 수=None) 로 파일을 올리면 그 URL 을 준다.

    보낼 바이트 수를 주면 잘린 응답이 된다. 같은 경로로 다시 부르면 응답을 바꾼다. 끝나면 서버와 스레드를 닫는다.
    """
    server = http.server.HTTPServer((HOST, 0), _FileHandler)
    server.files = {}
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    def serve(path: str, body: bytes, sent: int | None = None) -> str:
        server.files[path] = (body, sent)
        return f"http://{HOST}:{server.server_port}{path}"

    yield serve
    server.shutdown()
    server.server_close()
    thread.join()


@pytest.fixture
def silent_url() -> Iterator[str]:
    """연결은 받지만(OS listen 대기열) accept 도 응답도 하지 않는 서버의 기본 URL.

    끝나면 소켓을 닫는다. 안전장치로 남겨 둔 스레드의 연결도 이때 끊겨(ConnectionResetError) 스레드가 끝난다.
    """
    with socket.create_server((HOST, 0)) as sock:
        yield f"http://{HOST}:{sock.getsockname()[1]}"


@pytest.fixture
def gdelt_tmp(tmp_path: Path) -> Path:
    """load_events 의 임시 zip 경로. 호출부의 TMP_DIR / f"{key}.zip" 처럼 빈 폴더 안의 파일(절대 경로)."""
    folder = tmp_path / "gdelt_tmp"
    folder.mkdir()
    return folder / "20261110.zip"


class FakeUrlopenCalled(Exception):
    """가짜 urlopen 이 인자를 적은 뒤 내는 예외. 실제로 받지 않고 호출 모양만 본다."""


@pytest.fixture
def urlopen_calls(monkeypatch: pytest.MonkeyPatch) -> list[tuple[object, object]]:
    """urllib.request.urlopen 을 가짜로 바꾼다. 받은 (url, timeout 키워드)를 적고 FakeUrlopenCalled 를 낸다.

    지금 코드의 urlretrieve 도 안에서 urllib.request.urlopen(url, data) 를 부르므로 여기로 온다(timeout 키워드 없음 → None).
    """
    calls: list[tuple[object, object]] = []

    def fake(url: object, *args: object, **kwargs: object) -> NoReturn:
        calls.append((url, kwargs.get("timeout")))
        raise FakeUrlopenCalled

    monkeypatch.setattr(urllib.request, "urlopen", fake)
    return calls


def _call_with_limit(func: Callable[[], object]) -> BaseException | None:
    """안전장치: func 를 데몬 스레드에서 부르고 LIMIT_SECONDS 만 기다린다. func 가 낸 예외(없으면 None)를 돌려준다."""
    outcome: list[BaseException | None] = []

    def run() -> None:
        try:
            func()
        except BaseException as e:  # 스레드 밖으로 넘겨 테스트에서 본다
            outcome.append(e)
        else:
            outcome.append(None)

    worker = threading.Thread(target=run, daemon=True)
    worker.start()
    worker.join(LIMIT_SECONDS)
    assert not worker.is_alive(), f"{LIMIT_SECONDS}초 안에 끝나지 않음: 타임아웃 없이 응답을 기다린다"
    return outcome[0]


def _gdelt_zip() -> bytes:
    """GDELT export 모양 zip: 머리줄 없는 탭 구분 파일 1개. GDELT_ROWS 값을 GDELT_COLS 자리에 넣는다."""
    rows = [dict(zip(GDELT_COLS, values)) for values in GDELT_ROWS]
    text = "".join("\t".join(r.get(i, str(i)) for i in range(N_COLUMNS)) + "\n" for r in rows)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr(GDELT_MEMBER, text)
    return buf.getvalue()


# ---------- 정적 검사·상수 ----------

@pytest.mark.parametrize("word", FORBIDDEN)
def test_no_forbidden_name_in_python_sources(word: str) -> None:
    """루트 *.py 와 backend/ 아래 *.py 에 urlretrieve·setdefaulttimeout 이 0건(grep 처럼 주석·문자열도 센다)."""
    files = sorted([*ROOT.glob("*.py"), *(ROOT / "backend").rglob("*.py")])
    hits = [f"{p.relative_to(ROOT)}:{n}" for p in files
            for n, line in enumerate(p.read_bytes().splitlines(), 1) if word.encode() in line]
    assert hits == []


@pytest.mark.parametrize(("module", "name", "seconds"),
                         [(gdelt_collect, GDELT_CONST, GDELT_SECONDS), (ucdp, UCDP_CONST, UCDP_SECONDS)],
                         ids=["gdelt_collect", "ucdp"])
def test_timeout_constant(module: ModuleType, name: str, seconds: int) -> None:
    """타임아웃 상수가 계약 값이다. gdelt_collect 는 새 상수, ucdp 는 기존 상수."""
    assert getattr(module, name, None) == seconds


# ---------- 가짜 urlopen: timeout 키워드 ----------

def test_gdelt_urlopen_gets_timeout(urlopen_calls: list[tuple[object, object]], gdelt_tmp: Path,
                                    monkeypatch: pytest.MonkeyPatch) -> None:
    """load_events 가 urlopen 에 timeout=DOWNLOAD_TIMEOUT_SECONDS 를 키워드로 넘긴다(한 번, 호출할 때 읽은 값)."""
    # raising=False: 구현 전(상수 없음)에도 호출 모양까지 확인한다
    monkeypatch.setattr(gdelt_collect, GDELT_CONST, ODD_TIMEOUT, raising=False)
    with pytest.raises(FakeUrlopenCalled):
        gdelt_collect.load_events(FAKE_URL, gdelt_tmp)
    assert urlopen_calls == [(FAKE_URL, ODD_TIMEOUT)]


def test_ucdp_urlopen_gets_timeout(urlopen_calls: list[tuple[object, object]],
                                   monkeypatch: pytest.MonkeyPatch) -> None:
    """update 의 다운로드가 urlopen 에 timeout=TIMEOUT_SECONDS 를 키워드로 넘긴다(한 번, 호출할 때 읽은 값)."""
    monkeypatch.setattr(ucdp, UCDP_CONST, ODD_TIMEOUT)
    monkeypatch.setattr(ucdp, "latest_urls", lambda: [FAKE_URL])  # 목록 조회(ucdp.uu.se)를 건너뛴다
    with pytest.raises(FakeUrlopenCalled):
        ucdp.update()
    assert urlopen_calls == [(FAKE_URL, ODD_TIMEOUT)]


# ---------- 응답 없는 서버: 5초 안에 예외 ----------

def test_gdelt_silent_server_times_out(silent_url: str, gdelt_tmp: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """상수 1초에서 load_events 가 5초 안에 OSError 로 끝나고, 임시 zip(폴더 안 어떤 파일도)이 남지 않는다."""
    # raising=False: 구현 전(상수 없음)에도 호출까지 가서 실제로 멈추는지 안전장치로 확인한다
    monkeypatch.setattr(gdelt_collect, GDELT_CONST, TEST_TIMEOUT_SECONDS, raising=False)
    # 지난 실행이 남긴 임시 zip. tmp 를 urlopen 앞뒤 어디서 열든 실패 뒤 finally 가 지우는지 본다
    gdelt_tmp.write_bytes(STALE_TMP_BYTES)
    error = _call_with_limit(lambda: gdelt_collect.load_events(f"{silent_url}/{GDELT_MEMBER}.zip", gdelt_tmp))
    assert isinstance(error, OSError), repr(error)  # TimeoutError(응답 대기) 또는 URLError(연결·전송, urllib 이 감쌈)
    assert list(gdelt_tmp.parent.iterdir()) == []


def test_ucdp_silent_server_times_out(silent_url: str, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """상수 1초에서 update 의 다운로드가 5초 안에 OSError 로 끝나고, 받다 만 파일이 최종 이름으로 남지 않는다."""
    monkeypatch.setattr(ucdp, UCDP_CONST, TEST_TIMEOUT_SECONDS)
    monkeypatch.setattr(ucdp, "latest_urls", lambda: [f"{silent_url}/{UCDP_FILE}"])
    error = _call_with_limit(ucdp.update)
    assert isinstance(error, OSError), repr(error)
    assert not (tmp_path / ucdp.UCDP_DIR / UCDP_FILE).exists()  # 남으면 다음 실행이 받은 것으로 보고 건너뛴다


# ---------- 정상 응답: 지금과 같은 결과(지금 코드도 통과, 회귀 방지) ----------

def test_gdelt_normal_response_same_table(http_serve: Serve, gdelt_tmp: Path) -> None:
    """받은 zip 을 지금과 같은 표(열 6개 = COL_* 위치, 행 3개, 빈 칸 "")로 읽고 임시 zip 을 지운다."""
    url = http_serve(f"/{GDELT_MEMBER}.zip", _gdelt_zip())
    got = gdelt_collect.load_events(url, gdelt_tmp)
    pd.testing.assert_frame_equal(got, pd.DataFrame(GDELT_ROWS, columns=GDELT_COLS, dtype=str))
    assert list(gdelt_tmp.parent.iterdir()) == []


def test_ucdp_normal_response_saves_file(http_serve: Serve, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """update 가 받은 바이트를 그대로 data/ucdp/<이름> 에 두고(.part 없음) 집계를 다시 만든다(True)."""
    url = http_serve(f"/{UCDP_FILE}", UCDP_CSV)
    monkeypatch.setattr(ucdp, "latest_urls", lambda: [url])
    assert ucdp.update() is True
    folder = tmp_path / ucdp.UCDP_DIR
    assert sorted(p.name for p in folder.iterdir()) == [UCDP_FILE]
    assert (folder / UCDP_FILE).read_bytes() == UCDP_CSV


# ---------- 잘린 응답: Content-Length 보다 덜 받고 연결이 닫히면 실패 ----------

def test_gdelt_truncated_response_fails(http_serve: Serve, gdelt_tmp: Path) -> None:
    """잘린 zip 을 받으면 load_events 가 표를 돌려주지 않고 예외로 끝나며 임시 zip 이 남지 않는다."""
    data = _gdelt_zip()
    url = http_serve(f"/{GDELT_MEMBER}.zip", data, len(data) // 2)  # 절반만 보내고 닫는다
    # 크기 검사가 없으면 read_csv 의 BadZipFile, 검사를 넣었다면 ucdp 와 같은 ContentTooShortError
    with pytest.raises((zipfile.BadZipFile, urllib.error.ContentTooShortError)):
        gdelt_collect.load_events(url, gdelt_tmp)
    assert list(gdelt_tmp.parent.iterdir()) == []


def test_ucdp_truncated_response_fails_then_recovers(http_serve: Serve, tmp_path: Path,
                                                      monkeypatch: pytest.MonkeyPatch) -> None:
    """잘린 응답이면 update 가 ContentTooShortError 로 끝나고 최종 파일이 생기지 않는다.

    다음 실행이 정상 응답을 받으면 남은 .part 를 덮어써 최종 파일을 만든다.
    """
    url = http_serve(f"/{UCDP_FILE}", UCDP_CSV, len(UCDP_FIRST))
    monkeypatch.setattr(ucdp, "latest_urls", lambda: [url])
    with pytest.raises(urllib.error.ContentTooShortError):  # 예전 urlretrieve 가 내던 예외
        ucdp.update()
    folder = tmp_path / ucdp.UCDP_DIR
    assert not (folder / UCDP_FILE).exists()  # 남으면 다음 실행이 받은 것으로 보고 건너뛴다
    http_serve(f"/{UCDP_FILE}", UCDP_CSV)  # 같은 URL 이 이제 끝까지 보낸다
    assert ucdp.update() is True
    assert sorted(p.name for p in folder.iterdir()) == [UCDP_FILE]  # .part 는 덮어써 교체됐다
    assert (folder / UCDP_FILE).read_bytes() == UCDP_CSV

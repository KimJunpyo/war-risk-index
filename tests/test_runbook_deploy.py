"""이슈 #40(2-2 운영 런북 1: 서버 준비·첫 배포·업데이트·되돌리기) 인수 테스트.

deploy/RUNBOOK.md 를 글자로만 읽는다. 경로·포트·서비스 사용자는 하드코딩하지 않고 2-1 서비스 파일
(deploy/war-risk-api.service·war-risk-web.service)에서 읽어 비교한다. 유닛 읽기 함수와 서비스 정상 표본은
test_deploy_config.py(2-1 인수 테스트)의 것을 그대로 쓴다.

계약 (런북은 이 계약을 따른다)

[공통]
- UTF-8(BOM 없음). 줄은 splitlines 로 나눠 CRLF·LF 를 같게 본다.
- 코드 블록(``` 또는 ~~~ 울타리, 들여쓰기 자유) 안의 줄은 보지 않는다. bash 블록의 # 주석은 제목·표가 아니다.
    닫는 울타리는 여는 것과 같은 글자로 같거나 길고 뒤에 글이 없다(CommonMark).
- 제목 줄: 줄 처음(공백 3칸까지)에 # 1~3개, 공백, 제목 글. ####·#제목(# 뒤 공백 없음)·밑줄(===·---) 제목은 안 본다.
[절 제목] 제목 줄에 개요·서버 준비·첫 배포·업데이트·되돌리기 가 글자 그대로(띄어쓰기 포함) 있다.
    번호·앞뒤 글·단계·순서는 자유다(예: ## 1. 서버 준비).
[서버 규약 표]
- 개요 절: 제목에 개요가 든 첫 제목 줄부터 # 개수가 같거나 적은 다음 제목 줄 전까지. 하위 절(### 서버 규약)도 포함한다.
- 개요 절에서 | 로 시작하는 줄이 표 행이다. 칸은 | 로 나누고(칸 안에 | 를 쓰지 않는다) 첫 칸이 행 이름이다.
    표가 여럿이거나 한 항목이 여러 행으로 나뉘어도 되고, 칸 수·머리 행은 자유다.
- 항목마다 행 이름에 괄호 안 낱말 중 하나가 든 행(대소문자 무시)이 있고, 그 행들의 글에 값이 있다.
    경로(경로·저장소): API WorkingDirectory 와 같은 절대 경로. 끝의 / · . 는 무시하고, 하위·상위 경로는 다르다고 본다.
    서비스 사용자(사용자): 두 서비스의 User= 값
    포트(포트): API --port 값과 웹 --port(-p) 값
    Python·Node 버전(런타임·버전·Python·Node): Python 3.12, Node 24(plan.md 5절). 이름 뒤 20자 안에 다른 숫자 없이 온다.
    시간대(시간대): Asia/Seoul(plan.md 5절)
- 사용자·포트 값은 영문·숫자·_ 에 붙지 않은 낱말로 찾는다(8000 은 18000 에서 찾지 않고, warrisk를 처럼 한글은 붙어도 된다).

테스트 방식
- 판정 함수(_check_*)는 {저장소 기준 경로: 내용} 을 받는다. 실제 파일 테스트와 자체 검사가 같은 함수를 쓴다.
- 자체 검사: 정상 표본(GOOD_RUNBOOK + 2-1 의 GOOD_API_SERVICE·GOOD_WEB_SERVICE)과 ALLOWED 변형은 모든 판정을 통과한다.
    REJECTED 변형은 런북이나 서비스 표본 한 군데를 바꿔 지정한 판정이 실패한다. 서비스 표본만 바꾼 변형은 값을 설정
    파일에서 읽는지 본다. 바꿀 글자가 표본에 없으면 바로 실패해 빈 검사가 되지 않는다. 모든 표본을 LF·CRLF 로 돌린다.
- 런북을 쓰기 전에는 실제 파일 테스트 두 개가 '파일 없음: deploy/RUNBOOK.md' 로 실패한다(테스트 자체 오류 아님).

못 잡는 것: 포트 행에서 백엔드·프론트 값이 서로 바뀐 표기, 행 글의 뜻, 절 순서와 본문([수동] 항목).

인수 조건 → 테스트
- 절 제목 다섯 개: test_runbook_sections
- 서버 규약 표 다섯 항목, 경로·포트(와 서비스 사용자)가 2-1 설정 파일 값과 같음: test_runbook_server_table
- 판정 함수 자체: test_good_samples_pass, test_allowed_variants_pass, test_rejected_variants_fail
"""

import itertools
import re
from collections.abc import Callable, Iterator
from pathlib import PurePosixPath

import pytest

# 2-1 인수 테스트의 유닛 읽기·표본을 그대로 쓴다(pytest 기본 import 방식이 tests/ 를 sys.path 에 넣는다)
from test_deploy_config import (
    API_SERVICE, GOOD_API_SERVICE, GOOD_WEB_SERVICE, NEWLINES, WEB_PORT_OPTIONS, WEB_SERVICE, _next_start_args, _one,
    _option_values, _read, _service, _uvicorn_args,
)

RUNBOOK = "deploy/RUNBOOK.md"
SECTIONS = ("개요", "서버 준비", "첫 배포", "업데이트", "되돌리기")
OVERVIEW = SECTIONS[0]
HEADING = re.compile(r" {0,3}(?P<marks>#{1,3})[ \t]+(?P<title>.*)")  # match 로 줄 처음부터. #### 는 제목으로 안 본다
FENCE = re.compile(r"[ \t]*(?P<fence>`{3,}|~{3,})")  # 코드 블록 울타리. 목록 안 블록도 있어 들여쓰기는 자유
# 서버 규약 표 항목 → 행 이름 낱말
ROW_NAMES = {
    "경로": re.compile(r"경로|저장소"),
    "서비스 사용자": re.compile(r"사용자"),
    "포트": re.compile(r"포트"),
    "Python·Node 버전": re.compile(r"런타임|버전|python|node", re.IGNORECASE),
    "시간대": re.compile(r"시간대"),
}
ABS_PATH = re.compile(r"(?<![\w./-])/[\w./-]+", re.ASCII)  # 절대 경로. ASCII 라 붙은 한글 조사는 경로에 안 들어간다
# plan.md 5절 서버 규약 중 설정 파일에 없는 값. 버전은 이름 뒤 20자 안에 다른 숫자·줄바꿈 없이 온다(Node.js 버전 v24)
PYTHON = re.compile(r"python[^\d\n]{0,20}?3\.12(?!\d)", re.IGNORECASE)
NODE = re.compile(r"node[^\d\n]{0,20}?24(?!\d)", re.IGNORECASE)
TIMEZONE = "Asia/Seoul"

Files = dict[str, str]  # 저장소 기준 경로 → 내용
Check = Callable[[Files], None]


# ---------- 런북 읽기 ----------

def _prose_lines(text: str) -> Iterator[str]:
    """코드 블록 밖의 줄. 닫는 울타리는 여는 것과 같은 글자로 같거나 길고 뒤에 글이 없다(CommonMark)."""
    fence = ""  # 열려 있는 울타리. "" 이면 코드 블록 밖
    for line in text.splitlines():
        m = FENCE.match(line)
        if not fence:
            if m:
                fence = m["fence"]
            else:
                yield line
        elif m and m["fence"][0] == fence[0] and len(m["fence"]) >= len(fence) and not line[m.end():].strip():
            fence = ""


def _overview_rows(text: str) -> list[tuple[str, str]]:
    """개요 절 안 표 행마다 (행 이름, 칸을 공백으로 이은 글). 하위 절(### 서버 규약 등)도 개요 절이다."""
    rows: list[tuple[str, str]] = []
    level = 0  # 개요 제목의 # 개수. 0 이면 아직 개요 앞
    for line in _prose_lines(text):
        heading = HEADING.match(line)
        if heading and level and len(heading["marks"]) <= level:
            break  # 개요와 같거나 높은 단계의 다음 절
        if heading and not level and OVERVIEW in heading["title"]:
            level = len(heading["marks"])
        elif level and line.lstrip().startswith("|"):
            cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
            rows.append((cells[0], " ".join(cells)))
    return rows


def _has_token(text: str, value: str) -> bool:
    """value 가 영문·숫자·_ 에 붙지 않은 낱말로 text 에 있다. 한글 조사는 붙어도 된다(warrisk를)."""
    return re.search(rf"(?<!\w){re.escape(value)}(?!\w)", text, re.ASCII) is not None


# ---------- 판정 함수: 계약을 어기면 AssertionError ----------

def _check_sections(files: Files) -> None:
    """제목 줄(#~###, 코드 블록 밖)에 절 낱말이 모두 있다."""
    titles = [m["title"] for line in _prose_lines(files[RUNBOOK]) if (m := HEADING.match(line))]
    assert [word for word in SECTIONS if not any(word in title for title in titles)] == [], f"제목 줄: {titles}"


def _check_server_table(files: Files) -> None:
    """개요 절 표에 다섯 항목 행이 있고, 경로·사용자·포트는 서비스 파일 값과, 버전·시간대는 plan.md 5절 값과 같다."""
    rows = _overview_rows(files[RUNBOOK])
    # 항목 → 행 이름이 맞는 행들의 글. 버전 정규식이 행을 건너지 않게 줄바꿈으로 잇는다
    found = {item: "\n".join(text for name, text in rows if names.search(name)) for item, names in ROW_NAMES.items()}
    assert [item for item, text in found.items() if not text] == [], f"개요 절 표의 행 이름: {[name for name, _ in rows]}"
    api, web = _service(files[API_SERVICE]), _service(files[WEB_SERVICE])
    root = PurePosixPath(_one(api, "WorkingDirectory"))
    paths = {PurePosixPath(path.rstrip(".")) for path in ABS_PATH.findall(found["경로"])}  # 끝 . 은 문장 부호
    assert root in paths, f"{root} 없음: {found['경로']!r}"
    users = [_one(api, "User"), _one(web, "User")]
    assert [user for user in users if not _has_token(found["서비스 사용자"], user)] == [], found["서비스 사용자"]
    api_ports = _option_values(_uvicorn_args(api), "--port")
    web_ports = _option_values(_next_start_args(web), *WEB_PORT_OPTIONS)
    assert len(api_ports) == len(web_ports) == 1, f"서비스 파일 포트가 하나씩이 아님: {api_ports}, {web_ports}"
    assert [port for port in api_ports + web_ports if not _has_token(found["포트"], port)] == [], found["포트"]
    runtime = found["Python·Node 버전"]
    assert PYTHON.search(runtime) and NODE.search(runtime), f"Python 3.12·Node 24 가 없음: {runtime!r}"
    assert TIMEZONE in found["시간대"], found["시간대"]


# ---------- 실제 파일 ----------

def test_runbook_sections() -> None:
    """deploy/RUNBOOK.md 에 개요·서버 준비·첫 배포·업데이트·되돌리기 절 제목이 있다."""
    _check_sections({RUNBOOK: _read(RUNBOOK)})


def test_runbook_server_table() -> None:
    """개요의 서버 규약 표에 경로·서비스 사용자·포트·Python·Node 버전·시간대가 있고, 경로·포트·사용자가 2-1 값과 같다."""
    _check_server_table({name: _read(name) for name in (RUNBOOK, API_SERVICE, WEB_SERVICE)})


# ---------- 판정 함수 자체 검사 ----------

GOOD_RUNBOOK = """\
# war-risk-index 운영 런북

## 0. 개요

명령 블록 앞에 실행 위치를 적는다. 서버 bash:

```bash
# 코드 블록 안의 # 줄은 제목이 아니다
timedatectl
```

### 서버 규약

| 항목 | 값 | 이유 |
|---|---|---|
| 저장소 위치 | `/srv/war-risk-index`(백엔드 작업 디렉터리) | 수집 모듈이 상대 경로를 쓴다 |
| 서비스 사용자 | `warrisk`(로그인 셸 없는 시스템 사용자) | `data/`·`out/` 쓰기 권한만 준다 |
| 포트 | 백엔드 8000, 프론트 3000. 둘 다 `127.0.0.1`에만 바인딩 | 밖에는 Caddy만 노출한다 |
| 런타임 | Python 3.12 venv(`/srv/war-risk-index/.venv`), Node 24 LTS | 로컬과 같은 메이저 버전 |
| 시간대 | Asia/Seoul | 로컬 날짜를 쓰는 코드가 있다 |

## 1. 서버 준비

```bash
sudo timedatectl set-timezone Asia/Seoul
```

## 2. 첫 배포

## 3. 업데이트

## 4. 되돌리기
"""
SAMPLES: Files = {RUNBOOK: GOOD_RUNBOOK, API_SERVICE: GOOD_API_SERVICE, WEB_SERVICE: GOOD_WEB_SERVICE}
CHECKS: list[Check] = [_check_sections, _check_server_table]
# 허용하는 다른 표기: id → (런북에서 바꿀 글자, 바꾼 글자). 모든 판정을 통과해야 한다
ALLOWED: dict[str, tuple[str, str]] = {
    "path_row_other_name": ("| 저장소 위치 |", "| 경로 |"),
    "runtime_split_rows": (
        "| 런타임 | Python 3.12 venv(`/srv/war-risk-index/.venv`), Node 24 LTS | 로컬과 같은 메이저 버전 |",
        "| Python 버전 | 3.12 | 로컬과 같다 |\n| Node.js 버전 | v24 LTS | 로컬과 같다 |"),
    "path_plain_trailing_slash": ("`/srv/war-risk-index`(백엔드", "/srv/war-risk-index/ (백엔드"),
    "user_with_korean_particle": ("`warrisk`(로그인 셸 없는 시스템 사용자)", "warrisk를 쓴다(로그인 셸 없음)"),
    # ~~~ 블록 안의 ``` 는 블록을 닫지 않는다
    "tilde_fence_with_backticks_inside": ("```bash\n# 코드 블록 안의 # 줄은 제목이 아니다\ntimedatectl\n```",
                                          "~~~bash\n```\n# 코드 블록 안의 # 줄은 제목이 아니다\ntimedatectl\n~~~"),
}
# 계약을 어기는 변형: id → (바꿀 파일, 실패해야 하는 판정, 바꿀 글자, 바꾼 글자). 표본에서 한 군데만 바꾼다
REJECTED: dict[str, tuple[str, Check, str, str]] = {
    "no_rollback_heading": (RUNBOOK, _check_sections, "## 4. 되돌리기", "## 4. 원복"),
    "heading_only_in_code_block": (RUNBOOK, _check_sections, "## 4. 되돌리기\n", "```bash\n# 4. 되돌리기\n```\n"),
    "heading_level_4": (RUNBOOK, _check_sections, "## 4. 되돌리기", "#### 4. 되돌리기"),
    "heading_without_space": (RUNBOOK, _check_sections, "## 3. 업데이트", "##3. 업데이트"),
    # 표 행 누락: 행 이름에 낱말이 없으면 값이 표에 있어도 없는 행이다
    "no_path_row": (RUNBOOK, _check_server_table, "| 저장소 위치 |", "| 위치 |"),
    "no_user_row": (RUNBOOK, _check_server_table, "| 서비스 사용자 |", "| 계정 |"),
    "no_port_row": (RUNBOOK, _check_server_table, "| 포트 |", "| 바인딩 |"),
    "no_runtime_row": (RUNBOOK, _check_server_table, "| 런타임 |", "| 설치 |"),
    "no_timezone_row": (RUNBOOK, _check_server_table, "| 시간대 |", "| 시계 |"),
    "table_outside_overview": (RUNBOOK, _check_server_table, "### 서버 규약", "## 서버 규약"),
    # 런북 값이 설정 파일·plan.md 와 다름
    "path_other_root": (RUNBOOK, _check_server_table, "`/srv/war-risk-index`(", "`/opt/war-risk-index`("),
    "path_subdirectory_only": (RUNBOOK, _check_server_table, "`/srv/war-risk-index`(", "`/srv/war-risk-index/app`("),
    "user_other": (RUNBOOK, _check_server_table, "`warrisk`(", "`war-risk`("),
    "api_port_other": (RUNBOOK, _check_server_table, "백엔드 8000", "백엔드 8001"),
    "web_port_longer_number": (RUNBOOK, _check_server_table, "프론트 3000", "프론트 30000"),
    "python_other": (RUNBOOK, _check_server_table, "Python 3.12", "Python 3.11"),
    "node_other": (RUNBOOK, _check_server_table, "Node 24", "Node 22"),
    "timezone_other": (RUNBOOK, _check_server_table, "| Asia/Seoul |", "| UTC |"),
    # 설정 파일만 바뀌고 런북은 그대로(값을 하드코딩하지 않고 설정 파일에서 읽는지 본다)
    "config_root": (API_SERVICE, _check_server_table, "/srv/war-risk-index", "/opt/war-risk-index"),
    "config_api_port": (API_SERVICE, _check_server_table, "--port 8000", "--port 8001"),
    "config_web_port": (WEB_SERVICE, _check_server_table, "--port 3000", "--port 3001"),
    "config_user": (WEB_SERVICE, _check_server_table, "User=warrisk", "User=wri"),
}


def _variant(name: str, old: str, new: str) -> Files:
    """정상 표본에서 name 파일의 old 를 new 로 바꾼다. old 가 없으면(표본·표 오타) 바로 실패해 빈 검사가 되지 않는다."""
    assert old in SAMPLES[name], f"{name} 표본에 없는 글자: {old!r}"
    return {**SAMPLES, name: SAMPLES[name].replace(old, new)}


def _newlines(files: Files) -> list[Files]:
    """모든 파일을 LF·CRLF 로 바꾼 두 벌."""
    return [{name: text.replace("\n", newline) for name, text in files.items()} for newline in NEWLINES]


def test_good_samples_pass() -> None:
    """정상 표본은 모든 판정을 LF·CRLF 모두에서 통과한다(코드 블록 안 # 줄에서 개요 절이 끝나지 않는다)."""
    for files, check in itertools.product(_newlines(SAMPLES), CHECKS):
        check(files)


@pytest.mark.parametrize("case", list(ALLOWED))
def test_allowed_variants_pass(case: str) -> None:
    """계약이 허용하는 다른 표기도 모든 판정을 LF·CRLF 모두에서 통과한다."""
    for files, check in itertools.product(_newlines(_variant(RUNBOOK, *ALLOWED[case])), CHECKS):
        check(files)


@pytest.mark.parametrize("case", list(REJECTED))
def test_rejected_variants_fail(case: str) -> None:
    """표본 한 군데를 계약을 어기게 바꾸면 지정한 판정이 LF·CRLF 모두에서 실패한다."""
    name, check, old, new = REJECTED[case]
    for files in _newlines(_variant(name, old, new)):
        with pytest.raises(AssertionError):
            check(files)

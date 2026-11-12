"""이슈 #39(2-1 배포 설정 파일: Caddy·systemd·환경변수 예시) 인수 테스트.

설정 파일을 글자로만 읽는다. 네트워크·서버·caddy·systemd 는 쓰지 않고 실제 data/·out/ 도 읽지 않는다.
git 은 읽기 전용인 check-ignore 하나만 부른다.

계약 (구현은 이 계약을 따른다)

[공통]
- 파일: deploy/Caddyfile, deploy/war-risk-api.service, deploy/war-risk-web.service, deploy/web.env.example(모두 신규),
    루트 .env.example. 모두 UTF-8(BOM 없음)이다.
- 줄은 splitlines 로 나눠 CRLF·LF 를 같게 본다(이 PC 는 core.autocrlf=true 라 작업 트리가 CRLF 일 수 있다).
    커밋한 내용이 i/lf 인지는 [명령] 항목(git ls-files --eol deploy/)이 보고, .gitattributes 는 요구하지 않는다.
- 서버 규약(plan.md 5절): 저장소 /srv/war-risk-index, 사용자 warrisk, 백엔드 127.0.0.1:8000, 프론트 127.0.0.1:3000.
    바꾸면 세 설정 파일·런북과 함께 이 파일의 상수도 바꾼다.
[deploy/Caddyfile]
- 주석: # 가 줄 처음이거나 공백 뒤에 오면 거기서 줄 끝까지 주석이다(줄 끝 주석 포함, Caddy 규칙).
    토큰 중간의 #(예: /a#b)는 값이다. 판정은 주석을 지운 토큰으로 한다. 따옴표는 따로 보지 않는다(이 설정에는 필요 없다).
- 블록: 여는 { 는 줄 끝, 닫는 } 는 혼자 한 줄이다(Caddy 문서 규칙). 한 줄 블록(handle { … })은 안 된다.
- 최상위는 중괄호로 감싼 사이트 블록 하나뿐이고 주소는 정확히 {$SITE_DOMAIN} 이다.
    도메인 하드코딩, 기본값 표기({$SITE_DOMAIN:…}), 전역 옵션 블록, 스니펫은 없다.
- 라우팅은 handle 방식만 허용한다. 사이트 블록 바로 안의 handle 이 정확히 아래 둘이다.
      handle /api/* {                       handle {
          reverse_proxy 127.0.0.1:8000          reverse_proxy 127.0.0.1:3000
      }                                     }
    handle 마다 reverse_proxy 는 하나, 업스트림은 같은 줄에 하나다(http:// 스킴·localhost 안 됨).
    reverse_proxy 하위 블록(header_up 등)은 되지만 아래 금지 하위 지시어는 안 된다.
    이유: handle 은 같은 단계의 다른 handle 과 배타적이라 처음 맞는 하나만 돈다(Caddy 문서).
    reverse_proxy 두 줄 방식(reverse_proxy /api/* … + reverse_proxy …)도 문서의 정렬 규칙(같은 지시어는 경로 매처가 있는
    것이 먼저, 매처 없는 것이 마지막)대로면 같은 결과지만, 이 PC 에 caddy 가 없어 실측하지 않았다(확실하지 않음).
    또 섞어 쓰면(reverse_proxy /api/* + handle {}) 문서의 지시어 순서상 handle 이 reverse_proxy 보다 먼저라 /api 요청까지
    프론트로 간다. 그래서 정렬 규칙에 기대지 않고 의도가 드러나는 handle 하나로 정한다.
- 금지 지시어: 주석을 지운 줄의 첫 토큰(지시어·하위 지시어 이름)이 다음이면 깊이와 상관없이 안 된다.
    log, encode / health_·unhealthy_ 로 시작하는 이름, fail_duration, max_fails(업스트림 능동·수동 헬스 체크)
- /api/health 주석: /api/health 가 나오는 주석 문단에 헬스 체크 낱말과 부정 표현이 함께 있다.
    문단은 주석이 있는 줄(줄 주석·줄 끝 주석)이 이어진 묶음이다. 빈 줄이나 주석 없는 줄에서 끊긴다.
    헬스 체크 낱말: 헬스 체크(띄어쓰기 자유), health check(health-check·healthcheck), health_ 가 들어간 이름.
    부정 표현: 않·없·금지·아니·아님, not·no·never·n't(대소문자 무시). 뜻까지는 보지 않는다(리뷰 몫).
    예: # /api/health 는 외부 가동 감시 전용이라 Caddy 헬스 체크에는 쓰지 않는다.
[deploy/war-risk-*.service] systemd 유닛
- 읽기(systemd.syntax(7)): [섹션] 아래 키=값. Environment=·After= 처럼 같은 키가 여러 번 나와 configparser 기본값
    (strict)은 오류라 직접 읽는다. 앞뒤 공백을 뺀 줄이 # · ; 로 시작하면 주석이다.
    줄 끝 백슬래시는 다음 줄과 공백 하나로 잇는다(사이의 주석 줄은 건너뛴다).
- [Service] 에 User=warrisk, Restart=always, WorkingDirectory, ExecStart 가 한 줄씩 있다.
    [Unit] 에 둔 User= 는 systemd 가 무시하므로 섹션까지 본다.
- [Install] 의 WantedBy 에 multi-user.target 이 있다(공백으로 나눈 이름들, 여러 줄이면 모두 모은다). 재부팅 뒤
    다시 뜨게(이슈 배경) systemctl enable 은 [Install] 만 읽으므로 [Service] 에 둔 WantedBy= 는 안 된다.
- ExecStart 는 shlex.split 으로 나눈다. 옵션 값은 옵션 바로 다음 토큰이다(--port 8000. --port=8000·-p3000 은 안 됨).
    옵션 순서는 자유. 같은 옵션은 한 번만 쓴다(나온 값을 모두 모아 비교해 --workers 1 --workers 2 는 안 된다).
    systemd 에는 줄 끝 주석이 없어 # 뒤도 인자로 넘어간다. 그래서 # 로 시작하는 인자가 없어야 한다.
- Environment= 값은 shlex 로 나눈 이름=값 들이다(한 줄에 여러 개·따옴표 가능). 모든 섹션의 Environment 이름에
    KEY·TOKEN·SECRET·PASSWORD 가 들어가면 안 된다(대소문자 무시). 비밀값은 루트 .env 에 둔다.
[deploy/war-risk-api.service]
- WorkingDirectory=/srv/war-risk-index
- ExecStart 실행 파일은 정확히 <WorkingDirectory>/.venv/bin/python 이다. 이어진 두 토큰 -m uvicorn 이 있고,
    그 뒤 인자(순서 자유)에 backend.app.main:app 이 한 번, --host 127.0.0.1, --port 8000, --workers 1, --loop asyncio,
    --no-access-log 가 있다.
- [Service] 의 Environment 에 PYTHONUNBUFFERED=1 이 있다.
[deploy/war-risk-web.service]
- WorkingDirectory 는 API WorkingDirectory 아래 frontend(/srv/war-risk-index/frontend)다.
- ExecStart 는 next CLI 를 직접 부른다. npm·npx 래퍼는 안 된다(npm 이 종료 신호를 자식에게 넘기는지 확실하지 않다).
    node 설치 경로는 런북(2-2)이 정하므로 고정하지 않는다. 다음 둘 중 하나다.
    (가) <WorkingDirectory>/node_modules/.bin/next start …  실행 파일은 절대 경로다.
         스크립트 첫 줄 #!/usr/bin/env node 로 node 를 찾으므로 node 가 systemd 서비스 기본 PATH(/usr/bin 등)에 있어야 한다.
    (나) <node> <next 스크립트> start …  <node> 는 이름이 node 인 경로(/usr/bin/node 등)다.
         <next 스크립트> 는 절대 경로나 WorkingDirectory 기준 상대 경로다.
    next 스크립트는 WorkingDirectory 기준 node_modules/.bin/next 또는 node_modules/next/dist/bin/next 다.
- start 뒤 인자에 --hostname 127.0.0.1(또는 -H), --port 3000(또는 -p)이 있다. next start 기본값(0.0.0.0, 환경변수 PORT)에
    기대지 않는다.
- TimeoutStopSec 은 10~30초다. 초 단위 정수만 쓴다: 30·30s·30sec 는 되고 0.5min 은 안 된다.
[포트] Caddyfile 두 업스트림 포트가 API --port, 웹 --port(-p) 값과 같다.
[.env.example]
- DATA_GO_KR_SERVICE_KEY= 줄을 그대로 둔다.
- CORS_ORIGINS·LIVE_UPDATES 는 주석 줄(# 로 시작)에서만 설명한다. 이름=값 줄로 넣지 않는다(빈 값도 안 된다).
    값이 있으면 test_m4_env.py::test_env_example_exists_with_empty_values 가 깨진다. LIVE_UPDATES= 빈 값은 그 테스트를
    통과하지만, .env 로 복사하면 main.py 가 "1" 이 아니라고 보고 갱신 스레드를 끈다.
[deploy/web.env.example]
- NEXT_PUBLIC_SITE_URL=, NEXT_PUBLIC_API_BASE_URL= 가 있고, 모든 이름=값 줄의 값이 비어 있다(# 주석·빈 줄 제외).
- git check-ignore -q deploy/web.env.example 의 종료 코드가 1 이다(무시되지 않음).

테스트 방식
- 판정 함수(_check_*)는 파일 내용 문자열을 받아 계약을 어기면 AssertionError 를 낸다. 실제 파일 테스트와 자체 검사가
    같은 함수를 쓴다. 실제 파일이 없으면 '파일 없음: <경로>' 로 실패한다.
- 자체 검사: 정상 표본(GOOD_*)과 ALLOWED 변형(허용하는 다른 표기)은 그 파일의 모든 판정을 통과한다.
    REJECTED 변형은 표본에서 한 군데만 바꿔 계약을 어기게 한 것이라 지정한 판정이 실패한다.
    바꿀 글자가 표본에 없으면 바로 실패해 빈 검사가 되지 않는다. 모든 표본을 LF·CRLF 로 한 번씩 돌린다.
- 구현 전(54c00e9)에는 실제 파일 테스트가 모두 실패했다(테스트 자체 오류 아님). 새 파일을 읽는 테스트는 '파일 없음',
    test_env_example 은 CORS_ORIGINS·LIVE_UPDATES 설명 주석이 없어서다. 자체 검사는 모두 통과했다.

못 잡는 것
- 주석의 뜻, caddy·systemd 가 설정을 실제로 받아들이는지(3-1 의 caddy validate·systemd-analyze verify), node 가 PATH 에
    있는지. Caddy 의 따옴표 토큰·import 로 부른 파일, systemd 의 지정자(%)·$ 치환·실행 파일 접두사(-·@·+ 등)·빈 값 대입
    (목록 초기화)은 보지 않는다.

인수 조건 → 테스트
- 사이트 주소, /api/* → 127.0.0.1:8000, 나머지 → 127.0.0.1:3000: test_caddy_site_and_routes
- log·encode 없음: test_caddy_no_log_or_encode
- 헬스 체크 하위 지시어 없음, /api/health 주석: test_caddy_no_upstream_health_check, test_caddy_health_comment
- API ExecStart 옵션: test_api_exec_start
- API WorkingDirectory 가 웹 WorkingDirectory 의 상위, python 이 그 아래 .venv: test_working_directories, test_api_exec_start
- PYTHONUNBUFFERED=1: test_api_unbuffered
- next start 127.0.0.1·3000, TimeoutStopSec 10~30초: test_web_exec_start
- User=warrisk·Restart=always·비밀값 이름 없음: test_service_common(두 서비스)
- 포트 일치: test_ports_match
- .env.example 주석 줄: test_env_example (test_env_example_exists_with_empty_values 는 test_m4_env.py 그대로)
- web.env.example 빈 값·무시 안 됨: test_web_env_example
- tests 전체 통과·새 파일이 키 모양 문자열·위협 참조에 안 걸림(이 파일 밖, 둘 다 deploy/ 도 훑는다):
  test_m4_env.py::test_no_key_like_strings_in_repo, test_m1_backend.py::test_no_threat_references_in_repo
- 판정 함수 자체: test_good_samples_pass, test_allowed_variants_pass, test_rejected_variants_fail,
  test_unit_parser_repeated_keys, test_caddy_tree_strips_comments

명령·서버(이 파일 밖): 커밋 뒤 git ls-files --eol deploy/ 가 모두 i/lf. 3-1 에서 systemd-analyze verify, caddy validate.
"""

import codecs
import itertools
import re
import shlex
import subprocess
from collections.abc import Callable, Iterator
from pathlib import Path, PurePosixPath
from typing import NamedTuple

import pytest

ROOT = Path(__file__).resolve().parents[1]
ENCODING = "utf-8"
CADDYFILE = "deploy/Caddyfile"
API_SERVICE = "deploy/war-risk-api.service"
WEB_SERVICE = "deploy/war-risk-web.service"
WEB_ENV = "deploy/web.env.example"
ENV_EXAMPLE = ".env.example"
NEWLINES = ("\n", "\r\n")  # 자체 검사는 표본을 두 줄바꿈으로 모두 돌린다
# plan.md 5절 서버 규약
SERVER_ROOT = PurePosixPath("/srv/war-risk-index")  # 저장소 위치 = API WorkingDirectory
FRONTEND_DIR = "frontend"
SERVICE_USER = "warrisk"
HOST = "127.0.0.1"
API_PORT, WEB_PORT = 8000, 3000

# Caddyfile
SITE_ADDRESS = "{$SITE_DOMAIN}"
API_MATCHER = "/api/*"
# 사이트 블록 안 handle 마다 (경로 매처, 그 안 reverse_proxy 업스트림들). 매처 없는 handle 은 ""
CADDY_ROUTES = [(API_MATCHER, [f"{HOST}:{API_PORT}"]), ("", [f"{HOST}:{WEB_PORT}"])]
CADDY_COMMENT = re.compile(r"(?:^|\s)#(?P<text>.*)$")  # 줄 처음이나 공백 뒤의 # 부터 줄 끝까지
LOG_ENCODE = re.compile(r"log|encode")  # 지시어 이름 전체와 비교한다(fullmatch)
HEALTH_DIRECTIVE = re.compile(r"(?:health|unhealthy)_\w+|fail_duration|max_fails")  # 업스트림 능동·수동 헬스 체크
HEALTH_PATH = "/api/health"
HEALTH_WORD = re.compile(r"헬스\s*체크|health[\s_-]*check|health_", re.IGNORECASE)
NEGATION = re.compile(r"않|없|금지|아니|아님|\bnot\b|\bno\b|\bnever\b|n't", re.IGNORECASE)

# systemd 유닛
RESTART = "always"
WANTED_BY = "multi-user.target"  # [Install]. systemctl enable 로 부팅 때 켜진다
VENV_PYTHON = ".venv/bin/python"  # API WorkingDirectory 기준
UVICORN = ("-m", "uvicorn")
APP = "backend.app.main:app"
API_OPTIONS = {"--host": HOST, "--port": str(API_PORT), "--workers": "1", "--loop": "asyncio"}
NO_ACCESS_LOG = "--no-access-log"
NODE = "node"
NEXT_SCRIPTS = ("node_modules/.bin/next", "node_modules/next/dist/bin/next")  # 웹 WorkingDirectory 기준
NEXT_START = "start"
WEB_HOST_OPTIONS, WEB_PORT_OPTIONS = ("--hostname", "-H"), ("--port", "-p")
STOP_TIMEOUT_MIN, STOP_TIMEOUT_MAX = 10, 30  # 초. Next 문서가 종료 신호 뒤 10~30초 기다리기를 권한다
TIME_SPAN = re.compile(r"(\d+)\s*(?:s|sec|second|seconds)?")  # 초 단위 정수만(0.5min·1min 30s 는 안 됨)
SECRET_WORDS = ("KEY", "TOKEN", "SECRET", "PASSWORD")
UNBUFFERED = "PYTHONUNBUFFERED=1"

# 환경변수 예시
KEY_LINE = "DATA_GO_KR_SERVICE_KEY="
COMMENT_ONLY_NAMES = ("CORS_ORIGINS", "LIVE_UPDATES")
WEB_ENV_NAMES = ("NEXT_PUBLIC_SITE_URL", "NEXT_PUBLIC_API_BASE_URL")
GIT_NOT_IGNORED = 1  # git check-ignore 종료 코드: 무시되면 0, 아니면 1, 오류는 128


def _read(rel: str) -> str:
    """저장소 기준 파일 내용(UTF-8, BOM 없음). 없으면 '파일 없음' 으로 실패한다."""
    path = ROOT / rel
    assert path.is_file(), f"파일 없음: {rel}"
    data = path.read_bytes()
    assert not data.startswith(codecs.BOM_UTF8), f"BOM 이 있음: {rel}"
    return data.decode(ENCODING)


# ---------- Caddyfile 읽기 ----------

class Node(NamedTuple):
    """Caddyfile 한 줄. 줄 끝 { 로 블록을 열면 그 안의 줄이 children 이다."""
    line: int
    tokens: list[str]  # 주석과 여는 { 를 뺀 토큰. 첫 토큰이 지시어(하위 지시어) 이름이다
    children: list["Node"]


def _caddy_tree(text: str) -> list[Node]:
    """주석을 지운 Caddyfile 을 블록 트리로 읽는다. 여는 { 는 줄 끝, 닫는 } 는 혼자 한 줄이어야 한다."""
    root: list[Node] = []
    stack = [root]
    for n, raw in enumerate(text.splitlines(), 1):
        tokens = CADDY_COMMENT.sub("", raw).split()
        if not tokens:
            continue
        if tokens == ["}"]:
            assert len(stack) > 1, f"{n}줄: 짝 없는 }}"
            stack.pop()
            continue
        opens = tokens[-1] == "{"
        if opens:
            tokens.pop()
        assert tokens and not {"{", "}"} & set(tokens), f"{n}줄: 전역 옵션 블록·한 줄 블록은 안 됨: {raw!r}"
        node = Node(n, tokens, [])
        stack[-1].append(node)
        if opens:
            stack.append(node.children)
    assert len(stack) == 1, "닫히지 않은 블록이 있음"
    return root


def _walk(nodes: list[Node]) -> Iterator[Node]:
    """트리의 모든 줄(깊이 우선)."""
    for node in nodes:
        yield node
        yield from _walk(node.children)


def _directives(text: str, pattern: re.Pattern[str]) -> list[str]:
    """이름(줄 첫 토큰)이 pattern 과 통째로 맞는 지시어·하위 지시어를 깊이와 상관없이 '줄: 이름' 으로."""
    return [f"{node.line}: {node.tokens[0]}" for node in _walk(_caddy_tree(text)) if pattern.fullmatch(node.tokens[0])]


def _caddy_routes(tree: list[Node]) -> list[tuple[str, list[str]]]:
    """최상위 블록 바로 안 handle 마다 (경로 매처, 그 안 reverse_proxy 업스트림들). 매처 없는 handle 은 ""."""
    return [(" ".join(handle.tokens[1:]),
             [" ".join(proxy.tokens[1:]) for proxy in handle.children if proxy.tokens[0] == "reverse_proxy"])
            for site in tree for handle in site.children if handle.tokens[0] == "handle"]


def _comment_paragraphs(text: str) -> list[str]:
    """주석이 있는 줄(줄 주석·줄 끝 주석)이 이어진 묶음마다 주석 글을 이어 붙인다. 빈 줄·주석 없는 줄에서 끊긴다."""
    comments = [CADDY_COMMENT.search(line) for line in text.splitlines()]
    return [" ".join(m["text"] for m in group) for found, group in itertools.groupby(comments, key=bool) if found]


# ---------- systemd 유닛 읽기 ----------

def _unit(text: str) -> dict[str, dict[str, list[str]]]:
    """systemd 유닛 → {섹션: {키: [값, ...]}}. 같은 키가 여러 번 나오면 나온 순서대로 모두 남긴다.

    configparser 기본값(strict)은 같은 키가 두 번 나오면 DuplicateOptionError 라 쓰지 않는다.
    앞뒤 공백을 뺀 줄이 # · ; 로 시작하면 주석이다. 줄 끝 백슬래시는 다음 줄과 공백 하나로 잇고, 사이의 주석 줄은 건너뛴다.
    줄 끝 주석은 없다(# 뒤도 값이다).
    """
    units: dict[str, dict[str, list[str]]] = {}
    section: dict[str, list[str]] | None = None
    pending = ""  # 줄 끝 백슬래시로 이어지는 중인 앞부분
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line[0] in "#;":
            continue
        line = pending + line
        if line.endswith("\\"):
            pending = line[:-1] + " "
            continue
        pending = ""
        if line.startswith("[") and line.endswith("]"):
            section = units.setdefault(line[1:-1], {})
            continue
        key, sep, value = line.partition("=")
        assert sep and section is not None, f"섹션 안의 키=값 줄이 아님: {raw!r}"
        section.setdefault(key.strip(), []).append(value.strip())
    return units


def _service(text: str) -> dict[str, list[str]]:
    """[Service] 섹션. 없으면 빈 dict."""
    return _unit(text).get("Service", {})


def _one(section: dict[str, list[str]], key: str) -> str:
    """section 에 한 줄뿐인 key 의 값. 없거나 여러 줄이면 실패한다."""
    values = section.get(key, [])
    assert len(values) == 1, f"{key}= 줄이 하나가 아님: {values}"
    return values[0]


def _option_values(args: list[str], *names: str) -> list[str]:
    """names 중 하나인 옵션마다 바로 다음 인자(값)를 나온 순서대로. 같은 옵션이 여러 번이면 값도 여러 개다."""
    return [value for option, value in zip(args, args[1:]) if option in names]


def _env_assignments(section: dict[str, list[str]]) -> list[str]:
    """Environment= 값들을 shlex 로 나눈 이름=값 목록. 한 줄에 여러 개·따옴표도 된다."""
    return [item for value in section.get("Environment", []) for item in shlex.split(value)]


def _uvicorn_args(service: dict[str, list[str]]) -> list[str]:
    """API ExecStart 의 -m uvicorn 뒤 인자. 실행 파일이 <WorkingDirectory>/.venv/bin/python 이 아니면 실패한다."""
    tokens = shlex.split(_one(service, "ExecStart"))
    python = PurePosixPath(_one(service, "WorkingDirectory")) / VENV_PYTHON
    assert PurePosixPath(tokens[0]) == python, f"실행 파일이 {python} 이 아님: {tokens}"
    pairs = list(zip(tokens, tokens[1:]))
    assert UVICORN in pairs, f"-m uvicorn 없음: {tokens}"
    return tokens[pairs.index(UVICORN) + len(UVICORN):]


def _next_start_args(service: dict[str, list[str]]) -> list[str]:
    """웹 ExecStart 의 start 뒤 인자. next 스크립트를 직접 실행하거나 node 바로 다음에 두지 않으면 실패한다."""
    tokens = shlex.split(_one(service, "ExecStart"))
    workdir = PurePosixPath(_one(service, "WorkingDirectory"))
    scripts = {workdir / script for script in NEXT_SCRIPTS}
    if PurePosixPath(tokens[0]) in scripts:  # (가) 스크립트 직접 실행
        args = tokens[1:]
    else:  # (나) node <스크립트>. 스크립트가 상대 경로면 WorkingDirectory 기준
        assert PurePosixPath(tokens[0]).name == NODE and len(tokens) > 1 and workdir / tokens[1] in scripts, \
            f"next 를 직접 부르지 않음(npm·npx 래퍼 안 됨): {tokens}"
        args = tokens[2:]
    assert args[:1] == [NEXT_START], f"next {NEXT_START} 가 아님: {tokens}"
    return args[1:]


# ---------- 환경변수 예시 읽기 ----------

def _env_entries(text: str) -> dict[str, str]:
    """# 주석·빈 줄을 뺀 이름=값 줄 → {이름: 값}. test_m4_env 의 .env.example 읽기와 같은 규칙."""
    entries = {}
    for line in map(str.strip, text.splitlines()):
        if line and not line.startswith("#"):
            name, sep, value = line.partition("=")
            assert sep, f"이름=값 형식이 아닌 줄: {line!r}"
            entries[name.strip()] = value.strip()
    return entries


# ---------- 판정 함수: 계약을 어기면 AssertionError ----------

def _check_caddy_routes(text: str) -> None:
    """최상위는 {$SITE_DOMAIN} 사이트 블록 하나이고, handle /api/* → 8000, 매처 없는 handle → 3000 이다."""
    tree = _caddy_tree(text)
    assert [site.tokens for site in tree] == [[SITE_ADDRESS]], f"최상위는 {SITE_ADDRESS} 사이트 블록 하나뿐이어야 함"
    assert sorted(_caddy_routes(tree)) == sorted(CADDY_ROUTES)


def _check_caddy_no_log_encode(text: str) -> None:
    assert _directives(text, LOG_ENCODE) == []


def _check_caddy_no_health_check(text: str) -> None:
    assert _directives(text, HEALTH_DIRECTIVE) == []


def _check_caddy_health_comment(text: str) -> None:
    """/api/health 가 나오는 주석 문단 중 하나에 헬스 체크 낱말과 부정 표현이 함께 있다."""
    paragraphs = _comment_paragraphs(text)
    assert any(HEALTH_PATH in p and HEALTH_WORD.search(p) and NEGATION.search(p) for p in paragraphs), paragraphs


def _check_api_exec(text: str) -> None:
    """uvicorn 인자에 앱이 한 번, 계약 옵션 값이 한 번씩, --no-access-log 가 있다."""
    args = _uvicorn_args(_service(text))
    assert args.count(APP) == 1, f"앱 인자 {APP} 가 한 번이 아님: {args}"
    assert {option: _option_values(args, option) for option in API_OPTIONS} == \
        {option: [value] for option, value in API_OPTIONS.items()}
    assert NO_ACCESS_LOG in args, f"{NO_ACCESS_LOG} 없음: {args}"


def _check_api_env(text: str) -> None:
    assert UNBUFFERED in _env_assignments(_service(text))


def _check_web_exec(text: str) -> None:
    """next start 를 127.0.0.1:3000 으로 띄우고, TimeoutStopSec 이 10~30초다."""
    service = _service(text)
    args = _next_start_args(service)
    got = {"hostname": _option_values(args, *WEB_HOST_OPTIONS), "port": _option_values(args, *WEB_PORT_OPTIONS)}
    assert got == {"hostname": [HOST], "port": [str(WEB_PORT)]}, args
    timeout = _one(service, "TimeoutStopSec")
    m = TIME_SPAN.fullmatch(timeout)
    assert m and STOP_TIMEOUT_MIN <= int(m[1]) <= STOP_TIMEOUT_MAX, f"TimeoutStopSec 이 10~30초가 아님: {timeout!r}"


def _check_service_common(text: str) -> None:
    """[Service] 에 User=warrisk·Restart=always 가 한 줄씩, Environment 이름에 비밀 낱말 없음, ExecStart 에 # 인자 없음.

    [Install] 의 WantedBy(공백으로 나눈 이름들, 여러 줄이면 모두)에 multi-user.target 이 있다.
    """
    unit = _unit(text)
    service = unit.get("Service", {})
    assert (service.get("User"), service.get("Restart")) == ([SERVICE_USER], [RESTART])
    targets = [target for value in unit.get("Install", {}).get("WantedBy", []) for target in value.split()]
    assert WANTED_BY in targets, f"[Install] 의 WantedBy 에 {WANTED_BY} 없음: {targets}"
    names = [item.partition("=")[0] for section in unit.values() for item in _env_assignments(section)]
    assert [name for name in names if any(word in name.upper() for word in SECRET_WORDS)] == []
    # systemd 에는 줄 끝 주석이 없어 # 뒤가 프로그램 인자로 넘어간다
    assert [arg for arg in shlex.split(_one(service, "ExecStart")) if arg.startswith("#")] == []


def _check_env_example(text: str) -> None:
    """DATA_GO_KR_SERVICE_KEY= 줄이 있고, CORS_ORIGINS·LIVE_UPDATES 는 이름=값 줄 없이 주석 줄에만 나온다."""
    lines = [line.strip() for line in text.splitlines()]
    comments = [line for line in lines if line.startswith("#")]
    assert KEY_LINE in lines, f"{KEY_LINE} 줄이 없음"
    assert [name for name in COMMENT_ONLY_NAMES if name in _env_entries(text)] == [], "이름=값 줄은 안 됨(빈 값도)"
    assert [name for name in COMMENT_ONLY_NAMES if not any(name in c for c in comments)] == [], "설명 주석 줄 없음"


def _check_web_env(text: str) -> None:
    """NEXT_PUBLIC_* 두 이름이 있고, 모든 이름=값 줄의 값이 비어 있다."""
    entries = _env_entries(text)
    assert {name: entries.get(name) for name in WEB_ENV_NAMES} == dict.fromkeys(WEB_ENV_NAMES, "")
    assert {name: value for name, value in entries.items() if value} == {}


# ---------- 실제 설정 파일 ----------

def test_caddy_site_and_routes() -> None:
    """사이트 주소가 {$SITE_DOMAIN} 이고, /api/* 는 127.0.0.1:8000, 나머지는 127.0.0.1:3000 으로 보낸다."""
    _check_caddy_routes(_read(CADDYFILE))


def test_caddy_no_log_or_encode() -> None:
    """log·encode 지시어가 없다(주석 안의 낱말은 상관없다)."""
    _check_caddy_no_log_encode(_read(CADDYFILE))


def test_caddy_no_upstream_health_check() -> None:
    """업스트림 헬스 체크 하위 지시어(health_*·unhealthy_*·fail_duration·max_fails)가 없다."""
    _check_caddy_no_health_check(_read(CADDYFILE))


def test_caddy_health_comment() -> None:
    """/api/health 를 Caddy 헬스 체크에 쓰지 않는다는 주석이 있다."""
    _check_caddy_health_comment(_read(CADDYFILE))


def test_api_exec_start() -> None:
    """API ExecStart 가 <WorkingDirectory>/.venv/bin/python -m uvicorn backend.app.main:app 와 계약 옵션으로 띄운다."""
    _check_api_exec(_read(API_SERVICE))


def test_api_unbuffered() -> None:
    """API 서비스에 Environment=PYTHONUNBUFFERED=1 이 있다."""
    _check_api_env(_read(API_SERVICE))


def test_working_directories() -> None:
    """API WorkingDirectory 는 서버 규약의 저장소 루트이고, 웹 WorkingDirectory 는 그 아래 frontend 다."""
    api = PurePosixPath(_one(_service(_read(API_SERVICE)), "WorkingDirectory"))
    web = PurePosixPath(_one(_service(_read(WEB_SERVICE)), "WorkingDirectory"))
    assert (api, web) == (SERVER_ROOT, SERVER_ROOT / FRONTEND_DIR)


def test_web_exec_start() -> None:
    """웹 ExecStart 가 next start 를 127.0.0.1:3000 으로 직접 띄우고, TimeoutStopSec 이 10~30초다."""
    _check_web_exec(_read(WEB_SERVICE))


@pytest.mark.parametrize("name", [API_SERVICE, WEB_SERVICE])
def test_service_common(name: str) -> None:
    """두 서비스 모두 User=warrisk·Restart=always·WantedBy=multi-user.target 이고, Environment 에 비밀값 이름이 없다."""
    _check_service_common(_read(name))


def test_ports_match() -> None:
    """Caddyfile 두 업스트림 포트가 API·웹 서비스 ExecStart 의 포트와 같다."""
    routes = _caddy_routes(_caddy_tree(_read(CADDYFILE)))
    caddy = {matcher: [upstream.rpartition(":")[2] for upstream in upstreams] for matcher, upstreams in routes}
    api = _option_values(_uvicorn_args(_service(_read(API_SERVICE))), "--port")
    web = _option_values(_next_start_args(_service(_read(WEB_SERVICE))), *WEB_PORT_OPTIONS)
    assert caddy == {API_MATCHER: api, "": web}


def test_env_example() -> None:
    """.env.example 은 DATA_GO_KR_SERVICE_KEY= 줄을 두고, CORS_ORIGINS·LIVE_UPDATES 를 주석 줄로만 설명한다."""
    _check_env_example(_read(ENV_EXAMPLE))


def test_web_env_example() -> None:
    """deploy/web.env.example 에 NEXT_PUBLIC_* 두 값이 빈 값으로 있고, git 이 이 파일을 무시하지 않는다."""
    _check_web_env(_read(WEB_ENV))
    proc = subprocess.run(["git", "check-ignore", "-q", WEB_ENV], cwd=ROOT, capture_output=True, text=True,
                          encoding=ENCODING)
    assert proc.returncode == GIT_NOT_IGNORED, proc.stderr


# ---------- 판정 함수 자체 검사 ----------

GOOD_CADDYFILE = """\
# 접근 로그(log)는 켜지 않는다: 대피소 요청 주소에 좌표 쿼리가 있다. encode 도 넣지 않는다.
{$SITE_DOMAIN} {
    # /api/health 는 외부 가동 감시 전용이다. 데이터가 오래되면 일부러 503 을 주므로
    # Caddy 헬스 체크(health_uri, unhealthy_status 등)에는 쓰지 않는다.
    handle /api/* {
        reverse_proxy 127.0.0.1:8000  # 백엔드. log 없음
    }
    handle {
        reverse_proxy 127.0.0.1:3000
    }
}
"""
GOOD_API_SERVICE = """\
[Unit]
Description=war-risk-index API
After=network-online.target
Wants=network-online.target

[Service]
User=warrisk
WorkingDirectory=/srv/war-risk-index
Environment=PYTHONUNBUFFERED=1
ExecStart=/srv/war-risk-index/.venv/bin/python -m uvicorn backend.app.main:app \\
    --host 127.0.0.1 --port 8000 --workers 1 --loop asyncio --no-access-log
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
"""
GOOD_WEB_SERVICE = """\
[Unit]
Description=war-risk-index web
After=network-online.target
Wants=network-online.target

[Service]
User=warrisk
WorkingDirectory=/srv/war-risk-index/frontend
ExecStart=/srv/war-risk-index/frontend/node_modules/.bin/next start --hostname 127.0.0.1 --port 3000
Restart=always
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
"""
GOOD_ENV_EXAMPLE = """\
# 이 파일을 .env 로 복사한 뒤 값을 채운다. .env 는 커밋하지 않는다.

# 공공데이터포털 일반 인증키(serviceKey)
DATA_GO_KR_SERVICE_KEY=

# CORS_ORIGINS: 기본 http://localhost:3000, 쉼표로 구분. 같은 주소로 배포하면 넣지 않는다.
# LIVE_UPDATES: 기본 1. 서버에서는 넣지 않는다. 빈 값으로 넣으면 갱신 스레드가 꺼진다.
"""
GOOD_WEB_ENV = """\
# 서버에서 frontend/.env.production.local 로 복사해 채운다. 빌드 전에 채우고, 바꾸면 다시 빌드한다.
NEXT_PUBLIC_SITE_URL=
NEXT_PUBLIC_API_BASE_URL=
"""

Check = Callable[[str], None]
# 종류 → (정상 표본, 그 파일의 판정 함수들)
SAMPLES: dict[str, tuple[str, list[Check]]] = {
    "caddy": (GOOD_CADDYFILE, [_check_caddy_routes, _check_caddy_no_log_encode, _check_caddy_no_health_check,
                               _check_caddy_health_comment]),
    "api": (GOOD_API_SERVICE, [_check_api_exec, _check_api_env, _check_service_common]),
    "web": (GOOD_WEB_SERVICE, [_check_web_exec, _check_service_common]),
    "env": (GOOD_ENV_EXAMPLE, [_check_env_example]),
    "web_env": (GOOD_WEB_ENV, [_check_web_env]),
}
CADDY_HANDLES = ("    handle /api/* {\n        reverse_proxy 127.0.0.1:8000  # 백엔드. log 없음\n    }\n"
                 "    handle {\n        reverse_proxy 127.0.0.1:3000\n    }\n")
API_ARGS = "backend.app.main:app \\\n    --host 127.0.0.1 --port 8000 --workers 1 --loop asyncio --no-access-log"
WEB_EXEC = "/srv/war-risk-index/frontend/node_modules/.bin/next start --hostname 127.0.0.1 --port 3000"
# 허용하는 다른 표기: id → (종류, 바꿀 글자, 바꾼 글자). 그 파일의 모든 판정을 통과해야 한다
ALLOWED: dict[str, tuple[str, str, str]] = {
    "caddy_trailing_comment_next_line": (
        "caddy", "    # Caddy 헬스 체크(health_uri, unhealthy_status 등)에는 쓰지 않는다.\n    handle /api/* {",
        "    handle /api/* {  # Caddy 헬스 체크에는 쓰지 않는다"),
    "caddy_english_comment": ("caddy", "Caddy 헬스 체크(health_uri, unhealthy_status 등)에는 쓰지 않는다.",
                              "never used for Caddy health checks."),
    "api_options_reordered": (
        "api", API_ARGS,
        "\\\n    --no-access-log --loop asyncio --workers 1 --port 8000 --host 127.0.0.1 backend.app.main:app"),
    "api_one_line": ("api", " \\\n    ", " "),
    "api_quoted_environment": ("api", "Environment=PYTHONUNBUFFERED=1",
                               'Environment="PYTHONUNBUFFERED=1" TZ=Asia/Seoul'),
    "web_node_short_options": ("web", WEB_EXEC,
                               "/usr/bin/node node_modules/next/dist/bin/next start -p 3000 -H 127.0.0.1"),
    "web_timeout_seconds_suffix": ("web", "TimeoutStopSec=30", "TimeoutStopSec=10s"),
    "web_wanted_by_two_targets": ("web", "WantedBy=multi-user.target", "WantedBy=graphical.target multi-user.target"),
}
# 계약을 어기는 변형: id → (종류, 실패해야 하는 판정, 바꿀 글자, 바꾼 글자). 표본에서 한 군데만 바꾼다
REJECTED: dict[str, tuple[str, Check, str, str]] = {
    "caddy_hardcoded_domain": ("caddy", _check_caddy_routes, "{$SITE_DOMAIN} {", "example.com {"),
    "caddy_api_port": ("caddy", _check_caddy_routes, "127.0.0.1:8000", "127.0.0.1:8001"),
    "caddy_reverse_proxy_style": ("caddy", _check_caddy_routes, CADDY_HANDLES,
                                  "    reverse_proxy /api/* 127.0.0.1:8000\n    reverse_proxy 127.0.0.1:3000\n"),
    "caddy_one_line_block": ("caddy", _check_caddy_routes,
                             "    handle {\n        reverse_proxy 127.0.0.1:3000\n    }\n",
                             "    handle { reverse_proxy 127.0.0.1:3000 }\n"),
    "caddy_log": ("caddy", _check_caddy_no_log_encode, "    handle {\n", "    log\n    handle {\n"),
    "caddy_encode": ("caddy", _check_caddy_no_log_encode, "    handle {\n", "    encode gzip\n    handle {\n"),
    "caddy_health_uri_in_subblock": ("caddy", _check_caddy_no_health_check, ":8000  # 백엔드. log 없음",
                                     ":8000 {\n            health_uri /api/health\n        }"),
    "caddy_unhealthy_status": ("caddy", _check_caddy_no_health_check, ":3000\n",
                               ":3000 {\n            unhealthy_status 5xx\n        }\n"),
    "caddy_max_fails": ("caddy", _check_caddy_no_health_check, ":3000\n",
                        ":3000 {\n            max_fails 3\n        }\n"),
    "caddy_comment_without_negation": ("caddy", _check_caddy_health_comment, "에는 쓰지 않는다.", "에 쓴다."),
    "caddy_comment_split_by_blank_line": ("caddy", _check_caddy_health_comment, "주므로\n", "주므로\n\n"),
    "api_workers_2": ("api", _check_api_exec, "--workers 1", "--workers 2"),
    "api_workers_twice": ("api", _check_api_exec, "--workers 1", "--workers 1 --workers 2"),
    "api_no_loop": ("api", _check_api_exec, " --loop asyncio", ""),
    "api_no_access_log_flag": ("api", _check_api_exec, " --no-access-log", ""),
    "api_public_host": ("api", _check_api_exec, "--host 127.0.0.1", "--host 0.0.0.0"),
    "api_system_python": ("api", _check_api_exec, "=/srv/war-risk-index/.venv/bin/python", "=/usr/bin/python3"),
    "api_other_app": ("api", _check_api_exec, "backend.app.main:app", "main:app"),
    "api_no_unbuffered": ("api", _check_api_env, "Environment=PYTHONUNBUFFERED=1\n", ""),
    "api_secret_env": ("api", _check_service_common, "PYTHONUNBUFFERED=1\n", 'PYTHONUNBUFFERED=1 "db_password=x y"\n'),
    "api_inline_comment": ("api", _check_service_common, "--no-access-log\n", "--no-access-log  # Q11\n"),
    "api_user_in_unit_section": ("api", _check_service_common, "\n\n[Service]\nUser=warrisk\n",
                                 "\nUser=warrisk\n\n[Service]\n"),
    "api_restart_on_failure": ("api", _check_service_common, "Restart=always", "Restart=on-failure"),
    "api_no_wanted_by": ("api", _check_service_common, "WantedBy=multi-user.target\n", ""),
    "web_wanted_by_in_service_section": ("web", _check_service_common, "\n[Install]\nWantedBy=multi-user.target\n",
                                         "WantedBy=multi-user.target\n\n[Install]\n"),
    "web_npm_wrapper": ("web", _check_web_exec, "=/srv/war-risk-index/frontend/node_modules/.bin/next start",
                        "=/usr/bin/npm run start --"),
    "web_next_dev": ("web", _check_web_exec, ".bin/next start", ".bin/next dev"),
    "web_no_hostname": ("web", _check_web_exec, " --hostname 127.0.0.1", ""),
    "web_port_3001": ("web", _check_web_exec, "--port 3000", "--port 3001"),
    "web_timeout_90": ("web", _check_web_exec, "TimeoutStopSec=30", "TimeoutStopSec=90"),
    "web_timeout_5s": ("web", _check_web_exec, "TimeoutStopSec=30", "TimeoutStopSec=5s"),
    "web_timeout_minutes": ("web", _check_web_exec, "TimeoutStopSec=30", "TimeoutStopSec=0.5min"),
    "env_live_updates_empty_line": ("env", _check_env_example, "KEY=\n", "KEY=\nLIVE_UPDATES=\n"),
    "env_cors_value_line": ("env", _check_env_example, "KEY=\n", "KEY=\nCORS_ORIGINS=https://example.com\n"),
    "env_no_live_updates_comment": ("env", _check_env_example, "# LIVE_UPDATES:", "# 갱신 스레드:"),
    "env_key_line_removed": ("env", _check_env_example, "\nDATA_GO_KR_SERVICE_KEY=\n", "\n"),
    "web_env_filled": ("web_env", _check_web_env, "NEXT_PUBLIC_SITE_URL=\n",
                       "NEXT_PUBLIC_SITE_URL=https://example.com\n"),
    "web_env_missing_name": ("web_env", _check_web_env, "NEXT_PUBLIC_API_BASE_URL=\n", ""),
}


def _variant(kind: str, old: str, new: str) -> str:
    """kind 의 정상 표본에서 old 를 new 로 바꾼다. old 가 없으면(표본·표 오타) 바로 실패해 빈 검사가 되지 않는다."""
    good = SAMPLES[kind][0]
    assert old in good, f"{kind} 표본에 없는 글자: {old!r}"
    return good.replace(old, new)


@pytest.mark.parametrize("kind", list(SAMPLES))
def test_good_samples_pass(kind: str) -> None:
    """계약대로 쓴 표본은 그 파일의 모든 판정을 LF·CRLF 모두에서 통과한다(주석 안의 log·health_uri 는 상관없다)."""
    text, checks = SAMPLES[kind]
    for newline, check in itertools.product(NEWLINES, checks):
        check(text.replace("\n", newline))


@pytest.mark.parametrize("case", list(ALLOWED))
def test_allowed_variants_pass(case: str) -> None:
    """계약이 허용하는 다른 표기도 그 파일의 모든 판정을 LF·CRLF 모두에서 통과한다."""
    kind, old, new = ALLOWED[case]
    text = _variant(kind, old, new)
    for newline, check in itertools.product(NEWLINES, SAMPLES[kind][1]):
        check(text.replace("\n", newline))


@pytest.mark.parametrize("case", list(REJECTED))
def test_rejected_variants_fail(case: str) -> None:
    """표본에서 한 군데만 계약을 어기게 바꾸면 지정한 판정이 LF·CRLF 모두에서 실패한다."""
    kind, check, old, new = REJECTED[case]
    text = _variant(kind, old, new)
    for newline in NEWLINES:
        with pytest.raises(AssertionError):
            check(text.replace("\n", newline))


def test_unit_parser_repeated_keys() -> None:
    """같은 키가 여러 번 나와도 순서대로 모두 남는다(configparser 기본값은 오류).

    ; 주석 줄, 줄 끝 백슬래시 잇기(사이 주석 줄은 건너뜀), 값 안의 # 도 systemd 처럼 읽는다.
    """
    text = ("[Unit]\nAfter=network-online.target\nAfter=time-sync.target\n"
            "[Service]\n; 세미콜론 주석\nEnvironment=A=1\nEnvironment=\"B=2 3\" C=4\n"
            "ExecStart=/bin/x --a \\\n# 사이 주석\n  --b 2 #c\n")
    for newline in NEWLINES:
        unit = _unit(text.replace("\n", newline))
        assert unit["Unit"] == {"After": ["network-online.target", "time-sync.target"]}
        assert _env_assignments(unit["Service"]) == ["A=1", "B=2 3", "C=4"]
        assert shlex.split(_one(unit["Service"], "ExecStart")) == ["/bin/x", "--a", "--b", "2", "#c"]


def test_caddy_tree_strips_comments() -> None:
    """# 는 줄 처음이나 공백 뒤일 때만 주석(줄 끝 주석 포함)이고 토큰 중간의 # 는 값이다. 줄 끝 { 가 블록을 연다."""
    text = "# log\n{$SITE_DOMAIN} {\n    redir /a#b /c  # encode\n    handle {\n        respond ok\n    }\n}\n"
    expected = [Node(2, [SITE_ADDRESS], [Node(3, ["redir", "/a#b", "/c"], []),
                                         Node(4, ["handle"], [Node(5, ["respond", "ok"], [])])])]
    for newline in NEWLINES:
        assert _caddy_tree(text.replace("\n", newline)) == expected

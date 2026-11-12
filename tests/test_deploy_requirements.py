"""이슈 #37(1-4 Python 런타임 의존성 고정과 백테스트·테스트 의존성 분리) 인수 테스트.

requirements 파일은 읽기만 하고 pip 은 부르지 않는다(네트워크·설치 없음). 설치 버전과 의존성은 이 테스트를 돌리는 venv 의
importlib.metadata 로 본다. import 검사는 LIVE_UPDATES=0 인 별도 파이썬 프로세스에서 한다(서버는 띄우지 않음).

계약 (구현은 이 계약을 따른다)

[backend/requirements.txt] 런타임 목록
- 패키지는 정확히 6개: fastapi, uvicorn[standard], python-dotenv, pandas, numpy, pycountry. 모두 == 로 고정한다.
- dev 전용 4개(matplotlib·xlrd·pytest·httpx)는 버전이 없는 줄로도 두지 않는다.
- 맨 위 주석(첫 패키지 줄 앞)에 이 venv 의 Python major.minor 를 적는다. 예: # Python 3.12 (로컬 3.12.10 에서 확인)
    대소문자와 Python·숫자 사이 공백은 자유. 3.12.10 처럼 뒤에 더 적어도 된다.
- 옵션 줄(-r 포함)은 두지 않는다.
[backend/requirements-dev.txt] dev 목록
- 빈 줄·주석을 뺀 첫 줄이 -r requirements.txt 이고, 이 줄은 하나뿐이다. pip install -r 하나로 런타임까지 깔린다.
- 패키지는 정확히 dev 전용 4개: pytest·httpx(테스트), matplotlib·xlrd(백테스트). 모두 == 로 고정하고 extras 는 없다.
    런타임 패키지는 다시 적지 않는다(-r 로 들어온다).
- 용도 주석은 줄 주석·꼬리 주석 어느 쪽이든 된다.
[줄 형식] 두 파일 공통
- 파일은 UTF-8(BOM 없음)로 읽는다. 첫 줄의 # -*- coding: utf-8 -*- 는 주석이라 있어도 되고 없어도 된다.
    pip 이 로케일 인코딩 대신 UTF-8 로 읽게 하는 PEP 263 선언이다(pip 은 첫 두 줄에서만 찾는다).
- 주석은 pip 과 같은 규칙으로 지운다: 줄 처음의 #, 또는 공백 뒤의 # 부터 줄 끝까지. 지우고 남은 빈 줄은 무시한다.
- 패키지 줄은 앞뒤 공백을 빼면 정확히 이름[extras]==버전 이다.
    공백(pandas == 3.1.1), 환경 마커(;), --hash, 와일드카드(==3.*), 다른 연산자(>=·~=·===), 여러 조건(,),
    줄 이음(줄 끝 백슬래시)은 안 된다.
- 그 밖의 줄(버전 없는 이름, dev 의 -r requirements.txt 말고 -r·-c·-e·--index-url 같은 옵션)은 안 된다.
[이름·버전 비교]
- 이름·extras 는 PEP 503 정규화(소문자, -·_·. 연속은 - 하나) 뒤에 비교한다. Python_Dotenv==1.2.4 도 python-dotenv 다.
- extras 는 정규화해서 비교한다: uvicorn 은 정확히 standard 하나, 나머지는 extras 없음.
- 버전은 extras 를 뺀 이름으로 찾은 importlib.metadata.version() 과 글자 그대로 같다.
    uvicorn[standard]==0.54.0 은 uvicorn 의 설치 버전과 비교한다. 3.1.1.0 처럼 PEP 440 으로만 같은 표기는 다르다고 본다.
- 한 파일에 같은 이름이 두 번 나오면 안 된다.
[gpr_backtest.py]
- matplotlib 은 모듈 맨 위(tree.body)에서 import 하지 않고 함수 안에서 import 한다(지우면 실행이 NameError).
    어느 함수(main 이나 그 헬퍼)인지, import matplotlib.pyplot as plt·from matplotlib import pyplot as plt 같은 표기는 자유.
[런타임 import] 서버 venv 에는 런타임 목록과 그 의존성만 깔린다. 그 밖의 모듈을 부르면 백엔드가 ImportError 로 죽는다.
- 런타임 폐포(closure): 런타임 목록 6개에서 importlib.metadata.requires() 를 따라간 배포판들.
    extras 를 따라가고(uvicorn 은 standard), 환경 마커는 이 venv(지금 Windows·Python 3.12)에서 packaging 으로 평가한다.
- LIVE_UPDATES=0 인 별도 프로세스에서 backend.app.main, gpr_backtest 를 각각 import 할 때 새로 불린 최상위 모듈이
    (1) dev 전용 4개가 아니다(인수 조건은 matplotlib).
    (2) 표준 라이브러리·저장소 모듈이 아니면 그 배포판이 런타임 폐포 안이다.
        배포판은 모듈 파일이 있는 site-packages 바로 아래 이름으로 packages_distributions() 에서 찾는다.
        그래서 pandas/_libs 의 _cyutility 처럼 최상위 이름으로 등록되는 하위 파일도 pandas 로 본다.
        파일이 없는 합성 모듈(cython_runtime·_cython_3_x)은 뺀다.
    인터프리터 시작 때 이미 불린 모듈(sitecustomize, .pth·coverage·디버거가 부른 것 등)은 코드가 부른 것이 아니라 대상이 아니다.
- 함수 안 import(늦은 import)는 AST 로 본다. 대상은 backend.app.main import 에서 불린 저장소 모듈 파일이다
    (backend 패키지는 폴더 안 *.py 전부). 함수 안 import 가 부르는 최상위 모듈은 다음 중 하나여야 한다.
    표준 라이브러리, 그 import 에서 이미 불린 저장소 모듈, 배포판이 런타임 폐포 안인 모듈, 허용 목록.
    허용 목록은 gpr_backtest.py 의 matplotlib 하나다(그림 함수 안). 런타임은 gpr_backtest 의 상수만 쓰고 함수는 부르지 않는다.
    import 때 안 불리는 저장소 모듈(예: 함수 안 import gdelt_weekly)은 안을 따라가 보지 않으므로 허용하지 않는다.
    상대 import(from . import x)는 저장소 모듈이라 보지 않는다.

테스트 방식
- packaging 은 pytest 의 의존성(pytest 9.2.0 → packaging>=24)이라 dev venv 에 있다. requirements-dev.txt 에는 적지 않는다.
- 버전·폐포 기준은 이 venv 다. venv 의 패키지를 올리면 requirements 도 같이 바꿔야 통과한다(의도한 동작).
- 패키지 목록을 일부러 바꾸면(추가·삭제) 이 파일의 RUNTIME·DEV_ONLY 표도 같이 바꾼다.
- 못 잡는 것: 마커를 이 venv 에서 평가하므로 Linux 에서만 깔리는 의존성(uvloop 등)과 그 import 는 보지 않는다.
    라이브러리 안의 늦은 import(pd.read_excel 이 부르는 xlrd 등), 문자열로 부르는 import(importlib.import_module)도 못 잡는다.
    런타임 의존성이 dev venv 에 있으면 쓰는 선택 의존성을 import 하면 폐포 밖이라 실패한다(서버에서는 괜찮을 수 있음).
    시작 때 이미 불린 패키지는 코드가 다시 import 해도 새로 불리지 않아 못 본다(예: sitecustomize 가 matplotlib 을 부르는 환경).
- 구현 전(be74cf1)에는 다음이 실패했다(테스트 자체 오류 아님).
    test_line_format[requirements.txt](pandas·numpy·matplotlib·xlrd 버전 없음),
    test_runtime_packages·test_runtime_excludes_dev_only(matplotlib·xlrd 있음), test_dev_packages(matplotlib·xlrd 없음),
    test_runtime_header_names_python(주석 없음), test_import_loads_no_dev_only_package 2개·
    test_import_within_runtime_closure 2개(matplotlib 불림), test_backtest_imports_matplotlib_in_function(맨 위 import).
  그때도 통과(회귀 방지): test_line_format[requirements-dev.txt], test_pins_match_venv 2개, test_dev_includes_runtime_first,
    test_function_imports_within_runtime_closure.

인수 조건 → 테스트
- 런타임 패키지 줄 모두 == 고정, venv 와 같음: test_line_format[requirements.txt], test_pins_match_venv[requirements.txt],
  test_runtime_packages(6개 모두 있음, uvicorn 의 standard extras 포함)
- 런타임에 matplotlib·xlrd·pytest·httpx 없음: test_runtime_excludes_dev_only
- dev 에 넷 모두(==, venv 와 같음), -r 유지: test_dev_packages, test_line_format[requirements-dev.txt],
  test_pins_match_venv[requirements-dev.txt], test_dev_includes_runtime_first
- import 뒤 matplotlib 없음: test_import_loads_no_dev_only_package[backend.app.main]
  함께 보는 것: [gpr_backtest], test_backtest_imports_matplotlib_in_function
- 런타임 목록만 깐 venv 에서도 import 됨(새 venv 수동 확인의 로컬 대용): test_import_within_runtime_closure 2개,
  test_function_imports_within_runtime_closure
- (할 일) 맨 위 Python 주석: test_runtime_header_names_python

수동(이 파일 밖): 런타임 목록만 깐 새 venv(Python 3.12)로 8001 포트에 띄워 /api/pairs·/api/countries·/api/live·/api/blend 200,
.venv 에서 gpr_backtest.py 실행 뒤 out/gpr_backtest.png 수정 시각 갱신.
"""

import ast
import functools
import importlib.metadata
import itertools
import json
import os
import re
import subprocess
import sys
import sysconfig
from pathlib import Path

import pytest
from packaging.requirements import Requirement  # pytest 의 의존성. 환경 마커 평가용

ROOT = Path(__file__).resolve().parents[1]
REQ_DIR = ROOT / "backend"
RUNTIME_FILE, DEV_FILE = "requirements.txt", "requirements-dev.txt"
FILES = [RUNTIME_FILE, DEV_FILE]
ENCODING = "utf-8"
INCLUDE = ["-r", RUNTIME_FILE]  # dev 파일이 런타임 목록을 읽어 오는 줄(공백으로 나눈 모양)
# 런타임 목록: 정규화한 이름 → 정규화·정렬한 extras
RUNTIME = {"fastapi": (), "uvicorn": ("standard",), "python-dotenv": (), "pandas": (), "numpy": (), "pycountry": ()}
# dev 전용: 테스트(pytest·httpx), 백테스트(matplotlib·xlrd). 넷 다 배포 이름 = import 이름이라 sys.modules 검사에도 쓴다
DEV_ONLY = ["httpx", "matplotlib", "pytest", "xlrd"]
NOT_INSTALLED = "<설치 안 됨>"
NO_DIST = "<배포판 없음>"
NAME = r"[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?"  # PEP 508 이름. extras 이름도 같은 모양
# 고정 줄 전체: 이름[extras]==버전. 버전에 공백·;·,·*·= 가 못 들어가 마커·여러 조건·와일드카드·=== 가 걸린다
PIN = re.compile(rf"(?P<name>{NAME})(?:\[(?P<extras>{NAME}(?:,{NAME})*)\])?==(?P<version>[A-Za-z0-9][A-Za-z0-9.+!_-]*)")
# 고정 여부와 상관없이 줄 맨 앞의 이름·[extras] 만 읽는다(버전 없는 matplotlib 줄도 센다). - 로 시작하는 옵션 줄은 안 맞는다
REQUIREMENT = re.compile(rf"(?P<name>{NAME})(?:\[(?P<extras>[^\]]*)\])?")
COMMENT = re.compile(r"(^|\s+)#.*$")  # pip 의 주석 규칙(pip/_internal/req/req_file.py 의 COMMENT_RE)
PYTHON_VERSION = f"{sys.version_info.major}.{sys.version_info.minor}"  # 핀을 비교하는 이 venv 의 Python
PYTHON_RE = re.compile(rf"python\s*{re.escape(PYTHON_VERSION)}(?!\d)", re.IGNORECASE)  # 3.12.10 은 되고 3.120 은 안 됨
BACKTEST_FILE = "gpr_backtest.py"
MATPLOTLIB = "matplotlib"
# 함수 안 import 허용 목록: (저장소 기준 파일, 최상위 모듈). 그림 함수 안의 matplotlib 만
FUNCTION_IMPORT_ALLOWED = {(BACKTEST_FILE, MATPLOTLIB)}
FUNCTIONS = (ast.FunctionDef, ast.AsyncFunctionDef)
MAIN_MODULE = "backend.app.main"  # 서버 진입점(uvicorn backend.app.main:app)
RUNTIME_IMPORTS = [MAIN_MODULE, "gpr_backtest"]  # 서버 진입점, matplotlib import 를 옮긴 모듈
SITE_DIRS = sorted({Path(sysconfig.get_path(key)) for key in ("purelib", "platlib")})  # 이 venv 의 site-packages
SUBPROCESS_TIMEOUT = 120  # 초. test_m4_env 와 같은 값(pandas·fastapi import 포함)
# 별도 파이썬에서 module 을 import 할 때 새로 불린 최상위 모듈 → 파일을 JSON 으로 출력한다. 표준 라이브러리와
# import 전에 이미 있던 모듈(인터프리터 시작 때 sitecustomize·.pth 등이 부른 것)은 뺀다.
# 파일은 __file__(패키지는 __init__.py), 없으면 네임스페이스 패키지의 첫 폴더, 둘 다 없으면 None
CHILD_SCRIPT = """
import json, sys
sys.path.insert(0, {root!r})
base = set(sys.modules)
import {module}
def where(m):
    return getattr(m, "__file__", None) or next(iter(getattr(m, "__path__", None) or []), None)
tops = [n for n in list(sys.modules) if "." not in n and n not in sys.stdlib_module_names and n not in base]
print(json.dumps({{n: where(sys.modules[n]) for n in tops}}))
"""


def _norm(name: str) -> str:
    """PEP 503 정규화: 소문자, -·_·. 연속은 - 하나."""
    return re.sub(r"[-_.]+", "-", name).lower()


def _lines(name: str) -> list[tuple[int, str]]:
    """(줄 번호, 내용) 목록. 주석을 지우고 앞뒤 공백을 뺀 뒤 빈 줄은 버린다."""
    raw = (REQ_DIR / name).read_text(encoding=ENCODING).splitlines()
    lines = ((n, COMMENT.sub("", s).strip()) for n, s in enumerate(raw, 1))
    return [(n, line) for n, line in lines if line]


def _requirements(name: str) -> list[tuple[str, tuple[str, ...]]]:
    """패키지 줄의 (정규화한 이름, 정규화·정렬한 extras) 를 정렬한 목록. 고정 여부와 상관없이 세고 중복도 남긴다."""
    found = []
    for _, line in _lines(name):
        if m := REQUIREMENT.match(line):
            extras = [_norm(e.strip()) for e in (m["extras"] or "").split(",") if e.strip()]
            found.append((_norm(m["name"]), tuple(sorted(extras))))
    return sorted(found)


def _installed(dist: str) -> str:
    try:
        return importlib.metadata.version(dist)
    except importlib.metadata.PackageNotFoundError:
        return NOT_INSTALLED


@functools.cache
def _loaded(module: str) -> dict[str, str | None]:
    """별도 프로세스(LIVE_UPDATES=0)에서 module import 가 새로 부른 최상위 모듈 → 파일. 표준 라이브러리·시작 때 모듈은 뺀다."""
    script = CHILD_SCRIPT.format(root=str(ROOT), module=module)
    env = {**os.environ, "LIVE_UPDATES": "0", "PYTHONIOENCODING": ENCODING}
    proc = subprocess.run([sys.executable, "-c", script], cwd=ROOT, env=env, capture_output=True, text=True,
                          encoding=ENCODING, timeout=SUBPROCESS_TIMEOUT)
    assert proc.returncode == 0, proc.stderr
    return json.loads(proc.stdout.strip().splitlines()[-1])


def _site_top(path: str) -> str | None:
    """site-packages 안 파일이면 바로 아래 이름(확장자 앞), 아니면 None. 예: pandas/_libs/_cyutility...pyd → pandas."""
    p = Path(path)
    return next((p.relative_to(d).parts[0].split(".")[0] for d in SITE_DIRS if p.is_relative_to(d)), None)


def _is_local(path: str) -> bool:
    """저장소 모듈인지. 저장소 안 .venv 의 site-packages 는 뺀다."""
    return _site_top(path) is None and Path(path).is_relative_to(ROOT)


@functools.cache
def _owners() -> dict[str, frozenset[str]]:
    """최상위 import 이름 → 정규화한 배포판 이름들(packages_distributions)."""
    return {top: frozenset(map(_norm, dists)) for top, dists in importlib.metadata.packages_distributions().items()}


@functools.cache
def _closure() -> frozenset[str]:
    """런타임 폐포: RUNTIME 에서 requires() 를 따라간 배포판(정규화). extras 를 따라가고 마커는 이 venv 에서 평가한다."""
    seen: set[tuple[str, str]] = set()  # (배포판, extra). extras 없이 부를 때는 ""
    todo = [(name, extra) for name, extras in RUNTIME.items() for extra in ("", *extras)]
    while todo:
        name, extra = todo.pop()
        if (name, extra) in seen:
            continue
        seen.add((name, extra))
        try:
            requires = importlib.metadata.requires(name) or []
        except importlib.metadata.PackageNotFoundError:  # 마커는 참인데 안 깔림: 이름만 넣고 더 따라가지 않는다
            continue
        for req in map(Requirement, requires):
            if req.marker is None or req.marker.evaluate({"extra": extra}):
                todo += [(_norm(req.name), e) for e in ("", *map(_norm, req.extras))]
    return frozenset(name for name, _ in seen)


def _in_closure(top: str | None) -> bool:
    """최상위 import 이름의 배포판이 런타임 폐포 안인지."""
    return bool(_owners().get(top, frozenset()) & _closure())


def _imported(node: ast.AST) -> set[str]:
    """import 문이 부르는 최상위 모듈 이름. 상대 import(from . import x)나 import 문이 아니면 빈 집합."""
    if isinstance(node, ast.Import):
        return {a.name.split(".")[0] for a in node.names}
    if isinstance(node, ast.ImportFrom) and node.level == 0:
        return {node.module.split(".")[0]}
    return set()


def _function_imports(tree: ast.Module) -> set[tuple[int, str]]:
    """함수 안 import 의 (줄, 최상위 모듈). 안쪽 함수의 import 는 바깥 함수에서도 걸리므로 집합으로 한 번만 센다."""
    return {(node.lineno, name) for func in ast.walk(tree) if isinstance(func, FUNCTIONS)
            for node in ast.walk(func) for name in _imported(node)}


def _runtime_files(loaded: dict[str, str | None]) -> list[Path]:
    """import 에서 불린 저장소 모듈 파일. 패키지(backend)는 폴더 안 *.py 전부."""
    files: set[Path] = set()
    for path in (Path(p) for p in loaded.values() if p and _is_local(p)):
        top = path.parent if path.name == "__init__.py" else path
        files |= set(top.rglob("*.py")) if top.is_dir() else {top}
    return sorted(files)


# ---------- 줄 형식과 버전 ----------

@pytest.mark.parametrize("name", FILES)
def test_line_format(name: str) -> None:
    """빈 줄·주석을 뺀 모든 줄이 이름[extras]==버전이다. dev 파일만 -r requirements.txt 줄을 더 허용한다."""
    allowed = [INCLUDE] if name == DEV_FILE else []
    bad = [f"{name}:{n}: {line!r}" for n, line in _lines(name)
           if not PIN.fullmatch(line) and line.split() not in allowed]
    assert bad == []


@pytest.mark.parametrize("name", FILES)
def test_pins_match_venv(name: str) -> None:
    """고정 줄의 버전이 이 venv 의 설치 버전과 글자 그대로 같다. uvicorn[standard] 는 uvicorn 으로 찾는다."""
    pins = [m for _, line in _lines(name) if (m := PIN.fullmatch(line))]
    wrong = {m[0]: v for m in pins if (v := _installed(_norm(m["name"]))) != m["version"]}
    assert wrong == {}  # {줄: venv 버전}


# ---------- 런타임·dev 구분 ----------

def test_runtime_packages() -> None:
    """런타임 목록의 패키지가 정확히 6개(이름·extras)다. 빠짐·더함·중복·extras 누락이 모두 걸린다."""
    assert _requirements(RUNTIME_FILE) == sorted(RUNTIME.items())


def test_runtime_excludes_dev_only() -> None:
    """런타임 목록에 dev 전용 이름이 없다(버전 없는 줄도 센다)."""
    assert sorted({n for n, _ in _requirements(RUNTIME_FILE)} & set(DEV_ONLY)) == []


def test_dev_packages() -> None:
    """dev 목록의 패키지가 정확히 dev 전용 4개이고 extras 가 없다(런타임 패키지는 -r 로만 들어온다)."""
    assert _requirements(DEV_FILE) == [(n, ()) for n in sorted(DEV_ONLY)]


def test_dev_includes_runtime_first() -> None:
    """dev 파일의 첫 줄(빈 줄·주석 빼고)이 -r requirements.txt 이고, 그런 줄은 하나뿐이다."""
    includes = [i for i, (_, line) in enumerate(_lines(DEV_FILE)) if line.split() == INCLUDE]
    assert includes == [0]


def test_runtime_header_names_python() -> None:
    """런타임 파일 맨 위 주석(첫 패키지 줄 앞의 빈 줄·주석 줄)에 이 venv 의 Python major.minor 가 있다."""
    raw = (REQ_DIR / RUNTIME_FILE).read_text(encoding=ENCODING).splitlines()
    header = list(itertools.takewhile(lambda s: not COMMENT.sub("", s).strip(), raw))
    assert any(PYTHON_RE.search(s) for s in header), f"맨 위 주석에 Python {PYTHON_VERSION} 없음: {header}"


# ---------- 런타임 import ----------

@pytest.mark.parametrize("module", RUNTIME_IMPORTS)
def test_import_loads_no_dev_only_package(module: str) -> None:
    """LIVE_UPDATES=0 인 별도 프로세스에서 module 을 import 할 때 새로 불린 sys.modules 에 dev 전용 패키지가 없다."""
    assert sorted(set(_loaded(module)) & set(DEV_ONLY)) == []  # 불린 dev 전용 패키지


@pytest.mark.parametrize("module", RUNTIME_IMPORTS)
def test_import_within_runtime_closure(module: str) -> None:
    """module import 가 새로 부른 서드파티 최상위 모듈의 배포판이 모두 런타임 폐포 안이다(런타임 목록만 깐 venv 에서도 됨)."""
    bad = {}
    for name, path in _loaded(module).items():
        if path is None or _is_local(path):
            continue  # 파일 없는 합성 모듈(cython_runtime 등), 저장소 모듈
        top = _site_top(path)
        if not _in_closure(top):
            bad[name] = sorted(_owners().get(top, ())) or NO_DIST
    assert bad == {}  # {모듈: 배포판들}


def test_function_imports_within_runtime_closure() -> None:
    """런타임 파일의 함수 안 import 가 표준 라이브러리·이미 불린 저장소 모듈·런타임 폐포·허용 목록 안이다."""
    loaded = _loaded(MAIN_MODULE)
    local = {n for n, p in loaded.items() if p and _is_local(p)}
    bad = []
    for path in _runtime_files(loaded):
        rel = path.relative_to(ROOT).as_posix()
        for line, name in sorted(_function_imports(ast.parse(path.read_text(encoding=ENCODING)))):
            allowed = name in sys.stdlib_module_names or name in local or (rel, name) in FUNCTION_IMPORT_ALLOWED
            if not (allowed or _in_closure(name)):
                bad.append(f"{rel}:{line}: {name}")
    assert bad == []


def test_backtest_imports_matplotlib_in_function() -> None:
    """gpr_backtest.py 는 matplotlib 을 모듈 맨 위가 아니라 함수 안에서 import 한다(어느 함수·어떤 표기든 된다).

    맨 위 금지는 별도 프로세스 검사도 보증한다. 함수 안 import 가 없으면 지운 것이라 실행이 NameError 다.
    """
    tree = ast.parse((ROOT / BACKTEST_FILE).read_text(encoding=ENCODING))
    assert [n.lineno for n in tree.body if MATPLOTLIB in _imported(n)] == []  # 맨 위 import 줄
    assert MATPLOTLIB in {name for _, name in _function_imports(tree)}

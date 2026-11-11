"""이슈 #34(1-1 지수·UCDP·가중치 파일 원자적 쓰기) 인수 테스트.

실제 data/·out/ 는 건드리지 않는다. 공용 함수는 tmp_path 에서 확인하고, 호출부 4개 모듈은 소스를 ast 로 읽기만 한다.

계약 (구현은 이 계약을 따른다)

[공용] 루트 atomic_write.py (신규, data_go_kr.py 처럼 루트 모듈)
- write(path: Path, writer: Callable[[Path], object]) -> None
    임시 경로 = 같은 폴더의 path.with_name(path.name + ".part"). 예: x.csv.asof → x.csv.asof.part (with_suffix 로 만들지 않음)
    writer(임시 경로) 로 쓰게 한 뒤 임시 경로.replace(path) 로 교체한다. os.replace(임시, 대상) 가 1번 불린다.
    writer 가 예외를 내면 교체하지 않고 그 예외 객체를 그대로 올린다(감싸지 않음). 대상 파일은 그대로다.
    실패 때 남은 .part 를 지울지는 자유. 다음 호출은 .part 가 남아 있어도 덮어쓰고 성공한다.
- write_csv(df: pd.DataFrame, path: Path, **kwargs) -> None
    write 를 거쳐 df.to_csv(임시 경로, **kwargs). 키워드는 받은 그대로 넘긴다.
    결과 바이트 = df.to_csv(path, **kwargs). to_csv() 문자열을 write_text 로 쓰면 Windows 에서 줄바꿈이 달라진다.
- write_text(path: Path, text: str, encoding: str = "utf-8") -> None
    write 를 거쳐 임시 경로.write_text(text, encoding=encoding).
    결과 바이트 = path.write_text(text, encoding=encoding). write_bytes 로 쓰면 Windows 에서 줄바꿈이 달라진다.

[호출부] build_index.py · build_country_index.py · blend.py · ucdp.py
- 모듈 맨 위에서 import atomic_write (별칭·from import 없이) 하고 atomic_write.write_csv·write_text 로 부른다.
- 아래 7곳을 곳마다 한 번씩 바꾼다. 경로 인자는 지금 식 그대로, 옵션은 지금처럼 키워드로 넘긴다. 쓰는 순서·내용은 그대로.
    build_index.py:46           atomic_write.write_csv(out, INDEX_FILE, index=False, encoding="utf-8")
    build_country_index.py:209  atomic_write.write_csv(out, COUNTRY_INDEX_FILE, index=False, encoding="utf-8")
    build_country_index.py:216  atomic_write.write_csv(m, COUNTRY_META_FILE, index=False, encoding="utf-8")
    blend.py:65                 atomic_write.write_text(BLEND_FILE, json.dumps(...), encoding="utf-8")
    ucdp.py:126                 atomic_write.write_csv(out, MONTHLY_FILE, index=False, encoding="utf-8")
    ucdp.py:127                 atomic_write.write_csv(opponents(events), OPPONENT_FILE, index=False, encoding="utf-8")
    ucdp.py:128                 atomic_write.write_text(Path(str(MONTHLY_FILE) + ".asof"), ..., encoding="utf-8")
- 네 모듈에서 대상 상수(위 6개와 .asof 경로)에 바로 to_csv·write_text 하는 호출은 0건이다.

정적 검사 방식 (ast. 정규식과 달리 줄바꿈·괄호·키워드 인자 모양에 흔들리지 않는다)
- 바로 쓰기: X.to_csv(경로, ...) 는 첫 인자(또는 path_or_buf=), X.write_text(...) 는 X 만 본다. 그 식 안에 대상 상수가
  이름(INDEX_FILE)이나 속성(blend.BLEND_FILE)으로 나오면 잡는다. 이름은 통째로 비교한다(INDEX_FILE ≠ COUNTRY_INDEX_FILE).
  그래서 pd.read_csv(MONTHLY_FILE).to_csv(tmp) 처럼 상수를 읽기만 하는 줄은 잡지 않는다.
- 공용 함수 호출: atomic_write.write_csv 의 둘째 인자, write_text 의 첫 인자(또는 path=) 안에 상수가 나오는 호출을 센다.
  .asof 자리는 ".asof" 가 든 글자 상수가 함께 있어야 하고, MONTHLY_FILE 자리에는 없어야 한다.
- 미탐: 지역 변수·함수 인자를 거친 경로(p = INDEX_FILE; out.to_csv(p)), open·write_bytes·json.dump 같은 다른 쓰기.
  다만 바꾸지 않은 곳은 공용 함수 호출 검사가 실패하므로 7곳 누락은 잡힌다.
- 오탐: 경로를 새 상수(ASOF_FILE 등)로 빼거나 옵션을 위치 인자로 넘기면 공용 함수 호출 검사가 실패한다(계약 위반으로 본다).
  상수로 만든 임시 경로에 손으로 쓰는 것(INDEX_FILE.with_name(...) 에 to_csv)도 바로 쓰기로 잡는다(공용 함수를 쓰라는 계약).

수동(이 파일 밖): 바꾸기 전후 build_country_index.main() → build_index.main() 결과 4개 파일 SHA-256 비교, ucdp.py 실행 뒤 확인.
"""

import ast
import json
import os
from collections.abc import Callable
from pathlib import Path
from types import ModuleType

import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[1]
MODULE = "atomic_write"
PART_SUFFIX = ".part"
ENCODING = "utf-8"
OTHER_ENCODING = "utf-16"  # 받은 encoding 을 쓰는지(utf-8 로 고정하면 바이트가 달라짐)
FAILING_ENCODING = "ascii"  # 한글에서 UnicodeEncodeError: 쓰는 도중 실패의 실제 예
# 점이 여럿인 실제 대상 이름(ucdp.py:128). with_suffix 로 임시 이름을 만들면 <대상>.part 와 달라진다
TARGET_NAME = "ucdp_country_monthly.csv.asof"
CSV_OPTIONS = {"index": False, "encoding": ENCODING}  # 호출부 7곳의 to_csv 옵션
TEXT_OPTIONS = {"encoding": ENCODING}
OTHER_CSV_OPTIONS = {"sep": ";", "na_rep": "없음"}  # 호출부에 없는 to_csv 키워드도 그대로 넘기는지(index 는 기본값)
# 한글·쉼표·따옴표·줄바꿈·결측: 인코딩·따옴표·줄바꿈 처리 차이가 바이트에 드러난다
FRAME = pd.DataFrame({
    "country": ["KOR", "UKR", "SDN"],
    "date": ["2026-11-01", "2026-11-02", "2026-11-03"],
    "weekly": [12.5, float("nan"), 130.0],
    "status_reason": ["등록된 전쟁 진행 중", 'UCDP "최근" 12개월, 교전', "줄\n바꿈"],
})
TEXT = json.dumps({"w1": 0.8, "w2": 0.2, "메모": "가중치"}, ensure_ascii=False, indent=2)  # blend.save 와 같은 모양
OLD_BYTES = "기존 내용,그대로\n".encode(ENCODING)
NEW_BYTES = "새 내용,교체\n".encode(ENCODING)
HALF_BYTES = NEW_BYTES[: len(NEW_BYTES) // 2]  # 쓰는 도중 끊긴 내용
STALE_REPEAT = 100  # 남은 .part 를 새 내용보다 길게 만들어, 덮어쓴 뒤 꼬리가 남지 않는지 본다
STALE_PART_BYTES = OLD_BYTES * STALE_REPEAT


def _aw() -> ModuleType:
    """atomic_write 모듈. 테스트 안에서 import 해서, 구현 전에는 테스트마다 ModuleNotFoundError 로 실패한다."""
    import atomic_write

    return atomic_write


def _part(path: Path) -> Path:
    return path.with_name(path.name + PART_SUFFIX)


def _record_replace(monkeypatch: pytest.MonkeyPatch) -> list[tuple[Path, Path]]:
    """os.replace 호출(원본, 대상)을 기록한다. Path.replace 도 안에서 os.replace 를 부른다."""
    calls: list[tuple[Path, Path]] = []
    real = os.replace

    def spy(src: str | os.PathLike, dst: str | os.PathLike, **kwargs: object) -> None:
        calls.append((Path(src), Path(dst)))
        real(src, dst, **kwargs)

    monkeypatch.setattr(os, "replace", spy)
    return calls


# ---------- 공용 함수: atomic_write ----------

# 이름 → (공용 함수로 쓰기, 바로 쓰기). 두 결과 바이트가 같아야 한다
CASES: dict[str, tuple[Callable[[Path], object], Callable[[Path], object]]] = {
    "write": (lambda p: _aw().write(p, lambda tmp: tmp.write_bytes(NEW_BYTES)), lambda p: p.write_bytes(NEW_BYTES)),
    "write_csv": (lambda p: _aw().write_csv(FRAME, p, **CSV_OPTIONS), lambda p: FRAME.to_csv(p, **CSV_OPTIONS)),
    "write_csv_kwargs": (lambda p: _aw().write_csv(FRAME, p, **OTHER_CSV_OPTIONS),
                         lambda p: FRAME.to_csv(p, **OTHER_CSV_OPTIONS)),
    "write_text": (lambda p: _aw().write_text(p, TEXT, **TEXT_OPTIONS), lambda p: p.write_text(TEXT, **TEXT_OPTIONS)),
    "write_text_encoding": (lambda p: _aw().write_text(p, TEXT, encoding=OTHER_ENCODING),
                            lambda p: p.write_text(TEXT, encoding=OTHER_ENCODING)),
}
# 이름 → 쓰는 도중 실제로 실패하는 공용 함수 호출(한글을 ascii 로 쓰다 UnicodeEncodeError)
FAILING: dict[str, Callable[[Path], object]] = {
    "write_csv": lambda p: _aw().write_csv(FRAME, p, **{**CSV_OPTIONS, "encoding": FAILING_ENCODING}),
    "write_text": lambda p: _aw().write_text(p, TEXT, encoding=FAILING_ENCODING),
}


class FakeWriteError(Exception):
    """가짜 쓰기가 내는 예외(다른 예외와 헷갈리지 않게 따로 둠)."""


def test_write_failure_keeps_target_and_raises(tmp_path: Path) -> None:
    """가짜 쓰기가 받은 경로에 절반만 쓰고 예외를 내도 대상은 그대로이고, 같은 예외 객체가 호출한 쪽으로 온다."""
    target = tmp_path / TARGET_NAME
    target.write_bytes(OLD_BYTES)
    error = FakeWriteError("쓰는 도중 실패")
    received: list[Path] = []

    def half_then_fail(tmp: Path) -> None:
        received.append(tmp)
        Path(tmp).write_bytes(HALF_BYTES)
        raise error

    with pytest.raises(FakeWriteError) as excinfo:
        _aw().write(target, half_then_fail)
    assert excinfo.value is error  # 감싸거나 바꾸지 않음
    assert received == [_part(target)]  # 같은 폴더의 <대상>.part 를 Path 로 받음
    assert target.read_bytes() == OLD_BYTES


@pytest.mark.parametrize("case", list(FAILING))
def test_wrapper_failure_keeps_target(tmp_path: Path, case: str) -> None:
    """write_csv·write_text 도 쓰는 도중 실패하면 대상은 그대로이고 예외는 그대로 올라온다."""
    target = tmp_path / TARGET_NAME
    target.write_bytes(OLD_BYTES)
    with pytest.raises(UnicodeEncodeError):
        FAILING[case](target)
    assert target.read_bytes() == OLD_BYTES  # 바로 쓰면 머리줄만 남거나(to_csv) 비어 버린다(write_text)


@pytest.mark.parametrize("after_crash", [False, True], ids=["first_run", "after_crash"])
@pytest.mark.parametrize("case", list(CASES))
def test_success_matches_direct_write(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, case: str,
                                      after_crash: bool) -> None:
    """정상 종료: 바로 쓴 것과 바이트가 같고, 폴더에 대상만 남으며(*.part 없음), 임시 → 대상 교체가 1번 일어난다.

    after_crash: 직전 실행이 쓰는 도중 끝나 옛 대상과 더 긴 .part 가 남은 상태에서 다시 쓴다.
    """
    atomic, direct = CASES[case]
    expected = tmp_path / "direct" / TARGET_NAME
    expected.parent.mkdir()
    direct(expected)
    target = tmp_path / "atomic" / TARGET_NAME
    target.parent.mkdir()
    if after_crash:
        target.write_bytes(OLD_BYTES)
        _part(target).write_bytes(STALE_PART_BYTES)
    replaced = _record_replace(monkeypatch)
    atomic(target)
    assert target.read_bytes() == expected.read_bytes()
    assert sorted(p.name for p in target.parent.iterdir()) == [TARGET_NAME]  # *.part 가 남지 않음
    assert replaced == [(_part(target), target)]  # 같은 폴더의 <대상>.part → 대상(Path.replace)


# ---------- 정적 검사: 호출부 7곳 ----------

SOURCES = ["build_index.py", "build_country_index.py", "blend.py", "ucdp.py"]
TARGETS = {"INDEX_FILE", "COUNTRY_INDEX_FILE", "COUNTRY_META_FILE", "BLEND_FILE", "MONTHLY_FILE", "OPPONENT_FILE"}
DIRECT_WRITES = {"to_csv", "write_text"}
ASOF = ".asof"
PATH_ARG = {"write_csv": 1, "write_text": 0}  # 공용 함수의 경로 인자 위치: write_csv(df, path), write_text(path, text)
FUNC_OPTIONS = {"write_csv": CSV_OPTIONS, "write_text": TEXT_OPTIONS}
# 이슈 표의 7곳: (파일, 공용 함수, 경로 상수, .asof 경로인지). 주석의 줄 번호는 바꾸기 전 기준
SITES = [
    ("build_index.py", "write_csv", "INDEX_FILE", False),  # :46
    ("build_country_index.py", "write_csv", "COUNTRY_INDEX_FILE", False),  # :209
    ("build_country_index.py", "write_csv", "COUNTRY_META_FILE", False),  # :216
    ("blend.py", "write_text", "BLEND_FILE", False),  # :65
    ("ucdp.py", "write_csv", "MONTHLY_FILE", False),  # :126
    ("ucdp.py", "write_csv", "OPPONENT_FILE", False),  # :127
    ("ucdp.py", "write_text", "MONTHLY_FILE", True),  # :128
]
# 검사기 자체 확인용 표본. 1~4줄은 바로 쓰기, 5~7줄은 공용 함수 호출, 8줄은 상수를 읽어 다른 곳에 쓰기
DETECTOR_SAMPLE = '''\
out.to_csv(INDEX_FILE, index=False, encoding="utf-8")
m.to_csv(path_or_buf=COUNTRY_META_FILE)
Path(str(MONTHLY_FILE) + ".asof").write_text(as_of, encoding="utf-8")
blend.BLEND_FILE.write_text(text)
atomic_write.write_csv(out, INDEX_FILE, index=False, encoding="utf-8")
atomic_write.write_csv(out, COUNTRY_INDEX_FILE, index=False, encoding="utf-8")
atomic_write.write_text(Path(str(MONTHLY_FILE) + ".asof"), as_of, encoding="utf-8")
pd.read_csv(MONTHLY_FILE).to_csv(tmp)
'''


def _tree(name: str) -> ast.Module:
    return ast.parse((ROOT / name).read_text(encoding=ENCODING), filename=name)


def _calls(tree: ast.AST) -> list[ast.Call]:
    return [n for n in ast.walk(tree) if isinstance(n, ast.Call)]


def _mentions(expr: ast.AST, names: set[str]) -> bool:
    """식 안에 names 가 이름(INDEX_FILE)이나 속성(blend.BLEND_FILE)으로 나오는지. 이름은 통째로 비교한다."""
    return any((isinstance(n, ast.Name) and n.id in names) or (isinstance(n, ast.Attribute) and n.attr in names)
               for n in ast.walk(expr))


def _has_asof(expr: ast.AST) -> bool:
    return any(isinstance(n, ast.Constant) and isinstance(n.value, str) and ASOF in n.value for n in ast.walk(expr))


def _path_arg(call: ast.Call, index: int, keyword: str) -> ast.AST | None:
    if len(call.args) > index:
        return call.args[index]
    return next((k.value for k in call.keywords if k.arg == keyword), None)


def _direct_writes(tree: ast.AST) -> list[ast.Call]:
    """대상 상수에 바로 쓰는 호출. X.to_csv 는 경로 인자를, X.write_text 는 X 를 본다."""
    hits = []
    for c in _calls(tree):
        f = c.func
        if not isinstance(f, ast.Attribute) or f.attr not in DIRECT_WRITES:
            continue
        target = f.value if f.attr == "write_text" else _path_arg(c, 0, "path_or_buf")
        if target is not None and _mentions(target, TARGETS):
            hits.append(c)
    return hits


def _atomic_calls(tree: ast.AST, func: str, const: str, asof: bool) -> list[ast.Call]:
    """atomic_write.<func> 호출 중 경로 인자에 const 가 나오고 .asof 여부가 맞는 것."""
    hits = []
    for c in _calls(tree):
        f = c.func
        is_atomic = isinstance(f, ast.Attribute) and isinstance(f.value, ast.Name) and f.value.id == MODULE
        if not is_atomic or f.attr != func:
            continue
        target = _path_arg(c, PATH_ARG[func], "path")
        if target is not None and _mentions(target, {const}) and _has_asof(target) == asof:
            hits.append(c)
    return hits


def test_static_detector_sample() -> None:
    """검사기 자체 확인(오탐·미탐): 표본의 바로 쓰기 4줄만 잡고, 공용 함수 호출은 상수·.asof 별로 가려낸다."""
    tree = ast.parse(DETECTOR_SAMPLE)
    assert sorted(c.lineno for c in _direct_writes(tree)) == [1, 2, 3, 4]
    assert [c.lineno for c in _atomic_calls(tree, "write_csv", "INDEX_FILE", False)] == [5]  # COUNTRY_INDEX_FILE 제외
    assert [c.lineno for c in _atomic_calls(tree, "write_text", "MONTHLY_FILE", True)] == [7]
    assert _atomic_calls(tree, "write_text", "MONTHLY_FILE", False) == []  # .asof 경로를 MONTHLY_FILE 로 세지 않음


@pytest.mark.parametrize("name", SOURCES)
def test_static_no_direct_writes(name: str) -> None:
    """대상 상수(.asof 경로 포함)에 바로 to_csv·write_text 하는 호출이 0건."""
    hits = sorted(f"{name}:{c.lineno}: {ast.unparse(c)}" for c in _direct_writes(_tree(name)))
    assert hits == []


@pytest.mark.parametrize(("name", "func", "const", "asof"), SITES,
                         ids=[f"{n}:{c}{ASOF if a else ''}" for n, _, c, a in SITES])
def test_static_site_calls_atomic_write(name: str, func: str, const: str, asof: bool) -> None:
    """7곳이 각각 atomic_write.write_csv·write_text 를 한 번, 지금 경로·옵션 그대로 부른다."""
    tree = _tree(name)
    assert any(isinstance(s, ast.Import) and any(a.name == MODULE and a.asname is None for a in s.names)
               for s in tree.body), f"{name}: 맨 위 import {MODULE} 없음"
    calls = _atomic_calls(tree, func, const, asof)
    assert len(calls) == 1, f"{name}: {MODULE}.{func}(... {const}{ASOF if asof else ''} ...) 호출 {len(calls)}건"
    options = {k.arg: ast.unparse(k.value) for k in calls[0].keywords if k.arg in FUNC_OPTIONS[func]}
    assert options == {k: repr(v) for k, v in FUNC_OPTIONS[func].items()}  # 옵션은 지금처럼 키워드 그대로

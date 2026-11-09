"""M4 이슈 #10(4-2)·#12(4-4)·#13(4-5) 프론트 소스 인수 테스트.

순수 로직(위치 반올림·요청 경로)은 node --test 로 확인한다:
  frontend/src/entities/shelter/model/coords.test.ts
여기서는 그 모듈이 별칭 없이 import 되는지와 고정 문구·속성·저장소 미사용만 소스 grep 으로 확인한다.

계약 (구현은 이 계약을 따른다)
- Advisory.source 에 "kr_mofa". ADVISORY_LEVELS 에 외교부 단계 이름(여행유의·여행자제·출국권고·여행금지).
- 대피소: frontend/src/entities/shelter/ (index.ts, model/coords.ts), frontend/src/widgets/nearby-shelters/ (index.ts)
  좌표 쿼리(lat=)는 coords.ts 에서만 만든다. shelter 엔티티·위젯은 localStorage·sessionStorage·document.cookie 를 쓰지 않는다.
  getCurrentPosition 시간 초과 10초. 고정 문구는 아래 상수 그대로.
- 재외공관: frontend/src/widgets/embassy-contacts/ (index.ts), 전화는 tel: 링크.
- HomePage 가 두 위젯을 쓰고, footer 데이터 출처에 외교부·행정안전부.

브라우저 수동: 로드 시 위치 팝업 없음(시크릿 창), Network 의 lat·lon 자릿수, 허용·거부 흐름, 시·도→시·군·구 선택,
Application 탭 저장소·쿠키, available:false 시 DOM 없음, 키보드 조작, 외교부 맨 앞 표시·새 탭, KOR·국가 쌍 선택 시
연락처 영역 DOM 없음, 폭 375/1280, 콘솔 오류, tsc·lint.
"""

import re
from pathlib import Path

import pytest

FRONTEND = Path(__file__).resolve().parents[1] / "frontend"
SRC = FRONTEND / "src"
BLOCK_COMMENT = re.compile(r"/\*.*?\*/", re.S)
LINE_COMMENT = re.compile(r"(?<![:\"'`])//.*")

COUNTRY_TYPES = SRC / "entities" / "country" / "model" / "types.ts"
GUIDE = SRC / "entities" / "guide" / "model" / "guide.ts"
HOME = SRC / "views" / "home" / "ui" / "HomePage.tsx"
SHELTER_ENTITY = SRC / "entities" / "shelter"
COORDS = SHELTER_ENTITY / "model" / "coords.ts"
SHELTER_WIDGET = SRC / "widgets" / "nearby-shelters"
EMBASSY_WIDGET = SRC / "widgets" / "embassy-contacts"
MOFA_LEVELS = ["여행유의", "여행자제", "출국권고", "여행금지"]
FIND_NEARBY = "내 주변 대피소 찾기"
FIND_BY_REGION = "지역으로 찾기"
LOCATION_FAILED = "위치를 쓸 수 없습니다. 지역으로 찾아 주세요."
PRIVACY_NOTICE = "위치는 대피소 검색에만 쓰고 저장하지 않습니다. 약 1km 단위로 반올림해 보냅니다."
STORAGE = re.compile(r"\b(localStorage|sessionStorage|document\.cookie)\b")


def _code(path: Path) -> str:
    """주석을 뺀 소스."""
    assert path.exists(), f"없음: {path.relative_to(FRONTEND)}"
    text = path.read_text(encoding="utf-8")
    return LINE_COMMENT.sub("", BLOCK_COMMENT.sub("", text))


def _dir_code(path: Path) -> str:
    """디렉터리 아래 .ts/.tsx(테스트 제외) 소스를 이어 붙임."""
    assert path.is_dir(), f"없음: {path.relative_to(FRONTEND)}"
    files = [p for p in sorted(path.rglob("*.ts*")) if ".test." not in p.name]
    assert files, f"소스 없음: {path.relative_to(FRONTEND)}"
    return "\n".join(_code(p) for p in files)


# --- #10 (4-2) ---

def test_advisory_source_has_kr_mofa() -> None:
    m = re.search(r"source:\s*([^;]+);", _code(COUNTRY_TYPES))
    assert m and '"kr_mofa"' in m.group(1)


def test_guide_has_mofa_levels() -> None:
    code = _code(GUIDE)
    block = code[code.index("ADVISORY_LEVELS"):]
    assert all(name in block for name in MOFA_LEVELS), MOFA_LEVELS


# --- #12 (4-4) ---

def test_shelter_modules_exist() -> None:
    assert (SHELTER_ENTITY / "index.ts").exists()
    assert (SHELTER_WIDGET / "index.ts").exists()


def test_coords_is_alias_free() -> None:
    # node --test 가 @/ 별칭을 못 풀므로 단일 파일 계약
    assert not re.search(r"from\s+[\"']@/", _code(COORDS)), "@/ 별칭 import 사용"


def test_coord_query_built_only_in_coords() -> None:
    offenders = [p.relative_to(SRC).as_posix() for p in SRC.rglob("*.ts*")
                 if p != COORDS and ".test." not in p.name and re.search(r"[?&]lat=", _code(p))]
    assert offenders == []


@pytest.mark.parametrize("text", [FIND_NEARBY, FIND_BY_REGION, LOCATION_FAILED, PRIVACY_NOTICE])
def test_shelter_fixed_texts(text: str) -> None:
    assert text in _dir_code(SHELTER_WIDGET)


def test_shelter_geolocation_timeout_and_map_link() -> None:
    code = _dir_code(SHELTER_WIDGET)
    assert "getCurrentPosition" in code
    assert re.search(r"\b10_?000\b", code), "위치 요청 시간 초과 10초"
    assert 'target="_blank"' in code and 'rel="noreferrer"' in code


def test_shelter_no_browser_storage() -> None:
    hits = STORAGE.findall(_dir_code(SHELTER_ENTITY) + _dir_code(SHELTER_WIDGET))
    assert hits == []


# --- #13 (4-5) ---

def test_embassy_widget_tel_links() -> None:
    assert (EMBASSY_WIDGET / "index.ts").exists()
    assert "tel:" in _dir_code(EMBASSY_WIDGET)


# --- 배치·출처 ---

def test_home_uses_widgets_and_footer_sources() -> None:
    code = _code(HOME)
    assert re.search(r"[\"']@/widgets/nearby-shelters[\"']", code)
    assert re.search(r"[\"']@/widgets/embassy-contacts[\"']", code)
    assert "외교부" in code and "행정안전부" in code

"""M4 이슈 #10(4-2)·#12(4-4)·#13(4-5) 프론트 소스 인수 테스트.

순수 로직(위치 반올림·요청 경로)은 node --test 로 확인한다:
  frontend/src/entities/shelter/model/coords.test.ts
여기서는 그 모듈이 별칭 없이 import 되는지와 고정 문구·속성·저장소 미사용만 소스 grep 으로 확인한다.

계약 (구현은 이 계약을 따른다)
- Advisory.source 에 "kr_mofa". ADVISORY_LEVELS 에 외교부 단계 이름(여행유의·여행자제·출국권고·여행금지).
- 대피소: frontend/src/entities/shelter/ (index.ts, model/coords.ts), frontend/src/widgets/nearby-shelters/ (index.ts)
  좌표 쿼리(lat=)는 coords.ts 에서만 만든다. shelter 엔티티·위젯은 localStorage·sessionStorage·document.cookie 를 쓰지 않는다.
  (이슈 #81 명세 변경, plan.md Q4 B) 지역 결과는 "이 기기에 저장"을 누를 때만 Cache Storage 에 남는다.
  Cache Storage(caches)는 위젯의 model/saved.ts 에서만 쓰고, 그 캐시 이름(SAVED_CACHE)은 public/sw.js 의 SAVED 와 같으며
  sw.js activate 가 지우지 않는다. 고정 문구 PRIVACY_NOTICE 는 이 동작에 맞춘 문구다.
  getCurrentPosition 시간 초과 10초. 고정 문구는 아래 상수 그대로.
- 재외공관: frontend/src/widgets/embassy-contacts/ (index.ts), 전화는 tel: 링크.
- HomePage 가 두 위젯을 쓰고, 푸터 위젯(frontend/src/widgets/site-footer/) 데이터 출처에 외교부·행정안전부.
  (이슈 #26: 푸터 위치 이동에 따른 검사 경로 변경. 예전에는 HomePage.tsx 의 footer)

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
SITE_FOOTER = SRC / "widgets" / "site-footer"
MOFA_LEVELS = ["여행유의", "여행자제", "출국권고", "여행금지"]
FIND_NEARBY = "내 주변 대피소 찾기"
FIND_BY_REGION = "지역으로 찾기"
LOCATION_FAILED = "위치를 쓸 수 없습니다. 지역으로 찾아 주세요."
# 이슈 #81 명세 변경: 지역 결과 저장이 생겨 "저장하지 않습니다"를 위치에만 한정하고 저장 조건을 적는다
PRIVACY_NOTICE = "위치(내 주변 찾기)는 저장하지 않습니다. 지역 결과는 '이 기기에 저장'을 누를 때만 이 기기에 남습니다."
ROUNDING_NOTICE = "위치는 약 1km 단위로 반올림해 보냅니다."
SAVE_BUTTON = "이 기기에 저장"
SAVED_MODEL = SHELTER_WIDGET / "model" / "saved.ts"
SW = FRONTEND / "public" / "sw.js"
CACHE_STORAGE = re.compile(r"\bcaches\.")
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


@pytest.mark.parametrize("text", [FIND_NEARBY, FIND_BY_REGION, LOCATION_FAILED, PRIVACY_NOTICE, ROUNDING_NOTICE, SAVE_BUTTON])
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


def test_shelter_cache_storage_only_in_saved_model() -> None:
    # 이슈 #81: 저장은 model/saved.ts 한 곳에서만(키에 지역 이름만 넣는 것은 saved.test.ts·e2e 가 본다)
    files = [p for d in (SHELTER_ENTITY, SHELTER_WIDGET) for p in sorted(d.rglob("*.ts*")) if ".test." not in p.name]
    offenders = [p.relative_to(SRC).as_posix() for p in files if p != SAVED_MODEL and CACHE_STORAGE.search(_code(p))]
    assert offenders == []
    assert CACHE_STORAGE.search(_code(SAVED_MODEL))


def test_saved_cache_kept_by_service_worker() -> None:
    # 저장 캐시 이름이 sw.js 의 SAVED 와 같고 activate 가 그 이름을 지우지 않는다(다음 버전 서비스 워커가 사용자 저장본을 지우지 않게)
    m = re.search(r'SAVED_CACHE\s*=\s*"([^"]+)"', _code(SAVED_MODEL))
    sw = _code(SW)
    assert m and f'const SAVED = "{m.group(1)}";' in sw
    assert re.search(r"key\s*!==\s*CACHE\s*&&\s*key\s*!==\s*SAVED", sw), "activate 가 SAVED 를 남기지 않음"


# --- #13 (4-5) ---

def test_embassy_widget_tel_links() -> None:
    assert (EMBASSY_WIDGET / "index.ts").exists()
    assert "tel:" in _dir_code(EMBASSY_WIDGET)


# --- 배치·출처 ---

def test_home_uses_widgets_and_footer_sources() -> None:
    code = _code(HOME)
    assert re.search(r"[\"']@/widgets/nearby-shelters[\"']", code)
    assert re.search(r"[\"']@/widgets/embassy-contacts[\"']", code)
    # 푸터 위치 이동에 따른 검사 경로 변경(이슈 #26 할 일 3): 데이터 출처는 푸터 위젯에 있다
    footer = _dir_code(SITE_FOOTER)
    assert "외교부" in footer and "행정안전부" in footer

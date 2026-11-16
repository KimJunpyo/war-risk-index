"""worker/test/shelters.spec.ts 용 대피소 픽스처 shelters.json 을 #50 회귀 픽스처(tests/fixtures/m12)로 만든다.

- files: publish._shelter_payloads() 가 만드는 R2 파일(api/ 아래 키 → 내용). 작게 두려고 meta·타일 전부와 REGION_FILES 만 넣는다
- cases: [쿼리, main.list_shelters 응답]. 좌표는 test_m12_publish.POINTS, 지역은 REGIONS

저장소 루트에서 실행: .venv\\Scripts\\python.exe worker\\test\\fixtures\\make_shelters.py
대피소 응답 형식(publish·main)이나 m12 픽스처가 바뀌면 다시 만들고 생성물도 함께 커밋한다.
"""

import json
import os
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))  # main 이 루트의 수집 모듈을 최상위 이름으로 import 함
sys.path.insert(0, str(ROOT / "tests"))  # POINTS 는 pytest 처럼 test_m12_publish 를 최상위 이름으로 읽는다
os.environ["LIVE_UPDATES"] = "0"  # tests/conftest.py 처럼 main import 전에 백그라운드 갱신을 끈다

import publish  # noqa: E402
from backend.app import main  # noqa: E402
from test_m12_publish import FIX, KEY_ENV, POINTS  # noqa: E402

OUT = Path(__file__).resolve().parent / "shelters.json"
REGION_FILES = ["부산광역시/서구", "서울특별시/노원구"]  # files 에 넣을 지역 파일(시설이 적은 것)
# 시·군·구, 공백이 섞인 같은 지역, 시·군·구 뒤에 낱말이 더 붙은 것(첫 공백에서만 나눈다), 없는 시·군·구,
# 픽스처에 시설이 없는 시·도, 목록에 없는 지역
REGIONS = ["부산광역시 서구", "  부산광역시   서구 ", "서울특별시 노원구", "서울특별시 노원구 상계동", "서울특별시 없는구",
           "제주특별자치도", "없는지역"]


def run() -> None:
    os.environ[KEY_ENV] = "fixture-key"  # 값은 쓰지 않는다. 키가 있어야 대피소 파일을 읽는다
    main.ROOT = FIX
    payloads = publish._shelter_payloads()
    keep = {"shelters/meta.json", *(f"shelters/region/{r}.json" for r in REGION_FILES)}
    files = {f"api/{rel}": v for rel, v in payloads.items() if rel in keep or rel.startswith("shelters/tiles/")}
    cases: list[list[Any]] = [[{"lat": lat, "lon": lon}, main.list_shelters(lat=lat, lon=lon, region=None)]
                              for lat, lon in POINTS]
    cases += [[{"region": r}, main.list_shelters(lat=None, lon=None, region=r)] for r in REGIONS]
    OUT.write_text(json.dumps({"files": files, "cases": cases}, ensure_ascii=False, allow_nan=False,
                              separators=(",", ":")), encoding="utf-8")
    print(f"{len(files)}개 파일, {len(cases)}개 사례, {OUT.stat().st_size / 1e3:.0f}KB → {OUT}")


if __name__ == "__main__":
    run()

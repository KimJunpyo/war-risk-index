"""지금 API(backend/app/main.py)의 고정 엔드포인트 응답을 out/api/ 아래 JSON 파일로 미리 만든다(#50).

Cloudflare Worker 는 이 파일을 내주기만 한다. news 는 동적이라 만들지 않는다(#54).
계산은 main.py 의 엔드포인트 함수를 그대로 부르고, "응답 행 만들기(build) → JSON 쓰기(write)" 두 단계로 나눈다.
나중에 같은 행을 D1 에 넣을 때는 build() 결과만 쓰면 된다.

대피소
- 위치 검색: 0.1° 격자 타일 shelters/tiles/{floor(lat*10)}_{floor(lon*10)}.json. Worker 는 main.list_shelters 와 같은
  사각형 범위의 타일을 합쳐 사각형·반경 필터 → 거리순 정렬 → SHELTER_NEARBY_LIMIT 자르기를 한다.
- 지역 검색: shelters/region/{시·도}.json, shelters/region/{시·도}/{시·군·구}.json (응답 그대로, 이름순·상한 적용).
  목록에 없는 지역은 Worker 가 shelters/meta.json 의 available·as_of 로 빈 응답을 만든다.

프로젝트 루트에서 실행: python publish.py
"""

import json
import math
import time
from pathlib import Path
from typing import Any

import atomic_write
from backend.app import main
from backend.app.pairs import PAIRS

OUT_DIR = main.ROOT / "out" / "api"
CATALYST_DAYS = 90  # 프론트가 쓰는 기간(CatalystPanel.tsx). 이 기간 파일 하나만 만든다
TILE_SCALE = 10  # 0.1° 격자: 키 = floor(좌표 × 10)
TILE_FIELDS = ["name", "address", "lat", "lon", "capacity", "kind"]  # distance_m 은 Worker 가 계산


def tile_key(lat: float, lon: float) -> str:
    """좌표가 속한 타일 이름(확장자 없음)."""
    return f"{math.floor(lat * TILE_SCALE)}_{math.floor(lon * TILE_SCALE)}"


def _shelter_payloads() -> dict[str, Any]:
    """대피소 메타·지역 목록·지역별 응답·위치 타일."""
    df = main._shelters()
    regions = main.shelter_regions()
    out: dict[str, Any] = {
        "shelters/regions.json": regions,
        "shelters/meta.json": {"available": not df.empty, "as_of": df["updated"].max() if len(df) else None},
    }
    for r in regions["regions"]:
        sido = r["sido"]
        out[f"shelters/region/{sido}.json"] = main.list_shelters(lat=None, lon=None, region=sido)
        for sigungu in r["sigungu"]:
            out[f"shelters/region/{sido}/{sigungu}.json"] = main.list_shelters(lat=None, lon=None,
                                                                               region=f"{sido} {sigungu}")
    if len(df):
        items = main._shelter_items(df.assign(distance_m=None))
        tiles: dict[str, list[dict]] = {}
        for item in items:
            tiles.setdefault(tile_key(item["lat"], item["lon"]), []).append({k: item[k] for k in TILE_FIELDS})
        out.update({f"shelters/tiles/{k}.json": v for k, v in tiles.items()})
    return out


def build() -> dict[str, Any]:
    """{out/api 기준 상대 경로: 응답 객체}. 파일은 쓰지 않는다."""
    out: dict[str, Any] = {
        "pairs.json": main.list_pairs(),
        "countries.json": main.list_countries(),
        "cases.json": main.list_cases(),
        "blend.json": main.blend_weights(),
        "live.json": main.live_status(),
        # Worker 가 요청 시각 기준으로 나이를 계산한다(/api/health 와 같은 원천)
        "status.json": dict(zip(("live_as_of", "index_date"), main.freshness())),
    }
    for pid in PAIRS:
        out[f"pairs/{pid}/index.json"] = main.pair_index(pid)
        out[f"pairs/{pid}/catalysts.json"] = main.pair_catalysts(pid, days=CATALYST_DAYS)
    cat = main.country_catalyst_rows()  # 나라마다 전체 표를 다시 합치고 거르지 않도록 한 번만 읽고 나눔
    src = cat.groupby("src").indices if len(cat) else {}
    dst = cat.groupby("dst").indices if len(cat) else {}
    for c in out["countries.json"]:
        code = c["code"]
        rows = cat.iloc[sorted({*src.get(code, ()), *dst.get(code, ())})]
        out[f"countries/{code}/index.json"] = main.country_index(code)
        out[f"countries/{code}/catalysts.json"] = main.country_catalyst_response(rows, code, CATALYST_DAYS)
        out[f"countries/{code}/embassies.json"] = main.country_embassies(code)
    out.update(_shelter_payloads())
    return out


def write(payloads: dict[str, Any], out_dir: Path = OUT_DIR) -> None:
    """응답 객체를 JSON 파일로 원자적으로 쓰고, 이번에 만들지 않은 옛 파일(사라진 타일·지역 등)은 지운다."""
    for rel, payload in payloads.items():
        path = out_dir / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        atomic_write.write_text(path, json.dumps(payload, ensure_ascii=False, allow_nan=False, separators=(",", ":")))
    keep = {(out_dir / rel).resolve() for rel in payloads}
    for path in out_dir.rglob("*.json"):
        if path.resolve() not in keep:
            path.unlink()


def run(out_dir: Path = OUT_DIR) -> None:
    started = time.perf_counter()
    payloads = build()
    write(payloads, out_dir)
    size = sum((out_dir / rel).stat().st_size for rel in payloads)
    print(f"{len(payloads)}개 파일, {size / 1e6:.1f}MB, {time.perf_counter() - started:.1f}초 → {out_dir}")


if __name__ == "__main__":
    run()

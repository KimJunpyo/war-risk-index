"""공공데이터포털(data.go.kr) 공통 호출.

키는 .env 의 DATA_GO_KR_SERVICE_KEY(포털 "인코딩 키"). 키 값은 로그·파일·예외 메시지에 남기지 않는다.
"""

import json
import os
import urllib.parse
import urllib.request

KEY_ENV = "DATA_GO_KR_SERVICE_KEY"
TIMEOUT_SECONDS = 60
OK_CODES = {"0", "00"}  # 서비스마다 성공 코드 표기가 다름
MAX_PAGES = 50  # totalCount 가 비정상일 때 무한 호출 방지


def service_key() -> str | None:
    """호출 시점의 환경변수를 읽어 인코딩 키를 원래 값으로 되돌린다. 없으면 None."""
    key = os.environ.get(KEY_ENV, "").strip()
    return urllib.parse.unquote(key) if key else None  # unquote_plus 는 키 안의 + 를 공백으로 바꿈


def _get_json(url: str) -> dict:
    """유일한 네트워크 지점(테스트가 바꿔 끼움)."""
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as r:
        return json.loads(r.read().decode("utf-8"))


def fetch_all(url: str, page_size: int, max_pages: int = MAX_PAGES, **params: str) -> list[dict]:
    """totalCount 를 다 받을 때까지 pageNo 를 올려 items.item 을 모은다. 키 없거나 오류 코드면 RuntimeError.
    건수가 많은 데이터(대피시설 등)는 max_pages 를 호출별로 늘린다."""
    key = service_key()
    if not key:
        raise RuntimeError(f"{KEY_ENV} 없음")
    out: list[dict] = []
    for page in range(1, max_pages + 1):
        # urlencode 가 키를 한 번만 인코딩
        query = urllib.parse.urlencode({"serviceKey": key, "pageNo": page, "numOfRows": page_size,
                                        "returnType": "json", **params})
        res = _get_json(f"{url}?{query}")["response"]
        header, body = res.get("header", {}), res.get("body", {})
        if str(header.get("resultCode")) not in OK_CODES:
            raise RuntimeError(f"data.go.kr 오류 {header.get('resultCode')}: {header.get('resultMsg')}")
        items = (body.get("items") or {}).get("item") or []
        items = [items] if isinstance(items, dict) else items
        out += items
        total = int(body.get("totalCount") or 0)
        if len(out) >= total:
            return out
        if not items:  # 중간 빈 페이지: 일부만 받은 결과로 기존 데이터를 덮어쓰지 않도록 실패 처리
            raise RuntimeError(f"data.go.kr 일부만 수신 ({len(out)}/{total}건)")
    raise RuntimeError(f"data.go.kr 페이지 수가 {max_pages} 를 넘음")

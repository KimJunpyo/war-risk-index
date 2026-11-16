"""공공데이터포털(data.go.kr) 공통 호출.

키는 .env 의 DATA_GO_KR_SERVICE_KEY(포털 "인코딩 키"). 키 값은 로그·파일·예외 메시지에 남기지 않는다.
"""

import http.client
import json
import os
import time
import urllib.parse
import urllib.request
from collections.abc import Iterator
from pathlib import Path

KEY_ENV = "DATA_GO_KR_SERVICE_KEY"
# 요청 하나의 제한 시간. 대피시설 API 는 가끔 수십 초씩 멈춘다(2026-11 로컬 실측 10쪽 중 3쪽이 9·18·43초, 나머지 0.5초 안).
# 오래 기다리기보다 끊고 다시 부르는 편이 빠르다
TIMEOUT_SECONDS = 20
PAGE_TRIES = 3  # 쪽마다 시도 횟수. 일시 오류(네트워크·시간 초과·HTTP 오류·응답 형식 이상)만 다시 부른다
RETRY_PAUSE_SECONDS = 1.0  # 다시 부르기 전에 쉬는 시간
FAILURE_SUFFIX = ".failed"  # 데이터 파일 옆에 마지막 실패 시각(epoch 초)을 적는 파일의 확장자
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


def _page(url: str) -> dict:
    """한 쪽 응답의 response. 없으면 ValueError.

    게이트웨이 오류(OpenAPI_ServiceResponse. 예: 04 = 제공 기관 서버가 응답하지 않음)는 표준 코드·문구만 알리고,
    그 밖의 모양은 최상위 키 이름만 알린다(값에 무엇이 섞였을지 몰라 남기지 않음).
    """
    res = _get_json(url)
    if isinstance(res, dict) and isinstance(res.get("response"), dict):
        return res["response"]
    gateway = res.get("OpenAPI_ServiceResponse") if isinstance(res, dict) else None
    head = gateway.get("cmmMsgHeader") if isinstance(gateway, dict) else None
    if isinstance(head, dict):
        raise ValueError(f"data.go.kr 게이트웨이 오류 {head.get('returnReasonCode')} {str(head.get('returnAuthMsg'))[:60]}")
    shape = sorted(res)[:5] if isinstance(res, dict) else type(res).__name__
    raise ValueError(f"data.go.kr 응답에 response 가 없음(최상위 키: {shape})")


def fetch_pages(url: str, page_size: int, first_page: int = 1, received: int = 0, max_pages: int = MAX_PAGES,
                budget_seconds: float | None = None,
                params: dict[str, str] | None = None) -> Iterator[tuple[int, list[dict], int]]:
    """first_page 부터 한 쪽씩 (쪽 번호, items.item, totalCount)를 낸다. 받은 건수가 totalCount 에 닿으면 끝난다.
    키 없거나 오류 코드면 RuntimeError. received 는 first_page 앞에서 이미 받은 건수다(이어 받기, shelters.
    쪽이 꽉 찼다고 가정해 세면 앞 쪽이 짧았을 때 일찍 끝난 것으로 보고 이어 받기가 멈춘다). params 는 쿼리에 더할 값이다.

    한 쪽이 일시 오류(네트워크·시간 초과·HTTP 오류·JSON 아님·response 없음)면 그 쪽만 PAGE_TRIES 번까지 다시 부르고,
    끝내 실패하면 RuntimeError(원래 예외는 __cause__). 오류 코드(resultCode)는 다시 부르지 않는다.
    budget_seconds 를 넘기면 다음 요청 전에 예외 없이 멈춘다(요청 하나는 TIMEOUT_SECONDS 까지 더 걸릴 수 있다).
    """
    key = service_key()
    if not key:
        raise RuntimeError(f"{KEY_ENV} 없음")
    started = time.monotonic()
    got, total = received, 0
    for page in range(first_page, max_pages + 1):
        # urlencode 가 키를 한 번만 인코딩
        query = urllib.parse.urlencode({"serviceKey": key, "pageNo": page, "numOfRows": page_size,
                                        "returnType": "json", **(params or {})})
        attempt = 1
        while True:
            if budget_seconds is not None and time.monotonic() - started > budget_seconds:
                return
            try:
                res = _page(f"{url}?{query}")
                break
            # urllib 의 HTTP·네트워크·시간 초과 오류는 OSError, 본문이 도중에 끊기면 HTTPException(IncompleteRead), JSON 아님은 ValueError
            except (OSError, http.client.HTTPException, ValueError) as e:
                if attempt == PAGE_TRIES:
                    raise RuntimeError(f"data.go.kr {page}쪽 {PAGE_TRIES}번 모두 실패({got}/{total}건 받음)") from e
                attempt += 1
                time.sleep(RETRY_PAUSE_SECONDS)
        header, body = res.get("header", {}), res.get("body", {})
        if str(header.get("resultCode")) not in OK_CODES:
            raise RuntimeError(f"data.go.kr 오류 {header.get('resultCode')}: {header.get('resultMsg')}")
        items = (body.get("items") or {}).get("item") or []
        items = [items] if isinstance(items, dict) else items
        got += len(items)
        total = int(body.get("totalCount") or 0)
        if got < total and not items:  # 중간 빈 페이지: 일부만 받은 결과로 기존 데이터를 덮어쓰지 않도록 실패 처리
            raise RuntimeError(f"data.go.kr 일부만 수신 ({got}/{total}건)")
        yield page, items, total
        if got >= total:
            return
    raise RuntimeError(f"data.go.kr 페이지 수가 {max_pages} 를 넘음")


def fetch_all(url: str, page_size: int, max_pages: int = MAX_PAGES, **params: str) -> list[dict]:
    """totalCount 를 다 받을 때까지 pageNo 를 올려 items.item 을 모은다(fetch_pages 를 끝까지 돈다).
    건수가 많은 데이터(대피시설 등)는 max_pages 를 호출별로 늘린다."""
    return [item for _, items, _ in fetch_pages(url, page_size, max_pages=max_pages, params=params) for item in items]


def _failure_file(data_file: Path) -> Path:
    return data_file.with_suffix(FAILURE_SUFFIX)


def failed_recently(data_file: Path, seconds: float) -> bool:
    """data_file 의 마지막 실패 시각(옆 .failed 파일)에서 seconds 가 안 지났으면 True. 파일이 없거나 깨졌으면 False.

    실패 시각을 프로세스 메모리가 아니라 파일에 둔다. 배치(batch.py)는 실행마다 새 프로세스라 메모리 값이 사라지지만,
    data/ 아래 파일은 R2 state 로 다음 실행에 넘어간다(#52). 서버를 다시 띄워도 남는다.
    """
    try:
        elapsed = time.time() - float(_failure_file(data_file).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return False
    return 0 <= elapsed < seconds  # 미래 시각(시계 차이·깨진 값)으로 계속 막히지 않게


def mark_failed(data_file: Path) -> None:
    """지금을 data_file 의 마지막 실패 시각으로 적는다.

    성공해도 지우지 않는다. 배치는 R2 state/ 키를 지우지 않아 지운 파일이 다음 받기 때 돌아오고,
    성공한 뒤에는 데이터 파일의 신선도 검사가 먼저 걸러 남은 실패 시각이 영향을 주지 않는다.
    """
    path = _failure_file(data_file)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f"{int(time.time())}\n", encoding="utf-8")  # 내림: 반올림하면 지금보다 미래가 되어 failed_recently 가 거른다

"""외교부 재외공관 정보 → data/embassies.csv (국가 ISO alpha-2 별 대한민국 공관 연락처).

공공데이터포털 EmbassyService2. serviceKey 가 없으면 받지 않는다.
영사콜센터 번호는 데이터와 별개로 상수로 둔다(해외 나라 선택 시 항상 표시).
"""

import html
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pandas as pd

import data_go_kr

EMBASSY_URL = "https://apis.data.go.kr/1262000/EmbassyService2/getEmbassyList2"
EMBASSY_FILE = Path("data/embassies.csv")
PAGE_SIZE = 100
REFRESH_SECONDS = 20 * 3600  # 파일이 이보다 새로우면 다시 받지 않음(하루 1회)
RETRY_SECONDS = 6 * 3600  # 실패 뒤 이 시간 동안은 재수신하지 않음(15분 주기 갱신 루프 대비)
EMBASSY_TYPE_CODE = "10"  # embassy_ty_cd: 10 대사관, 20 총영사관 등
COLUMNS = ["iso2", "name", "kind", "kind_cd", "address", "tel", "emergency_tel"]
# 수집일(KST) 열. 파일 mtime 은 복사·복원(배치 환경)하면 바뀌고 시간대도 달라 쓰지 않는다
COLLECTED_COLUMN = "collected"
KST = timezone(timedelta(hours=9))
# 영사콜센터 (출처 https://www.0404.go.kr, 확인일 2026-11-09)
CALL_CENTER = {"tel": "02-3210-0404", "tel_overseas": "+82-2-3210-0404", "source": "https://www.0404.go.kr"}
# 원문 오류로 알려진 행 (나라, 공관명, 주소에 든 글자). 주 멕시코 대사관 이름으로 아바나(쿠바) 주소·전화가 옴(2026-11-09).
# 좌표·주소 국가로 거르는 일반 규칙은 겸임 공관(코소보 → 빈 주재 대사관)까지 지워서 쓰지 않음.
# shortcut: 확인한 오류만 뺌, 원문이 고쳐지거나 새 오류가 보이면 이 목록을 갱신할 것
KNOWN_BAD = (("MX", "주 멕시코 대한민국 대사관", "La Habana"),)
_last_failure = 0.0  # 마지막 실패 시각(프로세스 메모리, 재시작하면 초기화)
_warned_no_key = False  # 키 없음 안내는 프로세스당 한 번만(15분 주기 갱신 루프 대비)


def _text(v: object) -> str:
    return html.unescape(str(v)).strip() if v is not None else ""  # 원문에 HTML 엔티티가 섞여 옴(코소보 &szlig; 등)


def parse(items: list[dict]) -> pd.DataFrame:
    """응답 item → 저장 표. 국가 코드 없는 행·완전 중복 행·알려진 오류 행 제외, 나라별 대사관 먼저."""
    rows = [{"iso2": _text(x.get("country_iso_alp2")).upper(), "name": _text(x.get("embassy_kor_nm")),
             "kind": _text(x.get("embassy_ty_cd_nm")), "kind_cd": _text(x.get("embassy_ty_cd")),
             "address": _text(x.get("emblgbd_addr")),  # 원문 필드 이름(embassy_addr 아님)
             "tel": _text(x.get("tel_no")), "emergency_tel": _text(x.get("urgency_tel_no"))}
            for x in items]
    df = pd.DataFrame(rows, columns=COLUMNS)
    df = df[df["iso2"] != ""].drop_duplicates()  # 원문에 같은 공관이 두 번 오는 경우가 있음(불가리아 등)
    for iso2, name, addr in KNOWN_BAD:  # 틀린 연락처는 보여주지 않음(그 나라는 영사콜센터만)
        df = df[~((df["iso2"] == iso2) & (df["name"] == name) & df["address"].str.contains(addr, regex=False))]
    df = df.assign(_order=(df["kind_cd"] != EMBASSY_TYPE_CODE).astype(int))
    return df.sort_values(["iso2", "_order", "name"]).drop(columns="_order").reset_index(drop=True)


def update(force: bool = False) -> bool:
    """하루 1회 받아 저장. 키 없으면 False(호출·쓰기 없음). 실패는 예외로 올리고 기존 파일은 그대로."""
    global _last_failure, _warned_no_key
    if not data_go_kr.service_key():
        if not _warned_no_key:
            print(f"재외공관: {data_go_kr.KEY_ENV} 없음, 건너뜀")
            _warned_no_key = True
        return False
    if not force and EMBASSY_FILE.exists() and time.time() - EMBASSY_FILE.stat().st_mtime < REFRESH_SECONDS:
        return False
    if not force and time.time() - _last_failure < RETRY_SECONDS:
        return False
    try:
        items = data_go_kr.fetch_all(EMBASSY_URL, PAGE_SIZE)
        df = parse(items)
        if df.empty:  # 정상 응답 0건도 실패로 보고 직전 파일 유지
            raise RuntimeError("재외공관 0건")
    except Exception:
        _last_failure = time.time()
        raise
    df = df.assign(**{COLLECTED_COLUMN: datetime.now(KST).strftime("%Y-%m-%d")})
    EMBASSY_FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = EMBASSY_FILE.with_suffix(".csv.part")
    df.to_csv(tmp, index=False, encoding="utf-8")
    tmp.replace(EMBASSY_FILE)
    print(f"재외공관: 원문 {len(items)}건 → 저장 {len(df)}건, {df['iso2'].nunique()}개국")
    return True


if __name__ == "__main__":
    update(force=True)

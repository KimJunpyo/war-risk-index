"""공식 v1 을 전 세계 국가 단위로 적용해 사이트용 파일 저장 + 국가 상태(전쟁 중/휴전/잦은 국방 이슈) 판정.

국가 점수 = 그 나라가 행위자인 갈등 언급 / 전체 언급 (쌍 점수와 같은 공식, 같은 기준선).
"""

import pandas as pd
import pycountry

import blend
import index_v1
import live
import ucdp
from country_collect import COUNTRY_FILE
from gpr_backtest import HIGH_RISK, OUT_DIR

COUNTRY_INDEX_FILE = OUT_DIR / "country_index.csv"
COUNTRY_META_FILE = OUT_DIR / "country_meta.csv"
# 최근 1년 하루 평균 언급이 이보다 적으면 제외. 변동성은 언급량과 무관했고(2026-11 분석), 기사 몇 건으로
# 상대 급등하는 작은 나라가 상위를 차지하지 않게 하려는 주목도 기준
MIN_AVG_MENTIONS = 1000
RECENT_DAYS = 365
CEASEFIRE_DAYS = 730  # 전쟁 종료 후 이 기간까지 '휴전·소강'
FREQUENT_WINDOW_DAYS = 90
FREQUENT_RATIO = 0.2  # 최근 90일 중 주간 100+ 비율이 이 이상이면 '잦은 국방 이슈' (평시 평균 약 5%)
FREQUENT_MIN_MENTIONS = 1000  # 언급이 적은 나라는 점수가 출렁여 '잦은 국방 이슈'에서 제외
# UCDP 공식 기준: 국가 관련 교전(state-based) 사망 연 25명 이상 = 무력 충돌, 1,000명 이상 = 전쟁
UCDP_WAR_DEATHS = 1000
UCDP_CONFLICT_DEATHS = 25
UCDP_WINDOW_MONTHS = 12
STATUS_WAR, STATUS_CONFLICT, STATUS_CEASEFIRE, STATUS_FREQUENT = "전쟁 중", "무력 충돌", "휴전·소강", "잦은 국방 이슈"
STATUS_CIVIL = "내전 중"
OPPONENT_LIMIT = 3  # 화면에 보여줄 교전 상대 수
# CAMEO 코드가 ISO alpha-3 와 다른 경우
CAMEO_TO_ISO = {"ROM": "ROU", "ZAR": "COD", "TMP": "TLS", "BUR": "MMR"}


def iso_info(code: str) -> dict | None:
    c = pycountry.countries.get(alpha_3=CAMEO_TO_ISO.get(code, code))
    return {"iso2": c.alpha_2, "numeric": c.numeric} if c else None


def iso2_of(iso3: str) -> str | None:
    c = pycountry.countries.get(alpha_3=iso3)
    return c.alpha_2 if c else None


def ucdp_summary(monthly: pd.DataFrame, as_of: str | None) -> pd.DataFrame:
    """UCDP 월별 → 국가별 최근 12개월 사망자(국가 관련 교전 / 전체 조직적 폭력), 직전 2년 내 전쟁 수준 여부."""
    cols = ["state_12m", "all_12m", "was_war"]
    if monthly.empty or not as_of:
        return pd.DataFrame(columns=cols)
    end = pd.Period(as_of[:7], freq="M")
    m = monthly.assign(p=pd.PeriodIndex(monthly["month"], freq="M"))
    recent = m[m["p"] > end - UCDP_WINDOW_MONTHS]
    state = m[m["type"] == "state"].pivot_table(index="p", columns="iso3", values="deaths", aggfunc="sum")
    state = state.reindex(pd.period_range(state.index.min(), end, freq="M"), fill_value=0).fillna(0)
    rolling = state.rolling(UCDP_WINDOW_MONTHS, min_periods=1).sum()
    past = rolling.loc[end - CEASEFIRE_DAYS // 30: end - UCDP_WINDOW_MONTHS]
    return pd.DataFrame({
        "state_12m": recent[recent["type"] == "state"].groupby("iso3")["deaths"].sum(),
        "all_12m": recent.groupby("iso3")["deaths"].sum(),
        "was_war": (past >= UCDP_WAR_DEATHS).any(),
    }).fillna({"state_12m": 0, "all_12m": 0, "was_war": False})


def opponent_summary(opps: pd.DataFrame, as_of: str | None) -> dict[str, dict]:
    """UCDP 교전 상대(월별) → iso3 → {states: 상대국 iso3, groups: 무장단체명, party_12m: 당사자로서 교전 사망}.

    최근 12개월, 사망 UCDP_CONFLICT_DEATHS 이상인 상대만, 사망자 많은 순 OPPONENT_LIMIT 개.
    """
    if opps.empty or not as_of:
        return {}
    end = pd.Period(as_of[:7], freq="M")
    o = opps[pd.PeriodIndex(opps["month"], freq="M") > end - UCDP_WINDOW_MONTHS]
    g = (o.groupby(["iso3", "opponent", "opponent_iso3"], dropna=False)["deaths"].sum().reset_index()
         .sort_values("deaths", ascending=False))
    g = g[g["deaths"] >= UCDP_CONFLICT_DEATHS]
    out = {}
    for iso3, x in g.groupby("iso3"):
        out[iso3] = {
            "states": x["opponent_iso3"].dropna().tolist()[:OPPONENT_LIMIT],
            "groups": x.loc[x["opponent_iso3"].isna(), "opponent"].tolist()[:OPPONENT_LIMIT],
            "party_12m": float(x["deaths"].sum()),
        }
    return out


def country_status(code: str, weekly: pd.Series, today: pd.Timestamp, ucdp_row: dict | None,
                   avg_mentions: float, opp: dict | None = None) -> tuple[str | None, str | None, list[str], list[str]]:
    """(상태, 근거, 상대국 iso3, 상대 무장단체). 우선순위: 전쟁·내전 > 무력 충돌 > 휴전·소강 > 잦은 국방 이슈.

    - 전쟁·충돌은 UCDP(전 세계, 약 1개월 지연) + 수동 등록 전쟁(index_v1.WAR_PERIODS, 날짜 정확) 중 하나라도 해당하면.
    - 1,000명 이상이면서 상대에 다른 나라 정부가 있으면 '전쟁 중', 무장단체뿐이면 '내전 중'.
    - 교전 규모 = 자국 영토 사망(state_12m)과 당사자로서 사망(해외 교전 포함) 중 큰 값.
    """
    u, o = ucdp_row or {}, opp or {}
    states, groups = list(o.get("states", [])), list(o.get("groups", []))
    intensity = max(float(u.get("state_12m", 0) or 0), float(o.get("party_12m", 0) or 0))
    pairs = [(pair, pd.Timestamp(e) if e else None) for pair, periods in index_v1.WAR_PERIODS.items()
             if code in pair.split("-") for s, e in periods if pd.Timestamp(s) <= today]
    ongoing = [p for p, e in pairs if e is None or e >= today]
    if ongoing:
        enemies = [CAMEO_TO_ISO.get(c, c) for p in ongoing for c in p.split("-") if c != code]
        return STATUS_WAR, "등록된 전쟁 진행 중", list(dict.fromkeys(enemies + states)), groups
    deaths = f"UCDP 최근 12개월 교전 사망 {intensity:,.0f}명"
    if intensity >= UCDP_WAR_DEATHS:
        return (STATUS_WAR if states else STATUS_CIVIL), deaths, states, groups
    if intensity >= UCDP_CONFLICT_DEATHS:
        return STATUS_CONFLICT, deaths, states, groups
    ended = [e for _, e in pairs if e is not None and (today - e).days <= CEASEFIRE_DAYS]
    if ended:
        return STATUS_CEASEFIRE, f"등록된 전쟁 종료 {max(ended):%Y-%m-%d}", [], []
    if u.get("was_war"):
        return STATUS_CEASEFIRE, "UCDP 최근 2년 내 전쟁 수준 → 현재 감소", [], []
    recent = weekly.loc[today - pd.Timedelta(days=FREQUENT_WINDOW_DAYS):].dropna()
    ratio = (recent >= HIGH_RISK).mean() if len(recent) else 0
    if avg_mentions >= FREQUENT_MIN_MENTIONS and ratio >= FREQUENT_RATIO:
        return STATUS_FREQUENT, f"최근 {FREQUENT_WINDOW_DAYS}일 중 {ratio:.0%}가 고위험(100+)", [], []
    return None, None, [], []


def self_check() -> None:
    today = pd.Timestamp("2026-11-01")
    quiet = pd.Series(50.0, index=pd.date_range(end=today, periods=200))
    rus = country_status("RUS", quiet, today, None, 5000)
    assert rus[0] == STATUS_WAR and rus[2] == ["UKR"]  # 등록 전쟁 상대국
    assert country_status("IND", quiet, today, None, 5000)[0] == STATUS_CEASEFIRE  # 2025-05 등록 전쟁 종료
    assert country_status("FRA", quiet, today, None, 5000) == (None, None, [], [])
    sdn = country_status("SDN", quiet, today, {"state_12m": 4000}, 5000, {"groups": ["RSF"]})
    assert sdn[0] == STATUS_CIVIL and sdn[3] == ["RSF"]  # 상대가 무장단체뿐 → 내전
    pak = country_status("PAK", quiet, today, {"state_12m": 3000}, 5000, {"states": ["AFG"], "groups": ["TTP"]})
    assert pak[0] == STATUS_WAR and pak[2] == ["AFG"]
    # 자국 영토 사망이 없어도 해외 교전 당사자면 반영 (예: 미국)
    assert country_status("USA", quiet, today, None, 5000, {"states": ["IRN"], "party_12m": 3800})[0] == STATUS_WAR
    assert country_status("NGA", quiet, today, {"state_12m": 300}, 5000)[0] == STATUS_CONFLICT
    assert country_status("IND", quiet, today, {"state_12m": 300}, 5000)[0] == STATUS_CONFLICT  # 충돌이 소강보다 우선
    assert country_status("ETH", quiet, today, {"state_12m": 0, "was_war": True}, 5000)[0] == STATUS_CEASEFIRE
    hot = quiet.copy()
    hot.iloc[-30:] = 120
    assert country_status("FRA", hot, today, None, 5000)[0] == STATUS_FREQUENT
    assert country_status("NRU", hot, today, None, 400) == (None, None, [], [])  # 언급 적은 나라 제외
    o = pd.DataFrame({"iso3": ["PAK", "PAK", "PAK"], "month": ["2026-05", "2026-06", "2024-01"],
                      "opponent": ["TTP", "Government of Afghanistan", "BLA"], "opponent_iso3": [None, "AFG", None],
                      "deaths": [900, 30, 500]})
    s = opponent_summary(o, "2026-09-30")["PAK"]
    assert s == {"states": ["AFG"], "groups": ["TTP"], "party_12m": 930.0}  # 2024 년(BLA)은 기간 밖
    m = pd.DataFrame({"iso3": ["SDN", "SDN", "ETH"], "month": ["2026-08", "2026-09", "2024-06"],
                      "type": ["state", "state", "state"], "deaths": [700, 600, 2000], "events": [1, 1, 1]})
    u = ucdp_summary(m, "2026-09-30")
    assert u.loc["SDN", "state_12m"] == 1300 and bool(u.loc["ETH", "was_war"]) and u.loc["ETH", "state_12m"] == 0
    assert iso_info("ROM")["iso2"] == "RO" and iso_info("AFR") is None


def add_blend(out: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    """국가 지수(v1)에 2.0 7일 점수(v2_weekly)와 종합 점수(blended)를 붙이고, 가중치를 추정·저장."""
    daily_v2 = pd.read_csv(live.V2_DAILY_COUNTRY, dtype={"key": str}) if live.V2_DAILY_COUNTRY.exists() else None
    if daily_v2 is None or daily_v2.empty:
        return out.assign(v2_weekly=float("nan"), blended=out["weekly"]), blend.DEFAULT
    v2 = live.v2_scores(daily_v2, "country")[["date", "country", "weekly"]].rename(columns={"weekly": "v2_weekly"})
    out = out.merge(v2, on=["date", "country"], how="left")
    w = blend.estimate(out.rename(columns={"weekly": "s1", "v2_weekly": "s2"}), "country")
    blend.save(w)
    out["blended"] = blend.combine(out["weekly"], out["v2_weekly"], w).round(1)
    out["v2_weekly"] = out["v2_weekly"].round(1)
    return out, w


def main() -> None:
    self_check()
    raw = pd.read_csv(COUNTRY_FILE, dtype={"key": str})
    raw["date"] = pd.to_datetime(raw["key"], format="%Y%m%d")
    # 전체 언급 수는 날마다 하나 → 언급이 없는 날의 국가 행을 0 으로 채우기 위해 따로 둠
    totals = raw.drop_duplicates("key").set_index("date")["total_mentions"].sort_index()
    recent = raw[raw["date"] > raw["date"].max() - pd.Timedelta(days=RECENT_DAYS)]
    avg = recent.groupby("country")["mentions"].sum() / recent["key"].nunique()
    monthly, ucdp_as_of = ucdp.load()
    u = ucdp_summary(monthly, ucdp_as_of)
    opp = opponent_summary(ucdp.load_opponents(), ucdp_as_of)
    # 언급이 적어도 실제 교전(UCDP 무력 충돌 이상)이 있는 나라는 지도에 남김 (콩고민주공화국·말리 등)
    armed = set(u.index[u["state_12m"] >= UCDP_CONFLICT_DEATHS]) | {
        k for k, v in opp.items() if v["party_12m"] >= UCDP_CONFLICT_DEATHS}
    codes = [c for c in avg.index if iso_info(c)
             and (avg[c] >= MIN_AVG_MENTIONS or CAMEO_TO_ISO.get(c, c) in armed)]
    frames, meta = [], []
    for code in codes:
        conflict = raw[raw["country"] == code].set_index("date")["conflict_mentions"].reindex(totals.index,
                                                                                                fill_value=0)
        s = index_v1.dyad_scores(pd.DataFrame({"conflict_mentions": conflict, "total_mentions": totals}))
        s = s.dropna(how="all").round(1)
        if s["weekly"].dropna().empty:
            continue
        frames.append(s.assign(country=code))
        last = s.dropna(subset=["weekly"]).iloc[-1]
        iso3 = CAMEO_TO_ISO.get(code, code)
        u_row = u.loc[iso3].to_dict() if iso3 in u.index else None
        status, reason, enemies, groups = country_status(code, s["weekly"], s.index.max(), u_row, avg[code],
                                                         opp.get(iso3))
        meta.append({"code": code, **iso_info(code), "date": last.name.strftime("%Y-%m-%d"),
                     "daily": last["daily"], "weekly": last["weekly"], "grade": index_v1.grade(last["weekly"]),
                     "status": status, "status_reason": reason,
                     # 화면에서 한국어 이름으로 바꾸도록 상대국은 ISO alpha-2 로 저장 ('|' 구분)
                     "opponents": "|".join(filter(None, (iso2_of(x) for x in enemies))),
                     "armed_groups": "|".join(groups),
                     "ucdp_state_12m": (u_row or {}).get("state_12m"), "ucdp_all_12m": (u_row or {}).get("all_12m"),
                     "ucdp_as_of": ucdp_as_of,
                     "high_ratio": round((s["weekly"].dropna() >= HIGH_RISK).mean(), 3)})
    out = pd.concat(frames).rename_axis("date").reset_index()[["country", "date", "daily", "weekly"]]
    out, w = add_blend(out)
    out.to_csv(COUNTRY_INDEX_FILE, index=False, encoding="utf-8")
    m = pd.DataFrame(meta)
    # 최신일 종합 점수: 각 나라 마지막 v1 날짜의 값
    last = out.dropna(subset=["weekly"]).groupby("country").tail(1).set_index("country")
    m["v2_weekly"] = m["code"].map(last["v2_weekly"])
    m["blended"] = m["code"].map(last["blended"])
    m["grade"] = m["blended"].fillna(m["weekly"]).map(index_v1.grade)
    m.to_csv(COUNTRY_META_FILE, index=False, encoding="utf-8")
    print(f"국가 {len(m)}개, {len(out)}행 저장 · 종합 가중치 {w}")
    print(m["status"].value_counts(dropna=False).to_string())
    print(m.sort_values("blended", ascending=False).head(15)[
        ["code", "weekly", "v2_weekly", "blended", "status", "status_reason"]].to_string(index=False))
    unknown = avg[(avg >= MIN_AVG_MENTIONS) & ~avg.index.map(lambda c: iso_info(c) is not None)]
    print("ISO 매핑 안 된 코드(지역 코드 등):", ", ".join(unknown.sort_values(ascending=False).index[:30]))


if __name__ == "__main__":
    main()

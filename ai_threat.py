"""뉴스 위협 평가 (규칙·키워드 방식, 비용 없음): 기사 제목·요약에서 '위협 신호'를 찾아 국가·일별로 집계.

유료 API 는 쓰지 않는다. 표현 사전은 threat_lexicon.py.
대표 공식(FORMULA_v1)과 별개인 실험 신호다. 문맥을 이해하지 못하는 키워드 매칭이라 오탐·누락이 있다.

python ai_threat.py live    → 오늘 뉴스룸 기사(data/newsroom) 평가 → data/ai_threat/latest.json
python ai_threat.py cases   → 사례 기사(data/case_articles) 평가 → out/ai_threat_cases.csv
"""

import json
import math
import re
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

import threat_lexicon as lx

OUT_DIR = Path("data/ai_threat")
NEWSROOM_DIR = Path("data/newsroom")
CASE_ARTICLES = Path("data/case_articles/articles.jsonl")
CASES_OUT = Path("out/ai_threat_cases.csv")
SCORE_SCALE = 40.0       # 점수 = 100·(1-exp(-가중합/SCORE_SCALE)). 가중합 40 ≈ 63점
NEG_WINDOW = 20          # 부정어를 찾는 앞·뒤 글자 수
BASE_INTENSITY = 2
SUMMARY_CHARS = 400
METHOD = "rule-v1"
LIVE_DAYS = 3            # 사이트용: 최근 며칠 기사만 집계

# 신호 유형 → (한국어 이름, 가중치). 가중치는 개전 직전에 특이할수록 크게 둔 사전 가정 (검증 전)
SIGNALS = {
    "negotiation_breakdown": ("협상 결렬", 2.0),
    "ultimatum": ("최후통첩", 3.0),
    "mobilization": ("병력 이동·동원", 2.5),
    "embassy_evacuation": ("대사관 철수·자국민 대피", 3.0),
    "strike_warning": ("공습·공격 경고", 2.5),
    "military_threat": ("군사력 사용 위협", 1.5),
    "show_of_force": ("무력 시위·훈련", 1.0),
    "armed_clash": ("교전·공격 발생", 1.0),
    "de_escalation": ("긴장 완화", -1.5),
}
STRONG = ["negotiation_breakdown", "ultimatum", "mobilization", "embassy_evacuation", "strike_warning"]


def _rx(parts: list[str]) -> re.Pattern:
    return re.compile("|".join(f"(?:{p})" for p in parts))


PAT = {t: _rx(lx.PATTERNS[t]) for t in SIGNALS}
EXC = {t: _rx(p) for t, p in lx.EXCLUDE.items()}
NEG_B, NEG_A, DENY = _rx(lx.NEG_BEFORE), _rx(lx.NEG_AFTER), _rx(lx.DENIAL)
SPEC, IMM, BIG = _rx(lx.SPECULATIVE), _rx(lx.IMMINENT), _rx(lx.LARGE_SCALE)
CTRY = {c: _rx(p) for c, p in lx.COUNTRIES.items()}


# ---------- 규칙 평가 ----------

def _quoted(text: str, pos: int) -> bool:
    """pos 가 따옴표 쌍 안에 있는지 (여는 따옴표 개수로 판단)."""
    before = text[:pos]
    for o, c in lx.QUOTE_PAIRS:
        n = before.count(o) if o == c else before.count(o) - before.count(c)
        if (n % 2 == 1) if o == c else n > 0:
            return True
    return False


def countries(text: str) -> list[str]:
    """처음 언급된 순서대로 국가 코드."""
    hits = [(m.start(), c) for c, rx in CTRY.items() if (m := rx.search(text))]
    return [c for _, c in sorted(hits)]


def classify(article: dict) -> list[dict]:
    """기사 1건 → 신호 목록 (유형마다 최대 1개, 부정되지 않은 첫 매칭)."""
    text = f"{article.get('title', '')}. {article.get('summary', '')[:SUMMARY_CHARS]}".lower()
    if DENY.search(text):
        return []  # 부인·반박 기사는 통째로 버림
    found = countries(text)
    actor = found[0] if found else article.get("iso3") or "UNK"
    target = next((c for c in found if c != actor), article.get("iso3") if article.get("iso3") != actor else "UNK") or "UNK"
    spec, boost = bool(SPEC.search(text)), bool(IMM.search(text)) + bool(BIG.search(text))
    out = []
    for t, rx in PAT.items():
        if t in EXC and EXC[t].search(text):
            continue
        for m in rx.finditer(text):
            if NEG_B.search(text[max(0, m.start() - NEG_WINDOW):m.start()]) or NEG_A.search(text[m.end():m.end() + NEG_WINDOW]):
                continue
            intensity = BASE_INTENSITY + boost - spec - _quoted(text, m.start())
            out.append({**{k: article.get(k) for k in ("url", "title", "published_at", "iso3", "feed", "case", "day")},
                        "type": t, "intensity": max(1, min(5, intensity)), "actor": actor, "target": target,
                        "evidence": m.group(0), "evidence_ko": f"{SIGNALS[t][0]}: '{m.group(0)}'"})
            break
    return out


def assess(articles: list[dict]) -> list[dict]:
    return [s for a in articles for s in classify(a)]


# ---------- 집계 ----------

def to_score(raw: float) -> float:
    return round(100 * (1 - math.exp(-max(raw, 0) / SCORE_SCALE)), 1)


def aggregate(signals: list[dict], key: str = "country") -> list[dict]:
    """신호 → (날짜, 국가) 또는 사례 별 위협 점수.

    key="country": actor·target 양쪽 국가에 같은 가중치를 준다. 같은 기사·같은 유형은 한 번만 센다.
    key="case": 사례 단위 합계.
    """
    seen, raw = set(), defaultdict(float)
    by_type: dict[tuple, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    top: dict[tuple, list] = defaultdict(list)
    for s in signals:
        if (s["url"], s["type"]) in seen:
            continue
        seen.add((s["url"], s["type"]))
        w = SIGNALS[s["type"]][1] * s["intensity"]
        if key == "case":
            groups = [(s["case"],)]
        else:
            day = (s.get("published_at") or datetime.now(timezone.utc).isoformat())[:10]
            groups = [(day, c) for c in {s["actor"], s["target"]} - {"UNK", None}]
        for g in groups:
            raw[g] += w
            by_type[g][s["type"]] += 1
            top[g].append((w, s))
    rows = []
    for g, r in raw.items():
        best = sorted(top[g], key=lambda x: -x[0])[:3]
        rows.append({**(dict(case=g[0]) if key == "case" else dict(date=g[0], iso3=g[1])),
                     "raw": round(r, 1), "score": to_score(r), "types": dict(by_type[g]),
                     "evidence": [{"type": SIGNALS[s["type"]][0], "intensity": s["intensity"], "title": s["title"],
                                   "match": s["evidence"], "url": s["url"]} for w, s in best if w > 0]})
    return sorted(rows, key=lambda x: -x["raw"])


# ---------- 실행 ----------

def _read_jsonl(path: Path) -> list[dict]:
    return [json.loads(l) for l in path.open(encoding="utf-8")] if path.exists() else []


def run_live() -> Path:
    """가장 최근 뉴스룸 파일을 평가해 latest.json 을 다시 쓴다 (평가가 공짜라 매번 전체 재계산)."""
    files = sorted(NEWSROOM_DIR.glob("*.jsonl"))
    if not files:
        raise RuntimeError("data/newsroom 이 비어 있음: 먼저 python newsroom.py fetch")  # 백엔드 스레드에서도 잡히도록 예외
    since = (datetime.now(timezone.utc) - timedelta(days=LIVE_DAYS)).isoformat()
    # 날짜 없는 기사는 어느 날에 넣을지 몰라 제외 (예: 신화사 군사 피드는 수년 전 기사가 날짜 없이 섞여 있음)
    arts = [a for a in _read_jsonl(files[-1]) if (a.get("published_at") or "") >= since]
    signals = assess(arts)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    latest = OUT_DIR / "latest.json"
    latest.write_text(json.dumps({
        "date": files[-1].stem, "method": METHOD, "updated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "articles": len(arts), "signals": len(signals),
        "signal_names": {t: n for t, (n, _) in SIGNALS.items()}, "countries": aggregate(signals),
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    return latest


def run_cases() -> Path:
    import pandas as pd

    from case_backtest import CASES
    arts = [a for a in _read_jsonl(CASE_ARTICLES) if a.get("title")]
    signals = assess(arts)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "case_signals.jsonl").write_text("".join(json.dumps(s, ensure_ascii=False) + "\n" for s in signals),
                                                encoding="utf-8")
    agg = {r["case"]: r for r in aggregate(signals, key="case")}
    n_art = pd.Series([a["case"] for a in arts]).value_counts()
    strong = defaultdict(set)
    for s in signals:
        if s["type"] in STRONG:
            strong[s["case"]].add(s["url"])
    rows = []
    for name, is_war, t0, _ in CASES:
        r = agg.get(name, {"raw": 0.0, "types": {}})
        n = int(n_art.get(name, 0))
        rows.append({"case": name, "war": is_war, "t0": t0, "articles": n,
                     "raw_per_article": round(r["raw"] / n, 3) if n else None,
                     "strong_share": round(len(strong[name]) / n, 3) if n else None,
                     **{SIGNALS[t][0]: r["types"].get(t, 0) for t in SIGNALS}})
    CASES_OUT.parent.mkdir(exist_ok=True)
    pd.DataFrame(rows).to_csv(CASES_OUT, index=False, encoding="utf-8-sig")
    return CASES_OUT


def self_check() -> None:
    def types(title: str, **kw: str) -> dict[str, int]:
        return {s["type"]: s["intensity"] for s in classify({"url": "u", "title": title, **kw})}

    assert types("Russia issues ultimatum to Ukraine") == {"ultimatum": 2}
    assert types("Россия стягивает войска к границе Украины")["mobilization"] == 2
    assert types("美 국무부, 이스라엘 대사관 철수 권고")["embassy_evacuation"] == 2
    assert types("解放军在台湾周边举行大规模军演") == {"show_of_force": 3}           # 대규모 +1
    assert "strike_warning" in types("ایران: انتقام سخت در راه است")
    assert types("Pentagon has no plans to deploy troops to Taiwan") == {}           # 앞 부정어
    assert types("국방부 \"병력 증강 없다\"") == {}                                   # 뒤 부정어(한국어)
    assert types("Kremlin denies troop buildup near Ukraine") == {}                 # 부인 기사
    assert types("Could Russia invade? Troops massing near border") == {"mobilization": 1}  # 추측 -1
    assert types("Hamas says \"ultimatum\" unacceptable") == {"ultimatum": 1}         # 인용 -1
    assert "de_escalation" not in types("Ceasefire violation reported in Kashmir")
    assert types("Atlanta is ready for pandas") == {}
    assert types("North and South Korea battle to 1-1 draw in soccer clash") == {}  # 스포츠 제외
    assert types("Russia agreed to supply Iran with 90 missile launchers") == {}
    assert types("俄战略轰炸机列装") == {}
    assert types("Минтруд: при назначении пособия") == {}
    s = classify({"url": "u", "title": "North Korea threatens nuclear strike on South Korea"})[0]
    assert (s["actor"], s["target"], s["type"]) == ("PRK", "KOR", "military_threat")
    assert countries("북한 미사일 발사에 합참 대응") == ["PRK", "KOR"]

    sig = [{"url": "a", "type": "ultimatum", "intensity": 5, "actor": "RUS", "target": "UKR", "published_at": "2026-11-05T00:00", "title": "t", "evidence": "e"},
           {"url": "a", "type": "ultimatum", "intensity": 5, "actor": "RUS", "target": "UKR", "published_at": "2026-11-05T00:00", "title": "t", "evidence": "e"},
           {"url": "b", "type": "de_escalation", "intensity": 2, "actor": "IND", "target": "PAK", "published_at": "2026-11-05T00:00", "title": "t", "evidence": "e"}]
    rows = {(r["date"], r["iso3"]): r for r in aggregate(sig)}
    assert rows[("2026-11-05", "RUS")]["raw"] == 15.0            # 같은 기사·유형 중복은 1회
    assert rows[("2026-11-05", "IND")]["score"] == 0.0           # 완화 신호만 있으면 0점
    assert rows[("2026-11-05", "IND")]["evidence"] == []         # 음수 신호는 근거 목록에서 제외
    assert to_score(SCORE_SCALE) == round(100 * (1 - math.exp(-1)), 1)


if __name__ == "__main__":
    self_check()
    cmd = sys.argv[1] if len(sys.argv) > 1 else "check"
    if cmd == "live":
        print(run_live())
    elif cmd == "cases":
        print(run_cases())
    print("self_check ok")

"""화면에 노출하는 국가 쌍 설정. 점수용 GDELT 쌍·전쟁 기간은 index_v1 이 단일 출처."""

PAIRS = {
    "KOR-PRK": {
        "name": "남북",
        "countries": ["대한민국", "북한"],
        "news_query": "북한 (군사 OR 미사일 OR 도발 OR 국방)",
    },
    "RUS-UKR": {
        "name": "러시아 · 우크라이나",
        "countries": ["러시아", "우크라이나"],
        "news_query": "러시아 우크라이나 (전쟁 OR 군사 OR 공격)",
    },
    "ISR-IRN": {
        "name": "이스라엘 · 이란",
        "countries": ["이스라엘", "이란"],
        "news_query": "이란 (이스라엘 OR 미국) (군사 OR 공습 OR 핵)",
    },
    "ISR-PSE": {
        "name": "이스라엘 · 팔레스타인",
        "countries": ["이스라엘", "팔레스타인"],
        "news_query": "(가자 OR 하마스) (이스라엘 OR 공습 OR 휴전)",
    },
    "CHN-TWN": {
        "name": "중국 · 대만",
        "countries": ["중국", "대만"],
        "news_query": "대만 (중국 OR 해협) (군사 OR 훈련 OR 국방)",
    },
    "IND-PAK": {
        "name": "인도 · 파키스탄",
        "countries": ["인도", "파키스탄"],
        "news_query": "인도 파키스탄 (군사 OR 카슈미르 OR 공습)",
    },
    "ARM-AZE": {
        "name": "아르메니아 · 아제르바이잔",
        "countries": ["아르메니아", "아제르바이잔"],
        "news_query": "아르메니아 아제르바이잔",
    },
}

# CAMEO 국가 코드 → 한국어 이름 (촉매 사건 표시용)
COUNTRY_NAMES = {
    "KOR": "한국", "PRK": "북한", "USA": "미국",
    "RUS": "러시아", "UKR": "우크라이나", "ISR": "이스라엘", "IRN": "이란",
    "PSE": "팔레스타인", "CHN": "중국", "TWN": "대만", "IND": "인도", "PAK": "파키스탄",
    "ARM": "아르메니아", "AZE": "아제르바이잔",
}

# CAMEO 지역 코드 → 한국어 (나라가 아닌 행위자. 나라 이름은 화면에서 ISO 코드로 번역)
REGION_NAMES = {
    "AFR": "아프리카", "ASA": "아시아", "BLK": "발칸", "CRB": "카리브해", "CAU": "코카서스", "CFR": "중앙아프리카",
    "CAS": "중앙아시아", "CEU": "중부유럽", "EIN": "동인도제도", "EAF": "동아프리카", "EEU": "동유럽", "EUR": "유럽",
    "LAM": "중남미", "MEA": "중동", "MDT": "지중해", "NAF": "북아프리카", "NMR": "북미", "PGS": "페르시아만",
    "SCN": "스칸디나비아", "SAM": "남미", "SAS": "남아시아", "SEA": "동남아시아", "SAF": "남아프리카",
    "WAF": "서아프리카", "WST": "서방",
}
ACTOR_NAMES = {**REGION_NAMES, **COUNTRY_NAMES}

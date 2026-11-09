export interface ThreatEvidence {
  type: string; // 한국어 신호 이름
  intensity: number; // 1~5
  title: string;
  match: string; // 매칭된 표현
  url: string;
}

export interface ThreatCountryDay {
  date: string;
  iso3: string; // CAMEO 국가 코드와 동일
  raw: number;
  score: number; // 0~100
  types: Record<string, number>; // 신호 유형 키 → 기사 수
  evidence: ThreatEvidence[];
}

export interface ThreatData {
  date: string;
  method: string;
  updated_at: string;
  articles: number;
  signals: number;
  signal_names: Record<string, string>;
  countries: ThreatCountryDay[];
}

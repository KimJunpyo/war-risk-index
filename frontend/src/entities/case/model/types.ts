/** 과거 위기 사례 (case_backtest.CASES) */
export interface PastCase {
  name: string;
  label: string; // 일반인용 이름 + " (T-0)"
  is_war: boolean; // false = 위기였지만 전쟁 없음 (대조군)
  t0: string;
  pairs: string[]; // GDELT 쌍
  score: number | null; // T-0 전날 일별 뉴스 집계 7일 점수
}

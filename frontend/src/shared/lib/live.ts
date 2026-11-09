/** GDELT 2.0 최근 24시간 실시간 점수 (국가·국가 쌍 공통) */
export interface LiveScore {
  score: number;
  as_of: string; // 슬롯 키 YYYYMMDDHHMMSS (UTC)
}

import type { Grade } from "@/shared/lib";

export interface IndexPoint {
  date: string;
  daily: number | null; // 24시간 점수 (v1)
  weekly: number | null; // 7일 점수 (v1, GDELT 1.0)
  v2_weekly: number | null; // 7일 점수 (v2, GDELT 2.0) — 최근 1년만
  blended: number | null; // 종합 = v1·v2 가중 결합 (v2 가 없으면 v1)
  grade: Grade | null;
}

export type ChartPeriod = "1y" | "3y" | "all";

/** 종합 가중치 (백엔드 blend.py) */
export interface BlendWeights {
  w1: number;
  w2: number;
  rho: number;
  estimated: boolean;
  median_corr?: number;
  entities?: number;
  overlap_days?: number;
}

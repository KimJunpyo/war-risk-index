import type { Grade, LiveScore } from "@/shared/lib";

export interface WarPeriod {
  start: string;
  end: string | null; // null = 진행 중
}

export interface Pair {
  id: string;
  name: string;
  countries: string[];
  latest: {
    date: string;
    daily: number | null;
    weekly: number | null; // v1 7일
    v2_weekly: number | null;
    blended: number | null; // 종합
    grade: Grade | null;
  } | null;
  live: LiveScore | null; // GDELT 2.0 최근 24시간 실시간 점수
  wars: WarPeriod[];
}

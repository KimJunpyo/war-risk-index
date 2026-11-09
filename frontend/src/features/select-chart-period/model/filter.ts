import type { ChartPeriod, IndexPoint } from "@/entities/risk-index";

const YEARS: Record<Exclude<ChartPeriod, "all">, number> = { "1y": 1, "3y": 3 };

/** 마지막 데이터 날짜 기준으로 기간을 자른다 (오늘 기준이 아님: 데이터 갱신이 늦어도 빈 그래프가 안 나오게) */
export function filterByPeriod(points: IndexPoint[], period: ChartPeriod): IndexPoint[] {
  if (period === "all" || points.length === 0) return points;
  const last = new Date(points.at(-1)!.date);
  last.setFullYear(last.getFullYear() - YEARS[period]);
  const from = last.toISOString().slice(0, 10);
  return points.filter((p) => p.date >= from);
}

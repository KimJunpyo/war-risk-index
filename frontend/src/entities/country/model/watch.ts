import { HIGH_RISK } from "@/shared/lib";
import type { Country } from "./types";

/** 주목 국가 사유. 순서 = 우선순위 (앞일수록 위에 표시) */
export const WATCH_REASONS = ["전쟁 중", "내전 중", "무력 충돌", "실시간 급등", "종합 고위험", "여행경보 최고 단계", "휴전·소강", "잦은 국방 이슈"] as const;
export type WatchReason = (typeof WATCH_REASONS)[number];

export const WATCH_CRITERIA: Record<WatchReason, string> = {
  "전쟁 중": "UCDP 최근 12개월 교전 사망 1,000명 이상이고 상대에 다른 나라 정부가 있음, 또는 등록된 전쟁 진행 중",
  "내전 중": "UCDP 최근 12개월 교전 사망 1,000명 이상이고 상대가 반군·무장단체뿐",
  "무력 충돌": "UCDP 최근 12개월 교전 사망 25명 이상",
  "실시간 급등": `최근 24시간 실시간 점수 ${HIGH_RISK} 이상`,
  "종합 고위험": `종합 7일 점수 ${HIGH_RISK} 이상`,
  "여행경보 최고 단계": "미 국무부 4단계(여행 금지) 또는 영국 FCDO 전역 모든 여행 자제 권고",
  "휴전·소강": "최근 2년 안에 전쟁 수준이었다가 감소, 또는 등록된 전쟁 종료 2년 이내",
  "잦은 국방 이슈": "최근 90일 중 20% 이상이 고위험 (언급량 충분한 나라만)",
};

export function watchReasons(c: Country): WatchReason[] {
  const r: WatchReason[] = [];
  if (c.status === "전쟁 중" || c.status === "내전 중" || c.status === "무력 충돌") r.push(c.status);
  if ((c.live?.score ?? 0) >= HIGH_RISK) r.push("실시간 급등");
  if ((c.latest.blended ?? c.latest.weekly ?? 0) >= HIGH_RISK) r.push("종합 고위험");
  if (c.advisory?.some((a) => a.level >= a.max_level)) r.push("여행경보 최고 단계");
  if (c.status === "휴전·소강" || c.status === "잦은 국방 이슈") r.push(c.status);
  return r;
}

/** 사유가 있는 나라만, 점수 높은 순 (기본 = 종합, 점수 없는 나라는 맨 아래) */
export function watchList(
  countries: Country[],
  score: (c: Country) => number | null | undefined = (c) => c.latest.blended ?? c.latest.weekly,
): { country: Country; reasons: WatchReason[] }[] {
  const s = (c: Country) => score(c) ?? -Infinity;
  return countries
    .map((country) => ({ country, reasons: watchReasons(country) }))
    .filter((x) => x.reasons.length > 0)
    .sort((a, b) => s(b.country) - s(a.country));
}

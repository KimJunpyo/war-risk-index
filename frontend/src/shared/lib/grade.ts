// 백엔드 index_v1 의 등급 문자열과 일치해야 함
export type Grade = "안정" | "긴장" | "고위험" | "전쟁 중";

export const HIGH_RISK = 100;
export const TENSION = 50;

export const GRADE_STYLE: Record<Grade, { text: string; badge: string; hex: string }> = {
  안정: { text: "text-emerald-400", badge: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30", hex: "#34d399" },
  긴장: { text: "text-amber-400", badge: "bg-amber-500/15 text-amber-300 ring-amber-500/30", hex: "#fbbf24" },
  고위험: { text: "text-red-400", badge: "bg-red-500/15 text-red-300 ring-red-500/30", hex: "#f87171" },
  "전쟁 중": { text: "text-fuchsia-400", badge: "bg-fuchsia-500/20 text-fuchsia-200 ring-fuchsia-500/40", hex: "#e879f9" },
};

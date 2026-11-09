import { HIGH_RISK, TENSION } from "@/shared/lib";
import { CHECKLIST, type ChecklistItem } from "./checklist";

// 점수별 행동 권고. 항목 문구는 checklist.ts (일반적인 비상 대비 권고를 참고한 자체 작성 문장)
export const EXTREME = 150; // 평시 대비 +4σ
const WAR_STATUSES = ["전쟁 중", "내전 중"];

export interface ScoreBand {
  id: "calm" | "tension" | "high" | "extreme";
  range: string;
  title: string;
  tone: string; // tailwind 색
  items: ChecklistItem[];
}

export const SCORE_BANDS: ScoreBand[] = [
  { id: "extreme", range: `${EXTREME}점 이상 또는 전쟁·내전 중`, title: "행동", tone: "text-fuchsia-300", items: CHECKLIST.extreme },
  { id: "high", range: `${HIGH_RISK}~${EXTREME}점`, title: "준비", tone: "text-red-300", items: CHECKLIST.high },
  { id: "tension", range: `${TENSION}~${HIGH_RISK}점`, title: "점검", tone: "text-amber-300", items: CHECKLIST.tension },
  { id: "calm", range: `${TENSION}점 미만`, title: "평상시", tone: "text-emerald-300", items: CHECKLIST.calm },
];

export function bandFor(score: number | null | undefined, status?: string | null): ScoreBand | null {
  if (status && WAR_STATUSES.includes(status)) return SCORE_BANDS[0];
  if (score === null || score === undefined) return null;
  if (score >= EXTREME) return SCORE_BANDS[0];
  if (score >= HIGH_RISK) return SCORE_BANDS[1];
  if (score >= TENSION) return SCORE_BANDS[2];
  return SCORE_BANDS[3];
}

/** 여행경보 단계 설명 (백엔드 travel_advisory.py 와 일치) */
export const ADVISORY_LEVELS: { level: number; us: string; uk: string; meaning: string }[] = [
  { level: 1, us: "일반적 주의 (Exercise Normal Precautions)", uk: "특별 권고 없음", meaning: "평소처럼 기본 안전수칙만 지키면 되는 수준" },
  { level: 2, us: "각별한 주의 (Exercise Increased Caution)", uk: "일부 지역 여행 자제 권고", meaning: "범죄·테러·시위 등 위험이 높아 주의가 필요한 수준" },
  { level: 3, us: "여행 재고 (Reconsider Travel)", uk: "전역 필수 외 여행 자제 권고", meaning: "꼭 필요한 경우가 아니면 가지 말 것을 권하는 수준" },
  { level: 4, us: "여행 금지 (Do Not Travel)", uk: "전역 모든 여행 자제 권고", meaning: "생명 위협이 커 방문하지 말고, 체류 중이면 떠날 것을 권하는 수준" },
];

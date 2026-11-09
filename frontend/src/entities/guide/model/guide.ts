import { HIGH_RISK, TENSION } from "@/shared/lib";

// 점수별 행동 권고. 일반적인 민방위·재난 대비 권고(비상용품 3일치 등)를 참고한 개인 실험용 가이드
export const EXTREME = 150; // 평시 대비 +4σ
const WAR_STATUSES = ["전쟁 중", "내전 중"];

export interface ScoreBand {
  id: "calm" | "tension" | "high" | "extreme";
  range: string;
  title: string;
  tone: string; // tailwind 색
  actions: string[];
}

export const SCORE_BANDS: ScoreBand[] = [
  {
    id: "extreme", range: `${EXTREME}점 이상 또는 전쟁·내전 중`, title: "행동", tone: "text-fuchsia-300",
    actions: [
      "정부·민방위 경보와 대피 지시를 최우선으로 따르기",
      "비상 가방을 현관 가까이 두고 바로 대피할 수 있게 유지",
      "해당 국가 방문 취소, 체류 중이면 대사관의 철수·대피 안내 따르기",
      "가족과 집결 장소·연락 방법 다시 확인",
    ],
  },
  {
    id: "high", range: `${HIGH_RISK}~${EXTREME}점`, title: "준비", tone: "text-red-300",
    actions: [
      "3일치 비상용품 실제로 준비: 물(1인 1일 약 3L), 조리 없이 먹을 식량, 상비약·처방약",
      "소액 현금, 신분증·여권·중요 서류 사본, 보조배터리, 손전등, 휴대용 라디오",
      "차량 연료 절반 이상 유지, 가까운 대피소와 대피 경로 직접 확인",
      "해당 지역 여행은 연기 검토, 해외 체류 중이면 영사 연락처·재외국민 등록 확인",
    ],
  },
  {
    id: "tension", range: `${TENSION}~${HIGH_RISK}점`, title: "점검", tone: "text-amber-300",
    actions: [
      "정부 발표와 뉴스를 평소보다 자주 확인",
      "비상용품 목록 점검, 물·식량 1~2일치 확보",
      "해당 국가 여행 계획이 있으면 여행경보 단계 확인",
    ],
  },
  {
    id: "calm", range: `${TENSION}점 미만`, title: "평상시", tone: "text-emerald-300",
    actions: [
      "가까운 대피소 위치 알아두기 (예: 안전디딤돌 앱, 국민재난안전포털)",
      "가족 비상연락망과 집결 장소 정해두기",
      "비상용품 목록 만들어두기",
    ],
  },
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

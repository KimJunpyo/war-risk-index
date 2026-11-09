import type { Grade, LiveScore } from "@/shared/lib";

// 백엔드 build_country_index 의 상태 문자열과 일치해야 함
export type CountryStatus = "전쟁 중" | "내전 중" | "무력 충돌" | "휴전·소강" | "잦은 국방 이슈";

/** 백엔드 travel_advisory.by_iso3 와 일치. 영국 FCDO 단계는 alert_status 를 1~4로 자체 환산한 값 */
/** 외교부 일부 지역 경보의 summary 머리말 (백엔드 travel_advisory.MOFA_PARTIAL 과 일치) */
export const MOFA_PARTIAL = "일부 지역";

export interface Advisory {
  source: "kr_mofa" | "us_state" | "uk_fcdo";
  name: string; // 출처 표시명 (예: 미 국무부)
  level: number;
  max_level: number;
  label: string;
  date: string | null;
  summary: string | null;
  url: string | null;
}

export interface Country {
  code: string; // GDELT(CAMEO) 국가 코드
  iso2: string;
  numeric: string; // ISO 3166 숫자 코드 = world-atlas 지도 id
  latest: {
    date: string;
    daily: number | null;
    weekly: number | null; // v1 (GDELT 1.0) 7일
    v2_weekly: number | null; // v2 (GDELT 2.0) 7일
    blended: number | null; // 종합 (v1·v2 가중 결합)
    grade: Grade | null;
  };
  week_ago: { date: string; blended: number | null } | null; // latest.date − 7일 종합 (그 날 행이 없으면 null)
  live: LiveScore | null;
  status: CountryStatus | null;
  status_reason: string | null;
  opponents: string[]; // 교전 상대국 ISO alpha-2 (UCDP·등록 전쟁)
  armed_groups: string[]; // 교전 상대 무장단체 (UCDP 원문 이름)
  ucdp: { state_12m: number | null; all_12m: number | null; as_of: string | null };
  advisory: Advisory[]; // 정부 여행경보 (출처별, 점수에는 미반영)
  pairs: string[];
  wars: { start: string; end: string | null; pair: string }[];
}

export const STATUS_STYLE: Record<CountryStatus, { hex: string; badge: string }> = {
  "전쟁 중": { hex: "#e879f9", badge: "bg-fuchsia-500/20 text-fuchsia-200 ring-fuchsia-500/40" },
  "내전 중": { hex: "#a78bfa", badge: "bg-violet-500/20 text-violet-200 ring-violet-500/40" },
  "무력 충돌": { hex: "#fb7185", badge: "bg-rose-500/15 text-rose-300 ring-rose-500/30" },
  "휴전·소강": { hex: "#38bdf8", badge: "bg-sky-500/15 text-sky-300 ring-sky-500/30" },
  "잦은 국방 이슈": { hex: "#fb923c", badge: "bg-orange-500/15 text-orange-300 ring-orange-500/30" },
};

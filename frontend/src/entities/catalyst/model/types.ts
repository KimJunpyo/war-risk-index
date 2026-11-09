export type CatalystType = "군사력 위협" | "최후통첩" | "무력 시위";

export interface CatalystEvent {
  date: string;
  src: string;
  dst: string;
  src_name: string | null; // 한국어 이름이 등록된 나라만
  dst_name: string | null;
  src_iso2: string | null;
  dst_iso2: string | null;
  type: CatalystType;
  mentions: number; // 기사 언급 수
  events: number; // 사건 수
}

export interface CatalystData {
  events: CatalystEvent[];
  daily: { date: string; mentions: number }[];
}

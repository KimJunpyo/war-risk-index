import type { CivilAlert } from "@/entities/guide";

// 경보 이름 색(1-1 경보별 토큰). 첫 화면 경보 카드와 경보 상세(1-5)가 같이 쓴다.
// Tailwind 는 소스에 적힌 클래스만 만들므로 id 로 조립하지 않고 글자 그대로 둔다
export const ALERT_COLOR: Record<CivilAlert["id"], string> = {
  alert: "text-alert-alert",
  "air-raid": "text-alert-air-raid",
  cbr: "text-alert-cbr",
  nuclear: "text-alert-nuclear",
  "all-clear": "text-alert-all-clear",
};

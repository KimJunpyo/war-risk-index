import type { CivilAlert } from "@/entities/guide";

// 경보 이름 색(1-1 경보별 토큰). 첫 화면 경보 타일과 경보 상세(1-5)가 같이 쓴다.
// Tailwind 는 소스에 적힌 클래스만 만들므로 id 로 조립하지 않고 글자 그대로 둔다
export const ALERT_COLOR: Record<CivilAlert["id"], string> = {
  alert: "text-alert-alert",
  "air-raid": "text-alert-air-raid",
  cbr: "text-alert-cbr",
  nuclear: "text-alert-nuclear",
  "all-clear": "text-alert-all-clear",
};

// 첫 화면 경보 타일 바탕(1-9): 새 토큰 없이 같은 경보 토큰에 투명도만 붙인다(평소 10%, hover 20%). 위와 같은 이유로 글자 그대로
export const ALERT_TILE: Record<CivilAlert["id"], string> = {
  alert: "bg-alert-alert/10 hover:bg-alert-alert/20",
  "air-raid": "bg-alert-air-raid/10 hover:bg-alert-air-raid/20",
  cbr: "bg-alert-cbr/10 hover:bg-alert-cbr/20",
  nuclear: "bg-alert-nuclear/10 hover:bg-alert-nuclear/20",
  "all-clear": "bg-alert-all-clear/10 hover:bg-alert-all-clear/20",
};

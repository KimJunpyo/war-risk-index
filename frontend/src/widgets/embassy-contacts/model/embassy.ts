/** 영사콜센터 (출처 https://www.0404.go.kr, 확인일 2026-11-09). API 실패·로딩 중에도 보이도록 프론트에도 둠.
 *  백엔드 embassies.CALL_CENTER 와 같은 값(tests/test_embassy_call_center.py 가 확인) */
export const CALL_CENTER = { tel: "02-3210-0404", tel_overseas: "+82-2-3210-0404", source: "https://www.0404.go.kr" };

/** GET /api/countries/{code}/embassies 응답 */
export interface Embassy {
  name: string;
  kind: string | null; // 대사관·총영사관·분관 등 (외교부 원문)
  address: string | null;
  tel: string | null;
  emergency_tel: string | null; // 근무시간 외 긴급
}

export interface EmbassyContacts {
  available: boolean;
  as_of: string | null; // 수집일
  call_center: { tel: string; tel_overseas: string; source: string };
  embassies: Embassy[];
}

/** 외교부 원문 전화 표기 → tel: 링크. 원문이 "+53) 7204-0977, 0988"·"(81) 92-…"·"…~3" 처럼 제각각이라
 *  첫 번호만 숫자로 남기고 국내 지역번호 앞 "(0)" 은 뺀다. +·( 로 시작하지 않으면 국가번호인지 알 수 없어
 *  null(링크 없이 텍스트만): 잘못된 번호로 걸리는 것보다 안전. */
export function telHref(text: string): string | null {
  const first = text.split(/[~,/]/)[0].trim();
  if (!/^[+(（]/.test(first)) return null;
  return `tel:+${first.replace(/[(（]0[)）]/g, "").replace(/\D/g, "")}`;
}

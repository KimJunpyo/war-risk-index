// node --test 로 직접 실행하므로 이 파일은 다른 모듈(@/ 별칭 포함)을 import 하지 않는다.

/** 제목에서 마지막 " - " 뒤(언론사명)를 뗀 부분에 키워드가 하나라도 있으면 true. 영문은 대소문자 무시 */
export function titleMentions(title: string, keywords: string[]): boolean {
  const cut = title.lastIndexOf(" - ");
  const body = cut >= 0 ? title.slice(0, cut) : title;
  return keywords.some((k) => k !== "" && mentions(body, k));
}

// 영문 키워드는 단어 앞 경계에서만 매칭 ("Oman"이 "woman"에 걸리지 않게, "Iranian"은 통과).
// 한국어는 조사·붙임표가 붙으므로 단순 포함
function mentions(body: string, keyword: string): boolean {
  if (!/[a-z]/i.test(keyword)) return body.includes(keyword);
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}`, "i").test(body);
}

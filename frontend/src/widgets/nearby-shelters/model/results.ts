// 대피소 결과 안 검색·페이지 나누기·건수 문구. node --test 로 바로 돌리므로 별칭(@/) import 없이 단일 파일로 둔다.

export const PAGE_SIZE = 10; // 페이지당 대피소 수(plan.md Q7)
const NUMBER_LOCALE = "ko-KR"; // 천 단위 쉼표(1,234)

/** 숫자를 천 단위 쉼표로 */
export const formatNumber = (n: number): string => n.toLocaleString(NUMBER_LOCALE);

/** 검색어를 공백으로 나눈 단어가 모두 이름 또는 주소에 들어 있는 항목(대소문자 무시, 원래 순서). 빈 검색어면 전부 */
export function filterShelters<T extends { name: string | null; address: string | null }>(items: readonly T[], query: string): T[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...items];
  // 이름·주소를 이어 붙이지 않고 따로 본다(붙이면 이름 끝 + 주소 앞으로 없는 글자가 생김)
  return items.filter((s) => {
    // 원천의 빈 이름·주소는 서버가 null 로 보낸다 → 빈 글자로 보고 넘어간다(한 건 때문에 화면이 멈추지 않게)
    const name = (s.name ?? "").toLowerCase();
    const address = (s.address ?? "").toLowerCase();
    return words.every((w) => name.includes(w) || address.includes(w));
  });
}

/** page 쪽(1부터)의 항목. 범위 밖 page 는 첫·마지막 쪽으로 보정하고 보정한 page 를 돌려준다. 0곳이면 빈 1쪽 */
export function paginate<T>(items: readonly T[], page: number, pageSize: number): { items: T[]; page: number; pageCount: number } {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const p = Math.min(Math.max(page, 1), pageCount);
  return { items: items.slice((p - 1) * pageSize, p * pageSize), page: p, pageCount };
}

/** 결과 건수 문구. total: 안전 상한으로 자르기 전 건수(없는 예전 응답이면 loaded), loaded: 받은 수,
 *  matched: 검색 뒤 남은 수, query: 검색창 원문 */
export function countText({ total, loaded, matched, query }: { total?: number; loaded: number; matched: number; query: string }): string {
  const all = total ?? loaded;
  const text = query.trim() ? `총 ${formatNumber(all)}곳 중 ${formatNumber(matched)}곳` : `총 ${formatNumber(all)}곳`;
  return all > loaded ? `${text} · 상위 ${formatNumber(loaded)}곳만 표시` : text;
}

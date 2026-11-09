import ISO_NUMERIC from "./iso-numeric.json"; // ISO 3166 숫자 → alpha-2 (pycountry 에서 생성)

// 브라우저 내장 국가명 번역(Intl). 별도 국가명 표 없이 ISO alpha-2 → 한국어
const names = typeof Intl !== "undefined" && "DisplayNames" in Intl
  ? new Intl.DisplayNames(["ko"], { type: "region" })
  : null;

// Intl 이름이 국내 통용 표기와 다른 경우 (예: "콩고-킨샤사")
const NAME_OVERRIDE: Record<string, string> = { CD: "콩고민주공화국", CG: "콩고공화국" };

export function countryName(iso2: string | null | undefined, fallback = ""): string {
  if (!iso2) return fallback;
  if (NAME_OVERRIDE[iso2]) return NAME_OVERRIDE[iso2];
  try {
    return names?.of(iso2) ?? fallback;
  } catch {
    return fallback; // 잘못된 코드
  }
}

export function iso2FromNumeric(numeric: string | null | undefined): string | null {
  return numeric ? (ISO_NUMERIC as Record<string, string>)[numeric] ?? null : null;
}

// 뉴스 제목 필터용 영어 이름. 모르는 코드는 코드 문자열 대신 undefined (짧은 약어 오탐 방지)
const enNames = typeof Intl !== "undefined" && "DisplayNames" in Intl
  ? new Intl.DisplayNames(["en"], { type: "region", fallback: "none" })
  : null;

// 제목에 자주 쓰이는 별칭. 2글자 이하 영문 약어(US, UK 등)는 오탐 때문에 넣지 않는다
const NEWS_ALIAS: Record<string, string[]> = {
  KR: ["한국", "South Korea"],
  TR: ["Turkey"],
  KP: ["북한", "North Korea"],
  US: ["미국"],
  PS: ["팔레스타인", "가자", "하마스", "Palestine"],
  TW: ["대만"],
  GB: ["영국"],
};

/** 뉴스 제목 필터 키워드: 한국어 이름 + 영어 이름 + 별칭 */
export function newsKeywords(iso2: string): string[] {
  let en: string | undefined;
  try {
    // "Myanmar (Burma)" → "Myanmar", "Congo - Kinshasa" → "Congo"
    en = enNames?.of(iso2)?.split(/ \(| - /)[0];
  } catch {
    en = undefined; // 잘못된 코드
  }
  const ko = countryName(iso2);
  return [ko === iso2 ? "" : ko, en ?? "", ...(NEWS_ALIAS[iso2] ?? [])].filter(Boolean);
}

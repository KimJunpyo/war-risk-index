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

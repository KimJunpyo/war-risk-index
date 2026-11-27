const KST_OFFSET_MS = 9 * 3_600_000; // 한국 표준시 UTC+9(서머타임 없음)

/** HTTP date 헤더(RFC 9110, 예: "Fri, 27 Nov 2026 05:04:00 GMT") → 한국 시각 "YYYY-MM-DD HH:mm". 없거나 읽을 수 없으면 null */
export function savedAtKst(date: string | null | undefined): string | null {
  const ms = date ? Date.parse(date) : NaN;
  if (Number.isNaN(ms)) return null;
  return new Date(ms + KST_OFFSET_MS).toISOString().slice(0, 16).replace("T", " ");
}

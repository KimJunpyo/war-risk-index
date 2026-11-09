const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** ISO 시각 → "3시간 전" 같은 상대 시간 */
export function timeAgo(iso: string | null, now = Date.now()): string {
  if (!iso) return "";
  const diff = now - new Date(iso).getTime();
  if (diff < HOUR) return `${Math.max(1, Math.round(diff / 60_000))}분 전`;
  if (diff < DAY) return `${Math.round(diff / HOUR)}시간 전`;
  return `${Math.round(diff / DAY)}일 전`;
}

export function formatScore(v: number | null | undefined): string {
  return v === null || v === undefined ? "–" : v.toFixed(0);
}

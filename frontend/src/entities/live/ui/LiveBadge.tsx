"use client";

import { timeAgo, useNow } from "@/shared/lib";
import { useLiveStatus } from "../api/use-live-status";

const STALE_MS = 45 * 60_000; // 15분 갱신이 3번 연속 밀리면 지연으로 표시

/** GDELT 2.0 슬롯 키(UTC) → ISO */
const slotToIso = (k: string) =>
  `${k.slice(0, 4)}-${k.slice(4, 6)}-${k.slice(6, 8)}T${k.slice(8, 10)}:${k.slice(10, 12)}:00Z`;

export function LiveBadge() {
  const { data } = useLiveStatus();
  const now = useNow();
  if (!data?.as_of || now === null) return null;
  const iso = slotToIso(data.as_of);
  const stale = now - Date.parse(iso) > STALE_MS;
  return (
    <span className="inline-flex animate-fade-up items-center gap-2 whitespace-nowrap rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-neutral-300">
      <span className={`h-2 w-2 rounded-full ${stale ? "bg-amber-400" : "animate-blink bg-red-500"}`} />
      {/* 좁은 폭(md 미만)에서는 헤더 한 줄에 들어가도록 점 + "LIVE"/"지연"만 보이고, 나머지 문구는 스크린리더에만 남김 */}
      <span>{stale ? <><span className="max-md:sr-only">실시간 </span>지연</> : "LIVE"}</span>
      <span className="text-neutral-400 max-md:sr-only">15분 갱신 · {timeAgo(iso, now)}</span>
    </span>
  );
}

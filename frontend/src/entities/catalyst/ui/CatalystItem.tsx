import { countryName } from "@/shared/lib";
import type { CatalystEvent, CatalystType } from "../model/types";

// GDELT 가 행위자의 나라를 특정하지 못한 사건(무장단체·시위대·익명 소식통 등)
const UNKNOWN_ACTOR = "국적 미상";
const actor = (name: string | null, iso2: string | null, code: string) =>
  name ?? countryName(iso2, code || UNKNOWN_ACTOR);

const TYPE_STYLE: Record<CatalystType, string> = {
  최후통첩: "bg-red-500/15 text-red-300",
  "군사력 위협": "bg-orange-500/15 text-orange-300",
  "무력 시위": "bg-sky-500/15 text-sky-300",
};

export function CatalystItem({ event }: { event: CatalystEvent }) {
  // 같은 나라끼리 = 정부와 국내 세력(반군·야당 등) 사이의 국내 사건
  const domestic = event.src !== "" && event.src === event.dst;
  return (
    <li className="flex items-center gap-3 py-2 text-sm">
      <span className="w-12 shrink-0 font-mono text-xs text-neutral-400">{event.date.slice(5)}</span>
      <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${TYPE_STYLE[event.type]}`}>{event.type}</span>
      <span className="truncate text-neutral-200">
        {domestic ? (
          <>
            {actor(event.src_name, event.src_iso2, event.src)}{" "}
            <span className="rounded bg-white/5 px-1 text-[10px] text-neutral-400">국내</span>
          </>
        ) : (
          <>
            {actor(event.src_name, event.src_iso2, event.src)} <span className="text-neutral-400">→</span>{" "}
            {actor(event.dst_name, event.dst_iso2, event.dst)}
          </>
        )}
      </span>
      <span className="ml-auto shrink-0 text-xs text-neutral-400">보도 {event.mentions}건</span>
    </li>
  );
}

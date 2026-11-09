"use client";

import { StatusBadge, type Country } from "@/entities/country";
import { countryName } from "@/shared/lib";
import { Panel } from "@/shared/ui";
import { weeklyMovers, type Mover } from "../model/movers";

/** 7일 전 대비 종합 점수가 많이 오른·내린 나라 (기존 /api/countries 응답만 사용) */
export function WeeklyMovers({ countries, onSelect }: { countries: Country[]; onSelect: (c: Country) => void }) {
  const { up, down } = weeklyMovers(countries);
  if (up.length === 0 && down.length === 0) return null;

  return (
    <Panel title="이번 주 변화" className="mt-8">
      <div className="grid gap-6 sm:grid-cols-2">
        {up.length > 0 && <MoverList title="오른 나라" items={up} onSelect={onSelect} />}
        {down.length > 0 && <MoverList title="내린 나라" items={down} onSelect={onSelect} />}
      </div>
    </Panel>
  );
}

function MoverList({ title, items, onSelect }: {
  title: string;
  items: Mover<Country>[];
  onSelect: (c: Country) => void;
}) {
  return (
    <div>
      <h3 className="mb-2 text-xs text-neutral-500">{title} (7일 전 대비)</h3>
      <ul className="-mx-2">
        {items.map(({ country: c, delta }) => (
          <li key={c.code}>
            <button
              onClick={() => onSelect(c)}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition hover:bg-white/5"
            >
              <span className="min-w-0 truncate text-neutral-200">{countryName(c.iso2, c.code)}</span>
              <StatusBadge status={c.status} />
              <span className="ml-auto tabular-nums text-neutral-400">{c.latest.blended?.toFixed(1)}</span>
              <span className={`w-14 text-right tabular-nums ${delta > 0 ? "text-rose-300" : "text-sky-300"}`}>
                {formatDelta(delta)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** +12.3 / −8.0 (빼기 기호는 U+2212) */
function formatDelta(v: number): string {
  return `${v > 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}`;
}

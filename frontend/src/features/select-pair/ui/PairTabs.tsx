"use client";

import { GradeBadge, type Pair } from "@/entities/pair";
import { formatScore, GRADE_STYLE } from "@/shared/lib";
import { AnimatedNumber } from "@/shared/ui";

export function PairTabs({ pairs, selected, onSelect }: {
  pairs: Pair[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div role="tablist" aria-label="국가 쌍 선택" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {pairs.map((p) => {
        const active = p.id === selected;
        const grade = p.latest?.grade ?? null;
        return (
          <button
            key={p.id}
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(p.id)}
            className={`rounded-xl border p-4 text-left transition ${
              active ? "border-white/30 bg-white/[0.08]" : "border-white/10 bg-white/[0.02] hover:bg-white/[0.05]"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="min-w-0 font-medium leading-snug text-neutral-100">{p.name}</span>
              <GradeBadge grade={grade} />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <AnimatedNumber
                value={p.latest?.blended ?? p.latest?.weekly}
                className={`text-3xl font-semibold tabular-nums ${grade ? GRADE_STYLE[grade].text : "text-neutral-400"}`}
              />
              <span className="text-xs text-neutral-500">
                {p.live ? <>실시간 24시간 {formatScore(p.live.score)}</> : <>24시간 {formatScore(p.latest?.daily)}</>}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

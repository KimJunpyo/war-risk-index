"use client";

import { usePastCases, type PastCase } from "@/entities/case";
import { formatScore } from "@/shared/lib";
import { Panel, StatusText } from "@/shared/ui";

type Row = { kind: "case"; item: PastCase } | { kind: "now"; score: number };

/** 선택한 국가 쌍의 현재 7일 점수(일별 뉴스 집계)를 과거 위기 직전 점수와 나란히 (개전·대조군 함께) */
export function PastCases({ pairId, pairName, current }: { pairId: string; pairName: string; current: number }) {
  const { data, loading, error } = usePastCases();
  // 점수 내림차순, 같은 점수면 "지금"이 위. 점수 없는 사례는 맨 아래
  const rows = [...(data ?? []).map((item): Row => ({ kind: "case", item })), { kind: "now", score: current } as Row]
    .sort((a, b) => (rowScore(b) ?? -Infinity) - (rowScore(a) ?? -Infinity) || (a.kind === "now" ? -1 : b.kind === "now" ? 1 : 0));
  const max = Math.max(...rows.map((r) => rowScore(r) ?? 0), 1);

  return (
    <Panel title="과거 위기 때 점수" className="lg:col-span-2">
      <p className="mb-3 text-xs leading-relaxed text-neutral-400">
        과거 11건 중 개전 5건, 전쟁 없이 지나간 위기 6건입니다. 점수만으로는 전쟁이 날지 구분할 수 없었습니다.
      </p>
      <StatusText loading={loading} error={error} />
      {data && (
        <ul className="space-y-1.5">
          {rows.map((r) => r.kind === "now" ? (
            <ScoreRow key="now" label={`지금 · ${pairName}`} score={r.score} max={max} highlight="now" />
          ) : (
            <ScoreRow
              key={r.item.name}
              label={r.item.label}
              score={r.item.score}
              max={max}
              isWar={r.item.is_war}
              highlight={r.item.pairs.includes(pairId) ? "same" : null}
            />
          ))}
        </ul>
      )}
      <p className="mt-3 text-[11px] text-neutral-500">
        비교 기준: 일별 뉴스 집계 7일 점수. 과거 사례는 시작일(괄호 안 날짜) 전날 값입니다.
      </p>
    </Panel>
  );
}

function rowScore(r: Row): number | null {
  return r.kind === "now" ? r.score : r.item.score;
}

function ScoreRow({ label, score, max, isWar, highlight }: {
  label: string;
  score: number | null;
  max: number;
  isWar?: boolean;
  highlight: "now" | "same" | null;
}) {
  const box = highlight === "now" ? "bg-white/10 ring-1 ring-white/30" : highlight === "same" ? "bg-amber-500/10 ring-1 ring-amber-500/30" : "";
  const bar = highlight === "now" ? "bg-white" : isWar ? "bg-rose-400/70" : "bg-sky-400/70";
  return (
    <li className={`rounded-lg px-2 py-1.5 ${box}`}>
      <div className="flex items-center gap-2 text-sm">
        <span className={`min-w-0 ${highlight === "now" ? "font-semibold text-white" : "text-neutral-200"}`}>{label}</span>
        {isWar !== undefined && (
          <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] ring-1 ${isWar ? "bg-rose-500/15 text-rose-300 ring-rose-500/30" : "bg-sky-500/15 text-sky-300 ring-sky-500/30"}`}>
            {isWar ? "개전" : "전쟁 없음"}
          </span>
        )}
        <span className="ml-auto shrink-0 tabular-nums text-neutral-300">{formatScore(score)}</span>
      </div>
      <div aria-hidden="true" className="mt-1 h-1.5 rounded-full bg-white/5">
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${(Math.max(score ?? 0, 0) / max) * 100}%` }} />
      </div>
    </li>
  );
}

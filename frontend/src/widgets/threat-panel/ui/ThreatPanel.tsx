"use client";

import { useThreat } from "@/entities/threat";
import { Panel, StatusText } from "@/shared/ui";

const DAYS = 3;
const EVIDENCE_LIMIT = 4;

/** basePath 의 마지막 조각에서 국가 코드를 뽑음: /api/pairs/RUS-UKR → [RUS, UKR], /api/countries/RUS → [RUS] */
const codesOf = (basePath: string) => basePath.split("/").at(-1)?.split("-") ?? [];

/** 국가별 뉴스룸 기사에서 찾은 위협 표현 신호 (키워드 실험, 대표 지수 미반영) */
export function ThreatPanel({ basePath }: { basePath: string }) {
  const { data, loading, error } = useThreat();
  const codes = codesOf(basePath);
  const rows = (data?.countries ?? []).filter((r) => codes.includes(r.iso3));
  const dates = [...new Set(rows.map((r) => r.date))].sort().reverse().slice(0, DAYS);
  const evidence = rows
    .filter((r) => dates.includes(r.date))
    .flatMap((r) => r.evidence)
    .filter((e, i, all) => all.findIndex((x) => x.url === e.url) === i)
    .sort((a, b) => b.intensity - a.intensity)
    .slice(0, EVIDENCE_LIMIT);

  return (
    <Panel title="🛰 뉴스룸 위협 신호" action={<span className="text-xs text-neutral-500">키워드 실험 · 지수 미반영</span>}>
      <StatusText loading={loading} error={error} />
      {data && (
        <>
          {dates.length === 0 ? (
            <p className="text-sm text-neutral-500">최근 신호 없음</p>
          ) : (
            <table className="mb-3 w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-neutral-500">
                  <th className="font-normal">날짜</th>
                  {codes.map((c) => <th key={c} className="text-right font-normal">{c}</th>)}
                </tr>
              </thead>
              <tbody>
                {dates.map((d) => (
                  <tr key={d} className="border-t border-white/5">
                    <td className="py-1 text-neutral-400">{d.slice(5)}</td>
                    {codes.map((c) => {
                      const r = rows.find((x) => x.date === d && x.iso3 === c);
                      return <td key={c} className="py-1 text-right tabular-nums text-neutral-200">{r ? r.score.toFixed(0) : "–"}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {evidence.length > 0 && (
            <ul className="divide-y divide-white/5">
              {evidence.map((e) => (
                <li key={e.url} className="py-2 text-sm">
                  <span className="mr-2 rounded bg-white/5 px-1.5 py-0.5 text-[11px] text-neutral-400">{e.type} {e.intensity}</span>
                  <a href={e.url} target="_blank" rel="noreferrer" className="text-neutral-200 hover:underline">{e.title}</a>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-[11px] leading-relaxed text-neutral-600">
            국방·안보 매체 {data.articles.toLocaleString()}건의 제목·요약에서 위협 표현(최후통첩·동원·대사관 철수 등)을 사전으로 찾은 값.
            문맥을 이해하지 못해 오탐·누락이 있으며, 과거 사례 검증에서 개전과 위기를 가르지 못했습니다.
          </p>
        </>
      )}
    </Panel>
  );
}

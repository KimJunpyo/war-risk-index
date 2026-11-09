"use client";

import { CatalystBars, CatalystItem, useCatalysts } from "@/entities/catalyst";
import { Panel, StatusText } from "@/shared/ui";

const LIST_DAYS = 14;
const LIST_LIMIT = 10;

/** basePath: 국가 쌍(/api/pairs/{id}) 또는 국가(/api/countries/{code}) */
export function CatalystPanel({ basePath }: { basePath: string }) {
  const { data, loading, error } = useCatalysts(basePath, 90);
  const lastDate = data?.daily.at(-1)?.date;
  const since = lastDate ? new Date(Date.parse(lastDate) - (LIST_DAYS - 1) * 86_400_000).toISOString().slice(0, 10) : "";
  // 최근 14일, 최신 날짜 순 (같은 날은 언급 많은 순)
  const top = (data?.events ?? [])
    .filter((e) => e.date >= since)
    .sort((a, b) => b.date.localeCompare(a.date) || b.mentions - a.mentions)
    .slice(0, LIST_LIMIT);
  const ultimatums = top.filter((e) => e.type === "최후통첩").length;

  return (
    <Panel title="⚡ 촉매 신호" action={<span className="text-xs text-neutral-500">위협 · 최후통첩 · 무력 시위</span>}>
      <StatusText loading={loading} error={error} />
      {data && (
        <>
          {ultimatums > 0 && (
            <p className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">
              최근 {LIST_DAYS}일 안에 최후통첩 신호가 {ultimatums}건 있습니다.
            </p>
          )}
          <p className="mb-1 text-xs text-neutral-500">최근 90일 일별 언급량</p>
          <CatalystBars daily={data.daily} />
          <p className="mb-1 mt-4 text-xs text-neutral-500">최근 {LIST_DAYS}일 주요 사건</p>
          {top.length === 0 ? (
            <p className="text-sm text-neutral-500">없음</p>
          ) : (
            <ul className="divide-y divide-white/5">
              {top.map((e) => <CatalystItem key={`${e.date}-${e.src}-${e.dst}-${e.type}`} event={e} />)}
            </ul>
          )}
          <p className="mt-2 text-[11px] leading-relaxed text-neutral-600">
            A → B = A가 B를 향해 한 행동 · <b className="text-neutral-500">국적 미상</b> = 나라를 특정할 수 없는
            무장단체·시위대 등 · <b className="text-neutral-500">국내</b> = 정부와 국내 세력(반군·야당 등) 사이 사건
          </p>
        </>
      )}
    </Panel>
  );
}

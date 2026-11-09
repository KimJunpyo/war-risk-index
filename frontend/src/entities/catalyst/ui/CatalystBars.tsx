/** 일별 촉매 언급량 막대 (최근 N일) */
export function CatalystBars({ daily }: { daily: { date: string; mentions: number }[] }) {
  const max = Math.max(1, ...daily.map((d) => d.mentions));
  return (
    <div className="flex h-16 items-end gap-px" aria-label="하루별 위협·경고 사건 보도량">
      {daily.map((d) => (
        <div
          key={d.date}
          title={`${d.date} · 보도 ${d.mentions}건`}
          className="flex-1 rounded-t-sm bg-orange-400/60 hover:bg-orange-300"
          style={{ height: `${Math.max(2, (d.mentions / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

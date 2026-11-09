/** 일별 촉매 언급량 막대 (최근 N일) */
export function CatalystBars({ daily }: { daily: { date: string; mentions: number }[] }) {
  const max = Math.max(1, ...daily.map((d) => d.mentions));
  return (
    <div className="flex h-16 items-end gap-px" aria-label="일별 촉매 언급량">
      {daily.map((d) => (
        <div
          key={d.date}
          title={`${d.date} · 언급 ${d.mentions}`}
          className="flex-1 rounded-t-sm bg-orange-400/60 hover:bg-orange-300"
          style={{ height: `${Math.max(2, (d.mentions / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

/** 출처 링크(새 탭)와 확인일 목록.
 *  360 터치 간격: 경보 카드 출처와 같은 줄 높이·간격(줄 높이 19.5px + 간격 8px = 링크 중심 간 27.5px, 24px 이상) */
export function SourceLinks({ sources }: { sources: { name: string; url: string; checkedAt: string }[] }) {
  return (
    <ul className="mt-1 space-y-2 text-xs leading-relaxed text-fg-muted">
      {sources.map((s) => (
        <li key={s.url}>
          <a href={s.url} target="_blank" rel="noreferrer" className="underline decoration-link-line hover:text-fg">
            {s.name}
          </a>{" "}
          ({s.checkedAt} 확인)
        </li>
      ))}
    </ul>
  );
}

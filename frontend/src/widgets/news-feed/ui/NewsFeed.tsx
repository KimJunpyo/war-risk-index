"use client";

import { useState } from "react";
import { NewsCard, useNews, type NewsRange } from "@/entities/news";
import { NewsRangeToggle } from "@/features/select-news-range";
import { Panel, StatusText } from "@/shared/ui";

/** newsPath: 국가 쌍(/api/pairs/{id}/news) 또는 국가(/api/countries/{code}/news?name=…) */
export function NewsFeed({ newsPath }: { newsPath: string }) {
  const [range, setRange] = useState<NewsRange>("24h");
  const { data, loading, error } = useNews(newsPath, range);

  return (
    <Panel title="국방 뉴스" action={<NewsRangeToggle value={range} onChange={setRange} />} className="lg:row-span-2">
      <StatusText loading={loading} error={error} />
      {data && data.length === 0 && <p className="text-sm text-neutral-500">해당 기간 뉴스가 없습니다.</p>}
      {data && data.length > 0 && (
        <ul className="-mx-2 max-h-[720px] overflow-y-auto">
          {data.map((n) => <NewsCard key={n.url} item={n} />)}
        </ul>
      )}
    </Panel>
  );
}

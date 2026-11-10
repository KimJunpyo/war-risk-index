"use client";

import { useState } from "react";
import { NewsCard, useNews, type NewsItem, type NewsRange } from "@/entities/news";
import { NewsRangeToggle } from "@/features/select-news-range";
import { titleMentions } from "@/shared/lib";
import { Panel, ScrollArea, StatusText } from "@/shared/ui";

// 목록 최대 높이: 기본 480px, md 560px, lg 이상 720px(오른쪽 열에서 두 행을 차지)
const LIST_MAX_H = "max-h-[480px] md:max-h-[560px] lg:max-h-[720px]";

/** newsPath: 국가 쌍(/api/pairs/{id}/news) 또는 국가(/api/countries/{code}/news?name=…)
 *  keywords: 제목(언론사명 제외)에 하나라도 있어야 보여줄 나라 이름들 */
export function NewsFeed({ newsPath, keywords }: { newsPath: string; keywords: string[] }) {
  const [picked, setPicked] = useState<NewsRange>("24h");
  // 두 기간을 모두 받아 걸러야 0건 여부로 패널·토글을 정할 수 있음
  const day = useNews(newsPath, "24h");
  const week = useNews(newsPath, "7d");
  const loading = day.loading || week.loading;
  // 조회 실패는 0건과 같게 취급 (둘 다 실패하면 패널을 숨김)
  const pick = (items: NewsItem[] | undefined) => (items ?? []).filter((n) => titleMentions(n.title, keywords));
  const items = { "24h": pick(day.data), "7d": pick(week.data) };

  if (!loading && items["7d"].length === 0 && items["24h"].length === 0) return null;
  // 걸러낸 뒤 0건인 기간은 고를 수 없게 하고 다른 기간을 보여줌 (보통 24시간만 0건 → 7일)
  const empty = loading ? [] : (["24h", "7d"] as const).filter((r) => items[r].length === 0);
  const range = empty.includes(picked) ? (picked === "24h" ? "7d" : "24h") : picked;
  const shown = items[range];

  return (
    <Panel
      title="국방 뉴스"
      action={<NewsRangeToggle value={range} onChange={setPicked} disabled={empty} />}
      className="lg:row-span-2"
    >
      <StatusText loading={loading} />
      {!loading && (
        <ScrollArea className="-mx-2" viewportClassName={LIST_MAX_H}>
          <ul>
            {shown.map((n) => <NewsCard key={n.url} item={n} />)}
          </ul>
        </ScrollArea>
      )}
    </Panel>
  );
}

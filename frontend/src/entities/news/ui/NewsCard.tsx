import { timeAgo } from "@/shared/lib";
import type { NewsItem } from "../model/types";

export function NewsCard({ item }: { item: NewsItem }) {
  // Google News 제목은 "제목 - 언론사" 형식이라 언론사 부분을 떼어 냄
  const title = item.source && item.title.endsWith(` - ${item.source}`)
    ? item.title.slice(0, -(item.source.length + 3))
    : item.title;
  return (
    <li>
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block rounded-lg px-2 py-2.5 transition hover:bg-white/5"
      >
        <p className="line-clamp-2 text-sm text-neutral-100">{title}</p>
        <p className="mt-1 text-xs text-neutral-500">
          {item.source} · {timeAgo(item.published_at)}
        </p>
      </a>
    </li>
  );
}

import { useFetch } from "@/shared/api";
import type { NewsItem, NewsRange } from "../model/types";

/** newsPath: 뉴스 엔드포인트 (쿼리 문자열이 이미 있을 수 있음) */
export const useNews = (newsPath: string | null, range: NewsRange) =>
  useFetch<NewsItem[]>(newsPath ? `${newsPath}${newsPath.includes("?") ? "&" : "?"}range=${range}` : null);

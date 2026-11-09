export interface NewsItem {
  title: string;
  url: string;
  source: string;
  published_at: string | null;
}

export type NewsRange = "24h" | "7d";

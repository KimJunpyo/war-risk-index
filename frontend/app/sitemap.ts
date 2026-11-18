import type { MetadataRoute } from "next";
import { CIVIL_ALERTS } from "@/entities/guide";
import { SITE_URL } from "@/shared/config/env";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE_URL}/emergency`, changeFrequency: "monthly", priority: 0.8 },
    // 경보 상세(1-5)
    ...CIVIL_ALERTS.map((a) => ({ url: `${SITE_URL}/emergency/${a.id}`, changeFrequency: "monthly" as const, priority: 0.7 })),
    { url: `${SITE_URL}/llms.txt`, changeFrequency: "monthly", priority: 0.3 },
  ];
}

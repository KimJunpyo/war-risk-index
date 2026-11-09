import type { MetadataRoute } from "next";
import { SITE_URL } from "@/shared/config/env";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE_URL}/llms.txt`, changeFrequency: "monthly", priority: 0.3 },
  ];
}

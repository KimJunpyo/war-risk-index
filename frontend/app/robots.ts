import type { MetadataRoute } from "next";
import { SITE_URL } from "@/shared/config/env";

// 검색엔진·AI 크롤러 모두 허용 (공개 지표라 답변 인용을 막을 이유 없음)
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}

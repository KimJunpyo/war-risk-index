// 백엔드 주소. 배포 시 NEXT_PUBLIC_API_BASE_URL 로 덮어쓴다.
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
// 사이트 공개 주소(canonical·sitemap·OG 이미지). 배포 시 NEXT_PUBLIC_SITE_URL 로 덮어쓴다.
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

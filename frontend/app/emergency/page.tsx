import type { Metadata } from "next";
import { EmergencyPage } from "@/views/emergency";

export const metadata: Metadata = {
  title: "비상 대비 안내",
  description:
    "민방위 경보 5종(경계·공습·화생방·핵·경보해제)별 행동요령, 비상 가방(3일 가방·7일 비축) 체크리스트, 가구원 수별 물·식량 계산. 국민안전24(행정안전부) 등 공식 안내를 바탕으로 자체 작성, 출처·확인일 포함.",
  alternates: { canonical: "/emergency" },
};

export default function Page() {
  return <EmergencyPage />;
}

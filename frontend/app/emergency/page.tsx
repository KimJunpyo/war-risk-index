import type { Metadata } from "next";
import { EmergencyPage } from "@/views/emergency";

export const metadata: Metadata = {
  title: "비상 대비 안내",
  description:
    "민방위 경보 5종(경계·공습·화생방·핵·경보해제)이 울릴 때 해야 할 일을 경보별로 정리한 비상 대비 안내. 국민안전24(행정안전부) 안내를 바탕으로 자체 작성, 출처·확인일 포함.",
  alternates: { canonical: "/emergency" },
};

export default function Page() {
  return <EmergencyPage />;
}

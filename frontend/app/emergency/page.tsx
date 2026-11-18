import type { Metadata, ResolvingMetadata } from "next";
import { EmergencyPage } from "@/views/emergency";

const PATH = "/emergency";
const TITLE = "비상 대비 안내";
const DESCRIPTION =
  "민방위 경보 5종(경계·공습·화생방·핵·경보해제)별 행동요령, 비상 가방(3일 가방·7일 비축) 체크리스트, 가구원 수별 물·식량 계산. 국민안전24(행정안전부) 등 공식 안내를 바탕으로 자체 작성, 출처·확인일 포함.";

// openGraph·twitter 는 얕게 합쳐져 페이지가 정하면 루트 값이 통째로 바뀐다(사이트 이름·파일 기반 이미지까지 빠짐).
// 그래서 루트 값을 이어 받고 공유 미리보기의 주소·제목·설명만 이 페이지 값으로 바꾼다
export async function generateMetadata(_: PageProps<"/emergency">, parent: ResolvingMetadata): Promise<Metadata> {
  const { openGraph, twitter } = await parent;
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: PATH },
    openGraph: { ...openGraph, url: PATH, title: TITLE, description: DESCRIPTION },
    twitter: { ...twitter, title: TITLE, description: DESCRIPTION },
  };
}

export default function Page() {
  return <EmergencyPage />;
}

import type { Metadata, ResolvingMetadata } from "next";
import { notFound } from "next/navigation";
import { CIVIL_ALERTS } from "@/entities/guide";
import { AlertDetailPage } from "@/views/emergency";

type Props = PageProps<"/emergency/[alert]">;

// 목록 밖 id 도 응답 전에 정적 결과를 다 만들게 해 notFound() 가 스트리밍 전에 불려 404 가 된다.
// Cache Components 에서는 dynamicParams 를 쓸 수 없고, 이 설정이 없으면 목록 밖 id 의 첫 요청은 껍데기를 먼저 보내 200(noindex)이 된다
export const ensureStatic = "navigation";
// 404 를 위해 params 를 Suspense 밖에서 읽으므로 이 경로로 오는 앱 안 이동은 정적 내용이 올 때까지 기다린다.
// 그래서 즉시 이동 검사(개발 서버가 브라우저 콘솔 오류로 알림)를 끈다
export const instant = false;

/** 빌드 때 만드는 경보 상세 5개(CIVIL_ALERTS id 그대로) */
export function generateStaticParams() {
  return CIVIL_ALERTS.map((a) => ({ alert: a.id }));
}

/** 주소의 경보(id 는 대소문자까지 글자 그대로 맞아야 함). 없으면 404 */
async function alertOf({ params }: Props) {
  const { alert } = await params;
  return CIVIL_ALERTS.find((a) => a.id === alert) ?? notFound();
}

// /emergency 와 같은 방식: openGraph·twitter 는 얕게 합쳐져 루트 값(사이트 이름·파일 기반 이미지)이 빠지므로 이어 받고 주소·제목·설명만 바꾼다
export async function generateMetadata(props: Props, parent: ResolvingMetadata): Promise<Metadata> {
  const a = await alertOf(props);
  const { openGraph, twitter } = await parent;
  const path = `/emergency/${a.id}`;
  const title = `${a.name} 행동요령`;
  const steps = a.keyActions.map((k, i) => `${i + 1}. ${k.text}`).join(" ");
  const description = `${a.when} 지금 할 일 3가지: ${steps}. 국민안전24(행정안전부) 안내를 바탕으로 자체 작성, 행동요령 전체·출처 포함.`;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { ...openGraph, url: path, title, description },
    twitter: { ...twitter, title, description },
  };
}

export default async function Page(props: Props) {
  return <AlertDetailPage alert={await alertOf(props)} />;
}

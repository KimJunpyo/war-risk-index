import type { Metadata, Viewport } from "next";
import { SITE_URL } from "@/shared/config/env";
import { PageScrollbar } from "@/shared/ui";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const TITLE = "전쟁 가능성 지수";
const DESCRIPTION =
  "전 세계 나라·국가 쌍의 갈등 뉴스가 평소보다 얼마나 늘었는지 점수로 보여주는 전쟁 위험 지표. GDELT 뉴스 이벤트와 UCDP 교전 기록, 15분 실시간 갱신, 점수별 행동 권고·여행경보 포함.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: `%s | ${TITLE}` },
  description: DESCRIPTION,
  applicationName: TITLE,
  keywords: ["전쟁 가능성", "전쟁 위험 지수", "지정학 리스크", "분쟁", "국방 뉴스", "여행경보", "GDELT", "UCDP", "war risk index"],
  alternates: { canonical: "/" },
  openGraph: { type: "website", locale: "ko_KR", url: "/", siteName: TITLE, title: TITLE, description: DESCRIPTION },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = { themeColor: "#0b1220", colorScheme: "dark" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} no-native-scrollbar h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <PageScrollbar />
      </body>
    </html>
  );
}

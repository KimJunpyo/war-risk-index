import { ImageResponse } from "next/og";

// 링크 공유 미리보기. 기본 글꼴에 한글이 없어 영문으로 표기
// shortcut: 한글 문구가 필요하면 한글 글꼴 파일을 fonts 옵션으로 넣어야 함
export const alt = "War Risk Index — 전쟁 가능성 지수";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{
        width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center",
        padding: 80, background: "linear-gradient(135deg, #0b1220 0%, #111a2e 100%)", color: "#fff",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <svg viewBox="0 0 64 64" width={120} height={120}>
            <circle cx="32" cy="32" r="21" fill="none" stroke="#1e3a5f" strokeWidth="3" />
            <ellipse cx="32" cy="32" rx="9" ry="21" fill="none" stroke="#1e3a5f" strokeWidth="2.5" />
            <path d="M14 44l10-9 8 5 9-12 9-6" fill="none" stroke="#fbbf24" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="50" cy="22" r="6" fill="#f43f5e" />
          </svg>
          <div style={{ fontSize: 76, fontWeight: 700 }}>War Risk Index</div>
        </div>
        <div style={{ marginTop: 32, fontSize: 34, color: "#cbd5e1" }}>
          How unusual is today&apos;s conflict news for each country?
        </div>
        <div style={{ marginTop: 16, fontSize: 28, color: "#94a3b8" }}>
          GDELT news events · UCDP armed conflict · updated every 15 minutes
        </div>
      </div>
    ),
    size,
  );
}

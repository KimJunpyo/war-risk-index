import { ImageResponse } from "next/og";

// iOS 홈 화면용 PNG. 그림은 app/icon.svg 와 같음
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width={180} height={180}>
        <rect width="64" height="64" fill="#0b1220" />
        <circle cx="32" cy="32" r="21" fill="none" stroke="#1e3a5f" strokeWidth="3" />
        <ellipse cx="32" cy="32" rx="9" ry="21" fill="none" stroke="#1e3a5f" strokeWidth="2.5" />
        <path d="M11 32h42" stroke="#1e3a5f" strokeWidth="2.5" />
        <path d="M14 44l10-9 8 5 9-12 9-6" fill="none" stroke="#fbbf24" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="50" cy="22" r="6" fill="#f43f5e" stroke="#0b1220" strokeWidth="2.5" />
      </svg>
    ),
    size,
  );
}

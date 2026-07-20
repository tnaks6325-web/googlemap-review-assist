import type { Metadata } from "next";
// Pretendard self-host (외부 CDN 의존 제거) — @font-face "Pretendard Variable" 제공
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "리뷰 작성 보조",
  description: "영수증 인증 후 클릭 몇 번으로 리뷰 초안을 완성하세요.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full">{children}</body>
    </html>
  );
}

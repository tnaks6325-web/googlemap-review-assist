import type { Metadata } from "next";
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
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}

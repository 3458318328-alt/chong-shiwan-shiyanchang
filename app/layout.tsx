import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "冲十万实验场 · 阿零 vs 时休",
  description: "阿零与时休的 30 天视频创作对决。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}

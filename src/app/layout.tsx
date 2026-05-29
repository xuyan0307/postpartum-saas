import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "月子产康 SaaS 管理平台",
  description: "面向月子产康门店的一期管理平台",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}

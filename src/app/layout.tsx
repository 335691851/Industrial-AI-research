import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "全球工业智能导航",
  description:
    "炽橙科技行业研究工作台：工业智能、数字孪生、3D + AI 与制造业科技情报。",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}

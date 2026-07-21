import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const ogImage = `${protocol}://${host}/og.png`;
  return {
    title: "SEA 销售经营看板",
    description: "东南亚六国、五品牌的 TikTok、Shopee 与 Lazada 全渠道销售经营洞察。",
    icons: { icon: "/favicon.svg" },
    openGraph: {
      title: "SEA 销售经营看板",
      description: "TikTok、Shopee、Lazada 全渠道销售与平台补贴洞察",
      type: "website",
      images: [{ url: ogImage, width: 1672, height: 941, alt: "SEA 销售经营看板" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "SEA 销售经营看板",
      description: "TikTok、Shopee、Lazada 全渠道销售与平台补贴洞察",
      images: [ogImage],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}

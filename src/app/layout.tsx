import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppShell } from "@/components/shell/AppShell";

const DESCRIPTION = "Explore BEAST FEAST, a robotics engineering platform for learning, designing, coding, and simulating robots.";

export const metadata: Metadata = {
  // production domain (verified) — Open Graph images resolve against it
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://beast-feast-pi.vercel.app"),
  title: { default: "BEAST FEAST | Robotics Engineering Platform", template: "%s | BEAST FEAST" },
  description: DESCRIPTION,
  applicationName: "BEAST FEAST",
  authors: [{ name: "Robotics Club KKH" }],
  openGraph: { type: "website", siteName: "BEAST FEAST", title: "BEAST FEAST | Robotics Engineering Platform", description: DESCRIPTION, locale: "en_IN" },
  twitter: { card: "summary_large_image", title: "BEAST FEAST | Robotics Engineering Platform", description: DESCRIPTION },
};

export const viewport: Viewport = { themeColor: "#4B5A50", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";
import { TestModeBanner } from "@/components/layout/TestModeBanner";

export const metadata: Metadata = {
  title: "A3CEND Outreach — Email Automation Platform",
  description: "Professional email outreach automation with SendGrid dynamic templates and intelligent follow-up sequences.",
  icons: {
    icon: [
      { url: "/icon.png?v=3", sizes: "32x32", type: "image/png" },
      { url: "/favicon.ico?v=3" },
    ],
    shortcut: "/favicon.ico?v=3",
    apple: "/apple-touch-icon.png?v=3",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" type="image/png" sizes="32x32" href="/icon.png?v=3" />
        <link rel="shortcut icon" href="/favicon.ico?v=3" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png?v=3" />
      </head>
      <body>
        <div className="app-layout">
          <Sidebar />
          <main className="app-main">
            <TestModeBanner />
            <div className="app-content">
              {children}
            </div>
          </main>
        </div>
      </body>
    </html>
  );
}

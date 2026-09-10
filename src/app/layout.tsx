import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";
import { TestModeBanner } from "@/components/layout/TestModeBanner";

export const metadata: Metadata = {
  title: "A3CEND Outreach — Email Automation Platform",
  description: "Professional email outreach automation with SendGrid dynamic templates and intelligent follow-up sequences.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
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

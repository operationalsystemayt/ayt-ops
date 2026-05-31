// app/layout.tsx
import type { Metadata } from "next";
import { Toaster } from "react-hot-toast";
import { Topbar } from "@/components/ui/Topbar";
import { appConfig } from "@/config/app";
import "./globals.css";

export const metadata: Metadata = {
  title: appConfig.appName,
  description: "Angkasa Yudistira Travel — Operational System",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className="dark">
      <body className="bg-neutral-950 text-neutral-100 antialiased min-h-screen">
        <Topbar />
        <main className="max-w-screen-xl mx-auto px-6 py-8">
          {children}
        </main>
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: "#171922",
              color: "#e2e8f0",
              border: "1px solid #2a2f45",
              fontSize: "13px",
            },
          }}
        />
      </body>
    </html>
  );
}

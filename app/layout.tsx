// app/layout.tsx
import type { Metadata } from "next";
import { Toaster } from "react-hot-toast";
import { Topbar } from "@/components/ui/Topbar";
import { ThemeProvider } from "@/hooks/useTheme";
import { appConfig } from "@/config/app";
import "./globals.css";

export const metadata: Metadata = {
  title: appConfig.appName,
  description: "Angkasa Yudistira Travel — Operational System",
};

// Inline script runs before React hydration → no flash of wrong theme
const themeInitScript = `
(function(){
  var t=localStorage.getItem('ayt-theme')||'dark';
  document.documentElement.setAttribute('data-theme',t);
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" suppressHydrationWarning>
      {/* eslint-disable-next-line @next/next/no-sync-scripts */}
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="bg-neutral-950 text-neutral-100 antialiased min-h-screen">
        <ThemeProvider>
          <Topbar />
          <main className="max-w-screen-xl mx-auto px-6 py-8">
            {children}
          </main>
          <ThemedToaster />
        </ThemeProvider>
      </body>
    </html>
  );
}

// Toaster that adapts to current theme
function ThemedToaster() {
  return (
    <Toaster
      position="top-right"
      toastOptions={{
        style: {
          background: "var(--toast-bg, #171922)",
          color: "var(--toast-text, #e2e8f0)",
          border: "1px solid var(--toast-border, #2a2f45)",
          fontSize: "13px",
          fontFamily: "Poppins, sans-serif",
        },
      }}
    />
  );
}

// components/ui/Topbar.tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { appConfig } from "@/config/app";
import { EnvBadge } from "./EnvBadge";
import { clsx } from "clsx";

const NAV = [
  { href: "/rab", label: "RAB Master" },
  { href: "/trip", label: "Open Trip" },
];

export function Topbar() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-50 bg-neutral-950/90 backdrop-blur border-b border-neutral-800">
      <div className="max-w-screen-xl mx-auto px-6 h-14 flex items-center gap-6">
        {/* Brand */}
        <div className="flex items-center gap-2.5 mr-2">
          <div className="w-2 h-2 rounded-full bg-teal-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
          <span className="font-semibold text-sm tracking-tight text-neutral-100">
            {appConfig.appName}
          </span>
          <EnvBadge />
        </div>

        {/* Nav */}
        <nav className="flex items-center gap-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "px-3 py-1.5 rounded-lg text-sm transition-colors",
                path.startsWith(item.href)
                  ? "bg-neutral-800 text-neutral-100 font-medium"
                  : "text-neutral-500 hover:text-neutral-300"
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Version */}
        <div className="ml-auto text-[10px] text-neutral-700 font-mono">
          v{appConfig.version}
        </div>
      </div>
    </header>
  );
}

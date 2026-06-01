// components/ui/Topbar.tsx
"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { EnvBadge } from "./EnvBadge";
import { appConfig } from "@/config/app";
import { clsx } from "clsx";

const NAV = [
  { href: "/rab", label: "RAB Master" },
  { href: "/trip", label: "Open Trip" },
];

export function Topbar() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-50 bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-screen-xl mx-auto px-6 h-16 flex items-center gap-8">
        {/* AYT Logo */}
        <Link href="/" className="flex items-center gap-3 flex-shrink-0">
          <Image
            src="/ayt-logo.png"
            alt="Angkasa Yudistira Travel"
            width={80}
            height={48}
            className="object-contain"
            priority
          />
          <div className="hidden sm:block">
            <div className="text-[10px] font-semibold uppercase tracking-widest leading-none"
              style={{ color: "var(--ayt-blue)" }}>
              Ops
            </div>
            <EnvBadge />
          </div>
        </Link>

        {/* Nav */}
        <nav className="flex items-center gap-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                path.startsWith(item.href)
                  ? "text-white"
                  : "text-gray-500 hover:text-gray-800 hover:bg-gray-100"
              )}
              style={path.startsWith(item.href)
                ? { backgroundColor: "var(--ayt-blue)" }
                : {}}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Right */}
        <div className="ml-auto text-[10px] text-gray-400 font-mono">
          v{appConfig.version}
        </div>
      </div>
    </header>
  );
}

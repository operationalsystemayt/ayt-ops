// components/ui/Topbar.tsx
"use client";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { EnvBadge } from "./EnvBadge";
import { ThemeToggle } from "./ThemeToggle";
import { appConfig } from "@/config/app";
import { clsx } from "clsx";

const NAV = [
  { href: "/rab", label: "RAB Master" },
  { href: "/trip", label: "Open Trip" },
  { href: "/trip?type=private", label: "Private Trip" },
];

function NavLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={clsx(
        "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
        active
          ? "text-white"
          : "text-gray-500 hover:text-gray-800 hover:bg-gray-100"
      )}
      style={active ? { backgroundColor: "var(--ayt-blue)" } : {}}
    >
      {label}
    </Link>
  );
}

function NavLinks({ path, isPrivate }: { path: string; isPrivate: boolean }) {
  return (
    <>
      {NAV.map((item) => {
        const isTrip = item.href.startsWith("/trip");
        const itemIsPrivate = item.href.includes("type=private");
        const active = isTrip
          ? path.startsWith("/trip") && itemIsPrivate === isPrivate
          : path.startsWith(item.href);
        return <NavLink key={item.href} href={item.href} label={item.label} active={active} />;
      })}
    </>
  );
}

function NavLinksWithParams({ path }: { path: string }) {
  const searchParams = useSearchParams();
  return <NavLinks path={path} isPrivate={searchParams.get("type") === "private"} />;
}

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
          <Suspense fallback={<NavLinks path={path} isPrivate={false} />}>
            <NavLinksWithParams path={path} />
          </Suspense>
        </nav>

        {/* Right */}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[10px] text-gray-400 font-mono">v{appConfig.version}</span>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

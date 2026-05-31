// components/ui/EnvBadge.tsx
"use client";
import { appConfig } from "@/config/app";
import { clsx } from "clsx";

export function EnvBadge() {
  if (appConfig.isProduction) return null;
  const label = appConfig.env.toUpperCase();
  const classes = appConfig.isSit
    ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
    : "bg-blue-500/20 text-blue-400 border-blue-500/30";

  return (
    <span className={clsx(
      "inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-widest border",
      classes
    )}>
      {label}
    </span>
  );
}

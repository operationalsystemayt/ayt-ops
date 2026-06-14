// lib/kurs.ts
// Shared multi-kurs helpers, used by both RAB Master and Transportasi.
import type { KursEntry } from "@/types/rab";

export type { KursEntry };

function n(val: number | "" | undefined | null): number {
  if (val === "" || val === null || val === undefined) return 0;
  return Number(val) || 0;
}

export function getKursValue(kursList: KursEntry[] | undefined, kurs_id: string | null | undefined): number {
  if (!kurs_id || !kursList) return 1;
  const entry = kursList.find((k) => k.id === kurs_id);
  return entry ? (n(entry.value) || 1) : 1;
}

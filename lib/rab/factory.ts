// lib/rab/factory.ts
import type { RabMaster, RabItem, RabHeader } from "@/types/rab";
import { nanoid } from "nanoid";

// nanoid shim using crypto
function uid() {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
}

export function blankItem(sort_order = 0): RabItem {
  return { id: uid(), detail: "", biaya: "", divisor: "none", sort_order, use_kurs: true };
}

export function defaultHeader(): RabHeader {
  return {
    nama: "",
    tiket_pesawat: "",
    hotel_peserta: "",
    hotel_tl: "",
    jumlah_pax: 16,
    jumlah_hari: 6,
    jumlah_malam: 5,
    jumlah_tl: 1,
    kurs: 1,
  };
}

export function newRab(createdBy = "ops"): RabMaster {
  const now = new Date().toISOString().slice(0, 10);
  return {
    id: uid(),
    header: defaultHeader(),
    peserta_rows: [blankItem(0), blankItem(1)],
    tl_rows: [blankItem(0), blankItem(1)],
    harga_jual: "",
    harga_jual_landtour: "",
    tipping: "",
    tipping_landtour: "",
    notes: "",
    created_at: now,
    updated_at: now,
    created_by: createdBy,
  };
}

export const DIVISOR_OPTIONS = [
  { value: "none",        label: "× 1 (flat)" },
  { value: "per_pax",     label: "÷ pax" },
  { value: "times_pax",   label: "× pax" },
  { value: "per_malam",   label: "÷ malam" },
  { value: "times_malam", label: "× malam" },
  { value: "per_tl",      label: "÷ TL" },
  { value: "times_tl",    label: "× TL" },
  { value: "per_hari",    label: "÷ hari" },
  { value: "times_hari",  label: "× hari" },
  { value: "custom",      label: "Custom…" },
];

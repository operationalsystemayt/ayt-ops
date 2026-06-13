// lib/rab/factory.ts
import type { RabMaster, RabItem, RabHeader, KursEntry } from "@/types/rab";
import { nanoid } from "nanoid";

// nanoid shim using crypto
function uid() {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
}

export function blankItem(sort_order = 0, defaultKursId?: string | null): RabItem {
  return { id: uid(), detail: "", biaya: "", divisor: "none", sort_order, kurs_id: defaultKursId ?? null };
}

export function blankKursEntry(label = "Kurs baru"): KursEntry {
  return { id: uid(), label, value: "" };
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
    jumlah_guide: "",
    jumlah_driver: "",
    kurs_list: [{ id: uid(), label: "Kurs", value: 1 }],
  };
}

export function newRab(createdBy = "ops"): RabMaster {
  const now = new Date().toISOString().slice(0, 10);
  const header = defaultHeader();
  const firstKursId = header.kurs_list[0]?.id ?? null;
  return {
    id: uid(),
    header,
    peserta_rows: [blankItem(0, firstKursId), blankItem(1, firstKursId)],
    tl_rows: [blankItem(0, firstKursId), blankItem(1, firstKursId)],
    guide_rows: [blankItem(0, firstKursId), blankItem(1, firstKursId)],
    driver_rows: [blankItem(0, firstKursId), blankItem(1, firstKursId)],
    guide_use_tiket_hotel: false,
    driver_use_tiket_hotel: false,
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
  { value: "none",         label: "× 1 (flat)" },
  { value: "per_pax",      label: "÷ pax" },
  { value: "times_pax",    label: "× pax" },
  { value: "per_malam",    label: "÷ malam" },
  { value: "times_malam",  label: "× malam" },
  { value: "per_tl",       label: "÷ Tour Leader" },
  { value: "times_tl",     label: "× Tour Leader" },
  { value: "per_hari",     label: "÷ hari" },
  { value: "times_hari",   label: "× hari" },
  { value: "per_guide",    label: "÷ Guide" },
  { value: "times_guide",  label: "× Guide" },
  { value: "per_driver",   label: "÷ Driver" },
  { value: "times_driver", label: "× Driver" },
  { value: "custom",       label: "Custom…" },
];

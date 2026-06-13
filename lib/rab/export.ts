// lib/rab/export.ts
import type { RabMaster, RabComputed, RabItem } from "@/types/rab";
import { formatIDR, n, applyDivisor } from "./calculations";

type Row = (string | number)[];

function csvRow(cells: Row): string {
  return cells.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",");
}

export function exportRABtoCsv(rab: RabMaster, comp: RabComputed): void {
  const h = rab.header;
  const pax    = n(h.jumlah_pax);
  const malam  = n(h.jumlah_malam);
  const tl     = n(h.jumlah_tl);
  const hari   = n(h.jumlah_hari);
  const guide  = n(h.jumlah_guide);
  const driver = n(h.jumlah_driver);
  const kursList = h.kurs_list ?? [];

  const calc = (r: RabItem) =>
    applyDivisor(n(r.biaya), r.divisor, pax, malam, tl, hari, kursList, r.kurs_id, r.custom_formula, guide, driver);

  const rows: Row[] = [];

  rows.push(["Prakiraan Budget :"]);
  rows.push(["Tiket Pesawat", n(h.tiket_pesawat)]);
  rows.push(["Hotel Peserta", n(h.hotel_peserta)]);
  rows.push([]);
  rows.push(["Jumlah Pax", pax]);
  rows.push(["Jumlah Hari trip", n(h.jumlah_hari)]);
  rows.push(["Jumlah Malam", malam]);
  rows.push(["Jumlah Tour Leader", tl]);
  rows.push(["Jumlah Guide", guide]);
  rows.push(["Jumlah Driver", driver]);
  for (const k of kursList) {
    rows.push([`Kurs: ${k.label}`, n(k.value)]);
  }
  rows.push([]);
  rows.push([h.nama || "RAB Master"]);
  rows.push(["Budget Peserta", "", "Landtour", "Budget Tour Leader", ""]);

  // Fixed rows
  rows.push([
    `Tiket pesawat ${formatIDR(h.tiket_pesawat)}/pax`,
    formatIDR(comp.tiket_peserta_final),
    "",
    "Tiket pesawat",
    formatIDR(comp.tiket_tl_final),
  ]);
  rows.push([
    `Hotel ${formatIDR(h.hotel_peserta)}/malam/pax`,
    formatIDR(comp.hotel_peserta_final),
    "",
    "Hotel Tour Leader",
    formatIDR(comp.hotel_tl_final),
  ]);

  // Dynamic rows (zip peserta + tl)
  const maxLen = Math.max(rab.peserta_rows.length, rab.tl_rows.length);
  for (let i = 0; i < maxLen; i++) {
    const p = rab.peserta_rows[i];
    const t = rab.tl_rows[i];
    rows.push([
      p?.detail ?? "",
      p ? formatIDR(calc(p)) : "",
      "",
      t?.detail ?? "",
      t ? formatIDR(calc(t)) : "",
    ]);
  }

  rows.push(["Beban Tour Leader", formatIDR(comp.beban_tl)]);
  rows.push(["Jumlah", formatIDR(comp.total_peserta), formatIDR(comp.total_landtour)]);
  rows.push([
    "Harga Jual",
    formatIDR(rab.harga_jual),
    formatIDR(rab.harga_jual_landtour),
    "Jumlah beban Tour Leader",
    formatIDR(comp.total_tl),
  ]);
  rows.push(["Laba/pax", formatIDR(comp.laba_pax), formatIDR(comp.laba_pax_landtour)]);
  rows.push([
    `Tipping`,
    formatIDR(rab.tipping),
    formatIDR(rab.tipping_landtour),
  ]);
  rows.push([
    `Laba + tipping (${pax}pax)`,
    formatIDR(comp.laba_plus_tipping),
    formatIDR(comp.laba_plus_tipping_landtour),
  ]);

  // Budget Tour Guide
  rows.push([]);
  rows.push(["Budget Tour Guide", ""]);
  if (rab.guide_use_tiket_hotel) {
    rows.push(["Tiket pesawat Tour Guide", formatIDR(comp.tiket_guide_final)]);
    rows.push(["Hotel Tour Guide", formatIDR(comp.hotel_guide_final)]);
  }
  rab.guide_rows.forEach((r, i) => {
    rows.push([r.detail || "", formatIDR(comp.guide_dynamic[i] ?? 0)]);
  });
  rows.push(["Jumlah beban Tour Guide", formatIDR(comp.total_guide)]);

  // Budget Driver
  rows.push([]);
  rows.push(["Budget Driver", ""]);
  if (rab.driver_use_tiket_hotel) {
    rows.push(["Tiket pesawat Driver", formatIDR(comp.tiket_driver_final)]);
    rows.push(["Hotel Driver", formatIDR(comp.hotel_driver_final)]);
  }
  rab.driver_rows.forEach((r, i) => {
    rows.push([r.detail || "", formatIDR(comp.driver_dynamic[i] ?? 0)]);
  });
  rows.push(["Jumlah beban Driver", formatIDR(comp.total_driver)]);

  if (rab.notes?.trim()) {
    rows.push([]);
    rows.push(["Catatan"]);
    rows.push([rab.notes]);
  }

  const csv = rows.map(csvRow).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `${(h.nama || "rab_master").replace(/\s+/g, "_")}_latest.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// lib/rab/export.ts
import type { RabMaster, RabComputed } from "@/types/rab";
import { formatIDR, n, applyDivisor } from "./calculations";

type Row = (string | number)[];

function csvRow(cells: Row): string {
  return cells.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",");
}

export function exportRABtoCsv(rab: RabMaster, comp: RabComputed): void {
  const h = rab.header;
  const pax   = n(h.jumlah_pax);
  const malam = n(h.jumlah_malam);
  const tl    = n(h.jumlah_tl);
  const hari  = n(h.jumlah_hari);
  const kurs  = n(h.kurs) || 1;

  const rows: Row[] = [];

  rows.push(["Prakiraan Budget :"]);
  rows.push(["Tiket Pesawat", n(h.tiket_pesawat)]);
  rows.push(["Hotel Peserta", n(h.hotel_peserta)]);
  rows.push([]);
  rows.push(["Jumlah Pax", pax]);
  rows.push(["Jumlah Hari trip", n(h.jumlah_hari)]);
  rows.push(["Jumlah Malam", malam]);
  rows.push(["Jumlah TL", tl]);
  rows.push(["Kurs", kurs]);
  rows.push([]);
  rows.push([h.nama || "RAB Master"]);
  rows.push(["Budget Peserta", "", "Landtour", "Budget TL", ""]);

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
    "Hotel TL",
    formatIDR(comp.hotel_tl_final),
  ]);

  // Dynamic rows (zip peserta + tl)
  const maxLen = Math.max(rab.peserta_rows.length, rab.tl_rows.length);
  for (let i = 0; i < maxLen; i++) {
    const p = rab.peserta_rows[i];
    const t = rab.tl_rows[i];
    rows.push([
      p?.detail ?? "",
      p ? formatIDR(applyDivisor(n(p.biaya), p.divisor, pax, malam, tl, hari, kurs, p.use_kurs ?? true, p.custom_formula)) : "",
      "",
      t?.detail ?? "",
      t ? formatIDR(applyDivisor(n(t.biaya), t.divisor, pax, malam, tl, hari, kurs, t.use_kurs ?? true, t.custom_formula)) : "",
    ]);
  }

  rows.push(["Beban TL", formatIDR(comp.beban_tl)]);
  rows.push(["Jumlah", formatIDR(comp.total_peserta), formatIDR(comp.total_landtour)]);
  rows.push([
    "Harga Jual",
    formatIDR(rab.harga_jual),
    formatIDR(rab.harga_jual_landtour),
    "Jumlah beban TL",
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

  if (rab.notes?.trim()) {
    rows.push([]);
    rows.push(["Catatan"]);
    rows.push([rab.notes]);
  }

  const csv = rows.map(csvRow).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `${(h.nama || "rab_master").replace(/\s+/g, "_")}_latest.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

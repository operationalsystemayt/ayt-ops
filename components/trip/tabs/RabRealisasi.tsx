"use client";
import { useState, useEffect, useRef } from "react";
import { keberangkatanApi, hotelApi, transportasiApi, optionalTourApi, rabRealisasiApi } from "@/lib/trip/api";
import { rabStorage } from "@/lib/rab/storage";
import { computeRAB, n } from "@/lib/rab/calculations";
import type {
  ManifestKeberangkatan, ManifestHotel,
  ManifestTransportasi, ManifestOptionalTour,
} from "@/types/trip";
import type { RabMaster } from "@/types/rab";
import { clsx } from "clsx";

// ── Helpers ───────────────────────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2, 10); }

function fmtIDR(val: number): string {
  if (val === 0) return "—";
  return new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", maximumFractionDigits: 0,
  }).format(val);
}

function selisihColor(val: number) {
  if (val > 0) return "text-red-400";
  if (val < 0) return "text-green-400";
  return "text-neutral-500";
}

function pctStr(num: number, denom: number): string {
  if (!denom) return "—";
  const p = (num / denom) * 100;
  return `${p >= 0 ? "+" : ""}${p.toFixed(1)}%`;
}

const inp = "rounded bg-neutral-800 border border-neutral-700 px-2 py-1 text-xs text-neutral-100 focus:outline-none focus:border-teal-500 transition-colors w-full";
const sec = "text-[10px] font-semibold uppercase tracking-widest text-neutral-500";
const tdBase = "px-3 py-2 text-xs";

// ── Types ─────────────────────────────────────────────────────────────────────

interface EditableItem {
  id: string;
  label: string;
  refValue: number;              // from RAB master — reference only
  value: string;                 // per-pax amount (if multiplier=pax) or fixed total (if custom)
  isCustom?: boolean;            // manually added — can be deleted
  section?: "tl";                // TL burden items rendered separately
  multiplier?: "pax" | "custom"; // custom items only — default "pax"
}

interface RingkasanRow {
  id: string;
  label: string;
  rab: string;         // editable total RAB Working
  real: string;        // editable total Realisasi (auto-computed from price × pengali when pengali is set)
  price?: string;      // base price — combined with `pengali` to derive `real`
  pengali?: string;    // formula applied to price, e.g. "*100", "/5", "+50", "-20"
  isFixed: boolean;    // false = can be deleted (custom rows)
}

// Parses a "pengali" formula like "*100" / "/5" / "+50" / "-20" and applies it to `price`.
// Returns null when the formula is empty or not a recognized operator+number pattern.
function applyPengali(price: number, formula: string): number | null {
  const m = formula.trim().match(/^([*/+\-xX])\s*(-?\d+(?:[.,]\d+)?)$/);
  if (!m) return null;
  const op = m[1] === "x" || m[1] === "X" ? "*" : m[1];
  const operand = parseFloat(m[2].replace(",", "."));
  if (isNaN(operand)) return null;
  switch (op) {
    case "*": return price * operand;
    case "/": return operand !== 0 ? price / operand : null;
    case "+": return price + operand;
    case "-": return price - operand;
    default:  return null;
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props { tripId: string; tripName: string; totalPax: number; rabMasterId?: string }

export function RabRealisasi({ tripId, tripName, totalPax, rabMasterId }: Props) {
  const [loading, setLoading]             = useState(true);
  const [rab, setRab]                     = useState<RabMaster | null>(null);
  const [keberangkatan, setKeberangkatan] = useState<ManifestKeberangkatan[]>([]);
  const [hotels, setHotels]               = useState<ManifestHotel[]>([]);
  const [transport, setTransport]         = useState<ManifestTransportasi[]>([]);
  const [optional, setOptional]           = useState<ManifestOptionalTour[]>([]);

  // ── Editable RAB Plan state ──────────────────────────────────────────────────
  const [editPax,     setEditPax]     = useState<string>(String(totalPax));
  const [editHjual,   setEditHjual]   = useState<string>("");
  const [editTipping, setEditTipping] = useState<string>("");
  const [editItems,   setEditItems]   = useState<EditableItem[]>([]);
  const [rabInitDone, setRabInitDone] = useState(false);

  // ── Ringkasan editable state ─────────────────────────────────────────────────
  const [ringkasan,      setRingkasan]      = useState<RingkasanRow[]>([]);
  const [ringkasanReady, setRingkasanReady] = useState(false);

  // ── Save / load state ────────────────────────────────────────────────────────
  const [showMultiplierSelector, setShowMultiplierSelector] = useState(false);

  const [saving,     setSaving]     = useState(false);
  const [saveMsg,    setSaveMsg]    = useState<{ ok: boolean; text: string } | null>(null);
  const [dbStateLoaded, setDbStateLoaded] = useState(false);

  // ── Fetch all data ───────────────────────────────────────────────────────────
  useEffect(() => {
    const all: Promise<unknown>[] = [
      keberangkatanApi.list(tripId).then(setKeberangkatan),
      hotelApi.list(tripId).then(setHotels),
      transportasiApi.list(tripId).then(setTransport),
      optionalTourApi.list(tripId).then(setOptional),
      // Load saved state — if null, falls back to RAB master defaults
      rabRealisasiApi.getState(tripId).then(saved => {
        if (saved && typeof saved === "object") {
          const s = saved as any;
          if (s.editPax)     setEditPax(s.editPax);
          if (s.editHjual)   setEditHjual(s.editHjual);
          if (s.editTipping) setEditTipping(s.editTipping);
          if (Array.isArray(s.editItems))  { setEditItems(s.editItems);  setRabInitDone(true); }
          if (Array.isArray(s.ringkasan))  { setRingkasan(s.ringkasan);  setRingkasanReady(true); }
        }
        setDbStateLoaded(true);
      }).catch(() => setDbStateLoaded(true)),
    ];
    if (rabMasterId) {
      all.push(rabStorage.get(rabMasterId).then(r => { if (r) setRab(r); }));
    }
    Promise.all(all).finally(() => setLoading(false));
  }, [tripId, rabMasterId]);

  // ── Init RAB editable items once ────────────────────────────────────────────
  useEffect(() => {
    if (!rab || rabInitDone) return;
    const rc = computeRAB(rab);
    const items: EditableItem[] = [];

    if (n(rab.header.tiket_pesawat) > 0) {
      const ref = n(rab.header.tiket_pesawat);
      items.push({ id: "__tiket__", label: "Tiket Pesawat", refValue: ref, value: String(ref) });
    }
    if (n(rab.header.hotel_peserta) > 0) {
      const ref = rc.hotel_peserta_final;
      items.push({ id: "__hotel__", label: `Hotel (${n(rab.header.jumlah_malam)} malam)`, refValue: ref, value: String(Math.round(ref)) });
    }
    rab.peserta_rows.forEach((row, i) => {
      if (!row.detail) return;
      const ref = rc.peserta_dynamic[i] ?? 0;
      items.push({ id: row.id, label: row.detail, refValue: ref, value: String(Math.round(ref)) });
    });

    // TL items — expressed as per-pax burden
    const rabPax = Math.max(n(rab.header.jumlah_pax), 1);
    if (rc.tiket_tl_final > 0) {
      const ref = rc.tiket_tl_final / rabPax;
      items.push({ id: "__tiket_tl__", label: "Tiket Tour Leader", refValue: ref, value: String(Math.round(ref)), section: "tl" });
    }
    if (rc.hotel_tl_final > 0) {
      const ref = rc.hotel_tl_final / rabPax;
      items.push({ id: "__hotel_tl__", label: "Hotel Tour Leader", refValue: ref, value: String(Math.round(ref)), section: "tl" });
    }
    rab.tl_rows.forEach((row, i) => {
      if (!row.detail) return;
      const ref = (rc.tl_dynamic[i] ?? 0) / rabPax;
      items.push({ id: `tl_${row.id}`, label: row.detail, refValue: ref, value: String(Math.round(ref)), section: "tl" });
    });

    setEditItems(items);
    setEditHjual(String(n(rab.harga_jual)));
    setEditTipping(String(n(rab.tipping)));
    setRabInitDone(true);
  }, [rab, rabInitDone]);

  // ── Init Ringkasan once (after API + RAB both ready) ────────────────────────
  useEffect(() => {
    if (loading) return;
    if (rabMasterId && !rabInitDone) return;
    if (ringkasanReady) return;

    const pax = parseInt(editPax) || totalPax;

    // tiket_beli and hotel_beli computed inline since state may not be available
    const tiketBeli     = keberangkatan.reduce((s, k) => s + (k.harga_tiket ?? 0) / Math.max(k.unit ?? 1, 1), 0);
    const hotelBeli     = hotels.reduce((s, h) => s + (h.total_idr ?? 0), 0);
    const transportBeli = transport.reduce((s, t) => s + (t.total_idr ?? 0), 0);
    const optBeli       = optional.reduce((s, o) => s + (o.harga_beli_idr ?? 0) * (o.peserta_ids?.length ?? 0), 0);

    const tiketItem = editItems.find(i => i.id === "__tiket__");
    const hotelItem = editItems.find(i => i.id === "__hotel__");

    setRingkasan([
      {
        id: "r_tiket",
        label: "Tiket Pesawat",
        rab:  tiketItem ? String(Math.round((parseFloat(tiketItem.value) || 0) * pax)) : "0",
        real: String(Math.round(tiketBeli)),
        isFixed: true,
      },
      {
        id: "r_hotel",
        label: "Hotel",
        rab:  hotelItem ? String(Math.round((parseFloat(hotelItem.value) || 0) * pax)) : "0",
        real: String(Math.round(hotelBeli)),
        isFixed: true,
      },
      {
        id: "r_transport",
        label: "Transportasi",
        rab: "0",
        real: String(Math.round(transportBeli)),
        isFixed: true,
      },
      {
        id: "r_optional",
        label: "Optional Tour (Beli)",
        rab: "0",
        real: String(Math.round(optBeli)),
        isFixed: true,
      },
    ]);
    setRingkasanReady(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, rabInitDone, ringkasanReady]);

  // ── RAB Plan computed values ─────────────────────────────────────────────────
  const workPax       = Math.max(parseInt(editPax) || 1, 1);
  const workHjual     = parseFloat(editHjual)   || 0;
  const workTipping   = parseFloat(editTipping) || 0;
  // Per-pax equivalent for each item (custom items store a fixed total, so divide by pax)
  const itemPerPax = (it: EditableItem) => {
    const v = parseFloat(it.value) || 0;
    return it.multiplier === "custom" ? (workPax > 0 ? v / workPax : 0) : v;
  };
  const itemTotal = (it: EditableItem) => {
    const v = parseFloat(it.value) || 0;
    return it.multiplier === "custom" ? v : v * workPax;
  };
  const workItemSum   = editItems.reduce((s, it) => s + itemPerPax(it), 0);
  const workTotal     = workItemSum * workPax;
  const tlItems       = editItems.filter(it => it.section === "tl");
  const workTlTotal   = tlItems.reduce((s, it) => s + itemTotal(it), 0);
  const workLabaPax   = workHjual - workItemSum;
  const workLabaTotal = workLabaPax * workPax;
  const workLabaTippingPax   = workLabaPax + workTipping;
  const workLabaTipping      = workLabaTippingPax * workPax;

  // ── Ringkasan computed totals ────────────────────────────────────────────────
  const ringRabTotal  = ringkasan.reduce((s, r) => s + (parseFloat(r.rab)  || 0), 0);
  const ringRealTotal = ringkasan.reduce((s, r) => s + (parseFloat(r.real) || 0), 0);
  const ringSelisih   = ringRealTotal - ringRabTotal;

  // ── Pemasukan & Laba (Ringkasan-based) ──────────────────────────────────────
  const opt_jual        = optional.reduce((s, o) => s + (o.harga_jual_idr ?? 0) * (o.peserta_ids?.length ?? 0), 0);
  const total_pemasukan = workHjual > 0 ? workHjual * workPax : ringRealTotal + opt_jual;
  const laba_aktual     = total_pemasukan - ringRealTotal;
  const laba_per_pax    = workPax > 0 ? laba_aktual / workPax : 0;
  const selisih_laba    = laba_aktual - workLabaTotal;

  // ── Pengeluaran detail (for Realisasi breakdown panel) ──────────────────────
  const tiket_beli     = keberangkatan.reduce((s, k) => s + (k.harga_tiket ?? 0) / Math.max(k.unit ?? 1, 1), 0);
  const hotel_beli     = hotels.reduce((s, h) => s + (h.harga_idr ?? 0), 0);
  const transport_beli = transport.reduce((s, t) => s + (t.total_idr ?? 0), 0);
  const opt_beli       = optional.reduce((s, o) => s + (o.harga_beli_idr ?? 0) * (o.peserta_ids?.length ?? 0), 0);

  const shinList  = transport.filter(t => t.jenis === "SHINKANSEN");
  const lokalList = transport.filter(t => t.jenis === "LOKAL");

  const bookingGroups = (() => {
    const map = new Map<string, { label: string; total: number; pax: number }>();
    for (const k of keberangkatan) {
      const key    = k.kode_booking ?? k.id;
      const cur    = map.get(key);
      const contrib = (k.harga_tiket ?? 0) / Math.max(k.unit ?? 1, 1);
      map.set(key, {
        label: [k.maskapai, k.kode_booking].filter(Boolean).join(" · ") || "Tiket",
        total: (cur?.total ?? 0) + contrib,
        pax:   (cur?.pax   ?? 0) + 1,
      });
    }
    return [...map.values()];
  })();

  // ── Ringkasan helpers ────────────────────────────────────────────────────────
  const setRingRow = (id: string, patch: Partial<RingkasanRow>) =>
    setRingkasan(rows => rows.map(r => r.id === id ? { ...r, ...patch } : r));

  // Updates price/pengali and re-derives `real` automatically when the formula is valid
  const setRingPricePengali = (id: string, patch: Partial<Pick<RingkasanRow, "price" | "pengali">>) =>
    setRingkasan(rows => rows.map(r => {
      if (r.id !== id) return r;
      const next     = { ...r, ...patch };
      const computed = applyPengali(parseFloat(next.price ?? "") || 0, next.pengali ?? "");
      return computed !== null ? { ...next, real: String(Math.round(computed)) } : next;
    }));

  const removeRingRow = (id: string) =>
    setRingkasan(rows => rows.filter(r => r.id !== id));

  const addRingkasanRow = () =>
    setRingkasan(rows => [...rows, {
      id: `ring_${uid()}`, label: "Item baru",
      rab: "0", real: "0", price: "", pengali: "",
      isFixed: false,
    }]);

  // ── Add custom RAB item ──────────────────────────────────────────────────────
  const addCustomItem = (section?: "tl") => {
    const id = `custom_${uid()}`;
    setEditItems(items => [...items, {
      id, label: "Item baru", refValue: 0, value: "0",
      isCustom: true, multiplier: "pax",
      ...(section ? { section } : {}),
    }]);
    setRingkasan(rows => [...rows, { id, label: "Item baru", rab: "0", real: "0", isFixed: false }]);
  };

  const updateMultiplier = (id: string, multiplier: "pax" | "custom") =>
    setEditItems(its => its.map(it => it.id === id ? { ...it, multiplier } : it));

  // ── Remove custom RAB item ───────────────────────────────────────────────────
  const removeCustomItem = (id: string) => {
    setEditItems(items => items.filter(it => it.id !== id));
    removeRingRow(id);
  };

  // ── Update custom item label (syncs to ringkasan) ────────────────────────────
  const updateCustomLabel = (id: string, label: string) => {
    setEditItems(items => items.map(it => it.id === id ? { ...it, label } : it));
    setRingkasan(rows => rows.map(r => r.id === id ? { ...r, label } : r));
  };

  // ── CSV export ───────────────────────────────────────────────────────────────
  const [csvUploading, setCsvUploading] = useState(false);
  const [csvMsg, setCsvMsg]             = useState<{ ok: boolean; text: string } | null>(null);

  const buildCsvContent = (): string => {
    const rpFmt = (v: number) => v ? `Rp ${Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}` : "";

    // Build parallel columns: [rab items], [realisasi items], [summary]
    const rabRows: string[][] = [
      ...editItems.map(it => [it.label, rpFmt(parseFloat(it.value) || 0)]),
      ["", ""],
      ["jmlh rab", rpFmt(workItemSum)],
      ["harga jual", rpFmt(workHjual)],
      ["tipping", rpFmt(workTipping)],
      ["laba", rpFmt(workLabaPax)],
      ["laba+tipping", String(Math.round(workLabaTipping))],
      ["laba+tipping total", String(Math.round(workLabaTipping))],
    ];

    const realRows: string[][] = [
      ...bookingGroups.map(bg => [bg.label, "", String(bg.pax), rpFmt(bg.total)]),
      ...hotels.map(h => [
        [h.nama_hotel, h.rute].filter(Boolean).join(" - ") || "Hotel",
        rpFmt(h.harga_idr ?? 0),
        [h.jumlah_room ? `${h.jumlah_room} room` : "", h.jumlah_malam ? `${h.jumlah_malam} malam` : ""].filter(Boolean).join(", "),
        rpFmt(h.total_idr ?? 0),
      ]),
      ...shinList.map(t => [`Shinkansen ${t.kategori_usia ?? ""}`.trim(), rpFmt(t.harga_idr ?? 0), String(t.qty ?? ""), rpFmt(t.total_idr ?? 0)]),
      ...lokalList.map(t => [[t.vendor, t.tipe_kendaraan, t.keterangan_rute].filter(Boolean).join(" - ") || "Lokal", rpFmt(t.harga_idr ?? 0), "", rpFmt(t.total_idr ?? 0)]),
      ...optional.map(o => {
        const pax = o.peserta_ids?.length ?? 0;
        return [o.nama_tour, rpFmt(o.harga_beli_idr ?? 0), String(pax), rpFmt((o.harga_beli_idr ?? 0) * pax)];
      }),
      ["", "", "", ""],
      ["Pengeluaran", "", "", String(Math.round(ringRealTotal))],
    ];

    const ringRows: string[][] = ringkasan.map(r => [r.label, r.rab, r.real]);

    const sumRows: string[][] = [
      ["TOTAL KESELURUHAN PEMASUKAN", String(Math.round(total_pemasukan))],
      ["TOTAL PENGELUARAN", String(Math.round(ringRealTotal))],
      [`TOTAL LABA ${workPax}PAX`, String(Math.round(laba_aktual))],
      ["LABA PERPAX", laba_per_pax.toFixed(2)],
      ["", ""],
      ["Selisih kenaikan realisasi dari RAB", ringRabTotal > 0 ? pctStr(ringSelisih, ringRabTotal) : "—"],
    ];

    const maxR = Math.max(rabRows.length, realRows.length, ringRows.length, sumRows.length);

    const cell = (s: string) => s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"` : s;

    const toRow = (cells: string[]) => cells.map(cell).join(",");

    const lines: string[] = [
      toRow(["", "pax", String(workPax)]),
      toRow([]),
      toRow(["", "RAB PLAN TRIP", "", "", "", "", "", "PENGELUARAN REALISASI", "", "", "", "", "RINGKASAN RAB VS REALISASI", "", "", "DATA PEMASUKAN", ""]),
      toRow(["", "RAB TRIP", "", "", "", "", "", "Item", "Harga Satuan", "Qty/Pax", "Total", "", "Kategori", "RAB Working", "Realisasi", "", ""]),
    ];

    for (let i = 0; i < maxR; i++) {
      const rab  = rabRows[i]  ?? ["", ""];
      const real = realRows[i] ?? ["", "", "", ""];
      const ring = ringRows[i] ?? ["", "", ""];
      const sum  = sumRows[i]  ?? ["", ""];
      lines.push(toRow([
        "",
        rab[0],  rab[1],                              // col 1-2: RAB
        "", "", "", "",                               // col 3-6: empty
        real[0], real[1], real[2], real[3],           // col 7-10: realisasi
        "",                                           // col 11: separator
        ring[0], ring[1], ring[2],                   // col 12-14: ringkasan
        sum[0],  sum[1],                             // col 15-16: summary
      ]));
    }

    return lines.join("\n");
  };

  const handleDownloadCsv = () => {
    const csv  = buildCsvContent();
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `rab_vs_realisasi_${tripName.replace(/\s+/g, "_")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleUploadToDrive = async () => {
    setCsvUploading(true);
    setCsvMsg(null);
    try {
      const result = await rabRealisasiApi.uploadCsvToDrive(tripId, buildCsvContent());
      setCsvMsg({ ok: true, text: `CSV terupload ke Drive: ${result.file_name}` });
    } catch (e: any) {
      setCsvMsg({ ok: false, text: e.message ?? "Upload gagal" });
    } finally {
      setCsvUploading(false);
    }
  };

  // ── Save state to DB ────────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      await rabRealisasiApi.saveState(tripId, { editPax, editHjual, editTipping, editItems, ringkasan });
      setSaveMsg({ ok: true, text: "Tersimpan" });
      setTimeout(() => setSaveMsg(null), 3000);
    } catch (e: any) {
      setSaveMsg({ ok: false, text: e.message ?? "Gagal menyimpan" });
    } finally {
      setSaving(false);
    }
  };

  // ── Reset to RAB master ──────────────────────────────────────────────────────
  const resetToRab = () => {
    if (!rab) return;
    setEditPax(String(totalPax));
    setEditHjual(String(n(rab.harga_jual)));
    setEditTipping(String(n(rab.tipping)));
    // Remove custom items, reset values of master items
    setEditItems(items => items
      .filter(it => !it.isCustom)
      .map(it => ({ ...it, value: String(Math.round(it.refValue)) }))
    );
    // Reset ringkasan to re-initialize from scratch
    setRingkasanReady(false);
  };

  if (loading) return <div className="p-6 text-sm text-neutral-600">Memuat...</div>;

  return (
    <div className="p-4 space-y-6">

      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-xs text-neutral-500">{tripName}</span>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-teal-700/80 hover:bg-teal-700 text-white text-xs py-1.5 px-4 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap font-medium"
          >
            {saving ? "Menyimpan…" : "Simpan"}
          </button>
          {saveMsg && (
            <span className={clsx("text-[11px]", saveMsg.ok ? "text-teal-400" : "text-red-400")}>
              {saveMsg.ok ? "✓" : "⚠"} {saveMsg.text}
            </span>
          )}
          <button
            onClick={handleDownloadCsv}
            className="rounded-lg border border-neutral-700 hover:border-teal-500 hover:text-teal-400 text-neutral-400 text-xs py-1.5 px-3 transition-colors cursor-pointer whitespace-nowrap"
          >
            ↓ Download CSV
          </button>
          <button
            onClick={handleUploadToDrive}
            disabled={csvUploading}
            className="rounded-lg border border-neutral-700 hover:border-teal-500 hover:text-teal-400 text-neutral-400 text-xs py-1.5 px-3 transition-colors cursor-pointer disabled:opacity-40 whitespace-nowrap"
          >
            {csvUploading ? "Uploading…" : "↑ Upload CSV ke Drive"}
          </button>
          {csvMsg && (
            <span className={clsx("text-[11px]", csvMsg.ok ? "text-teal-400" : "text-red-400")}>
              {csvMsg.ok ? "✓" : "⚠"} {csvMsg.text}
            </span>
          )}
        </div>
      </div>

      {/* ── Summary cards ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <StatCard label="Total Pemasukan" value={fmtIDR(total_pemasukan)} color="text-teal-400" />
        <StatCard label="Total Pengeluaran" value={fmtIDR(ringRealTotal)} />
        <StatCard
          label="Laba Aktual"
          value={fmtIDR(Math.abs(laba_aktual))}
          color={laba_aktual >= 0 ? "text-green-400" : "text-red-400"}
          sub={workPax > 0 ? `${fmtIDR(Math.abs(laba_per_pax))}/pax` : undefined}
        />
        <StatCard
          label="RAB Laba/Pax"
          value={fmtIDR(workLabaPax)}
          color={workLabaPax >= 0 ? "text-neutral-300" : "text-red-400"}
          sub={rab ? "dari working RAB" : "—"}
        />
        <StatCard label="RAB Laba+Tipping" value={fmtIDR(workLabaTipping)} color="text-neutral-300" sub={`${workPax} pax`} />
        <StatCard
          label="Selisih Pengeluaran"
          value={ringSelisih !== 0 ? fmtIDR(Math.abs(ringSelisih)) : "—"}
          color={selisihColor(ringSelisih)}
          sub={ringRabTotal > 0 ? pctStr(ringSelisih, ringRabTotal) : undefined}
        />
      </div>

      {/* ── Main two-column layout ───────────────────────────────────────────── */}
      <div className={clsx("grid gap-4", rab ? "lg:grid-cols-2" : "grid-cols-1")}>

        {/* LEFT — Editable RAB Plan */}
        {rab && (
          <section>
            <div className="flex items-center justify-between mb-2">
              <p className={sec}>RAB Plan Trip — {rab.header.nama}</p>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowMultiplierSelector(v => !v)}
                  className="text-[10px] text-neutral-500 hover:text-teal-400 transition-colors cursor-pointer"
                >
                  {showMultiplierSelector ? "Sembunyikan" : "Tampilkan"} pilihan Pax/Total
                </button>
                <button
                  onClick={resetToRab}
                  className="text-[10px] text-neutral-500 hover:text-teal-400 transition-colors cursor-pointer"
                >
                  ↺ Reset ke RAB Master
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-neutral-700 overflow-hidden">
              {/* Shared header inputs */}
              <div className="px-3 py-2 bg-neutral-800/40 flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <label className="text-[10px] text-neutral-500 whitespace-nowrap">Total Pax</label>
                  <input type="number" value={editPax} onChange={e => setEditPax(e.target.value)}
                    className={clsx(inp, "w-16 text-center")} />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-[10px] text-neutral-500 whitespace-nowrap">Harga Jual/Pax</label>
                  <FormattedNumberInput value={editHjual} onChange={setEditHjual}
                    className={clsx(inp, "w-32")} placeholder="0" />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-[10px] text-neutral-500 whitespace-nowrap">Tipping/Pax</label>
                  <FormattedNumberInput value={editTipping} onChange={setEditTipping}
                    className={clsx(inp, "w-28")} placeholder="0" />
                </div>
              </div>

              {/* Items table */}
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-neutral-800/30">
                    <th className="px-3 py-1.5 text-left text-[9px] uppercase tracking-wide text-neutral-600">Item</th>
                    <th className="px-3 py-1.5 text-right text-[9px] uppercase tracking-wide text-neutral-600 whitespace-nowrap">Ref/Pax</th>
                    <th className="px-3 py-1.5 text-right text-[9px] uppercase tracking-wide text-neutral-600 whitespace-nowrap">Working/Pax</th>
                    <th className="px-3 py-1.5 text-right text-[9px] uppercase tracking-wide text-neutral-600 whitespace-nowrap">Total ({workPax}p)</th>
                    <th className="w-6" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/50">
                  {/* ── Peserta items ── */}
                  {editItems.filter(it => !it.section).map((item) => (
                    <EditableRow key={item.id} item={item} inp={inp}
                      total={itemTotal(item)}
                      onChange={v => setEditItems(its => its.map(it => it.id === item.id ? { ...it, value: v } : it))}
                      onLabelChange={item.isCustom ? (l => updateCustomLabel(item.id, l)) : undefined}
                      onRemove={item.isCustom ? (() => removeCustomItem(item.id)) : undefined}
                      onMultiplierChange={showMultiplierSelector ? (m => updateMultiplier(item.id, m)) : undefined}
                    />
                  ))}
                  {editItems.filter(it => !it.section).length === 0 && (
                    <tr><td colSpan={5} className="px-3 py-3 text-center text-neutral-700">Tidak ada item RAB</td></tr>
                  )}

                  {/* ── TL section header ── */}
                  {tlItems.length > 0 && (
                    <tr className="bg-neutral-800/50">
                      <td colSpan={5} className="px-3 py-1.5 text-[9px] font-semibold uppercase tracking-widest text-neutral-500">
                        Beban Tour Leader
                      </td>
                    </tr>
                  )}

                  {/* ── TL items ── */}
                  {tlItems.map(item => (
                    <EditableRow key={item.id} item={item} inp={inp}
                      total={itemTotal(item)}
                      onChange={v => setEditItems(its => its.map(it => it.id === item.id ? { ...it, value: v } : it))}
                      onLabelChange={item.isCustom ? (l => updateCustomLabel(item.id, l)) : undefined}
                      onRemove={item.isCustom ? (() => removeCustomItem(item.id)) : undefined}
                      onMultiplierChange={showMultiplierSelector ? (m => updateMultiplier(item.id, m)) : undefined}
                    />
                  ))}

                  {/* ── Total Beban TL ── */}
                  {tlItems.length > 0 && (
                    <tr className="bg-neutral-800/20 font-semibold">
                      <td className="px-3 py-1.5 text-neutral-400" colSpan={2}>Total Beban Tour Leader</td>
                      <td className="px-3 py-1.5 text-right text-neutral-400">
                        {fmtIDR(workPax > 0 ? workTlTotal / workPax : 0)}
                      </td>
                      <td className="px-3 py-1.5 text-right text-neutral-400">{fmtIDR(workTlTotal)}</td>
                      <td />
                    </tr>
                  )}
                </tbody>
                <tfoot className="border-t border-neutral-700">
                  <tr>
                    <td colSpan={5} className="px-3 py-1.5">
                      <div className="flex items-center gap-3">
                        <button onClick={() => addCustomItem()}
                          className="text-[11px] text-green-500 hover:text-green-300 transition-colors cursor-pointer">
                          + Tambah ke RAB
                        </button>
                        <button onClick={() => addCustomItem("tl")}
                          className="text-[11px] text-amber-500 hover:text-amber-300 transition-colors cursor-pointer">
                          + Tambah ke Tour Leader
                        </button>
                      </div>
                    </td>
                  </tr>
                  <tr className="bg-neutral-800/30 font-semibold">
                    <td className="px-3 py-2 text-neutral-300" colSpan={2}>Total Biaya</td>
                    <td className="px-3 py-2 text-right text-neutral-300">{fmtIDR(workItemSum)}</td>
                    <td className="px-3 py-2 text-right text-neutral-300">{fmtIDR(workTotal)}</td>
                    <td />
                  </tr>
                  <tr className="bg-neutral-900/50">
                    <td className="px-3 py-1.5 text-neutral-500" colSpan={2}>Harga Jual</td>
                    <td className="px-3 py-1.5 text-right text-teal-400">{fmtIDR(workHjual)}</td>
                    <td className="px-3 py-1.5 text-right text-teal-400">{fmtIDR(workHjual * workPax)}</td>
                    <td />
                  </tr>
                  <tr className="bg-neutral-900/50">
                    <td className="px-3 py-1.5 text-neutral-500" colSpan={2}>Laba/Pax</td>
                    <td className={clsx("px-3 py-1.5 text-right font-semibold", workLabaPax >= 0 ? "text-green-400" : "text-red-400")}>
                      {fmtIDR(workLabaPax)}
                    </td>
                    <td className="px-3 py-1.5 text-right text-neutral-300">{fmtIDR(workLabaTotal)}</td>
                    <td />
                  </tr>
                  <tr className="bg-neutral-900/50">
                    <td className="px-3 py-1.5 text-neutral-500" colSpan={2}>Laba+Tipping/Pax</td>
                    <td className={clsx("px-3 py-1.5 text-right font-semibold", workLabaTippingPax >= 0 ? "text-green-400" : "text-red-400")}>
                      {fmtIDR(workLabaTippingPax)}
                    </td>
                    <td className="px-3 py-1.5 text-right text-neutral-300">{fmtIDR(workLabaTipping)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        )}

        {/* RIGHT — Pengeluaran Realisasi breakdown */}
        <section className="space-y-3">
          <p className={sec + " mb-2"}>Pengeluaran Realisasi</p>

          <RealisasiSection title="Tiket Pesawat" total={tiket_beli}>
            {bookingGroups.map((bg, i) => (
              <RealisasiRow key={i} label={bg.label} sub={`${bg.pax} pax`} total={bg.total} />
            ))}
            {keberangkatan.length === 0 && <EmptyRow />}
          </RealisasiSection>

          <RealisasiSection title="Hotel" total={hotel_beli}>
            {hotels.map((h, i) => (
              <tr key={i} className="hover:bg-white/[0.02]">
                <td className="px-3 py-1.5">
                  <span className="text-neutral-300">
                    {[h.nama_hotel, h.rute].filter(Boolean).join(" — ") || "Hotel"}
                  </span>
                  <span className="ml-2 text-neutral-600">
                    {[
                      h.jumlah_room ? `${h.jumlah_room} room` : null,
                      h.jumlah_malam ? `${h.jumlah_malam} malam` : null,
                    ].filter(Boolean).join(" · ")}
                  </span>
                  {/* {h.harga_idr != null && (
                    <span className="ml-2 text-[10px] text-neutral-600">
                      @{fmtIDR(h.harga_idr)}/room
                    </span>
                  )} */}
                </td>
                <td className="px-3 py-1.5 text-right text-neutral-400 whitespace-nowrap">
                  {fmtIDR(h.harga_idr ?? 0)}
                </td>
              </tr>
            ))}
            {hotels.length === 0 && <EmptyRow />}
          </RealisasiSection>

          <RealisasiSection title="Transportasi" total={transport_beli}>
            {shinList.length > 0 && (
              <tr><td colSpan={2} className="px-3 pt-2 pb-0.5 text-[9px] uppercase tracking-wide text-neutral-600">Shinkansen</td></tr>
            )}
            {shinList.map((t, i) => (
              <RealisasiRow key={i} label={t.kategori_usia ?? "Shinkansen"} sub={t.qty ? `×${t.qty}` : undefined} total={t.total_idr ?? 0} />
            ))}
            {lokalList.length > 0 && (
              <tr><td colSpan={2} className="px-3 pt-2 pb-0.5 text-[9px] uppercase tracking-wide text-neutral-600">Lokal</td></tr>
            )}
            {lokalList.map((t, i) => (
              <RealisasiRow key={i}
                label={[t.vendor, t.tipe_kendaraan, t.keterangan_rute].filter(Boolean).join(" · ") || "Lokal"}
                total={t.total_idr ?? 0}
              />
            ))}
            {transport.length === 0 && <EmptyRow />}
          </RealisasiSection>

          <RealisasiSection title="Optional Tour" total={opt_beli}>
            {optional.map((o, i) => {
              const pax  = o.peserta_ids?.length ?? 0;
              const beli = (o.harga_beli_idr ?? 0) * pax;
              const jual = (o.harga_jual_idr  ?? 0) * pax;
              return (
                <tr key={i} className="hover:bg-white/[0.02]">
                  <td className="px-3 py-1.5">
                    <span className="text-xs text-neutral-200">{o.nama_tour}</span>
                    <span className="ml-2 text-[10px] text-neutral-600">{pax} pax</span>
                  </td>
                  <td className="px-3 py-1.5 text-right text-xs">
                    <span className="text-neutral-400">{fmtIDR(beli)}</span>
                    {jual > 0 && <span className="ml-2 text-[10px] text-teal-500">↑{fmtIDR(jual)}</span>}
                  </td>
                </tr>
              );
            })}
            {optional.length === 0 && <EmptyRow />}
          </RealisasiSection>
        </section>
      </div>

      {/* ── Ringkasan RAB vs Realisasi (editable) ───────────────────────────── */}
      <section>
        <p className={sec + " mb-2"}>Ringkasan RAB vs Realisasi</p>
        <div className="rounded-xl border border-neutral-700 overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-neutral-800/50">
                <th className="px-3 py-2 text-left text-[9px] uppercase tracking-wide text-neutral-500">Kategori</th>
                <th className="px-3 py-2 text-left text-[9px] uppercase tracking-wide text-neutral-500">RAB Working</th>
                <th className="px-3 py-2 text-left text-[9px] uppercase tracking-wide text-neutral-500">Price</th>
                <th className="px-3 py-2 text-left text-[9px] uppercase tracking-wide text-neutral-500">Pengali</th>
                <th className="px-3 py-2 text-left text-[9px] uppercase tracking-wide text-neutral-500">Realisasi</th>
                <th className="px-3 py-2 text-left text-[9px] uppercase tracking-wide text-neutral-500">Selisih</th>
                <th className="px-3 py-2 text-left text-[9px] uppercase tracking-wide text-neutral-500">%</th>
                <th className="w-6" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/50">
              {ringkasan.map(row => {
                const rabVal  = parseFloat(row.rab)  || 0;
                const realVal = parseFloat(row.real) || 0;
                const selisih = realVal - rabVal;
                return (
                  <tr key={row.id} className="hover:bg-white/[0.02]">
                    <td className="px-3 py-1.5">
                      {row.isFixed ? (
                        <span className="text-neutral-300">{row.label}</span>
                      ) : (
                        <input
                          value={row.label}
                          onChange={e => setRingRow(row.id, { label: e.target.value })}
                          className={clsx(inp, "w-full")}
                          placeholder="Nama kategori"
                        />
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      <FormattedNumberInput
                        value={row.rab}
                        onChange={v => setRingRow(row.id, { rab: v })}
                        className={clsx(inp, "w-32")}
                        placeholder="0"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <FormattedNumberInput
                        value={row.price ?? ""}
                        onChange={v => setRingPricePengali(row.id, { price: v })}
                        className={clsx(inp, "w-28")}
                        placeholder="0"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        value={row.pengali ?? ""}
                        onChange={e => setRingPricePengali(row.id, { pengali: e.target.value })}
                        className={clsx(inp, "w-20")}
                        placeholder="*100"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <FormattedNumberInput
                        value={row.real}
                        onChange={v => setRingRow(row.id, { real: v })}
                        className={clsx(inp, "w-32")}
                        placeholder="0"
                      />
                    </td>
                    <td className={clsx(tdBase, selisihColor(selisih))}>
                      {rabVal > 0 || realVal > 0
                        ? (selisih >= 0 ? "+" : "") + fmtIDR(Math.abs(selisih))
                        : "—"}
                    </td>
                    <td className={clsx(tdBase, selisihColor(selisih))}>
                      {rabVal > 0 ? pctStr(selisih, rabVal) : "—"}
                    </td>
                    <td className="pr-2 text-center">
                      {!row.isFixed && (
                        <button
                          onClick={() => removeRingRow(row.id)}
                          className="text-neutral-700 hover:text-red-400 transition-colors cursor-pointer text-sm leading-none"
                        >
                          ×
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t border-neutral-700">
              <tr>
                <td colSpan={8} className="px-3 py-1.5">
                  <button onClick={addRingkasanRow}
                    className="text-[11px] text-green-500 hover:text-green-300 transition-colors cursor-pointer">
                    + Tambah Item
                  </button>
                </td>
              </tr>
              <tr className="bg-neutral-800/30 font-semibold">
                <td className={tdBase + " text-neutral-200"}>Total Pengeluaran</td>
                <td className={tdBase + " text-neutral-300"}>{fmtIDR(ringRabTotal)}</td>
                <td colSpan={2} />
                <td className={tdBase + " text-neutral-300"}>{fmtIDR(ringRealTotal)}</td>
                <td className={clsx(tdBase, selisihColor(ringSelisih))}>
                  {ringSelisih !== 0 ? (ringSelisih > 0 ? "+" : "") + fmtIDR(Math.abs(ringSelisih)) : "—"}
                </td>
                <td className={clsx(tdBase, selisihColor(ringSelisih))}>
                  {ringRabTotal > 0 ? pctStr(ringSelisih, ringRabTotal) : "—"}
                </td>
                <td />
              </tr>
              <tr>
                <td className={tdBase + " text-neutral-500"}>Pemasukan (Harga Jual × Pax)</td>
                <td className={tdBase + " text-teal-400"}>{fmtIDR(workHjual * workPax)}</td>
                <td colSpan={2} />
                <td className={tdBase + " text-teal-400"}>{fmtIDR(total_pemasukan)}</td>
                <td colSpan={3} />
              </tr>
              <tr>
                <td className={tdBase + " font-semibold text-neutral-200"}>Laba</td>
                <td className={clsx(tdBase, "font-semibold", workLabaTotal >= 0 ? "text-green-400" : "text-red-400")}>
                  {fmtIDR(workLabaTotal)}
                </td>
                <td colSpan={2} />
                <td className={clsx(tdBase, "font-semibold", laba_aktual >= 0 ? "text-green-400" : "text-red-400")}>
                  {fmtIDR(laba_aktual)}
                </td>
                <td className={clsx(tdBase, selisihColor(selisih_laba))}>
                  {selisih_laba !== 0 ? (selisih_laba > 0 ? "+" : "") + fmtIDR(Math.abs(selisih_laba)) : "—"}
                </td>
                <td className={clsx(tdBase, selisihColor(selisih_laba))}>
                  {workLabaTotal !== 0 ? pctStr(selisih_laba, workLabaTotal) : "—"}
                </td>
                <td />
              </tr>
              <tr>
                <td className={tdBase + " text-neutral-500"}>Laba/Pax</td>
                <td className={tdBase + " text-neutral-400"}>{fmtIDR(workLabaPax)}</td>
                <td colSpan={2} />
                <td className={clsx(tdBase, laba_per_pax >= 0 ? "text-green-400" : "text-red-400")}>
                  {fmtIDR(laba_per_pax)}
                </td>
                <td colSpan={3} />
              </tr>
              <tr>
                <td className={tdBase + " text-neutral-500"}>Selisih kenaikan realisasi dari RAB</td>
                <td colSpan={5} />
                <td className={clsx(tdBase, "font-semibold", selisihColor(ringSelisih))}>
                  {ringRabTotal > 0 ? pctStr(ringSelisih, ringRabTotal) : "—"}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* ── Optional Tour margin detail ──────────────────────────────────────── */}
      {optional.length > 0 && (
        <section>
          <p className={sec + " mb-2"}>Margin Optional Tour</p>
          <div className="rounded-xl border border-neutral-700 overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-neutral-800/50">
                  {["Nama Tour","Pax","Harga Beli/Pax","Harga Jual/Pax","Total Beli","Total Jual","Margin"].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-[9px] uppercase tracking-wide text-neutral-500 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/50">
                {optional.map((o, i) => {
                  const pax    = o.peserta_ids?.length ?? 0;
                  const beli   = o.harga_beli_idr ?? 0;
                  const jual   = o.harga_jual_idr  ?? 0;
                  const margin = (jual - beli) * pax;
                  return (
                    <tr key={i} className="hover:bg-white/[0.02]">
                      <td className="px-3 py-2 font-medium text-neutral-100">{o.nama_tour}</td>
                      <td className="px-3 py-2 text-neutral-400 text-center">{pax}</td>
                      <td className="px-3 py-2 text-neutral-400">{fmtIDR(beli)}</td>
                      <td className="px-3 py-2 text-teal-400">{fmtIDR(jual)}</td>
                      <td className="px-3 py-2 text-neutral-400">{fmtIDR(beli * pax)}</td>
                      <td className="px-3 py-2 text-teal-400">{fmtIDR(jual * pax)}</td>
                      <td className={clsx("px-3 py-2 font-medium", margin >= 0 ? "text-green-400" : "text-red-400")}>
                        {fmtIDR(margin)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t border-neutral-700">
                <tr className="bg-neutral-800/30 font-semibold">
                  <td className="px-3 py-2 text-neutral-300" colSpan={4}>Total</td>
                  <td className="px-3 py-2 text-neutral-300">{fmtIDR(opt_beli)}</td>
                  <td className="px-3 py-2 text-teal-300">{fmtIDR(opt_jual)}</td>
                  <td className={clsx("px-3 py-2", (opt_jual - opt_beli) >= 0 ? "text-green-400" : "text-red-400")}>
                    {fmtIDR(opt_jual - opt_beli)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      )}

      {!rab && (
        <div className="rounded-xl border border-dashed border-neutral-700 p-6 text-center text-xs text-neutral-600">
          RAB belum terhubung ke trip ini.
        </div>
      )}
    </div>
  );
}

// ── Formatted number input ────────────────────────────────────────────────────

function dotFmt(raw: string): string {
  const n = parseInt(raw.replace(/\./g, ""), 10);
  if (isNaN(n) || raw === "") return raw;
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function FormattedNumberInput({
  value, onChange, className, placeholder,
}: {
  value: string;
  onChange: (raw: string) => void;
  className?: string;
  placeholder?: string;
}) {
  const [display, setDisplay] = useState(() => dotFmt(value));
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) setDisplay(dotFmt(value));
  }, [value]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/\./g, "").replace(/[^\d]/g, "");
    setDisplay(raw);
    onChange(raw);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setDisplay(dotFmt(raw)), 600);
  }

  function handleFocus() {
    focusedRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    setDisplay(display.replace(/\./g, ""));
  }

  function handleBlur() {
    focusedRef.current = false;
    if (timerRef.current) clearTimeout(timerRef.current);
    setDisplay(dotFmt(value));
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      value={display}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      className={className}
      placeholder={placeholder}
    />
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function EditableRow({ item, inp, total, onChange, onLabelChange, onRemove, onMultiplierChange }: {
  item: EditableItem;
  inp: string;
  total: number;
  onChange: (v: string) => void;
  onLabelChange?: (l: string) => void;
  onRemove?: () => void;
  onMultiplierChange?: (m: "pax" | "custom") => void;
}) {
  return (
    <tr className="hover:bg-white/[0.02]">
      <td className="px-3 py-1.5">
        {onLabelChange ? (
          <input value={item.label} onChange={e => onLabelChange(e.target.value)}
            className={clsx(inp, "w-full")} placeholder="Nama item" />
        ) : (
          <span className="text-neutral-300">{item.label}</span>
        )}
      </td>
      <td className="px-3 py-1.5 text-right text-neutral-600 whitespace-nowrap">
        {item.refValue > 0 ? fmtIDR(item.refValue) : "—"}
      </td>
      <td className="px-3 py-1.5">
        <div className="flex items-center gap-1 justify-end">
          <FormattedNumberInput value={item.value} onChange={onChange}
            className={clsx(inp, "w-28 text-right")} placeholder="0" />
          {onMultiplierChange && (
            <select
              value={item.multiplier ?? "pax"}
              onChange={e => onMultiplierChange(e.target.value as "pax" | "custom")}
              className="text-[9px] bg-neutral-800 border border-neutral-700 rounded px-1 py-1 text-neutral-400 cursor-pointer focus:outline-none focus:border-teal-500"
            >
              <option value="pax">× pax</option>
              <option value="custom">Total</option>
            </select>
          )}
        </div>
      </td>
      <td className="px-3 py-1.5 text-right text-neutral-400 whitespace-nowrap">
        {fmtIDR(total)}
      </td>
      <td className="pr-2 text-center">
        {onRemove && (
          <button onClick={onRemove}
            className="text-neutral-700 hover:text-red-400 transition-colors cursor-pointer text-sm leading-none">
            ×
          </button>
        )}
      </td>
    </tr>
  );
}

function StatCard({ label, value, color, sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-3">
      <p className="text-[10px] text-neutral-500 uppercase tracking-wide mb-1">{label}</p>
      <p className={clsx("text-sm font-semibold truncate", color ?? "text-neutral-200")}>{value}</p>
      {sub && <p className="text-[10px] text-neutral-600 mt-0.5">{sub}</p>}
    </div>
  );
}

function RealisasiSection({ title, total, children }: { title: string; total: number; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-neutral-700 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-neutral-800/40">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">{title}</span>
        <span className="text-xs font-medium text-teal-400">{fmtIDR(total)}</span>
      </div>
      <table className="w-full text-xs">
        <tbody className="divide-y divide-neutral-800/40">{children}</tbody>
      </table>
    </div>
  );
}

function RealisasiRow({ label, sub, total }: { label: string; sub?: string; total: number }) {
  return (
    <tr className="hover:bg-white/[0.02]">
      <td className="px-3 py-1.5">
        <span className="text-neutral-300">{label}</span>
        {sub && <span className="ml-2 text-neutral-600">{sub}</span>}
      </td>
      <td className="px-3 py-1.5 text-right text-neutral-400">{fmtIDR(total)}</td>
    </tr>
  );
}

function EmptyRow() {
  return (
    <tr>
      <td colSpan={2} className="px-3 py-2 text-neutral-700 text-center">Belum ada data</td>
    </tr>
  );
}

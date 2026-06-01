"use client";
import { useState, useEffect, useRef } from "react";
import { optionalTourApi, pesertaApi } from "@/lib/trip/api";
import { Button } from "@/components/ui";
import type { ManifestOptionalTour, ManifestPeserta, OptionalTourOCRResult } from "@/types/trip";
import { clsx } from "clsx";

const inp = "w-full rounded-lg bg-neutral-900 border border-neutral-700 px-2 py-1.5 text-xs text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-teal-500 transition-colors";
const inpRO = "w-full rounded-lg bg-neutral-800/60 border border-neutral-700 px-2 py-1.5 text-xs text-neutral-400 focus:outline-none transition-colors";
const lbl = "block text-[10px] text-neutral-500 uppercase tracking-wide mb-1";
const sel = "w-full rounded-lg bg-neutral-900 border border-neutral-700 px-2 py-1.5 text-xs text-neutral-100 focus:outline-none focus:border-teal-500 transition-colors";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function fmtDate(s?: string | null) {
  if (!s) return "—";
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return s;
  return `${String(d).padStart(2,"0")}-${MONTHS[m-1]}-${y}`;
}

function fmtJpy(n?: number | null) {
  if (n == null || n === 0) return "—";
  return `¥${new Intl.NumberFormat("ja-JP").format(n)}`;
}

function fmtIdr(n?: number | null) {
  if (n == null || n === 0) return "—";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);
}

function uid() { return Math.random().toString(36).slice(2, 10); }

const TOUR_NAMES = ["Tombori", "Shibuya Sky", "USJ", "Disneyland", "Disneysea", "Visa Web", "Visa Waiver", "Asuransi", "Lainnya"];
const TIER_OPTIONS = ["Adult", "Junior", "Child", "Senior", "+65", "-65"];

interface TourFormRow {
  _key: string;
  id?: string;
  nama_tour: string;
  tier: string;
  harga_jual_idr: string;
  harga_beli_jpy: string;
  kurs: string;
  harga_beli_idr: string;
  peserta_ids: string[];
  admission_date: string;
  tiket_drive_file_id?: string;
  // File state per row
  tiketFile?: File | null;
  localPdfUrl?: string | null;
}

function newTourRow(): TourFormRow {
  return {
    _key: uid(),
    nama_tour: "",
    tier: "Adult",
    harga_jual_idr: "",
    harga_beli_jpy: "",
    kurs: "",
    harga_beli_idr: "",
    peserta_ids: [],
    admission_date: "",
    tiketFile: null,
    localPdfUrl: null,
  };
}

interface Props { tripId: string; tripName: string; tglBerangkat: string; tglPulang: string }

export function ManifestOptionalTour({ tripId }: Props) {
  const [list, setList]               = useState<ManifestOptionalTour[]>([]);
  const [pesertaList, setPesertaList] = useState<ManifestPeserta[]>([]);
  const [loading, setLoading]         = useState(true);
  const [showForm, setShowForm]       = useState(false);

  // Form state
  const [tourRows, setTourRows] = useState<TourFormRow[]>([newTourRow()]);

  // Active PDF preview (for the left panel)
  const [activePdfRow, setActivePdfRow] = useState<number>(0);

  // Action state
  const [saving, setSaving]           = useState(false);
  const [uploading, setUploading]     = useState(false);
  const [scanning, setScanning]       = useState(false);
  const [csvUploading, setCsvUploading] = useState(false);
  const [msg, setMsg]                 = useState<{ ok: boolean; text: string } | null>(null);
  const [editId, setEditId]           = useState<string | null>(null);

  const fileRefs = useRef<(HTMLInputElement | null)[]>([]);

  const load = () => {
    Promise.all([
      optionalTourApi.list(tripId),
      pesertaApi.list(tripId),
    ]).then(([tours, peserta]) => {
      setList(tours);
      setPesertaList(peserta);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [tripId]);

  // ── Row helpers ───────────────────────────────────────────────────────────────

  const setRow = (i: number, patch: Partial<TourFormRow>) =>
    setTourRows(rows => rows.map((r, j) => j === i ? { ...r, ...patch } : r));

  const handlePriceChange = (i: number, field: "harga_beli_jpy" | "kurs", val: string) => {
    setTourRows(rows => rows.map((r, j) => {
      if (j !== i) return r;
      const updated = { ...r, [field]: val };
      const jpy = parseFloat(field === "harga_beli_jpy" ? val : r.harga_beli_jpy) || 0;
      const kurs = parseFloat(field === "kurs" ? val : r.kurs) || 0;
      if (jpy > 0 && kurs > 0) {
        updated.harga_beli_idr = String(Math.round(jpy * kurs));
      }
      return updated;
    }));
  };

  const addTourRow = () => {
    setTourRows(rows => [...rows, newTourRow()]);
    setActivePdfRow(tourRows.length);
  };

  const removeTourRow = (i: number) => {
    const row = tourRows[i];
    if (row.localPdfUrl) URL.revokeObjectURL(row.localPdfUrl);
    setTourRows(rows => rows.length > 1 ? rows.filter((_, j) => j !== i) : rows);
    if (activePdfRow >= i && activePdfRow > 0) setActivePdfRow(activePdfRow - 1);
  };

  const togglePeserta = (i: number, pid: string) => {
    setTourRows(rows => rows.map((r, j) => {
      if (j !== i) return r;
      const has = r.peserta_ids.includes(pid);
      return { ...r, peserta_ids: has ? r.peserta_ids.filter(x => x !== pid) : [...r.peserta_ids, pid] };
    }));
  };

  const selectAllPeserta = (i: number) => {
    const allIds = pesertaList.map(p => p.id);
    setTourRows(rows => rows.map((r, j) => j === i ? { ...r, peserta_ids: allIds } : r));
  };

  const clearPeserta = (i: number) => {
    setTourRows(rows => rows.map((r, j) => j === i ? { ...r, peserta_ids: [] } : r));
  };

  // ── File selection ────────────────────────────────────────────────────────────

  const handleSelectFile = (i: number, file: File) => {
    setTourRows(rows => rows.map((r, j) => {
      if (j !== i) return r;
      if (r.localPdfUrl) URL.revokeObjectURL(r.localPdfUrl);
      return { ...r, tiketFile: file, localPdfUrl: URL.createObjectURL(file), tiket_drive_file_id: undefined };
    }));
    setActivePdfRow(i);
    setMsg(null);
  };

  // ── OCR ───────────────────────────────────────────────────────────────────────

  const handleOcr = async (i: number) => {
    const row = tourRows[i];
    if (!row.tiketFile) return;
    setScanning(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", row.tiketFile);
      const result: OptionalTourOCRResult = await optionalTourApi.ocrTiket(tripId, fd);
      setRow(i, {
        nama_tour: result.nama_tour || row.nama_tour,
        tier: result.tier || row.tier,
        harga_beli_jpy: result.harga_beli_jpy > 0 ? String(result.harga_beli_jpy) : row.harga_beli_jpy,
        admission_date: result.admission_date || row.admission_date,
      });
      // Auto-compute harga_beli_idr if kurs is set
      const kurs = parseFloat(tourRows[i].kurs) || 0;
      if (result.harga_beli_jpy > 0 && kurs > 0) {
        setRow(i, { harga_beli_idr: String(Math.round(result.harga_beli_jpy * kurs)) });
      }
      setMsg({ ok: true, text: `OCR: ${result.nama_tour} ${result.tier} ¥${result.harga_beli_jpy} × ${result.qty} tiket` });
    } catch (e: any) {
      setMsg({ ok: false, text: e.message ?? "OCR gagal" });
    } finally {
      setScanning(false);
    }
  };

  // ── Save ──────────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    setSaving(true);
    setMsg(null);
    try {
      for (const row of tourRows) {
        if (!row.nama_tour) continue;

        // Upload file if new
        let driveFileId = row.tiket_drive_file_id;
        if (row.tiketFile && !driveFileId) {
          setUploading(true);
          const fd = new FormData();
          fd.append("file", row.tiketFile);
          const res = await optionalTourApi.uploadTiket(tripId, fd);
          driveFileId = res.drive_file_id;
          setUploading(false);
        }

        const payload: Partial<ManifestOptionalTour> = {
          nama_tour: row.nama_tour,
          kategori: row.nama_tour,
          tier: row.tier || undefined,
          harga_jual_idr: parseFloat(row.harga_jual_idr) || undefined,
          harga_beli_jpy: parseFloat(row.harga_beli_jpy) || undefined,
          harga_beli_idr: parseFloat(row.harga_beli_idr) || undefined,
          kurs: parseFloat(row.kurs) || undefined,
          peserta_ids: row.peserta_ids,
          tiket_drive_file_id: driveFileId || undefined,
        };

        if (row.id || editId) {
          await optionalTourApi.update(tripId, (row.id ?? editId)!, payload);
        } else {
          await optionalTourApi.create(tripId, payload);
        }
      }

      resetForm();
      load();
      setMsg({ ok: true, text: "Data optional tour berhasil disimpan." });
    } catch (e: any) {
      setUploading(false);
      setMsg({ ok: false, text: e.message ?? "Gagal menyimpan" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Hapus data ini?")) return;
    await optionalTourApi.delete(tripId, id);
    load();
  };

  const resetForm = () => {
    tourRows.forEach(r => { if (r.localPdfUrl) URL.revokeObjectURL(r.localPdfUrl); });
    setTourRows([newTourRow()]);
    setActivePdfRow(0);
    setEditId(null);
    setShowForm(false);
  };

  const startEdit = (item: ManifestOptionalTour) => {
    resetForm();
    setEditId(item.id ?? null);
    setTourRows([{
      _key: uid(),
      id: item.id,
      nama_tour: item.nama_tour,
      tier: item.tier ?? "Adult",
      harga_jual_idr: item.harga_jual_idr != null ? String(item.harga_jual_idr) : "",
      harga_beli_jpy: item.harga_beli_jpy != null ? String(item.harga_beli_jpy) : "",
      kurs: item.kurs != null ? String(item.kurs) : "",
      harga_beli_idr: item.harga_beli_idr != null ? String(item.harga_beli_idr) : "",
      peserta_ids: item.peserta_ids ?? [],
      admission_date: "",
      tiket_drive_file_id: item.tiket_drive_file_id,
      tiketFile: null,
      localPdfUrl: null,
    }]);
    setShowForm(true);
  };

  // ── Active PDF for left panel ─────────────────────────────────────────────────

  const activeRow = tourRows[activePdfRow] ?? tourRows[0];
  const pdfSrc = activeRow?.tiket_drive_file_id
    ? `https://drive.google.com/file/d/${activeRow.tiket_drive_file_id}/preview`
    : activeRow?.localPdfUrl ?? undefined;

  if (loading) return <div className="p-6 text-sm text-neutral-600">Memuat...</div>;

  return (
    <div>
      {/* ── Toolbar ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800 flex-wrap gap-2">
        <span className="text-xs text-neutral-400">{list.length} opsional tour</span>
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={() => {
            if (showForm) { resetForm(); } else { resetForm(); setShowForm(true); }
          }}>
            {showForm ? "Tutup form" : "+ Tambah Tour"}
          </Button>
          <button
            onClick={async () => {
              try { await optionalTourApi.exportCsv(tripId); }
              catch (e: any) { setMsg({ ok: false, text: e.message }); }
            }}
            disabled={list.length === 0}
            className="rounded-lg border border-neutral-700 hover:border-teal-500 hover:text-teal-400 text-neutral-400 text-xs py-1.5 px-3 transition-colors cursor-pointer disabled:opacity-40 whitespace-nowrap"
          >
            ↓ Export CSV
          </button>
          <button
            onClick={async () => {
              setCsvUploading(true);
              setMsg(null);
              try {
                const res = await optionalTourApi.uploadCsvToDrive(tripId);
                setMsg({ ok: true, text: `CSV terupload ke Drive: ${res.file_name}` });
              } catch (e: any) {
                setMsg({ ok: false, text: e.message ?? "Upload CSV gagal" });
              } finally { setCsvUploading(false); }
            }}
            disabled={csvUploading || list.length === 0}
            className="rounded-lg border border-neutral-700 hover:border-teal-500 hover:text-teal-400 text-neutral-400 text-xs py-1.5 px-3 transition-colors cursor-pointer disabled:opacity-40 whitespace-nowrap"
          >
            {csvUploading ? "Uploading…" : "↑ Upload CSV ke Drive"}
          </button>
        </div>
      </div>

      {/* ── Form Panel ───────────────────────────────────────────────────────── */}
      {showForm && (
        <div className="border-b border-neutral-800 bg-neutral-950/40">
          <div className="flex flex-col md:flex-row">
            {/* LEFT: PDF preview */}
            {pdfSrc && (
              <div className="w-full md:w-[38%] flex-shrink-0 p-4">
                {tourRows.length > 1 && (
                  <div className="flex gap-1.5 mb-2 flex-wrap">
                    {tourRows.map((r, i) => (
                      <button
                        key={r._key}
                        onClick={() => setActivePdfRow(i)}
                        className={clsx(
                          "text-[10px] px-2 py-0.5 rounded border cursor-pointer transition-colors",
                          activePdfRow === i ? "border-teal-500 text-teal-400" : "border-neutral-700 text-neutral-500"
                        )}
                      >
                        {r.nama_tour || `Tour ${i+1}`}
                      </button>
                    ))}
                  </div>
                )}
                <p className={lbl}>
                  Preview Tiket {activeRow.tiket_drive_file_id ? "(Drive)" : "(lokal — akan diupload saat Simpan)"}
                </p>
                <embed
                  src={pdfSrc}
                  type="application/pdf"
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-900"
                  style={{ height: 520 }}
                />
              </div>
            )}

            {/* RIGHT: Form */}
            <div className={clsx("flex-1 p-4 overflow-y-auto", pdfSrc ? "" : "w-full")} style={{ maxHeight: 620, overflowY: "auto" }}>

              {/* Tour rows */}
              <div className="space-y-4">
                {tourRows.map((row, i) => (
                  <div key={row._key} className="rounded-xl border border-neutral-700 bg-neutral-900/50 p-3">
                    {/* Row header */}
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                        Tour {i + 1}
                        {row.nama_tour ? ` — ${row.nama_tour}` : ""}
                      </span>
                      <div className="flex items-center gap-2">
                        {/* File input per row */}
                        <input
                          ref={el => { fileRefs.current[i] = el; }}
                          type="file"
                          accept=".pdf,application/pdf"
                          className="hidden"
                          onChange={e => { const f = e.target.files?.[0]; if (f) handleSelectFile(i, f); e.target.value = ""; }}
                        />
                        <button
                          onClick={() => { setActivePdfRow(i); fileRefs.current[i]?.click(); }}
                          className="text-[10px] rounded border border-neutral-700 hover:border-teal-500 hover:text-teal-400 text-neutral-500 py-0.5 px-2 transition-colors cursor-pointer whitespace-nowrap"
                        >
                          {row.tiketFile ? `📄 ${row.tiketFile.name}` : row.tiket_drive_file_id ? "📄 Drive" : "↑ Upload Tiket"}
                        </button>
                        {row.tiketFile && (
                          <button
                            onClick={() => handleOcr(i)}
                            disabled={scanning}
                            className="text-[10px] rounded bg-teal-900/40 border border-teal-700/50 hover:bg-teal-900/70 text-teal-400 py-0.5 px-2 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
                          >
                            {scanning ? "Scanning…" : "🔍 Scan AI"}
                          </button>
                        )}
                        {tourRows.length > 1 && (
                          <button
                            onClick={() => removeTourRow(i)}
                            className="text-neutral-600 hover:text-red-400 text-sm cursor-pointer px-1"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Row 1: nama_tour, tier, admission_date */}
                    <div className="flex gap-2 flex-wrap mb-2">
                      <div className="w-44">
                        <label className={lbl}>Nama Tour</label>
                        <select
                          value={TOUR_NAMES.includes(row.nama_tour) ? row.nama_tour : "Lainnya"}
                          onChange={e => {
                            if (e.target.value !== "Lainnya") setRow(i, { nama_tour: e.target.value });
                          }}
                          className={sel}
                        >
                          {TOUR_NAMES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                        {(!TOUR_NAMES.includes(row.nama_tour) || row.nama_tour === "Lainnya") && (
                          <input
                            value={row.nama_tour}
                            onChange={e => setRow(i, { nama_tour: e.target.value })}
                            placeholder="nama tour..."
                            className={clsx(inp, "mt-1")}
                          />
                        )}
                      </div>
                      <div className="w-28">
                        <label className={lbl}>Tier</label>
                        <select
                          value={TIER_OPTIONS.includes(row.tier) ? row.tier : "Adult"}
                          onChange={e => setRow(i, { tier: e.target.value })}
                          className={sel}
                        >
                          {TIER_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      <div className="w-36">
                        <label className={lbl}>Tgl Tiket</label>
                        <input
                          type="date"
                          value={row.admission_date}
                          onChange={e => setRow(i, { admission_date: e.target.value })}
                          className={inp}
                        />
                      </div>
                    </div>

                    {/* Row 2: pricing */}
                    <div className="flex gap-2 flex-wrap mb-2">
                      <div className="w-32">
                        <label className={lbl}>Harga Jual (Rp)</label>
                        <input
                          type="number"
                          value={row.harga_jual_idr}
                          onChange={e => setRow(i, { harga_jual_idr: e.target.value })}
                          placeholder="450000"
                          className={inp}
                        />
                      </div>
                      <div className="w-28">
                        <label className={lbl}>Harga Beli (¥)</label>
                        <input
                          type="number"
                          value={row.harga_beli_jpy}
                          onChange={e => handlePriceChange(i, "harga_beli_jpy", e.target.value)}
                          placeholder="8900"
                          className={inp}
                        />
                      </div>
                      <div className="w-24">
                        <label className={lbl}>Kurs</label>
                        <input
                          type="number"
                          value={row.kurs}
                          onChange={e => handlePriceChange(i, "kurs", e.target.value)}
                          placeholder="110"
                          className={inp}
                        />
                      </div>
                      <div className="w-32">
                        <label className={lbl}>Harga Beli (Rp) <span className="text-teal-600">auto</span></label>
                        <input
                          type="number"
                          value={row.harga_beli_idr}
                          onChange={e => setRow(i, { harga_beli_idr: e.target.value })}
                          placeholder="auto"
                          className={inpRO}
                        />
                      </div>
                    </div>

                    {/* Peserta multi-select */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className={lbl + " mb-0"}>Peserta ({row.peserta_ids.length} dipilih)</label>
                        <div className="flex gap-2">
                          <button onClick={() => selectAllPeserta(i)} className="text-[9px] text-teal-600 hover:text-teal-400 cursor-pointer">Pilih Semua</button>
                          <button onClick={() => clearPeserta(i)} className="text-[9px] text-neutral-600 hover:text-neutral-400 cursor-pointer">Kosongkan</button>
                        </div>
                      </div>
                      <div className="max-h-28 overflow-y-auto rounded-lg border border-neutral-700 bg-neutral-900/60">
                        {pesertaList.length === 0 ? (
                          <div className="px-3 py-2 text-xs text-neutral-600">Belum ada peserta</div>
                        ) : (
                          <div className="divide-y divide-neutral-800/60">
                            {pesertaList.map(p => (
                              <label key={p.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-white/[0.02] cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={row.peserta_ids.includes(p.id)}
                                  onChange={() => togglePeserta(i, p.id)}
                                  className="accent-teal-500"
                                />
                                <span className="text-xs text-neutral-300">{p.nama_lengkap}</span>
                                {p.title && <span className="text-[10px] text-neutral-600">{p.title}</span>}
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Add tour button */}
              <button
                onClick={addTourRow}
                className="mt-3 w-full text-xs text-neutral-500 hover:text-teal-400 border border-dashed border-neutral-700 hover:border-teal-600 rounded-lg py-2 transition-colors cursor-pointer"
              >
                + Tambah Tour
              </button>

              {/* OCR / error messages */}
              {msg && (
                <p className={clsx("text-[11px] mt-3", msg.ok ? "text-teal-400" : "text-red-400")}>
                  {msg.ok ? "✓" : "⚠"} {msg.text}
                </p>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-neutral-800">
                <Button size="sm" variant="ghost" onClick={resetForm}>Batal</Button>
                <Button size="sm" variant="primary" onClick={handleSave} loading={saving || uploading}>
                  {uploading ? "Uploading…" : saving ? "Menyimpan…" : "Simpan Semua"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Table ───────────────────────────────────────────────────────────── */}
      <div className="overflow-x-auto">
        {list.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-neutral-600">
            Belum ada data optional tour
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-neutral-800">
                {["NAMA TOUR","TIER","PESERTA","HARGA JUAL","HARGA BELI (¥)","HARGA BELI (Rp)","KURS","TIKET",""].map((col, i) => (
                  <th key={i} className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-neutral-600 whitespace-nowrap">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/50">
              {list.map(item => (
                <tr key={item.id} className="group hover:bg-white/[0.02] transition-colors">
                  <td className="px-3 py-2 text-xs font-medium text-neutral-100 whitespace-nowrap">{item.nama_tour}</td>
                  <td className="px-3 py-2 text-xs text-neutral-400 whitespace-nowrap">{item.tier ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-neutral-400 max-w-[200px]">
                    {item.peserta_names && item.peserta_names.length > 0
                      ? <span title={item.peserta_names.join(", ")} className="truncate block">
                          {item.peserta_names.length > 2
                            ? `${item.peserta_names.slice(0,2).join(", ")} +${item.peserta_names.length - 2}`
                            : item.peserta_names.join(", ")}
                        </span>
                      : <span className="text-neutral-600">—</span>}
                  </td>
                  <td className="px-3 py-2 text-xs text-teal-400 whitespace-nowrap">{fmtIdr(item.harga_jual_idr)}</td>
                  <td className="px-3 py-2 text-xs text-neutral-400 whitespace-nowrap">{fmtJpy(item.harga_beli_jpy)}</td>
                  <td className="px-3 py-2 text-xs text-neutral-400 whitespace-nowrap">{fmtIdr(item.harga_beli_idr)}</td>
                  <td className="px-3 py-2 text-xs text-neutral-500">{item.kurs ?? "—"}</td>
                  <td className="px-3 py-2 text-xs">
                    {item.tiket_drive_file_id ? (
                      <a
                        href={`https://drive.google.com/file/d/${item.tiket_drive_file_id}/view`}
                        target="_blank" rel="noopener noreferrer"
                        className="text-teal-500 hover:text-teal-300 cursor-pointer"
                        title="Lihat tiket"
                      >
                        📄 Lihat
                      </a>
                    ) : <span className="text-neutral-600">—</span>}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => startEdit(item)} className="text-[10px] text-neutral-500 hover:text-teal-400 cursor-pointer">edit</button>
                      <button onClick={() => handleDelete(item.id!)} className="text-[10px] text-neutral-500 hover:text-red-400 cursor-pointer">hapus</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            {/* Summary row */}
            {list.length > 0 && (
              <tfoot>
                <tr className="bg-neutral-900/30 border-t border-neutral-800">
                  <td className="px-3 py-2 text-xs font-bold text-neutral-300" colSpan={3}>
                    TOTAL ({list.length} item)
                  </td>
                  <td className="px-3 py-2 text-xs font-bold text-teal-300 whitespace-nowrap">
                    {fmtIdr(list.reduce((s, x) => s + ((x.harga_jual_idr ?? 0) * (x.peserta_ids?.length ?? 0)), 0))}
                  </td>
                  <td className="px-3 py-2 text-xs font-bold text-neutral-300 whitespace-nowrap">
                    {fmtJpy(list.reduce((s, x) => s + (x.harga_beli_jpy ?? 0), 0))}
                  </td>
                  <td className="px-3 py-2 text-xs font-bold text-neutral-300 whitespace-nowrap">
                    {fmtIdr(list.reduce((s, x) => s + ((x.harga_beli_idr ?? 0) * (x.peserta_ids?.length ?? 0)), 0))}
                  </td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            )}
          </table>
        )}
      </div>

      {/* Global message when form is closed */}
      {msg && !showForm && (
        <div className={clsx("px-4 py-2 text-xs", msg.ok ? "text-teal-400" : "text-red-400")}>
          {msg.ok ? "✓" : "⚠"} {msg.text}
        </div>
      )}
    </div>
  );
}

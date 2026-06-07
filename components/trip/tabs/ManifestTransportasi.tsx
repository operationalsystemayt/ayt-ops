"use client";
import { useState, useEffect, useRef } from "react";
import { transportasiApi } from "@/lib/trip/api";
import { Button, FormattedInput } from "@/components/ui";
import type { ManifestTransportasi, TransportasiOCRResult } from "@/types/trip";
import { clsx } from "clsx";

const inp = "w-full rounded-lg bg-neutral-900 border border-neutral-700 px-2 py-1.5 text-xs text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-teal-500 transition-colors";
const lbl = "block text-[10px] text-neutral-500 uppercase tracking-wide mb-1";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function fmtDate(s?: string | null) {
  if (!s) return "—";
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return s;
  return `${String(d).padStart(2,"0")}-${MONTHS[m-1]}-${y}`;
}

function fmtJpy(n?: number | null) {
  if (n == null) return "—";
  return `¥${new Intl.NumberFormat("ja-JP").format(n)}`;
}

function fmtIdr(n?: number | null) {
  if (n == null) return "—";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);
}

function uid() { return Math.random().toString(36).slice(2, 10); }

// ── Default shinkansen rows ────────────────────────────────────────────────────

const DEFAULT_SHINKANSEN = [
  { kategori_usia: "0 - 1 Th",  aturan_harga: "Free" },
  { kategori_usia: "1 - 5 Th",  aturan_harga: "Gratis tanpa kursi / 50% jika ambil kursi" },
  { kategori_usia: "6 - 11 Th", aturan_harga: "50% dari harga dewasa" },
  { kategori_usia: "12+ Th",    aturan_harga: "Harga dewasa (100%)" },
];

// ── State types ────────────────────────────────────────────────────────────────

interface ShinRow {
  _key: string;
  id?: string;
  kategori_usia: string;
  aturan_harga: string;
  qty: string;
  harga_jpy: string;
  harga_idr: string;
  waktu_pembayaran: string;
}

interface LokalRow {
  _key: string;
  id?: string;
  vendor: string;
  tgl_trip: string;
  tipe_kendaraan: string;
  keterangan_rute: string;
  harga_jpy: string;
  harga_satuan: string;
  harga_idr: string;
  waktu_pembayaran: string;
}

function newShinRow(template?: { kategori_usia: string; aturan_harga: string }): ShinRow {
  return {
    _key: uid(),
    kategori_usia: template?.kategori_usia ?? "",
    aturan_harga: template?.aturan_harga ?? "",
    qty: "",
    harga_jpy: "",
    harga_idr: "",
    waktu_pembayaran: "",
  };
}

function newLokalRow(): LokalRow {
  return {
    _key: uid(),
    vendor: "",
    tgl_trip: "",
    tipe_kendaraan: "",
    keterangan_rute: "",
    harga_jpy: "",
    harga_satuan: "",
    harga_idr: "",
    waktu_pembayaran: "",
  };
}

function defaultShinRows(): ShinRow[] {
  return DEFAULT_SHINKANSEN.map(t => newShinRow(t));
}

interface Props { tripId: string; tripName: string; tglBerangkat: string; tglPulang: string }

export function ManifestTransportasi({ tripId }: Props) {
  const [list, setList]       = useState<ManifestTransportasi[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formMode, setFormMode] = useState<"SHINKANSEN" | "LOKAL">("SHINKANSEN");

  // Shared kurs (same for all shinkansen rows, and optionally lokal)
  const [shinKurs, setShinKurs] = useState("");
  const [lokalKurs, setLokalKurs] = useState("");

  // Form state
  const [shinRows, setShinRows]   = useState<ShinRow[]>(defaultShinRows());
  const [lokalRows, setLokalRows] = useState<LokalRow[]>([newLokalRow()]);

  // File / upload state
  const [notaFile, setNotaFile]         = useState<File | null>(null);
  const [localPdfUrl, setLocalPdfUrl]   = useState<string | null>(null);
  const [driveFileId, setDriveFileId]   = useState<string | null>(null);
  const [uploading, setUploading]       = useState(false);
  const [csvUploading, setCsvUploading] = useState(false);

  // Action state
  const [saving, setSaving]     = useState(false);
  const [scanning, setScanning] = useState(false);
  const [msg, setMsg]           = useState<{ ok: boolean; text: string } | null>(null);

  const notaRef = useRef<HTMLInputElement>(null);

  const load = () =>
    transportasiApi.list(tripId).then(setList).finally(() => setLoading(false));

  useEffect(() => { load(); }, [tripId]);

  // ── Shinkansen row helpers ───────────────────────────────────────────────────

  const setShin = (i: number, patch: Partial<ShinRow>) =>
    setShinRows(rows => rows.map((r, j) => j === i ? { ...r, ...patch } : r));

  // Auto-compute harga_idr when qty, harga_jpy, or shinKurs changes
  const handleShinChange = (i: number, field: keyof ShinRow, val: string) => {
    setShinRows(rows => rows.map((r, j) => {
      if (j !== i) return r;
      const updated = { ...r, [field]: val };
      const qty = parseFloat(field === "qty" ? val : r.qty) || 0;
      const jpy = parseFloat(field === "harga_jpy" ? val : r.harga_jpy) || 0;
      const kurs = parseFloat(shinKurs) || 0;
      if (qty > 0 && jpy > 0 && kurs > 0) {
        updated.harga_idr = String(Math.round(qty * jpy * kurs));
      }
      return updated;
    }));
  };

  // Recompute all shin harga_idr when shinKurs changes
  const handleShinKursChange = (val: string) => {
    setShinKurs(val);
    const kurs = parseFloat(val) || 0;
    setShinRows(rows => rows.map(r => {
      const qty = parseFloat(r.qty) || 0;
      const jpy = parseFloat(r.harga_jpy) || 0;
      if (qty > 0 && jpy > 0 && kurs > 0) {
        return { ...r, harga_idr: String(Math.round(qty * jpy * kurs)) };
      }
      return r;
    }));
  };

  // ── Lokal row helpers ────────────────────────────────────────────────────────

  const setLokal = (i: number, patch: Partial<LokalRow>) =>
    setLokalRows(rows => rows.map((r, j) => j === i ? { ...r, ...patch } : r));

  const addLokalRow = () => setLokalRows(rows => [...rows, newLokalRow()]);
  const removeLokalRow = (i: number) =>
    setLokalRows(rows => rows.length > 1 ? rows.filter((_, j) => j !== i) : rows);

  const handleLokalChange = (i: number, field: keyof LokalRow, val: string) => {
    setLokalRows(rows => rows.map((r, j) => {
      if (j !== i) return r;
      const updated = { ...r, [field]: val };
      if (field === "harga_jpy") {
        const jpy = parseFloat(val) || 0;
        const kurs = parseFloat(lokalKurs) || 0;
        if (jpy > 0 && kurs > 0) {
          updated.harga_idr = String(Math.round(jpy * kurs));
        }
      }
      return updated;
    }));
  };

  // Recompute all lokal harga_idr when lokalKurs changes
  const handleLokalKursChange = (val: string) => {
    setLokalKurs(val);
    const kurs = parseFloat(val) || 0;
    setLokalRows(rows => rows.map(r => {
      const jpy = parseFloat(r.harga_jpy) || 0;
      if (jpy > 0 && kurs > 0) {
        return { ...r, harga_idr: String(Math.round(jpy * kurs)) };
      }
      return r;
    }));
  };

  // ── Select nota file ─────────────────────────────────────────────────────────
  const handleSelectNota = (file: File) => {
    if (localPdfUrl) URL.revokeObjectURL(localPdfUrl);
    setNotaFile(file);
    setLocalPdfUrl(URL.createObjectURL(file));
    setDriveFileId(null);
    setMsg(null);
    setShowForm(true);
  };

  // ── OCR ──────────────────────────────────────────────────────────────────────
  const handleOcr = async () => {
    if (!notaFile) return;
    setScanning(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", notaFile);
      const result: TransportasiOCRResult = await transportasiApi.ocrNota(tripId, fd);

      // Fill shinkansen rows
      if (result.shinkansen && result.shinkansen.length > 0) {
        const newShin = DEFAULT_SHINKANSEN.map((def, idx) => {
          const found = result.shinkansen.find(s => s.kategori_usia === def.kategori_usia)
            ?? result.shinkansen[idx];
          if (!found) return newShinRow(def);
          const kurs = found.kurs > 0 ? found.kurs : 0;
          const idr = found.qty > 0 && found.harga_jpy > 0 && kurs > 0
            ? Math.round(found.qty * found.harga_jpy * kurs) : 0;
          return {
            _key: uid(),
            kategori_usia: def.kategori_usia,
            aturan_harga: found.aturan_harga || def.aturan_harga,
            qty: found.qty > 0 ? String(found.qty) : "",
            harga_jpy: found.harga_jpy > 0 ? String(found.harga_jpy) : "",
            harga_idr: idr > 0 ? String(idr) : "",
            waktu_pembayaran: "",
          };
        });
        setShinRows(newShin);
        // Shared kurs from first non-zero
        const firstKurs = result.shinkansen.find(s => s.kurs > 0)?.kurs;
        if (firstKurs) setShinKurs(String(firstKurs));
      }

      // Fill lokal rows
      if (result.lokal && result.lokal.length > 0) {
        const firstLokalKurs = result.lokal.find(l => l.kurs > 0)?.kurs;
        if (firstLokalKurs) setLokalKurs(String(firstLokalKurs));
        const newLokal = result.lokal.map(l => {
          const kurs = l.kurs > 0 ? l.kurs : (firstLokalKurs ?? 0);
          const idr = l.harga_jpy > 0 && kurs > 0 ? Math.round(l.harga_jpy * kurs) : 0;
          return {
            _key: uid(),
            vendor: l.vendor ?? "",
            tgl_trip: l.tgl_trip ?? "",
            tipe_kendaraan: l.tipe_kendaraan ?? "",
            keterangan_rute: l.keterangan ?? "",
            harga_jpy: l.harga_jpy > 0 ? String(l.harga_jpy) : "",
            harga_satuan: l.harga_satuan ?? "",
            harga_idr: idr > 0 ? String(idr) : "",
            waktu_pembayaran: "",
          };
        });
        setLokalRows(newLokal);
      }

      setMsg({ ok: true, text: `OCR selesai — ${result.shinkansen?.length ?? 0} baris shinkansen, ${result.lokal?.length ?? 0} baris lokal.` });
    } catch (e: any) {
      setMsg({ ok: false, text: e.message ?? "OCR gagal" });
    } finally {
      setScanning(false);
    }
  };

  // ── Save ─────────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    setMsg(null);
    try {
      // 1. Upload nota if new
      let finalDriveId = driveFileId;
      if (notaFile && !driveFileId) {
        setUploading(true);
        const fd = new FormData();
        fd.append("file", notaFile);
        const res = await transportasiApi.uploadNota(tripId, fd);
        finalDriveId = res.drive_file_id;
        setDriveFileId(finalDriveId);
        setUploading(false);
      }

      const kurs = parseFloat(shinKurs) || undefined;

      // 2. Save shinkansen rows
      for (const row of shinRows) {
        const qty = parseInt(row.qty) || undefined;
        const hargaJpy = parseFloat(row.harga_jpy) || undefined;
        const hargaIdr = parseFloat(row.harga_idr) || undefined;

        const payload: Partial<ManifestTransportasi> = {
          jenis: "SHINKANSEN",
          kategori_usia: row.kategori_usia || undefined,
          keterangan_rute: row.aturan_harga || undefined, // aturan_harga stored in keterangan_rute
          qty,
          harga_jpy: hargaJpy,
          harga_idr: hargaIdr,
          total_idr: hargaIdr,
          kurs,
          nota_drive_file_id: finalDriveId || undefined,
          waktu_pembayaran: row.waktu_pembayaran || undefined,
        };

        if (row.id) {
          await transportasiApi.update(tripId, row.id, payload);
        } else {
          await transportasiApi.create(tripId, payload);
        }
      }

      // 3. Save lokal rows
      const loKurs = parseFloat(lokalKurs) || undefined;
      for (const row of lokalRows) {
        const hargaJpy = parseFloat(row.harga_jpy) || undefined;
        const hargaIdr = parseFloat(row.harga_idr) || undefined;

        if (!row.vendor && !row.tipe_kendaraan && !row.keterangan_rute && !hargaJpy) continue;

        const payload: Partial<ManifestTransportasi> = {
          jenis: "LOKAL",
          vendor: row.vendor || undefined,
          tgl_trip: row.tgl_trip || undefined,
          tipe_kendaraan: row.tipe_kendaraan || undefined,
          keterangan_rute: row.keterangan_rute || undefined,
          harga_jpy: hargaJpy,
          harga_satuan: row.harga_satuan || undefined,
          harga_idr: hargaIdr,
          total_idr: hargaIdr,
          kurs: loKurs,
          nota_drive_file_id: finalDriveId || undefined,
          waktu_pembayaran: row.waktu_pembayaran || undefined,
        };

        if (row.id) {
          await transportasiApi.update(tripId, row.id, payload);
        } else {
          await transportasiApi.create(tripId, payload);
        }
      }

      resetForm();
      load();
      setMsg({ ok: true, text: "Data transportasi berhasil disimpan." });
    } catch (e: any) {
      setUploading(false);
      setMsg({ ok: false, text: e.message ?? "Gagal menyimpan" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Hapus data ini?")) return;
    await transportasiApi.delete(tripId, id);
    load();
  };

  const resetForm = () => {
    if (localPdfUrl) URL.revokeObjectURL(localPdfUrl);
    setLocalPdfUrl(null);
    setNotaFile(null);
    setDriveFileId(null);
    setShinRows(defaultShinRows());
    setLokalRows([newLokalRow()]);
    setShinKurs("");
    setLokalKurs("");
    setShowForm(false);
  };

  // Start edit: pre-fill from existing rows
  const startEdit = (item: ManifestTransportasi) => {
    resetForm();
    setFormMode(item.jenis === "SHINKANSEN" ? "SHINKANSEN" : "LOKAL");
    if (item.jenis === "SHINKANSEN") {
      setShinRows(prev => prev.map(r =>
        r.kategori_usia === item.kategori_usia
          ? {
              ...r,
              id: item.id,
              qty: item.qty != null ? String(item.qty) : "",
              harga_jpy: item.harga_jpy != null ? String(item.harga_jpy) : "",
              harga_idr: item.harga_idr != null ? String(item.harga_idr) : "",
              waktu_pembayaran: item.waktu_pembayaran ?? "",
            }
          : r
      ));
      if (item.kurs) setShinKurs(String(item.kurs));
    } else {
      setLokalRows([{
        _key: uid(),
        id: item.id,
        vendor: item.vendor ?? "",
        tgl_trip: item.tgl_trip ?? "",
        tipe_kendaraan: item.tipe_kendaraan ?? "",
        keterangan_rute: item.keterangan_rute ?? "",
        harga_jpy: item.harga_jpy != null ? String(item.harga_jpy) : "",
        harga_satuan: item.harga_satuan ?? "",
        harga_idr: item.harga_idr != null ? String(item.harga_idr) : "",
        waktu_pembayaran: item.waktu_pembayaran ?? "",
      }]);
      if (item.kurs) setLokalKurs(String(item.kurs));
    }
    if (item.nota_drive_file_id) setDriveFileId(item.nota_drive_file_id);
    setShowForm(true);
  };

  const pdfSrc = driveFileId
    ? `https://drive.google.com/file/d/${driveFileId}/preview`
    : localPdfUrl ?? undefined;

  // Split list into sections
  const shinList = list.filter(x => x.jenis === "SHINKANSEN");
  const lokalList = list.filter(x => x.jenis === "LOKAL");

  if (loading) return <div className="p-6 text-sm text-neutral-600">Memuat...</div>;

  return (
    <div>
      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800 flex-wrap gap-2">
        <span className="text-xs text-neutral-400">{shinList.length} shinkansen · {lokalList.length} lokal</span>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            ref={notaRef}
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleSelectNota(f); e.target.value = ""; }}
          />
          <button
            onClick={() => notaRef.current?.click()}
            disabled={uploading}
            className="rounded-lg border border-neutral-700 hover:border-teal-500 hover:text-teal-400 text-neutral-400 text-xs py-1.5 px-3 transition-colors cursor-pointer disabled:opacity-40 whitespace-nowrap"
          >
            {uploading ? "Uploading…" : notaFile && !driveFileId ? `📄 ${notaFile.name}` : "↑ Upload Nota"}
          </button>
          <Button size="sm" variant="outline" onClick={() => {
            if (showForm) { resetForm(); }
            else { resetForm(); setShowForm(true); }
          }}>
            {showForm ? "Tutup form" : "+ Tambah/Edit"}
          </Button>
          <button
            onClick={async () => {
              try { await transportasiApi.exportCsv(tripId); }
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
                const res = await transportasiApi.uploadCsvToDrive(tripId);
                setMsg({ ok: true, text: `CSV terupload ke Drive: ${res.file_name}` });
              } catch (e: any) {
                setMsg({ ok: false, text: e.message ?? "Upload CSV gagal" });
              } finally {
                setCsvUploading(false);
              }
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
              <div className="w-full md:w-[40%] flex-shrink-0 p-4">
                <p className={lbl}>
                  Preview Nota {driveFileId ? "(Drive)" : "(lokal — akan diupload saat Simpan)"}
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
            <div className={clsx("flex-1 p-4 overflow-y-auto", pdfSrc ? "" : "w-full")}>

              {/* OCR button */}
              {notaFile && (
                <div className="flex items-center gap-3 mb-4">
                  <button
                    type="button"
                    onClick={handleOcr}
                    disabled={scanning}
                    className="rounded-lg bg-teal-900/40 border border-teal-700/50 hover:bg-teal-900/70 text-teal-400 text-xs py-1.5 px-4 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
                  >
                    {scanning ? "Scanning…" : "🔍 Scan AI (OCR) — auto-isi data transportasi"}
                  </button>
                  {msg && (
                    <span className={clsx("text-[11px] flex-1", msg.ok ? "text-teal-400" : "text-red-400")}>
                      {msg.ok ? "✓" : "⚠"} {msg.text}
                    </span>
                  )}
                </div>
              )}

              {/* ── Mode toggle ───────────────────────────────────────────── */}
              <div className="flex items-center gap-1 mb-5 bg-neutral-900 border border-neutral-700 rounded-lg p-1 w-fit">
                <button
                  type="button"
                  onClick={() => setFormMode("SHINKANSEN")}
                  className={clsx(
                    "px-4 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer",
                    formMode === "SHINKANSEN"
                      ? "bg-teal-700 text-white"
                      : "text-neutral-400 hover:text-neutral-200"
                  )}
                >
                  Shinkansen
                </button>
                <button
                  type="button"
                  onClick={() => setFormMode("LOKAL")}
                  className={clsx(
                    "px-4 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer",
                    formMode === "LOKAL"
                      ? "bg-teal-700 text-white"
                      : "text-neutral-400 hover:text-neutral-200"
                  )}
                >
                  Transportasi Lokal
                </button>
              </div>

              {/* ── SHINKANSEN section ─────────────────────────────────────── */}
              {formMode === "SHINKANSEN" && (
              <div className="mb-6">
                <div className="flex items-center gap-4 mb-3">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">SHINKANSEN</p>
                  <div className="flex items-center gap-2">
                    <label className={lbl + " mb-0 whitespace-nowrap"}>Kurs (shared)</label>
                    <FormattedInput
                      value={shinKurs}
                      onChange={handleShinKursChange}
                      placeholder="111"
                      className={clsx(inp, "w-24")}
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-neutral-700 overflow-hidden">
                  {/* Header row */}
                  <div className="grid grid-cols-[160px_1fr_60px_100px_110px_130px] gap-2 px-3 py-1.5 bg-neutral-800/50">
                    {["Kategori Usia","Aturan Harga","Qty","Harga OTS (¥)","Total IDR (auto)","Waktu Bayar"].map(h => (
                      <span key={h} className="text-[9px] text-neutral-500 uppercase tracking-wide">{h}</span>
                    ))}
                  </div>

                  {shinRows.map((row, i) => (
                    <div key={row._key} className="grid grid-cols-[160px_1fr_60px_100px_110px_130px] gap-2 px-3 py-2 border-t border-neutral-800/60 items-center">
                      <span className="text-xs text-neutral-300 font-medium">{row.kategori_usia}</span>
                      <input
                        value={row.aturan_harga}
                        onChange={e => setShin(i, { aturan_harga: e.target.value })}
                        placeholder="aturan harga"
                        className={inp}
                      />
                      <FormattedInput
                        value={row.qty}
                        onChange={v => handleShinChange(i, "qty", v)}
                        placeholder="0"
                        className={inp}
                      />
                      <FormattedInput
                        value={row.harga_jpy}
                        onChange={v => handleShinChange(i, "harga_jpy", v)}
                        placeholder="0"
                        className={inp}
                      />
                      <FormattedInput
                        value={row.harga_idr}
                        onChange={v => setShin(i, { harga_idr: v })}
                        placeholder="auto"
                        className={inp}
                      />
                      <input
                        type="date"
                        value={row.waktu_pembayaran}
                        onChange={e => setShin(i, { waktu_pembayaran: e.target.value })}
                        className={inp}
                      />
                    </div>
                  ))}
                </div>
              </div>
              )}

              {/* ── TRANSPORTASI LOKAL section ─────────────────────────────── */}
              {formMode === "LOKAL" && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-4">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">TRANSPORTASI LOKAL</p>
                    <div className="flex items-center gap-2">
                      <label className={lbl + " mb-0 whitespace-nowrap"}>Kurs (shared)</label>
                      <FormattedInput
                        value={lokalKurs}
                        onChange={handleLokalKursChange}
                        placeholder="111"
                        className={clsx(inp, "w-24")}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  {lokalRows.map((row, i) => (
                    <div key={row._key} className="rounded-xl border border-neutral-700 bg-neutral-900/60 p-3">
                      <div className="flex items-start gap-2 flex-wrap">
                        <div className="w-32">
                          <label className={lbl}>Agent / Vendor</label>
                          <input
                            value={row.vendor}
                            onChange={e => setLokal(i, { vendor: e.target.value })}
                            placeholder="Zhen-zhen"
                            className={inp}
                          />
                        </div>
                        <div className="w-32">
                          <label className={lbl}>Tgl Trip</label>
                          <input
                            type="date"
                            value={row.tgl_trip}
                            onChange={e => setLokal(i, { tgl_trip: e.target.value })}
                            className={inp}
                          />
                        </div>
                        <div className="w-44">
                          <label className={lbl}>Tipe Kendaraan</label>
                          <input
                            value={row.tipe_kendaraan}
                            onChange={e => setLokal(i, { tipe_kendaraan: e.target.value })}
                            placeholder="2 Hiace 1 Alphard"
                            className={inp}
                          />
                        </div>
                        <div className="flex-1 min-w-[160px]">
                          <label className={lbl}>Keterangan Rute</label>
                          <input
                            value={row.keterangan_rute}
                            onChange={e => setLokal(i, { keterangan_rute: e.target.value })}
                            placeholder="Kansai-Hotel arrival 19.35"
                            className={inp}
                          />
                        </div>
                      </div>
                      <div className="flex items-start gap-2 mt-2 flex-wrap">
                        <div className="w-28">
                          <label className={lbl}>Harga JPY (¥)</label>
                          <FormattedInput
                            value={row.harga_jpy}
                            onChange={v => handleLokalChange(i, "harga_jpy", v)}
                            placeholder="49000"
                            className={inp}
                          />
                        </div>
                        <div className="w-36">
                          <label className={lbl}>Harga Satuan (teks)</label>
                          <input
                            value={row.harga_satuan}
                            onChange={e => setLokal(i, { harga_satuan: e.target.value })}
                            placeholder="18000 & 13000"
                            className={inp}
                          />
                        </div>
                        <div className="w-32">
                          <label className={lbl}>Total IDR (auto)</label>
                          <FormattedInput
                            value={row.harga_idr}
                            onChange={v => setLokal(i, { harga_idr: v })}
                            placeholder="auto"
                            className={inp}
                          />
                        </div>
                        <div className="w-32">
                          <label className={lbl}>Waktu Bayar</label>
                          <input
                            type="date"
                            value={row.waktu_pembayaran}
                            onChange={e => setLokal(i, { waktu_pembayaran: e.target.value })}
                            className={inp}
                          />
                        </div>
                        {lokalRows.length > 1 && (
                          <button
                            onClick={() => removeLokalRow(i)}
                            className="self-end mb-1.5 text-neutral-600 hover:text-red-400 text-sm cursor-pointer px-1"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  onClick={addLokalRow}
                  className="mt-2 w-full text-xs text-neutral-500 hover:text-teal-400 border border-dashed border-neutral-700 hover:border-teal-600 rounded-lg py-2 transition-colors cursor-pointer"
                >
                  + Tambah Trip Lokal
                </button>
              </div>
              )}

              {/* Error/info (non-OCR) */}
              {msg && !notaFile && (
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

        {/* SHINKANSEN section */}
        {shinList.length > 0 && (
          <>
            <div className="px-4 py-2 bg-neutral-900/50 border-b border-neutral-800">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">SHINKANSEN</span>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-neutral-800">
                  {["KATEGORI","ATURAN","QTY","HARGA OTS","TOTAL JPY","TOTAL IDR","KURS","WAKTU BAYAR",""].map((col, i) => (
                    <th key={i} className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-neutral-600 whitespace-nowrap">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/50">
                {shinList.map(item => {
                  const totalJpy = (item.qty ?? 0) * (item.harga_jpy ?? 0);
                  return (
                    <tr key={item.id} className="group hover:bg-white/[0.02] transition-colors">
                      <td className="px-3 py-2 text-xs font-medium text-neutral-100 whitespace-nowrap">{item.kategori_usia ?? "—"}</td>
                      <td className="px-3 py-2 text-xs text-neutral-400 max-w-[200px] truncate" title={item.keterangan_rute ?? ""}>{item.keterangan_rute ?? "—"}</td>
                      <td className="px-3 py-2 text-xs text-neutral-400">{item.qty ?? "—"}</td>
                      <td className="px-3 py-2 text-xs text-neutral-400 whitespace-nowrap">{fmtJpy(item.harga_jpy)}</td>
                      <td className="px-3 py-2 text-xs text-neutral-400 whitespace-nowrap">{totalJpy > 0 ? fmtJpy(totalJpy) : "—"}</td>
                      <td className="px-3 py-2 text-xs text-teal-400 whitespace-nowrap">{fmtIdr(item.harga_idr)}</td>
                      <td className="px-3 py-2 text-xs text-neutral-500">{item.kurs ?? "—"}</td>
                      <td className="px-3 py-2 text-xs text-neutral-400 whitespace-nowrap">{fmtDate(item.waktu_pembayaran)}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => startEdit(item)} className="text-[10px] text-neutral-500 hover:text-teal-400 cursor-pointer">edit</button>
                          <button onClick={() => handleDelete(item.id!)} className="text-[10px] text-neutral-500 hover:text-red-400 cursor-pointer">hapus</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {/* Shinkansen total row */}
                <tr className="bg-neutral-900/30">
                  <td className="px-3 py-2 text-xs font-bold text-neutral-300" colSpan={2}>TOTAL SHINKANSEN</td>
                  <td className="px-3 py-2 text-xs font-bold text-neutral-300">
                    {shinList.reduce((s, x) => s + (x.qty ?? 0), 0)}
                  </td>
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2 text-xs font-bold text-neutral-300 whitespace-nowrap">
                    {fmtJpy(shinList.reduce((s, x) => s + (x.qty ?? 0) * (x.harga_jpy ?? 0), 0))}
                  </td>
                  <td className="px-3 py-2 text-xs font-bold text-teal-300 whitespace-nowrap">
                    {fmtIdr(shinList.reduce((s, x) => s + (x.harga_idr ?? 0), 0))}
                  </td>
                  <td colSpan={3} />
                </tr>
              </tbody>
            </table>
          </>
        )}

        {/* LOKAL section */}
        {lokalList.length > 0 && (
          <>
            <div className="px-4 py-2 bg-neutral-900/50 border-b border-neutral-800 border-t border-t-neutral-800">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">TRANSPORTASI LOKAL</span>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-neutral-800">
                  {["AGENT","TGL","KENDARAAN","KETERANGAN","HARGA JPY","SATUAN","TOTAL IDR","KURS","WAKTU BAYAR",""].map((col, i) => (
                    <th key={i} className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-neutral-600 whitespace-nowrap">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/50">
                {lokalList.map(item => (
                  <tr key={item.id} className="group hover:bg-white/[0.02] transition-colors">
                    <td className="px-3 py-2 text-xs font-medium text-neutral-100 whitespace-nowrap">{item.vendor ?? "—"}</td>
                    <td className="px-3 py-2 text-xs text-neutral-400 whitespace-nowrap">{fmtDate(item.tgl_trip)}</td>
                    <td className="px-3 py-2 text-xs text-neutral-400 whitespace-nowrap">{item.tipe_kendaraan ?? "—"}</td>
                    <td className="px-3 py-2 text-xs text-neutral-400 max-w-[200px] truncate" title={item.keterangan_rute ?? ""}>{item.keterangan_rute ?? "—"}</td>
                    <td className="px-3 py-2 text-xs text-neutral-400 whitespace-nowrap">{fmtJpy(item.harga_jpy)}</td>
                    <td className="px-3 py-2 text-xs text-neutral-500">{item.harga_satuan ?? "—"}</td>
                    <td className="px-3 py-2 text-xs text-teal-400 whitespace-nowrap">{fmtIdr(item.harga_idr)}</td>
                    <td className="px-3 py-2 text-xs text-neutral-500">{item.kurs ?? "—"}</td>
                    <td className="px-3 py-2 text-xs text-neutral-400 whitespace-nowrap">{fmtDate(item.waktu_pembayaran)}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        {item.nota_drive_file_id && (
                          <a
                            href={`https://drive.google.com/file/d/${item.nota_drive_file_id}/view`}
                            target="_blank" rel="noopener noreferrer"
                            className="text-[10px] text-teal-500 hover:text-teal-300 cursor-pointer"
                            title="Lihat nota"
                          >
                            📄
                          </a>
                        )}
                        <button onClick={() => startEdit(item)} className="text-[10px] text-neutral-500 hover:text-teal-400 cursor-pointer">edit</button>
                        <button onClick={() => handleDelete(item.id!)} className="text-[10px] text-neutral-500 hover:text-red-400 cursor-pointer">hapus</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {/* Lokal total row */}
                <tr className="bg-neutral-900/30">
                  <td className="px-3 py-2 text-xs font-bold text-neutral-300" colSpan={4}>TOTAL LOKAL</td>
                  <td className="px-3 py-2 text-xs font-bold text-neutral-300 whitespace-nowrap">
                    {fmtJpy(lokalList.reduce((s, x) => s + (x.harga_jpy ?? 0), 0))}
                  </td>
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2 text-xs font-bold text-teal-300 whitespace-nowrap">
                    {fmtIdr(lokalList.reduce((s, x) => s + (x.harga_idr ?? 0), 0))}
                  </td>
                  <td colSpan={3} />
                </tr>
              </tbody>
            </table>
          </>
        )}

        {/* Empty state */}
        {list.length === 0 && (
          <div className="px-4 py-8 text-center text-xs text-neutral-600">
            Belum ada data transportasi
          </div>
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

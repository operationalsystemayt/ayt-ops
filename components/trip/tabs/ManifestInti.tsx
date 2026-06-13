"use client";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { pesertaApi, ocrApi, manifestApi } from "@/lib/trip/api";
import { Button, Badge } from "@/components/ui";
import { getPesertaStatus, calcAge, isBirthdayDuringTrip } from "@/types/trip";
import type { ManifestPeserta, PesertaTitle, RoomType, MealType } from "@/types/trip";
import { clsx } from "clsx";

const TITLES: PesertaTitle[] = ["MR", "MRS", "MS", "MISS", "MASTER", "TOUR_LEADER"];
const ROOMS: (RoomType | "")[] = ["", "DOUBLE", "TWIN", "SINGLE", "TRIPLE"];
const MEALS: MealType[] = ["MUSLIM", "NON_MUSLIM"];

const STATUS_UI = {
  valid:     { label: "✓ Valid",        cls: "text-teal-400" },
  expiring:  { label: "⚠ Expiry <6bln", cls: "text-amber-400" },
  expired:   { label: "✗ Expired",       cls: "text-red-400" },
  no_paspor: { label: "⚠ Belum paspor", cls: "text-amber-400" },
  no_ktp:    { label: "⚠ Belum KTP",    cls: "text-amber-400" },
};

function fmtDate(s?: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  return isNaN(d.getTime()) ? s :
    d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).replace(/ /g, "-");
}

function blankForm() {
  return {
    title: "MR" as PesertaTitle,
    nama_lengkap: "",
    no_paspor: "",
    place_of_birth: "",
    place_of_issued: "",
    issued_date: "",
    tgl_lahir: "",
    expiry_date: "",
    room_type: "" as RoomType | "",
    meals: "NON_MUSLIM" as MealType,
    klien: "",
    kepala_keluarga: "",
    note: "",
  };
}

const sel = "w-full rounded-lg bg-neutral-900 border border-neutral-700 px-2 py-1.5 text-xs text-neutral-100 focus:outline-none focus:border-teal-500 transition-colors";
const inp = "w-full rounded-lg bg-neutral-900 border border-neutral-700 px-2 py-1.5 text-xs text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-teal-500 transition-colors";
const lbl = "block text-[10px] text-neutral-500 uppercase tracking-wide mb-1";

interface UploadState {
  paspor: { file: File | null; uploading: boolean; driveId: string | null };
  ktp:    { file: File | null; uploading: boolean; driveId: string | null };
}

function blankUpload(): UploadState {
  return {
    paspor: { file: null, uploading: false, driveId: null },
    ktp:    { file: null, uploading: false, driveId: null },
  };
}

// ── CSV helpers ───────────────────────────────────────────────────────────────

function csvRow(cells: (string | number)[]) {
  return cells.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",");
}

const MONTHS_UPPER = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
const MONTHS_TITLE = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// "2006-01-02" → "9 Aug 1981" (no leading zero, title-case month)
function fmtDateForCsv(s?: string | null): string {
  if (!s) return "";
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return s;
  return `${d} ${MONTHS_TITLE[m - 1]} ${y}`;
}

// "2026-01-29" + "2026-02-04" → "29 JAN - 4 FEB 2026"
function tripDateRange(start: string, end: string): string {
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  if (!sy || !sm || !sd || !ey || !em || !ed) return `${start} - ${end}`;
  return `${sd} ${MONTHS_UPPER[sm - 1]} - ${ed} ${MONTHS_UPPER[em - 1]} ${ey}`;
}

const MANIFEST_COLS = 15;
function emptyManifestRow(): string[] { return Array(MANIFEST_COLS).fill(""); }

const MANIFEST_HEADER_ROW1 = ["NO ", "Title", "NAME", "ROOM TYPE", "PASSPORT NO", "BIRTH", "", "", "VALIDITY PASSPOR", "", "", "UNIT", "KLIEN", "KEPALA KELUARGA", "NOTE"];
const MANIFEST_HEADER_ROW2 = ["", "", "", "", "", "PLACE", "AGE", "DATE", "PLACE OF ISSUED", "ISSUED DATE", "EXPIRY", "", "", "", ""];

// Returns a map of kepala_keluarga -> unit count, for non-empty values.
function kkCountMap(list: ManifestPeserta[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of list) {
    if (p.kepala_keluarga) m.set(p.kepala_keluarga, (m.get(p.kepala_keluarga) ?? 0) + 1);
  }
  return m;
}

// "Budi" -> "Budi (3 unit)" when part of a multi-member family group.
function kkLabel(p: ManifestPeserta, counts: Map<string, number>): string {
  if (!p.kepala_keluarga) return "";
  const c = counts.get(p.kepala_keluarga) ?? 1;
  return `${p.kepala_keluarga} (${c} unit)`;
}

function manifestDataRow(p: ManifestPeserta, i: number, counts: Map<string, number>): (string | number)[] {
  return [
    i + 1,
    p.title ?? "",
    p.nama_lengkap,
    p.room_type ?? "",
    p.no_paspor ?? "",
    p.place_of_birth ?? "",
    p.tgl_lahir ? calcAge(p.tgl_lahir) : "",
    fmtDateForCsv(p.tgl_lahir),
    p.place_of_issued ?? "",
    fmtDateForCsv(p.issued_date),
    fmtDateForCsv(p.expiry_date),
    p.unit ?? "",
    p.klien ?? "",
    kkLabel(p, counts),
    p.note ?? "",
  ];
}

function downloadManifestCsv(
  list: ManifestPeserta[],
  tripName: string,
  tglBerangkat: string,
  tglPulang: string,
) {
  const counts = kkCountMap(list);
  const rows: (string | number)[][] = [
    // Header block
    ["ANGKASA YUDISTIRA TRAVEL", ...Array(MANIFEST_COLS - 1).fill("")],
    [`NOTE PEMESANAN TIKET - ${tripName.toUpperCase()}`, ...Array(MANIFEST_COLS - 1).fill("")],
    [tripDateRange(tglBerangkat, tglPulang), ...Array(MANIFEST_COLS - 1).fill("")],
    emptyManifestRow(),
    // Two-row column header
    MANIFEST_HEADER_ROW1,
    MANIFEST_HEADER_ROW2,
    // Data rows
    ...list.map((p, i) => manifestDataRow(p, i, counts)),
    // Footer
    emptyManifestRow(), emptyManifestRow(), emptyManifestRow(), emptyManifestRow(),
    ["", "SUDAH PUNYA VISA", ...Array(MANIFEST_COLS - 2).fill("")],
    ["", "URUS VISA SENDIRI", ...Array(MANIFEST_COLS - 2).fill("")],
  ];

  const csv = rows.map(csvRow).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `manifest_peserta_${tripName.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

async function downloadManifestXlsx(
  list: ManifestPeserta[],
  tripName: string,
  tglBerangkat: string,
  tglPulang: string,
) {
  const XLSX = await import("xlsx");
  const counts = kkCountMap(list);
  const rows: (string | number)[][] = [
    ["ANGKASA YUDISTIRA TRAVEL"],
    [`NOTE PEMESANAN TIKET - ${tripName.toUpperCase()}`],
    [tripDateRange(tglBerangkat, tglPulang)],
    [],
    MANIFEST_HEADER_ROW1,
    MANIFEST_HEADER_ROW2,
    ...list.map((p, i) => manifestDataRow(p, i, counts)),
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Manifest");
  XLSX.writeFile(wb, `manifest_peserta_${tripName.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

async function downloadManifestPdf(
  list: ManifestPeserta[],
  tripName: string,
  tglBerangkat: string,
  tglPulang: string,
) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const counts = kkCountMap(list);

  const doc = new jsPDF({ orientation: "landscape" });
  doc.setFontSize(12);
  doc.text("ANGKASA YUDISTIRA TRAVEL", 10, 10);
  doc.setFontSize(9);
  doc.text(`NOTE PEMESANAN TIKET - ${tripName.toUpperCase()}`, 10, 16);
  doc.text(tripDateRange(tglBerangkat, tglPulang), 10, 22);

  const head = [["No", "Title", "Nama", "Room", "Paspor", "Tempat Lahir", "Usia", "Tgl Lahir",
    "Kantor Pengeluaran", "Tgl Pengeluaran", "Expiry", "Unit", "Klien", "Kepala Keluarga", "Note"]];
  const body = list.map((p, i) => manifestDataRow(p, i, counts).map((c) => String(c ?? "")));

  autoTable(doc, { head, body, startY: 28, styles: { fontSize: 6 } });

  doc.save(`manifest_peserta_${tripName.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

interface Props { tripId: string; tripName: string; tglBerangkat: string; tglPulang: string }

export function ManifestInti({ tripId, tripName, tglBerangkat, tglPulang }: Props) {
  const [list, setList]     = useState<ManifestPeserta[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding]   = useState(false);
  const [form, setForm]       = useState(blankForm());
  const [editId, setEditId]   = useState<string | null>(null);
  const [uploads, setUploads] = useState<UploadState>(blankUpload());
  const [uploading, setUploading]       = useState(false);
  const [compiling, setCompiling]       = useState(false);
  const [driveMsg, setDriveMsg]         = useState<{ ok: boolean; text: string } | null>(null);
  const [scanning, setScanning]     = useState(false);
  const [scanMsg, setScanMsg]       = useState<{ ok: boolean; text: string } | null>(null);
  const [pasporPreview, setPasporPreview] = useState<string | null>(null);
  const [zoomOpen, setZoomOpen]     = useState(false);
  const [exportFormat, setExportFormat] = useState<"csv" | "xlsx" | "pdf">("csv");

  const kkCounts = useMemo(() => kkCountMap(list), [list]);

  const pasporRef = useRef<HTMLInputElement>(null);
  const ktpRef    = useRef<HTMLInputElement>(null);

  // Close zoom on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setZoomOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Revoke object URL to avoid memory leaks
  const setPassportFile = useCallback((file: File | null) => {
    setPasporPreview((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
    setUploads((u) => ({ ...u, paspor: { ...u.paspor, file, driveId: null } }));
    if (file) setPasporPreview(URL.createObjectURL(file));
    setScanMsg(null);
  }, []);

  const load = () =>
    pesertaApi.list(tripId).then(setList).finally(() => setLoading(false));

  useEffect(() => { load(); }, [tripId]);

  const setF = (k: keyof ReturnType<typeof blankForm>) => (v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const buildPayload = (): Partial<ManifestPeserta> => ({
    ...form,
    no_urut:    editId ? undefined : list.length + 1,
    title:      (form.title || undefined) as ManifestPeserta["title"],
    room_type:  (form.room_type || undefined) as ManifestPeserta["room_type"],
    meals:      (form.meals || undefined) as ManifestPeserta["meals"],
    issued_date:  form.issued_date || undefined,
    tgl_lahir:    form.tgl_lahir   || undefined,
    expiry_date:  form.expiry_date  || undefined,
    kepala_keluarga: form.kepala_keluarga || undefined,
    note:            form.note            || undefined,
  });

  const handleSave = async () => {
    if (!form.nama_lengkap.trim()) return;

    let pid = editId;
    if (pid) {
      await pesertaApi.update(tripId, pid, buildPayload());
    } else {
      const p = await pesertaApi.create(tripId, buildPayload());
      pid = p.id;
    }

    // Upload files if selected
    if (pid) {
      if (uploads.paspor.file) {
        setUploads((u) => ({ ...u, paspor: { ...u.paspor, uploading: true } }));
        try {
          const res = await pesertaApi.uploadFile(tripId, pid, "paspor", uploads.paspor.file);
          setUploads((u) => ({ ...u, paspor: { ...u.paspor, uploading: false, driveId: res.drive_file_id } }));
        } catch {
          setUploads((u) => ({ ...u, paspor: { ...u.paspor, uploading: false } }));
        }
      }
      if (uploads.ktp.file) {
        setUploads((u) => ({ ...u, ktp: { ...u.ktp, uploading: true } }));
        try {
          const res = await pesertaApi.uploadFile(tripId, pid, "ktp", uploads.ktp.file);
          setUploads((u) => ({ ...u, ktp: { ...u.ktp, uploading: false, driveId: res.drive_file_id } }));
        } catch {
          setUploads((u) => ({ ...u, ktp: { ...u.ktp, uploading: false } }));
        }
      }
    }

    clearAllFormState();
    setAdding(false);
    load();
  };

  const handleOcr = async () => {
    if (!uploads.paspor.file) return;
    setScanning(true);
    setScanMsg(null);
    try {
      const result = await ocrApi.paspor(uploads.paspor.file);
      setForm((f) => ({
        ...f,
        title:          (result.title as PesertaTitle) || f.title,
        nama_lengkap:   result.nama_lengkap   || f.nama_lengkap,
        no_paspor:      result.no_paspor      || f.no_paspor,
        place_of_birth: result.place_of_birth || f.place_of_birth,
        tgl_lahir:      result.tgl_lahir      || f.tgl_lahir,
        place_of_issued:result.place_of_issued|| f.place_of_issued,
        issued_date:    result.issued_date    || f.issued_date,
        expiry_date:    result.expiry_date    || f.expiry_date,
      }));
      setScanMsg({ ok: true, text: "Data berhasil terbaca — periksa sebelum menyimpan." });
    } catch (e: any) {
      setScanMsg({ ok: false, text: e.message ?? "OCR gagal" });
    } finally {
      setScanning(false);
    }
  };

  const startEdit = (p: ManifestPeserta) => {
    clearAllFormState();
    setForm({
      title:           (p.title ?? "MR") as PesertaTitle,
      nama_lengkap:    p.nama_lengkap,
      no_paspor:       p.no_paspor       ?? "",
      place_of_birth:  p.place_of_birth  ?? "",
      place_of_issued: p.place_of_issued ?? "",
      issued_date:     p.issued_date     ?? "",
      tgl_lahir:       p.tgl_lahir       ?? "",
      expiry_date:     p.expiry_date     ?? "",
      room_type:       (p.room_type ?? "") as RoomType | "",
      meals:           (p.meals ?? "NON_MUSLIM") as MealType,
      klien:           p.klien ?? "",
      kepala_keluarga: p.kepala_keluarga ?? "",
      note:            p.note ?? "",
    });
    setEditId(p.id);
    setAdding(true);
  };

  // Clears every piece of form state — called on save, on cancel, and on "+ Tambah"
  const clearAllFormState = () => {
    setPasporPreview((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
    setZoomOpen(false);
    setEditId(null);
    setForm(blankForm());
    setUploads(blankUpload());
    setScanMsg(null);
    setDriveMsg(null);
  };

  const resetForm = () => {
    clearAllFormState();
    setAdding(false);
  };

  if (loading) return <div className="p-6 text-sm text-neutral-600">Memuat...</div>;

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800 flex-wrap gap-2">
        <span className="text-xs text-neutral-400">{list.length} peserta</span>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Format picker */}
          <select
            value={exportFormat}
            onChange={(e) => setExportFormat(e.target.value as "csv" | "xlsx" | "pdf")}
            className="rounded-lg bg-neutral-900 border border-neutral-700 px-2 py-1.5 text-xs text-neutral-300 focus:outline-none focus:border-teal-500 transition-colors cursor-pointer"
          >
            <option value="csv">CSV</option>
            <option value="xlsx">Excel</option>
            <option value="pdf">PDF</option>
          </select>

          {/* Download */}
          <button
            onClick={() => {
              if (exportFormat === "xlsx") downloadManifestXlsx(list, tripName, tglBerangkat, tglPulang);
              else if (exportFormat === "pdf") downloadManifestPdf(list, tripName, tglBerangkat, tglPulang);
              else downloadManifestCsv(list, tripName, tglBerangkat, tglPulang);
            }}
            disabled={list.length === 0}
            className="rounded-lg border border-neutral-700 hover:border-teal-500 hover:text-teal-400 text-neutral-400 text-xs py-1.5 px-3 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
          >
            ↓ Download {exportFormat.toUpperCase()}
          </button>

          {/* Upload to Drive */}
          <button
            onClick={async () => {
              setUploading(true);
              setDriveMsg(null);
              try {
                const res = await manifestApi.uploadToDrive(tripId, exportFormat);
                setDriveMsg({ ok: true, text: `Terupload: ${res.file_name}` });
              } catch (e: any) {
                setDriveMsg({ ok: false, text: e.message ?? "Upload gagal" });
              } finally {
                setUploading(false);
              }
            }}
            disabled={uploading || list.length === 0}
            className="rounded-lg border border-neutral-700 hover:border-teal-500 hover:text-teal-400 text-neutral-400 text-xs py-1.5 px-3 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {uploading ? "Uploading…" : "↑ Upload ke Drive"}
          </button>

          {/* Kompilasi Paspor → DOCX ke Drive */}
          <button
            onClick={async () => {
              setCompiling(true);
              setDriveMsg(null);
              try {
                const res = await manifestApi.passportCompilation(tripId);
                setDriveMsg({ ok: true, text: `Kompilasi selesai: ${res.total_images} paspor → ${res.file_name}` });
              } catch (e: any) {
                setDriveMsg({ ok: false, text: e.message ?? "Kompilasi gagal" });
              } finally {
                setCompiling(false);
              }
            }}
            disabled={compiling || list.filter(p => p.paspor_drive_file_id).length === 0}
            className="rounded-lg border border-neutral-700 hover:border-teal-500 hover:text-teal-400 text-neutral-400 text-xs py-1.5 px-3 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {compiling ? "Mengompilasi…" : "📋 Kompilasi Paspor"}
          </button>

          <Button size="sm" variant="outline" onClick={() => {
            if (adding) { resetForm(); }
            else { clearAllFormState(); setAdding(true); }
          }}>
            {adding ? "Tutup form" : "+ Tambah"}
          </Button>
        </div>
      </div>

      {/* Drive upload message */}
      {driveMsg && (
        <div className={clsx(
          "px-4 py-2 text-xs border-b border-neutral-800 flex items-center justify-between",
          driveMsg.ok ? "text-teal-400 bg-teal-950/20" : "text-red-400 bg-red-950/20"
        )}>
          <span>{driveMsg.ok ? "✓" : "⚠"} {driveMsg.text}</span>
          {driveMsg.ok && (
            <button onClick={() => setDriveMsg(null)} className="text-neutral-600 hover:text-neutral-400 cursor-pointer ml-4">×</button>
          )}
        </div>
      )}

      {/* Input Form */}
      {adding && (
        <div className="p-4 border-b border-neutral-800 bg-neutral-950/40">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">

            {/* Upload Paspor + KTP side by side */}
            <div className="col-span-full grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Upload Paspor</label>
              <div className="flex items-center gap-2 flex-wrap">
                <input ref={pasporRef} type="file" accept="image/*" className="hidden"
                  onChange={(e) => setPassportFile(e.target.files?.[0] ?? null)} />
                <button type="button" onClick={() => pasporRef.current?.click()}
                  className="rounded-lg border border-dashed border-neutral-600 hover:border-teal-500 hover:text-teal-400 text-neutral-500 text-xs py-1.5 px-3 transition-colors cursor-pointer whitespace-nowrap">
                  {uploads.paspor.file ? `📄 ${uploads.paspor.file.name}` : "Pilih foto paspor…"}
                </button>

                {/* OCR button — appears after file is chosen */}
                {uploads.paspor.file && (
                  <button type="button" onClick={handleOcr} disabled={scanning}
                    className="rounded-lg bg-teal-900/40 border border-teal-700/50 hover:bg-teal-900/70 text-teal-400 text-xs py-1.5 px-3 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap">
                    {scanning ? "Scanning…" : "🔍 Scan AI (OCR)"}
                  </button>
                )}

                {uploads.paspor.driveId && (
                  <span className="text-[10px] text-teal-500">✓ Terupload ke Drive</span>
                )}
              </div>

              {/* Passport image preview + zoom */}
              {pasporPreview && (
                <div className="mt-2 flex items-start gap-3">
                  <button
                    type="button"
                    onClick={() => setZoomOpen(true)}
                    className="relative group flex-shrink-0 cursor-zoom-in"
                    title="Klik untuk zoom"
                  >
                    <img
                      src={pasporPreview}
                      alt="Preview paspor"
                      className="h-28 w-auto max-w-[200px] object-cover rounded-lg border border-neutral-700 group-hover:border-teal-500 transition-colors"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 rounded-lg transition-colors flex items-center justify-center">
                      <span className="text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity font-medium">
                        🔍 Zoom
                      </span>
                    </div>
                  </button>
                  <p className="text-[10px] text-neutral-600 mt-1">Klik gambar untuk memperbesar</p>
                </div>
              )}

              {/* OCR result message */}
              {scanMsg && (
                <p className={clsx("text-[11px] mt-1.5", scanMsg.ok ? "text-teal-400" : "text-red-400")}>
                  {scanMsg.ok ? "✓" : "⚠"} {scanMsg.text}
                </p>
              )}
            </div>

            {/* Upload KTP */}
            <div>
              <label className={lbl}>Upload KTP</label>
              <div className="flex items-center gap-2">
                <input ref={ktpRef} type="file" accept="image/*" className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    setUploads((u) => ({ ...u, ktp: { ...u.ktp, file: f, driveId: null } }));
                  }} />
                <button type="button" onClick={() => ktpRef.current?.click()}
                  className="rounded-lg border border-dashed border-neutral-600 hover:border-teal-500 hover:text-teal-400 text-neutral-500 text-xs py-1.5 px-3 transition-colors cursor-pointer whitespace-nowrap">
                  {uploads.ktp.file ? `🪪 ${uploads.ktp.file.name}` : "Pilih foto KTP…"}
                </button>
                {uploads.ktp.driveId && (
                  <span className="text-[10px] text-teal-500">✓ Terupload ke Drive</span>
                )}
              </div>
            </div>
            </div>{/* end upload row */}

            {/* Title + Nama */}
            <div>
              <label className={lbl}>Title</label>
              <select value={form.title} onChange={(e) => setF("title")(e.target.value)} className={sel}>
                {TITLES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className={lbl}>Nama Lengkap <span className="text-red-500">*</span></label>
              <input value={form.nama_lengkap} onChange={(e) => setF("nama_lengkap")(e.target.value)}
                placeholder="Sesuai paspor" className={inp} />
            </div>

            {/* No Paspor + Tempat Lahir */}
            <div>
              <label className={lbl}>No. Paspor</label>
              <input value={form.no_paspor} onChange={(e) => setF("no_paspor")(e.target.value)} className={inp} />
            </div>
            <div className="col-span-2">
              <label className={lbl}>Tempat Lahir</label>
              <input value={form.place_of_birth} onChange={(e) => setF("place_of_birth")(e.target.value)}
                placeholder="cth: SUMBAWA BESAR" className={inp} />
            </div>

            {/* Dates */}
            <div>
              <label className={lbl}>Tgl Lahir</label>
              <input type="date" value={form.tgl_lahir} onChange={(e) => setF("tgl_lahir")(e.target.value)} className={inp} />
            </div>
            <div>
              <label className={lbl}>Tgl Pengeluaran</label>
              <input type="date" value={form.issued_date} onChange={(e) => setF("issued_date")(e.target.value)} className={inp} />
            </div>
            <div>
              <label className={lbl}>Tgl Habis Berlaku</label>
              <input type="date" value={form.expiry_date} onChange={(e) => setF("expiry_date")(e.target.value)} className={inp} />
            </div>
            <div>
              <label className={lbl}>Usia</label>
              <input value={form.tgl_lahir ? `${calcAge(form.tgl_lahir)} tahun` : "—"} disabled
                className={clsx(inp, "opacity-60 cursor-not-allowed")} />
            </div>

            {/* Kantor + Room */}
            <div className="col-span-2">
              <label className={lbl}>Kantor Pengeluaran</label>
              <input value={form.place_of_issued} onChange={(e) => setF("place_of_issued")(e.target.value)}
                placeholder="cth: BATAM" className={inp} />
            </div>
            <div>
              <label className={lbl}>Room</label>
              <select value={form.room_type} onChange={(e) => setF("room_type")(e.target.value)} className={sel}>
                {ROOMS.map((r) => <option key={r} value={r}>{r === "" ? "— (tidak ada)" : r}</option>)}
              </select>
            </div>

            {/* Meals + Klien */}
            <div>
              <label className={lbl}>Meals</label>
              <select value={form.meals} onChange={(e) => setF("meals")(e.target.value)} className={sel}>
                <option value="">— (tidak ada)</option>
                {MEALS.map((m) => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Klien</label>
              <input value={form.klien} onChange={(e) => setF("klien")(e.target.value)} className={inp} />
            </div>

            {/* Kepala Keluarga + Note */}
            <div>
              <label className={lbl}>Kepala Keluarga</label>
              <input value={form.kepala_keluarga} onChange={(e) => setF("kepala_keluarga")(e.target.value)}
                placeholder="cth: Budi" className={inp} />
            </div>
            <div className="col-span-2">
              <label className={lbl}>Note</label>
              <input value={form.note} onChange={(e) => setF("note")(e.target.value)} className={inp} />
            </div>

          </div>

          <div className="flex justify-end gap-2 mt-4">
            <Button size="sm" variant="ghost" onClick={resetForm}>Batal</Button>
            <Button size="sm" variant="primary" onClick={handleSave}
              loading={uploads.paspor.uploading || uploads.ktp.uploading}>
              {editId ? "Update" : "Simpan"}
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-neutral-800">
              {["No","Title","Nama","Paspor","Tgl Lahir","Tempat Lahir",
                "Tgl Pengeluaran","Kantor","Expiry","Usia",
                "Room","Klien","Meals","Kepala Keluarga","Note","Dok","Status",""].map((h) => (
                <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-neutral-600 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800/50">
            {list.length === 0 && (
              <tr><td colSpan={18} className="px-4 py-8 text-center text-xs text-neutral-600">Belum ada peserta</td></tr>
            )}
            {list.map((p, i) => {
              const st = getPesertaStatus(p);
              const birthday = isBirthdayDuringTrip(p.tgl_lahir, tglBerangkat, tglPulang);
              return (
                <tr key={p.id} className="group hover:bg-white/[0.02] transition-colors">
                  <td className="px-3 py-2 text-xs text-neutral-500">{i + 1}</td>
                  <td className="px-3 py-2 text-xs text-neutral-400">{p.title ?? "—"}</td>
                  <td className="px-3 py-2 text-xs font-medium text-neutral-100 whitespace-nowrap">
                    {p.nama_lengkap}
                    {birthday && (
                      <Badge variant="warning" className="ml-2">🎂 Ulang tahun saat trip</Badge>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs font-mono text-neutral-400">{p.no_paspor ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-neutral-400 whitespace-nowrap">{fmtDate(p.tgl_lahir)}</td>
                  <td className="px-3 py-2 text-xs text-neutral-400 whitespace-nowrap">{p.place_of_birth ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-neutral-400 whitespace-nowrap">{fmtDate(p.issued_date)}</td>
                  <td className="px-3 py-2 text-xs text-neutral-400 whitespace-nowrap">{p.place_of_issued ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-neutral-400 whitespace-nowrap">{fmtDate(p.expiry_date)}</td>
                  <td className="px-3 py-2 text-xs text-neutral-400">{p.tgl_lahir ? calcAge(p.tgl_lahir) : "—"}</td>
                  <td className="px-3 py-2 text-xs text-neutral-400">{p.room_type ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-neutral-400">{p.klien ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-neutral-400">{p.meals ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-neutral-400 whitespace-nowrap">{p.kepala_keluarga ? kkLabel(p, kkCounts) : "—"}</td>
                  <td className="px-3 py-2 text-xs text-neutral-400 whitespace-nowrap max-w-[160px] truncate" title={p.note ?? ""}>{p.note ?? "—"}</td>
                  {/* Document view links */}
                  <td className="px-3 py-2 text-xs">
                    <div className="flex gap-1.5">
                      {p.paspor_drive_file_id ? (
                        <a href={`https://drive.google.com/file/d/${p.paspor_drive_file_id}/view`}
                          target="_blank" rel="noopener noreferrer"
                          className="text-teal-500 hover:text-teal-300 transition-colors" title="Lihat Paspor">
                          📄
                        </a>
                      ) : (
                        <span className="text-neutral-700" title="Paspor belum upload">📄</span>
                      )}
                      {p.ktp_drive_file_id ? (
                        <a href={`https://drive.google.com/file/d/${p.ktp_drive_file_id}/view`}
                          target="_blank" rel="noopener noreferrer"
                          className="text-teal-500 hover:text-teal-300 transition-colors" title="Lihat KTP">
                          🪪
                        </a>
                      ) : (
                        <span className="text-neutral-700" title="KTP belum upload">🪪</span>
                      )}
                    </div>
                  </td>
                  <td className={clsx("px-3 py-2 text-[10px] font-medium whitespace-nowrap", STATUS_UI[st].cls)}>
                    {STATUS_UI[st].label}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => startEdit(p)} className="text-[10px] text-neutral-500 hover:text-teal-400 cursor-pointer">edit</button>
                      <button onClick={() => pesertaApi.delete(tripId, p.id).then(load)}
                        className="text-[10px] text-neutral-500 hover:text-red-400 cursor-pointer">hapus</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Full-screen passport zoom overlay */}
      {zoomOpen && pasporPreview && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
          onClick={() => setZoomOpen(false)}
        >
          <div
            className="relative max-w-[90vw] max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={pasporPreview}
              alt="Passport zoom"
              className="max-w-[90vw] max-h-[88vh] object-contain rounded-xl shadow-2xl"
            />
            <button
              onClick={() => setZoomOpen(false)}
              className="absolute -top-3 -right-3 w-7 h-7 bg-neutral-800 border border-neutral-600 rounded-full text-neutral-300 hover:text-white hover:bg-neutral-700 flex items-center justify-center text-base cursor-pointer transition-colors"
            >
              ×
            </button>
          </div>
          <p className="absolute bottom-4 text-xs text-neutral-600">
            Klik di luar gambar atau tekan Esc untuk menutup
          </p>
        </div>
      )}
    </div>
  );
}

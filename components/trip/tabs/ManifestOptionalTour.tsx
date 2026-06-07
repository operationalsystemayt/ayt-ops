"use client";
import { useState, useEffect, useRef } from "react";
import { optionalTourApi, pesertaApi } from "@/lib/trip/api";
import { Button, FormattedInput } from "@/components/ui";
import type { ManifestOptionalTour, ManifestPeserta } from "@/types/trip";
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
function fmtCurrency(n?: number | null) {
  if (n == null) return "—";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);
}

// ── State types ───────────────────────────────────────────────────────────────
interface OptionalTourForm {
  nama_tour: string;
  tanggal: string;
  harga_beli_kurs: string;
  kurs: string;
  harga_beli_idr: string;
  harga_jual_kurs: string;
  harga_jual_idr: string;
  peserta_ids: string[];
  kategori: string;
}

const blankForm = (): OptionalTourForm => ({
  nama_tour: "",
  tanggal: "",
  harga_beli_kurs: "",
  kurs: "",
  harga_beli_idr: "",
  harga_jual_kurs: "",
  harga_jual_idr: "",
  peserta_ids: [],
  kategori: "",
});

// ── Name matching (same as ManifestKeberangkatan) ─────────────────────────────
function matchPesertaName(ocrName: string, list: ManifestPeserta[]): string {
  const norm = (s: string) => s.toUpperCase().trim().replace(/\s+/g, " ");
  const target = norm(ocrName);
  const exact = list.find(p => norm(p.nama_lengkap) === target);
  if (exact) return exact.id;
  const ocrWords = new Set(target.split(" "));
  let best = { id: "", score: 0 };
  for (const p of list) {
    const dbWords = norm(p.nama_lengkap).split(" ");
    const hits = dbWords.filter(w => ocrWords.has(w)).length;
    const score = hits / Math.max(ocrWords.size, dbWords.length);
    if (score > best.score) best = { id: p.id, score };
  }
  return best.score >= 0.5 ? best.id : "";
}

const TOUR_OPTIONS = [
  "Tombori", "Shibuya Sky", "USJ", "Disneyland", "Disneysea",
  "Visa Web", "Visa Waiver", "Asuransi", "Lainnya",
];

interface Props {
  tripId: string;
  tripName?: string;
  tglBerangkat?: string;
  tglPulang?: string;
}

export function ManifestOptionalTour({ tripId }: Props) {
  const [list, setList]             = useState<ManifestOptionalTour[]>([]);
  const [pesertaList, setPesertaList] = useState<ManifestPeserta[]>([]);
  const [loading, setLoading]       = useState(true);
  const [showForm, setShowForm]     = useState(false);

  // Form state
  const [form, setForm]             = useState<OptionalTourForm>(blankForm());
  const [editId, setEditId]         = useState<string | null>(null);

  // File state
  const [tiketFile, setTiketFile]       = useState<File | null>(null);
  const [localPdfUrl, setLocalPdfUrl]   = useState<string | null>(null);
  const [driveFileId, setDriveFileId]   = useState<string | null>(null);

  // Ganti tiket state (per row)
  const [replacingId, setReplacingId]         = useState<string | null>(null);
  const [replacingLoading, setReplacingLoading] = useState<string | null>(null);
  const replaceRef = useRef<HTMLInputElement>(null);

  // "Lainnya" mode — user types a custom tour name
  const [useCustomTour, setUseCustomTour] = useState(false);

  // Action state
  const [saving, setSaving]         = useState(false);
  const [scanning, setScanning]     = useState(false);
  const [pesertaSearch, setPesertaSearch] = useState("");
  const [csvUploading, setCsvUploading] = useState(false);
  const [msg, setMsg]               = useState<{ ok: boolean; text: string } | null>(null);

  const tiketRef = useRef<HTMLInputElement>(null);

  const load = () =>
    optionalTourApi.list(tripId).then(setList).finally(() => setLoading(false));

  useEffect(() => {
    load();
    pesertaApi.list(tripId).then(setPesertaList);
  }, [tripId]);

  // ── Auto-calculations ────────────────────────────────────────────────────────
  const setF = (k: keyof OptionalTourForm, v: string) => {
    setForm(f => {
      const next = { ...f, [k]: v };
      // Auto-compute harga_beli_idr when harga_beli_kurs or kurs changes
      if (k === "harga_beli_kurs" || k === "kurs") {
        const beli = parseFloat(k === "harga_beli_kurs" ? v : next.harga_beli_kurs);
        const kursV = parseFloat(k === "kurs" ? v : next.kurs);
        if (!isNaN(beli) && !isNaN(kursV) && kursV > 0) {
          next.harga_beli_idr = String(Math.round(beli * kursV));
        }
      }
      // Auto-compute harga_jual_idr when harga_jual_kurs or kurs changes
      if (k === "harga_jual_kurs" || k === "kurs") {
        const jual = parseFloat(k === "harga_jual_kurs" ? v : next.harga_jual_kurs);
        const kursV = parseFloat(k === "kurs" ? v : next.kurs);
        if (!isNaN(jual) && !isNaN(kursV) && kursV > 0) {
          next.harga_jual_idr = String(Math.round(jual * kursV));
        }
      }
      return next;
    });
  };

  // ── Computed values ──────────────────────────────────────────────────────────
  const totalPax = form.peserta_ids.length;
  const hargaJualIdr = parseFloat(form.harga_jual_idr) || 0;
  const hargaBeliIdr = parseFloat(form.harga_beli_idr) || 0;
  const totalHargaJual = totalPax * hargaJualIdr;
  const totalHargaBeli = totalPax * hargaBeliIdr;
  const laba = totalHargaJual - totalHargaBeli;

  // ── Peserta toggle ───────────────────────────────────────────────────────────
  const togglePeserta = (id: string) => {
    setForm(f => ({
      ...f,
      peserta_ids: f.peserta_ids.includes(id)
        ? f.peserta_ids.filter(x => x !== id)
        : [...f.peserta_ids, id],
    }));
  };

  // ── Select tiket file ────────────────────────────────────────────────────────
  const handleSelectTiket = (file: File) => {
    if (localPdfUrl) URL.revokeObjectURL(localPdfUrl);
    setTiketFile(file);
    setLocalPdfUrl(URL.createObjectURL(file));
    setDriveFileId(null);
    setMsg(null);
    setShowForm(true);
  };

  // ── OCR ──────────────────────────────────────────────────────────────────────
  const handleOcr = async () => {
    if (!tiketFile) return;
    setScanning(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", tiketFile);
      const result = await optionalTourApi.ocrTiket(tripId, fd);

      setForm(f => {
        const next = { ...f };
        if (result.nama_tour) next.nama_tour = result.nama_tour;
        if (result.tanggal)   next.tanggal   = result.tanggal;
        if (result.harga_beli_kurs > 0) {
          next.harga_beli_kurs = String(result.harga_beli_kurs);
          if (result.kurs > 0) {
            next.kurs = String(result.kurs);
            next.harga_beli_idr = String(Math.round(result.harga_beli_kurs * result.kurs));
          }
        }
        // Match peserta names
        if (result.peserta_names && result.peserta_names.length > 0) {
          const matched = result.peserta_names
            .map(name => matchPesertaName(name, pesertaList))
            .filter(id => id !== "");
          if (matched.length > 0) next.peserta_ids = matched;
        }
        return next;
      });

      const paxCount = result.peserta_names?.length ?? 0;
      setMsg({ ok: true, text: `OCR selesai — ${result.nama_tour || "?"}, ${result.tanggal || "?"}, ${paxCount} peserta ditemukan. Periksa sebelum simpan.` });
    } catch (e: any) {
      setMsg({ ok: false, text: (e as Error).message ?? "OCR gagal" });
    } finally {
      setScanning(false);
    }
  };

  // ── Save ─────────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.nama_tour) {
      setMsg({ ok: false, text: "Nama kegiatan wajib diisi" });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      if (editId) {
        // Update: JSON body
        const body: Partial<ManifestOptionalTour> = {
          nama_tour: form.nama_tour,
          tanggal: form.tanggal || undefined,
          harga_beli_jpy: form.harga_beli_kurs ? parseFloat(form.harga_beli_kurs) : undefined,
          kurs: form.kurs ? parseFloat(form.kurs) : undefined,
          harga_beli_idr: form.harga_beli_idr ? parseFloat(form.harga_beli_idr) : undefined,
          harga_jual_kurs: form.harga_jual_kurs ? parseFloat(form.harga_jual_kurs) : undefined,
          harga_jual_idr: form.harga_jual_idr ? parseFloat(form.harga_jual_idr) : undefined,
          peserta_ids: form.peserta_ids,
          kategori: form.kategori || undefined,
        };
        await optionalTourApi.update(tripId, editId, body);
      } else {
        const fd = new FormData();
        fd.append("nama_tour", form.nama_tour);
        if (form.tanggal) fd.append("tanggal", form.tanggal);
        if (form.harga_beli_kurs) fd.append("harga_beli_kurs", form.harga_beli_kurs);
        if (form.kurs) fd.append("kurs", form.kurs);
        if (form.harga_beli_idr) fd.append("harga_beli_idr", form.harga_beli_idr);
        if (form.harga_jual_kurs) fd.append("harga_jual_kurs", form.harga_jual_kurs);
        if (form.harga_jual_idr) fd.append("harga_jual_idr", form.harga_jual_idr);
        fd.append("peserta_ids", JSON.stringify(form.peserta_ids));
        if (form.kategori) fd.append("kategori", form.kategori);
        if (tiketFile) fd.append("tiket", tiketFile);
        await optionalTourApi.create(tripId, fd);
      }

      resetForm();
      load();
    } catch (e: any) {
      setMsg({ ok: false, text: (e as Error).message ?? "Gagal menyimpan" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Hapus data ini?")) return;
    await optionalTourApi.delete(tripId, id);
    load();
  };

  // ── Replace tiket ─────────────────────────────────────────────────────────────
  const handleReplaceFile = async (oid: string, file: File) => {
    setReplacingLoading(oid);
    try {
      const fd = new FormData();
      fd.append("tiket", file);
      const updated = await optionalTourApi.replaceFile(tripId, oid, fd);
      // Update the row in-place — no full reload needed
      setList(prev => prev.map(item => item.id === oid ? { ...item, ...updated } : item));
    } catch (e: any) {
      setMsg({ ok: false, text: (e as Error).message ?? "Gagal ganti tiket" });
    } finally {
      setReplacingId(null);
      setReplacingLoading(null);
    }
  };

  const resetForm = () => {
    if (localPdfUrl) URL.revokeObjectURL(localPdfUrl);
    setLocalPdfUrl(null);
    setTiketFile(null);
    setDriveFileId(null);
    setForm(blankForm());
    setEditId(null);
    setMsg(null);
    setUseCustomTour(false);
    setShowForm(false);
  };

  const startEdit = (item: ManifestOptionalTour) => {
    resetForm();
    setEditId(item.id ?? null);
    // Detect if the saved tour name is a predefined option or a custom one
    const predefined = TOUR_OPTIONS.filter(o => o !== "Lainnya");
    const isCustom = !!item.nama_tour && !predefined.includes(item.nama_tour);
    setUseCustomTour(isCustom);
    setForm({
      nama_tour:       item.nama_tour ?? "",
      tanggal:         item.tanggal ?? "",
      harga_beli_kurs: item.harga_beli_jpy != null ? String(item.harga_beli_jpy) : "",
      kurs:            item.kurs != null ? String(item.kurs) : "",
      harga_beli_idr:  item.harga_beli_idr != null ? String(item.harga_beli_idr) : "",
      harga_jual_kurs: item.harga_jual_kurs != null ? String(item.harga_jual_kurs) : "",
      harga_jual_idr:  item.harga_jual_idr != null ? String(item.harga_jual_idr) : "",
      peserta_ids:     item.peserta_ids ?? [],
      kategori:        item.kategori ?? "",
    });
    if (item.tiket_drive_file_id) setDriveFileId(item.tiket_drive_file_id);
    setShowForm(true);
  };

  const pdfSrc = driveFileId
    ? `https://drive.google.com/file/d/${driveFileId}/preview`
    : localPdfUrl ?? undefined;

  if (loading) return <div className="p-6 text-sm text-neutral-600">Memuat...</div>;

  return (
    <div>
      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800 flex-wrap gap-2">
        <span className="text-xs text-neutral-400">{list.length} tur opsional</span>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Hidden file input for tiket upload */}
          <input ref={tiketRef} type="file" accept=".pdf,.jpg,.jpeg,.png,image/*,application/pdf"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleSelectTiket(f); e.target.value = ""; }} />
          <button onClick={() => tiketRef.current?.click()}
            className="rounded-lg border border-neutral-700 hover:border-teal-500 hover:text-teal-400 text-neutral-400 text-xs py-1.5 px-3 transition-colors cursor-pointer whitespace-nowrap">
            {tiketFile && !driveFileId ? `📄 ${tiketFile.name}` : "↑ Upload Tiket"}
          </button>

          <Button size="sm" variant="outline" onClick={() => {
            if (showForm) { resetForm(); }
            else { resetForm(); setShowForm(true); }
          }}>
            {showForm ? "Tutup form" : "+ Tambah manual"}
          </Button>

          <button onClick={async () => {
            try { await optionalTourApi.exportCsv(tripId); }
            catch (e: any) { setMsg({ ok: false, text: (e as Error).message }); }
          }}
            disabled={list.length === 0}
            className="rounded-lg border border-neutral-700 hover:border-teal-500 hover:text-teal-400 text-neutral-400 text-xs py-1.5 px-3 transition-colors cursor-pointer disabled:opacity-40 whitespace-nowrap">
            ↓ Export CSV
          </button>

          <button onClick={async () => {
            setCsvUploading(true);
            setMsg(null);
            try {
              const res = await optionalTourApi.uploadCsvToDrive(tripId);
              setMsg({ ok: true, text: `CSV terupload ke Drive: ${res.file_name}` });
            } catch (e: any) {
              setMsg({ ok: false, text: (e as Error).message ?? "Upload CSV gagal" });
            } finally {
              setCsvUploading(false);
            }
          }}
            disabled={csvUploading || list.length === 0}
            className="rounded-lg border border-neutral-700 hover:border-teal-500 hover:text-teal-400 text-neutral-400 text-xs py-1.5 px-3 transition-colors cursor-pointer disabled:opacity-40 whitespace-nowrap">
            {csvUploading ? "Uploading…" : "↑ Upload CSV ke Drive"}
          </button>
        </div>
      </div>

      {/* ── Form Panel ──────────────────────────────────────────────────────── */}
      {showForm && (
        <div className="border-b border-neutral-800 bg-neutral-950/40">
          <div className="flex flex-col md:flex-row">
            {/* LEFT: PDF preview */}
            {pdfSrc && (
              <div className="w-full md:w-[45%] flex-shrink-0 p-4">
                <p className={lbl}>Preview Tiket {driveFileId ? "(Drive)" : "(lokal — akan diupload saat Simpan)"}</p>
                <embed src={pdfSrc} type="application/pdf"
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-900"
                  style={{ height: 520 }} />
              </div>
            )}

            {/* RIGHT: Form */}
            <div className={clsx("flex-1 p-4 overflow-y-auto", pdfSrc ? "" : "w-full")}>

              {/* OCR button */}
              {tiketFile && (
                <div className="flex items-center gap-3 mb-4">
                  <button type="button" onClick={handleOcr} disabled={scanning}
                    className="rounded-lg bg-teal-900/40 border border-teal-700/50 hover:bg-teal-900/70 text-teal-400 text-xs py-1.5 px-4 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap">
                    {scanning ? "Scanning…" : "🔍 Scan AI (OCR)"}
                  </button>
                  {msg && (
                    <span className={clsx("text-[11px] flex-1", msg.ok ? "text-teal-400" : "text-red-400")}>
                      {msg.ok ? "✓" : "⚠"} {msg.text}
                    </span>
                  )}
                </div>
              )}

              <div className="space-y-4">
                {/* 1. Nama Kegiatan */}
                <div>
                  <label className={lbl}>Nama Kegiatan</label>
                  <select
                    value={useCustomTour ? "Lainnya" : (form.nama_tour || "")}
                    onChange={e => {
                      if (e.target.value === "Lainnya") {
                        setUseCustomTour(true);
                        setF("nama_tour", ""); // clear so user types their own
                      } else {
                        setUseCustomTour(false);
                        setF("nama_tour", e.target.value);
                      }
                    }}
                    className={clsx(inp, "cursor-pointer")}
                  >
                    <option value="">— Pilih kegiatan —</option>
                    {TOUR_OPTIONS.map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                  {useCustomTour && (
                    <input
                      autoFocus
                      value={form.nama_tour}
                      onChange={e => setF("nama_tour", e.target.value)}
                      placeholder="Tulis nama kegiatan..."
                      className={clsx(inp, "mt-2")}
                    />
                  )}
                </div>

                {/* 2. Tanggal */}
                <div>
                  <label className={lbl}>Tanggal Kegiatan</label>
                  <input type="date" value={form.tanggal}
                    onChange={e => setF("tanggal", e.target.value)}
                    className={inp} />
                </div>

                {/* 3. Harga Beli row */}
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className={lbl}>Harga Beli (Kurs)</label>
                    <FormattedInput value={form.harga_beli_kurs}
                      onChange={v => setF("harga_beli_kurs", v)}
                      placeholder="0" className={inp} />
                  </div>
                  <div>
                    <label className={lbl}>Kurs</label>
                    <FormattedInput value={form.kurs}
                      onChange={v => setF("kurs", v)}
                      placeholder="0" className={inp} />
                  </div>
                  <div>
                    <label className={lbl}>Harga Beli (IDR) <span className="text-neutral-600 normal-case">[auto]</span></label>
                    <FormattedInput value={form.harga_beli_idr}
                      onChange={v => setF("harga_beli_idr", v)}
                      placeholder="0" className={inp} />
                  </div>
                </div>

                {/* 4. Harga Jual row */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={lbl}>Harga Jual (Kurs)</label>
                    <FormattedInput value={form.harga_jual_kurs}
                      onChange={v => setF("harga_jual_kurs", v)}
                      placeholder="0" className={inp} />
                  </div>
                  <div>
                    <label className={lbl}>Harga Jual (IDR) <span className="text-neutral-600 normal-case">[auto]</span></label>
                    <FormattedInput value={form.harga_jual_idr}
                      onChange={v => setF("harga_jual_idr", v)}
                      placeholder="0" className={inp} />
                  </div>
                </div>

                {/* 5. Peserta multi-select */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className={lbl + " mb-0"}>Peserta ({form.peserta_ids.length} dipilih)</label>
                    {pesertaList.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          const allSelected = pesertaList.every(p => form.peserta_ids.includes(p.id));
                          setForm(f => ({
                            ...f,
                            peserta_ids: allSelected ? [] : pesertaList.map(p => p.id),
                          }));
                        }}
                        className="text-[10px] text-teal-500 hover:text-teal-300 cursor-pointer transition-colors"
                      >
                        {pesertaList.every(p => form.peserta_ids.includes(p.id)) ? "Hapus Semua" : "Pilih Semua"}
                      </button>
                    )}
                  </div>
                  {/* Search */}
                  <input
                    type="text"
                    value={pesertaSearch}
                    onChange={e => setPesertaSearch(e.target.value)}
                    placeholder="Cari nama peserta…"
                    className={clsx(inp, "mb-1 text-[11px]")}
                  />
                  <div className="max-h-48 overflow-y-auto rounded-lg border border-neutral-700 bg-neutral-900/60 divide-y divide-neutral-800/50">
                    {pesertaList.length === 0 && (
                      <p className="px-3 py-2 text-xs text-neutral-600">Belum ada peserta</p>
                    )}
                    {pesertaList
                      .filter(p => p.nama_lengkap.toLowerCase().includes(pesertaSearch.toLowerCase()))
                      .map(p => (
                      <label key={p.id}
                        className="flex items-center gap-2 px-3 py-1.5 hover:bg-white/[0.02] cursor-pointer">
                        <input type="checkbox"
                          checked={form.peserta_ids.includes(p.id)}
                          onChange={() => togglePeserta(p.id)}
                          className="rounded border-neutral-600 bg-neutral-800 text-teal-500 focus:ring-teal-500" />
                        <span className="text-xs text-neutral-200">
                          {p.title ? <span className="text-neutral-500 mr-1">{p.title}</span> : null}
                          {p.nama_lengkap}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* 6. Summary block */}
                <div className="rounded-lg border border-neutral-700 bg-neutral-900/40 px-4 py-3 grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <p className={lbl}>Total Pax</p>
                    <p className="text-sm font-medium text-neutral-100">{totalPax}</p>
                  </div>
                  <div>
                    <p className={lbl}>Total Harga Jual</p>
                    <p className="text-sm font-medium text-teal-400">{fmtCurrency(totalHargaJual)}</p>
                  </div>
                  <div>
                    <p className={lbl}>Total Harga Beli</p>
                    <p className="text-sm font-medium text-neutral-300">{fmtCurrency(totalHargaBeli)}</p>
                  </div>
                  <div>
                    <p className={lbl}>Laba</p>
                    <p className={clsx("text-sm font-medium", laba >= 0 ? "text-green-400" : "text-red-400")}>
                      {fmtCurrency(laba)}
                    </p>
                  </div>
                </div>

                {/* Kategori (optional) */}
                <div>
                  <label className={lbl}>Kategori (opsional)</label>
                  <input value={form.kategori}
                    onChange={e => setF("kategori", e.target.value)}
                    placeholder="e.g. Entertainment, Visa, dll"
                    className={inp} />
                </div>
              </div>

              {/* Error/info (non-OCR) */}
              {msg && !tiketFile && (
                <p className={clsx("text-[11px] mt-3", msg.ok ? "text-teal-400" : "text-red-400")}>
                  {msg.ok ? "✓" : "⚠"} {msg.text}
                </p>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-neutral-800">
                <Button size="sm" variant="ghost" onClick={resetForm}>Batal</Button>
                <Button size="sm" variant="primary" onClick={handleSave} loading={saving}>
                  {saving ? "Menyimpan…" : editId ? "Update" : "Simpan"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Message banner (outside form) */}
      {msg && !showForm && (
        <div className={clsx("mx-4 mt-3 px-3 py-2 rounded-lg text-xs",
          msg.ok ? "bg-teal-900/30 text-teal-400" : "bg-red-900/30 text-red-400")}>
          {msg.ok ? "✓" : "⚠"} {msg.text}
        </div>
      )}

      {/* ── Table ───────────────────────────────────────────────────────────── */}
      <div className="overflow-x-auto">
        {/* Hidden input for replace tiket */}
        <input ref={replaceRef} type="file" accept=".pdf,.jpg,.jpeg,.png,image/*,application/pdf"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0];
            if (f && replacingId) handleReplaceFile(replacingId, f);
            e.target.value = "";
          }} />

        <table className="w-full">
          <thead>
            <tr className="border-b border-neutral-800">
              {["No","Nama Kegiatan","Tanggal","Peserta","Harga Beli (Rp)","Harga Jual (Rp)","Total Pax","Laba","Tiket",""].map((col, i) => (
                <th key={i} className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-neutral-600 whitespace-nowrap">{col}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800/50">
            {list.length === 0 && (
              <tr><td colSpan={10} className="px-4 py-8 text-center text-xs text-neutral-600">Belum ada data tur opsional</td></tr>
            )}
            {list.map((item, i) => {
              const pax = item.peserta_ids?.length ?? 0;
              const jual = (item.harga_jual_idr ?? 0) * pax;
              const beli = (item.harga_beli_idr ?? 0) * pax;
              const itemLaba = jual - beli;
              return (
                <tr key={item.id} className="group hover:bg-white/[0.02] transition-colors">
                  <td className="px-3 py-2 text-xs text-neutral-500">{i + 1}</td>
                  <td className="px-3 py-2 text-xs font-medium text-neutral-100 whitespace-nowrap">{item.nama_tour}</td>
                  <td className="px-3 py-2 text-xs text-neutral-400 whitespace-nowrap">{fmtDate(item.tanggal)}</td>
                  <td className="px-3 py-2 text-xs text-neutral-400 max-w-[200px] truncate" title={item.peserta_names?.join(", ")}>
                    {item.peserta_names?.length ? item.peserta_names.join(", ") : "—"}
                  </td>
                  <td className="px-3 py-2 text-xs text-neutral-400 whitespace-nowrap">{fmtCurrency(item.harga_beli_idr)}</td>
                  <td className="px-3 py-2 text-xs text-teal-400 whitespace-nowrap">{fmtCurrency(item.harga_jual_idr)}</td>
                  <td className="px-3 py-2 text-xs text-neutral-400 text-center">{pax}</td>
                  <td className={clsx("px-3 py-2 text-xs whitespace-nowrap", itemLaba >= 0 ? "text-green-400" : "text-red-400")}>
                    {fmtCurrency(itemLaba)}
                  </td>
                  <td className="px-3 py-2">
                    {replacingLoading === item.id ? (
                      <span className="text-[10px] text-neutral-500 animate-pulse">Uploading…</span>
                    ) : item.tiket_drive_file_id ? (
                      <a href={`https://drive.google.com/file/d/${item.tiket_drive_file_id}/view`}
                        target="_blank" rel="noopener noreferrer"
                        className="text-[10px] text-teal-500 hover:text-teal-300 cursor-pointer" title="Lihat tiket">📄</a>
                    ) : (
                      <span className="text-[10px] text-neutral-700">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        disabled={replacingLoading === item.id}
                        onClick={() => {
                          setReplacingId(item.id ?? null);
                          replaceRef.current?.click();
                        }}
                        className="text-[10px] text-neutral-500 hover:text-teal-400 cursor-pointer whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
                        title="Ganti tiket">
                        {replacingLoading === item.id ? "Uploading…" : "↑ Tiket"}
                      </button>
                      <button onClick={() => startEdit(item)}
                        className="text-[10px] text-neutral-500 hover:text-teal-400 cursor-pointer">✏ Edit</button>
                      <button onClick={() => handleDelete(item.id!)}
                        className="text-[10px] text-neutral-500 hover:text-red-400 cursor-pointer">🗑 Hapus</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

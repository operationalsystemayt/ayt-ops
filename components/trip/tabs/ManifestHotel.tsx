"use client";
import { useState, useEffect, useRef } from "react";
import { hotelApi, pesertaApi } from "@/lib/trip/api";
import { Button } from "@/components/ui";
import type { ManifestHotel, ManifestPeserta } from "@/types/trip";
import { clsx } from "clsx";

const sel = "w-full rounded-lg bg-neutral-900 border border-neutral-700 px-2 py-1.5 text-xs text-neutral-100 focus:outline-none focus:border-teal-500 transition-colors";
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

// ── State types ────────────────────────────────────────────────────────────────

interface PesertaRow {
  _key: string;
  peserta_id: string;
}

interface ConfirmationGroup {
  _key: string;
  id?: string;
  confirmation_number: string;
  tgl_stay_mulai: string;
  tgl_stay_selesai: string;
  jumlah_room: string;
  tipe_room: string;
  harga_jpy: string;
  kurs: string;
  harga_idr: string;
  waktu_pembayaran: string;
  peserta_rows: PesertaRow[];
}

interface HotelGroup {
  _key: string;
  nama_hotel: string;
  nama_agent: string;
  confirmations: ConfirmationGroup[];
}

const newPesertaRow = (): PesertaRow => ({ _key: uid(), peserta_id: "" });

const newConfirmation = (): ConfirmationGroup => ({
  _key: uid(),
  confirmation_number: "",
  tgl_stay_mulai: "",
  tgl_stay_selesai: "",
  jumlah_room: "",
  tipe_room: "DOUBLE",
  harga_jpy: "",
  kurs: "",
  harga_idr: "",
  waktu_pembayaran: "",
  peserta_rows: [newPesertaRow()],
});

const newHotelGroup = (): HotelGroup => ({
  _key: uid(),
  nama_hotel: "",
  nama_agent: "",
  confirmations: [newConfirmation()],
});

interface Props { tripId: string; tripName: string; tglBerangkat: string; tglPulang: string }

export function ManifestHotel({ tripId }: Props) {
  const [list, setList]               = useState<ManifestHotel[]>([]);
  const [pesertaList, setPesertaList] = useState<ManifestPeserta[]>([]);
  const [loading, setLoading]         = useState(true);
  const [showForm, setShowForm]       = useState(false);

  // Form state
  const [rute, setRute]               = useState("");
  const [hotelGroups, setHotelGroups] = useState<HotelGroup[]>([newHotelGroup()]);

  // File / upload state
  const [notaFile, setNotaFile]           = useState<File | null>(null);
  const [localPdfUrl, setLocalPdfUrl]     = useState<string | null>(null);
  const [driveFileId, setDriveFileId]     = useState<string | null>(null);
  const [uploading, setUploading]         = useState(false);
  const [csvUploading, setCsvUploading]   = useState(false);

  // Action state
  const [saving, setSaving]   = useState(false);
  const [scanning, setScanning] = useState(false);
  const [msg, setMsg]         = useState<{ ok: boolean; text: string } | null>(null);

  const notaRef = useRef<HTMLInputElement>(null);

  const load = () =>
    hotelApi.list(tripId).then(setList).finally(() => setLoading(false));
  useEffect(() => {
    load();
    pesertaApi.list(tripId).then(setPesertaList);
  }, [tripId]);

  // ── Hotel group helpers ──────────────────────────────────────────────────────

  const setHotel = (hi: number, patch: Partial<HotelGroup>) =>
    setHotelGroups(hs => hs.map((h, i) => i === hi ? { ...h, ...patch } : h));

  const addHotelGroup = () => setHotelGroups(hs => [...hs, newHotelGroup()]);
  const removeHotelGroup = (hi: number) =>
    setHotelGroups(hs => hs.length > 1 ? hs.filter((_, i) => i !== hi) : hs);

  // ── Confirmation helpers ─────────────────────────────────────────────────────

  const setConf = (hi: number, ci: number, patch: Partial<ConfirmationGroup>) =>
    setHotelGroups(hs => hs.map((h, i) => i === hi
      ? { ...h, confirmations: h.confirmations.map((c, j) => j === ci ? { ...c, ...patch } : c) }
      : h));

  const addConf = (hi: number) =>
    setHotelGroups(hs => hs.map((h, i) => i === hi
      ? { ...h, confirmations: [...h.confirmations, newConfirmation()] }
      : h));

  const removeConf = (hi: number, ci: number) =>
    setHotelGroups(hs => hs.map((h, i) => i === hi
      ? { ...h, confirmations: h.confirmations.length > 1 ? h.confirmations.filter((_, j) => j !== ci) : h.confirmations }
      : h));

  // Auto-compute harga_idr when harga_jpy or kurs changes
  const handleConfChange = (hi: number, ci: number, field: keyof ConfirmationGroup, val: string) => {
    setHotelGroups(hs => hs.map((h, i) => {
      if (i !== hi) return h;
      return {
        ...h,
        confirmations: h.confirmations.map((c, j) => {
          if (j !== ci) return c;
          const updated = { ...c, [field]: val };
          // Auto-compute harga_idr
          if (field === "harga_jpy" || field === "kurs") {
            const jpy = parseFloat(field === "harga_jpy" ? val : c.harga_jpy) || 0;
            const kurs = parseFloat(field === "kurs" ? val : c.kurs) || 0;
            if (jpy > 0 && kurs > 0) {
              updated.harga_idr = String(Math.round(jpy * kurs));
            }
          }
          return updated;
        }),
      };
    }));
  };

  // ── Peserta row helpers ──────────────────────────────────────────────────────

  const addPesertaRow = (hi: number, ci: number) =>
    setHotelGroups(hs => hs.map((h, i) => i === hi
      ? {
          ...h,
          confirmations: h.confirmations.map((c, j) => j === ci
            ? { ...c, peserta_rows: [...c.peserta_rows, newPesertaRow()] }
            : c),
        }
      : h));

  const removePesertaRow = (hi: number, ci: number, ri: number) =>
    setHotelGroups(hs => hs.map((h, i) => i === hi
      ? {
          ...h,
          confirmations: h.confirmations.map((c, j) => j === ci
            ? { ...c, peserta_rows: c.peserta_rows.length > 1 ? c.peserta_rows.filter((_, k) => k !== ri) : c.peserta_rows }
            : c),
        }
      : h));

  const setPesertaRow = (hi: number, ci: number, ri: number, patch: Partial<PesertaRow>) =>
    setHotelGroups(hs => hs.map((h, i) => i === hi
      ? {
          ...h,
          confirmations: h.confirmations.map((c, j) => j === ci
            ? { ...c, peserta_rows: c.peserta_rows.map((r, k) => k === ri ? { ...r, ...patch } : r) }
            : c),
        }
      : h));

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
      const result = await hotelApi.ocrNota(tripId, fd);

      // Auto-fill hotel group from OCR result
      const confs: ConfirmationGroup[] = (result.confirmation_numbers ?? []).map(cn => ({
        ...newConfirmation(),
        confirmation_number: cn,
        tgl_stay_mulai: result.tgl_checkin ?? "",
        tgl_stay_selesai: result.tgl_checkout ?? "",
        jumlah_room: result.jumlah_room > 0 ? String(result.jumlah_room) : "",
        tipe_room: result.tipe_room || "DOUBLE",
        harga_jpy: result.harga_jpy > 0 ? String(result.harga_jpy) : "",
        kurs: result.kurs > 0 ? String(result.kurs) : "",
        harga_idr: result.harga_jpy > 0 && result.kurs > 0
          ? String(Math.round(result.harga_jpy * result.kurs))
          : "",
      }));

      if (confs.length === 0) {
        confs.push(newConfirmation());
      }

      setHotelGroups([{
        _key: uid(),
        nama_hotel: result.nama_hotel ?? "",
        nama_agent: "",
        confirmations: confs,
      }]);

      setMsg({ ok: true, text: `OCR selesai — hotel: ${result.nama_hotel}, ${(result.confirmation_numbers ?? []).length} konfirmasi ditemukan. Pilih peserta secara manual.` });
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
      // 1. Upload nota to Drive if new file
      let finalDriveId = driveFileId;
      if (notaFile && !driveFileId) {
        setUploading(true);
        const fd = new FormData();
        fd.append("file", notaFile);
        const res = await hotelApi.uploadNota(tripId, fd);
        finalDriveId = res.drive_file_id;
        setDriveFileId(finalDriveId);
        setUploading(false);
      }

      // 2. For each hotel group, for each confirmation, save one row
      for (const hotel of hotelGroups) {
        for (const conf of hotel.confirmations) {
          const pesertaIds = conf.peserta_rows
            .map(r => r.peserta_id)
            .filter(Boolean);

          const hargaJpy = parseFloat(conf.harga_jpy) || undefined;
          const kurs = parseFloat(conf.kurs) || undefined;
          const hargaIdr = parseFloat(conf.harga_idr) || (hargaJpy && kurs ? hargaJpy * kurs : undefined);

          const payload: Partial<ManifestHotel> = {
            rute: rute || undefined,
            nama_hotel: hotel.nama_hotel || undefined,
            nama_agent: hotel.nama_agent || undefined,
            confirmation_number: conf.confirmation_number || undefined,
            tgl_stay_mulai: conf.tgl_stay_mulai || undefined,
            tgl_stay_selesai: conf.tgl_stay_selesai || undefined,
            jumlah_room: conf.jumlah_room ? parseInt(conf.jumlah_room) : undefined,
            tipe_room: (conf.tipe_room as any) || undefined,
            harga_jpy: hargaJpy,
            kurs: kurs,
            harga_idr: hargaIdr,
            peserta_ids: pesertaIds,
            nota_drive_file_id: finalDriveId || undefined,
            waktu_pembayaran: conf.waktu_pembayaran || undefined,
          };

          if (conf.id) {
            await hotelApi.update(tripId, conf.id, payload);
          } else {
            await hotelApi.create(tripId, payload);
          }
        }
      }

      resetForm();
      load();
      setMsg({ ok: true, text: "Data hotel berhasil disimpan." });
    } catch (e: any) {
      setUploading(false);
      setMsg({ ok: false, text: e.message ?? "Gagal menyimpan" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Hapus data ini?")) return;
    await hotelApi.delete(tripId, id);
    load();
  };

  const resetForm = () => {
    if (localPdfUrl) URL.revokeObjectURL(localPdfUrl);
    setLocalPdfUrl(null);
    setNotaFile(null);
    setDriveFileId(null);
    setRute("");
    setHotelGroups([newHotelGroup()]);
    setShowForm(false);
  };

  // Start edit: pre-fill from an existing row
  const startEdit = (item: ManifestHotel) => {
    resetForm();
    setRute(item.rute ?? "");
    setHotelGroups([{
      _key: uid(),
      nama_hotel: item.nama_hotel ?? "",
      nama_agent: item.nama_agent ?? "",
      confirmations: [{
        ...newConfirmation(),
        id: item.id,
        confirmation_number: item.confirmation_number ?? "",
        tgl_stay_mulai: item.tgl_stay_mulai ?? "",
        tgl_stay_selesai: item.tgl_stay_selesai ?? "",
        jumlah_room: item.jumlah_room != null ? String(item.jumlah_room) : "",
        tipe_room: item.tipe_room ?? "DOUBLE",
        harga_jpy: item.harga_jpy != null ? String(item.harga_jpy) : "",
        kurs: item.kurs != null ? String(item.kurs) : "",
        harga_idr: item.harga_idr != null ? String(item.harga_idr) : "",
        waktu_pembayaran: item.waktu_pembayaran ?? "",
        peserta_rows: item.peserta_ids.length > 0
          ? item.peserta_ids.map(pid => ({ _key: uid(), peserta_id: pid }))
          : [newPesertaRow()],
      }],
    }]);
    if (item.nota_drive_file_id) setDriveFileId(item.nota_drive_file_id);
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
        <span className="text-xs text-neutral-400">{list.length} hotel</span>
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
            {showForm ? "Tutup form" : "+ Tambah manual"}
          </Button>
          <button
            onClick={async () => {
              try { await hotelApi.exportCsv(tripId); }
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
                const res = await hotelApi.uploadCsvToDrive(tripId);
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

      {/* ── Upload + Form Panel ───────────────────────────────────────────────── */}
      {showForm && (
        <div className="border-b border-neutral-800 bg-neutral-950/40">
          <div className="flex flex-col md:flex-row">
            {/* LEFT: PDF preview */}
            {pdfSrc && (
              <div className="w-full md:w-[45%] flex-shrink-0 p-4">
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
                    {scanning ? "Scanning…" : "🔍 Scan AI (OCR) — auto-isi data hotel"}
                  </button>
                  {msg && (
                    <span className={clsx("text-[11px] flex-1", msg.ok ? "text-teal-400" : "text-red-400")}>
                      {msg.ok ? "✓" : "⚠"} {msg.text}
                    </span>
                  )}
                </div>
              )}

              {/* Rute (shared across all hotels) */}
              <div className="mb-4">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500 mb-2">Rute / Kota</p>
                <div className="w-48">
                  <label className={lbl}>Rute</label>
                  <input
                    value={rute}
                    onChange={e => setRute(e.target.value)}
                    placeholder="OSAKA, TOKYO, ..."
                    className={inp}
                  />
                </div>
              </div>

              {/* Hotel groups */}
              <div className="space-y-4">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">Hotel & Konfirmasi</p>

                {hotelGroups.map((hotel, hi) => (
                  <div key={hotel._key} className="rounded-xl border border-neutral-700 bg-neutral-900/60 overflow-hidden">
                    {/* Hotel header */}
                    <div className="px-3 py-2 bg-neutral-800/40 flex items-center gap-3 flex-wrap">
                      <span className="text-[10px] text-neutral-500 uppercase tracking-wide whitespace-nowrap">Hotel #{hi + 1}</span>
                      <div className="flex-1 min-w-[160px]">
                        <input
                          value={hotel.nama_hotel}
                          onChange={e => setHotel(hi, { nama_hotel: e.target.value })}
                          placeholder="Nama hotel"
                          className={inp}
                        />
                      </div>
                      <div className="w-40">
                        <input
                          value={hotel.nama_agent}
                          onChange={e => setHotel(hi, { nama_agent: e.target.value })}
                          placeholder="Nama agent / platform"
                          className={inp}
                        />
                      </div>
                      {hotelGroups.length > 1 && (
                        <button
                          onClick={() => removeHotelGroup(hi)}
                          className="ml-auto text-neutral-600 hover:text-red-400 text-sm cursor-pointer px-1"
                        >
                          ×
                        </button>
                      )}
                    </div>

                    {/* Confirmations */}
                    <div className="divide-y divide-neutral-800/60">
                      {hotel.confirmations.map((conf, ci) => (
                        <div key={conf._key} className="p-3">
                          {/* Conf header row */}
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <span className="text-[10px] text-neutral-600 whitespace-nowrap">Conf #{ci + 1}</span>
                            <div className="w-36">
                              <label className={lbl}>Conf Number</label>
                              <input
                                value={conf.confirmation_number}
                                onChange={e => setConf(hi, ci, { confirmation_number: e.target.value })}
                                placeholder="5653908643"
                                className={clsx(inp, "font-mono")}
                              />
                            </div>
                            <div className="w-32">
                              <label className={lbl}>Check-in</label>
                              <input
                                type="date"
                                value={conf.tgl_stay_mulai}
                                onChange={e => setConf(hi, ci, { tgl_stay_mulai: e.target.value })}
                                className={inp}
                              />
                            </div>
                            <div className="w-32">
                              <label className={lbl}>Check-out</label>
                              <input
                                type="date"
                                value={conf.tgl_stay_selesai}
                                onChange={e => setConf(hi, ci, { tgl_stay_selesai: e.target.value })}
                                className={inp}
                              />
                            </div>
                            <div className="w-16">
                              <label className={lbl}>Jml Room</label>
                              <input
                                type="number"
                                value={conf.jumlah_room}
                                onChange={e => setConf(hi, ci, { jumlah_room: e.target.value })}
                                placeholder="1"
                                className={inp}
                              />
                            </div>
                            <div className="w-24">
                              <label className={lbl}>Tipe Room</label>
                              <select
                                value={conf.tipe_room}
                                onChange={e => setConf(hi, ci, { tipe_room: e.target.value })}
                                className={sel}
                              >
                                <option value="DOUBLE">DOUBLE</option>
                                <option value="TWIN">TWIN</option>
                                <option value="SINGLE">SINGLE</option>
                                <option value="TRIPLE">TRIPLE</option>
                              </select>
                            </div>
                            {hotel.confirmations.length > 1 && (
                              <button
                                onClick={() => removeConf(hi, ci)}
                                className="ml-auto text-neutral-600 hover:text-red-400 text-sm cursor-pointer px-1 mt-3"
                              >
                                ×
                              </button>
                            )}
                          </div>

                          {/* Pricing row */}
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <div className="w-32">
                              <label className={lbl}>Harga JPY (¥)</label>
                              <input
                                type="number"
                                value={conf.harga_jpy}
                                onChange={e => handleConfChange(hi, ci, "harga_jpy", e.target.value)}
                                placeholder="129000"
                                className={inp}
                              />
                            </div>
                            <div className="w-24">
                              <label className={lbl}>Kurs</label>
                              <input
                                type="number"
                                value={conf.kurs}
                                onChange={e => handleConfChange(hi, ci, "kurs", e.target.value)}
                                placeholder="108.5"
                                className={inp}
                              />
                            </div>
                            <div className="w-36">
                              <label className={lbl}>Harga IDR (auto)</label>
                              <input
                                type="number"
                                value={conf.harga_idr}
                                onChange={e => setConf(hi, ci, { harga_idr: e.target.value })}
                                placeholder="auto"
                                className={inp}
                              />
                            </div>
                            <div className="w-36">
                              <label className={lbl}>Waktu Bayar</label>
                              <input
                                type="date"
                                value={conf.waktu_pembayaran}
                                onChange={e => setConf(hi, ci, { waktu_pembayaran: e.target.value })}
                                className={inp}
                              />
                            </div>
                          </div>

                          {/* Peserta rows */}
                          <div className="space-y-1 mb-2">
                            <p className="text-[10px] text-neutral-600 uppercase tracking-wide">Peserta</p>
                            {conf.peserta_rows.map((row, ri) => (
                              <div key={row._key} className="flex items-center gap-2">
                                <div className="flex-1 min-w-[160px]">
                                  <select
                                    value={row.peserta_id}
                                    onChange={e => setPesertaRow(hi, ci, ri, { peserta_id: e.target.value })}
                                    className={sel}
                                  >
                                    <option value="">— Pilih peserta —</option>
                                    {pesertaList.map(pp => (
                                      <option key={pp.id} value={pp.id}>
                                        {pp.title ? `${pp.title} ` : ""}{pp.nama_lengkap}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                {conf.peserta_rows.length > 1 && (
                                  <button
                                    onClick={() => removePesertaRow(hi, ci, ri)}
                                    className="text-neutral-600 hover:text-red-400 text-sm cursor-pointer px-1"
                                  >
                                    ×
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                          <button
                            onClick={() => addPesertaRow(hi, ci)}
                            className="text-[10px] text-neutral-500 hover:text-teal-400 cursor-pointer transition-colors"
                          >
                            + peserta
                          </button>
                        </div>
                      ))}
                    </div>

                    {/* Add confirmation */}
                    <div className="px-3 py-2 border-t border-neutral-800/60">
                      <button
                        onClick={() => addConf(hi)}
                        className="text-[10px] text-neutral-500 hover:text-teal-400 cursor-pointer transition-colors"
                      >
                        + Tambah Confirmation
                      </button>
                    </div>
                  </div>
                ))}

                <button
                  onClick={addHotelGroup}
                  className="w-full text-xs text-neutral-500 hover:text-teal-400 border border-dashed border-neutral-700 hover:border-teal-600 rounded-lg py-2 transition-colors cursor-pointer"
                >
                  + Tambah Hotel Baru
                </button>
              </div>

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
        <table className="w-full">
          <thead>
            <tr className="border-b border-neutral-800">
              {["RUTE","NAMA HOTEL","AGENT","CONF NO","TGL STAY","JML ROOM","TIPE","NAMA TAMU","JPY","RUPIAH","TOTAL","WAKTU BAYAR","KURS",""].map((col, i) => (
                <th key={i} className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-neutral-600 whitespace-nowrap">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800/50">
            {list.length === 0 && (
              <tr>
                <td colSpan={14} className="px-4 py-8 text-center text-xs text-neutral-600">
                  Belum ada data hotel
                </td>
              </tr>
            )}
            {list.map((item) => (
              <tr key={item.id} className="group hover:bg-white/[0.02] transition-colors">
                <td className="px-3 py-2 text-xs text-neutral-400 whitespace-nowrap">{item.rute ?? "—"}</td>
                <td className="px-3 py-2 text-xs font-medium text-neutral-100 whitespace-nowrap">{item.nama_hotel ?? "—"}</td>
                <td className="px-3 py-2 text-xs text-neutral-400">{item.nama_agent ?? "—"}</td>
                <td className="px-3 py-2 text-xs font-mono text-neutral-300">{item.confirmation_number ?? "—"}</td>
                <td className="px-3 py-2 text-xs text-neutral-400 whitespace-nowrap">
                  {item.tgl_stay_mulai ? `${fmtDate(item.tgl_stay_mulai)} - ${fmtDate(item.tgl_stay_selesai)}` : "—"}
                </td>
                <td className="px-3 py-2 text-xs text-neutral-400">{item.jumlah_room ?? "—"}</td>
                <td className="px-3 py-2 text-xs text-neutral-400">{item.tipe_room ?? "—"}</td>
                <td className="px-3 py-2 text-xs text-neutral-300 max-w-[160px] truncate" title={(item.peserta_names ?? []).join(", ")}>
                  {(item.peserta_names ?? []).join(", ") || "—"}
                </td>
                <td className="px-3 py-2 text-xs text-neutral-400 whitespace-nowrap">{fmtJpy(item.harga_jpy)}</td>
                <td className="px-3 py-2 text-xs text-teal-400 whitespace-nowrap">{fmtIdr(item.harga_idr)}</td>
                <td className="px-3 py-2 text-xs text-teal-300 whitespace-nowrap font-medium">{fmtIdr(item.total_idr)}</td>
                <td className="px-3 py-2 text-xs text-neutral-400 whitespace-nowrap">{fmtDate(item.waktu_pembayaran)}</td>
                <td className="px-3 py-2 text-xs text-neutral-500">{item.kurs ?? "—"}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    {item.nota_drive_file_id && (
                      <a
                        href={`https://drive.google.com/file/d/${item.nota_drive_file_id}/view`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-teal-500 hover:text-teal-300 cursor-pointer"
                        title="Lihat nota"
                      >
                        📄
                      </a>
                    )}
                    <button
                      onClick={() => startEdit(item)}
                      className="text-[10px] text-neutral-500 hover:text-teal-400 cursor-pointer"
                    >
                      edit
                    </button>
                    <button
                      onClick={() => handleDelete(item.id!)}
                      className="text-[10px] text-neutral-500 hover:text-red-400 cursor-pointer"
                    >
                      hapus
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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

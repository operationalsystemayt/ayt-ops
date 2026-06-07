"use client";
import { useState, useEffect, useRef } from "react";
import { keberangkatanApi, pesertaApi } from "@/lib/trip/api";
import { Button, FormattedInput } from "@/components/ui";
import { calcAge } from "@/types/trip";
import type { ManifestKeberangkatan, ManifestPeserta } from "@/types/trip";
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
function fmtCurrency(n?: number | null) {
  if (n == null) return "—";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);
}

// ── Local state types ──────────────────────────────────────────────────────────
interface PesertaRow {
  _key: string;
  id?: string;         // existing DB id (edit mode)
  no_etiket: string;
  peserta_id: string;
}

// Booking group only holds kode_booking + peserta rows.
// tgl_pemesanan, pemesanan, agent, limit_pembayaran, harga_tiket, klien
// are now shared at the FlightInfo level.
interface BookingGroupForm {
  _key: string;
  kode_booking: string;
  unit: string;
  rows: PesertaRow[];
}

interface FlightInfoForm {
  // Flight
  maskapai: string;
  rute_berangkat: string;
  tgl_berangkat_flight: string;
  jam_berangkat: string;
  rute_pulang: string;
  tgl_pulang_flight: string;
  jam_pulang: string;
  bagasi_kabin_kg: string;
  bagasi_checkin_kg: string;
  // Booking / pemesanan (shared across all groups in one upload)
  tgl_pemesanan: string;
  limit_pembayaran: string;
  pemesanan: string;
  agent: string;
  harga_tiket: string;
  klien: string;
}

function uid() { return Math.random().toString(36).slice(2, 10); }
const blankFlight = (): FlightInfoForm => ({
  maskapai: "", rute_berangkat: "", tgl_berangkat_flight: "", jam_berangkat: "",
  rute_pulang: "", tgl_pulang_flight: "", jam_pulang: "",
  bagasi_kabin_kg: "", bagasi_checkin_kg: "",
  tgl_pemesanan: "", limit_pembayaran: "", pemesanan: "", agent: "", harga_tiket: "", klien: "",
});
const newRow = (): PesertaRow => ({ _key: uid(), no_etiket: "", peserta_id: "" });
const newGroup = (): BookingGroupForm => ({ _key: uid(), kode_booking: "", unit: "", rows: [newRow()] });

// ── Name matching ──────────────────────────────────────────────────────────────
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

interface Props { tripId: string; tripName: string; tglBerangkat: string; tglPulang: string }

export function ManifestKeberangkatan({ tripId }: Props) {
  const [list, setList]           = useState<ManifestKeberangkatan[]>([]);
  const [pesertaList, setPesertaList] = useState<ManifestPeserta[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]   = useState(false);

  // Form state
  const [flight, setFlight]       = useState<FlightInfoForm>(blankFlight());
  const [groups, setGroups]       = useState<BookingGroupForm[]>([newGroup()]);

  // PDF / upload state
  const [tiketFile, setTiketFile]     = useState<File | null>(null);
  const [localPdfUrl, setLocalPdfUrl] = useState<string | null>(null);
  const [driveFileId, setDriveFileId] = useState<string | null>(null);
  const [uploading, setUploading]     = useState(false);
  const [csvUploading, setCsvUploading] = useState(false);

  // Action state
  const [saving, setSaving]       = useState(false);
  const [scanning, setScanning]   = useState(false);
  const [msg, setMsg]             = useState<{ ok: boolean; text: string } | null>(null);

  const tiketRef = useRef<HTMLInputElement>(null);

  const load = () => keberangkatanApi.list(tripId).then(setList).finally(() => setLoading(false));
  useEffect(() => { load(); pesertaApi.list(tripId).then(setPesertaList); }, [tripId]);

  // ── Flight helpers ───────────────────────────────────────────────────────────
  const setF = (k: keyof FlightInfoForm) => (v: string) =>
    setFlight(f => ({ ...f, [k]: v }));

  const flightPayload = () => ({
    maskapai:             flight.maskapai             || undefined,
    rute_berangkat:       flight.rute_berangkat       || undefined,
    tgl_berangkat_flight: flight.tgl_berangkat_flight || undefined,
    jam_berangkat:        flight.jam_berangkat        || undefined,
    rute_pulang:          flight.rute_pulang          || undefined,
    tgl_pulang_flight:    flight.tgl_pulang_flight    || undefined,
    jam_pulang:           flight.jam_pulang           || undefined,
    bagasi_kabin_kg:      flight.bagasi_kabin_kg   ? parseFloat(flight.bagasi_kabin_kg)   : undefined,
    bagasi_checkin_kg:    flight.bagasi_checkin_kg ? parseFloat(flight.bagasi_checkin_kg) : undefined,
    // Pemesanan fields (shared)
    tgl_pemesanan:        flight.tgl_pemesanan    || undefined,
    limit_pembayaran:     flight.limit_pembayaran || undefined,
    pemesanan:            flight.pemesanan        || undefined,
    agent:                flight.agent            || undefined,
    harga_tiket:          flight.harga_tiket      ? parseFloat(flight.harga_tiket) : undefined,
    klien:                flight.klien            || undefined,
  });

  // ── Group helpers ────────────────────────────────────────────────────────────
  const setGroup = (gi: number, patch: Partial<BookingGroupForm>) =>
    setGroups(gs => gs.map((g, i) => i === gi ? { ...g, ...patch } : g));

  const addGroup = () => setGroups(gs => [...gs, newGroup()]);
  const removeGroup = (gi: number) =>
    setGroups(gs => gs.length > 1 ? gs.filter((_, i) => i !== gi) : gs);

  const addRow = (gi: number) =>
    setGroups(gs => gs.map((g, i) => i === gi ? { ...g, rows: [...g.rows, newRow()] } : g));
  const removeRow = (gi: number, ri: number) =>
    setGroups(gs => gs.map((g, i) => i === gi
      ? { ...g, rows: g.rows.length > 1 ? g.rows.filter((_, j) => j !== ri) : g.rows }
      : g));
  const setRow = (gi: number, ri: number, patch: Partial<PesertaRow>) =>
    setGroups(gs => gs.map((g, i) => i === gi
      ? { ...g, rows: g.rows.map((r, j) => j === ri ? { ...r, ...patch } : r) }
      : g));

  // ── Select ticket file ───────────────────────────────────────────────────────
  const handleSelectTiket = (file: File) => {
    if (localPdfUrl) URL.revokeObjectURL(localPdfUrl);
    setTiketFile(file);
    setLocalPdfUrl(URL.createObjectURL(file));
    setDriveFileId(null);
    setFlight(blankFlight());
    setGroups([newGroup()]);
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
      const result = await keberangkatanApi.ocrTiket(tripId, fd);

      // Fill flight info (pemesanan fields kept as-is from user input)
      setFlight(f => ({
        ...f,
        maskapai:             result.maskapai          || f.maskapai,
        rute_berangkat:       result.rute_berangkat    || f.rute_berangkat,
        tgl_berangkat_flight: result.tgl_berangkat     || f.tgl_berangkat_flight,
        jam_berangkat:        result.jam_berangkat     || f.jam_berangkat,
        rute_pulang:          result.rute_pulang       || f.rute_pulang,
        tgl_pulang_flight:    result.tgl_pulang        || f.tgl_pulang_flight,
        jam_pulang:           result.jam_pulang        || f.jam_pulang,
        bagasi_kabin_kg:      result.bagasi_kabin_kg   > 0 ? String(result.bagasi_kabin_kg)   : f.bagasi_kabin_kg,
        bagasi_checkin_kg:    result.bagasi_checkin_kg > 0 ? String(result.bagasi_checkin_kg) : f.bagasi_checkin_kg,
      }));

      // Build booking groups from OCR
      const ocrGroups = result.booking_groups ?? [];
      if (ocrGroups.length > 0) {
        setGroups(ocrGroups.map(bg => ({
          _key: uid(),
          kode_booking: bg.kode_booking,
          unit: String(bg.peserta.length),
          rows: bg.peserta.map(p => ({
            _key: uid(),
            no_etiket: p.no_etiket,
            peserta_id: matchPesertaName(p.nama, pesertaList),
          })),
        })));
      }

      const totalPax = ocrGroups.reduce((s, g) => s + g.peserta.length, 0);
      setMsg({ ok: true, text: `OCR selesai — ${ocrGroups.length} kode booking, ${totalPax} peserta ditemukan. Periksa data sebelum simpan.` });
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
      // 1. Upload PDF to Drive if new file
      let finalDriveId = driveFileId;
      if (tiketFile && !driveFileId) {
        setUploading(true);
        const fd = new FormData();
        fd.append("file", tiketFile);
        const res = await keberangkatanApi.uploadTiket(tripId, fd);
        finalDriveId = res.drive_file_id;
        setDriveFileId(finalDriveId);
        setUploading(false);
      }

      // 2. Save each row — booking/pemesanan fields come from flight (shared level)
      const sharedPayload: Partial<ManifestKeberangkatan> = {
        ...flightPayload(),
        tiket_drive_file_id: finalDriveId || undefined,
      };
      for (const group of groups) {
        for (const row of group.rows) {
          const payload: Partial<ManifestKeberangkatan> = {
            ...sharedPayload,
            kode_booking: group.kode_booking || undefined,
            unit:         group.unit ? parseInt(group.unit) : group.rows.length,
            peserta_id:   row.peserta_id || undefined,
            no_etiket:    row.no_etiket  || undefined,
          };
          if (row.id) {
            await keberangkatanApi.update(tripId, row.id, payload);
          } else {
            await keberangkatanApi.create(tripId, payload);
          }
        }
      }

      resetForm();
      load();
    } catch (e: any) {
      setUploading(false);
      setMsg({ ok: false, text: e.message ?? "Gagal menyimpan" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Hapus data ini?")) return;
    await keberangkatanApi.delete(tripId, id);
    load();
  };

  const resetForm = () => {
    if (localPdfUrl) URL.revokeObjectURL(localPdfUrl);
    setLocalPdfUrl(null);
    setTiketFile(null);
    setDriveFileId(null);
    setFlight(blankFlight());
    setGroups([newGroup()]);
    setMsg(null);
    setShowForm(false);
  };

  // Start edit: pre-fill from a single existing row
  const startEdit = (k: ManifestKeberangkatan) => {
    resetForm();
    setFlight({
      maskapai:             k.maskapai             ?? "",
      rute_berangkat:       k.rute_berangkat       ?? "",
      tgl_berangkat_flight: k.tgl_berangkat_flight ?? "",
      jam_berangkat:        k.jam_berangkat        ?? "",
      rute_pulang:          k.rute_pulang          ?? "",
      tgl_pulang_flight:    k.tgl_pulang_flight    ?? "",
      jam_pulang:           k.jam_pulang           ?? "",
      bagasi_kabin_kg:      k.bagasi_kabin_kg   != null ? String(k.bagasi_kabin_kg)   : "",
      bagasi_checkin_kg:    k.bagasi_checkin_kg != null ? String(k.bagasi_checkin_kg) : "",
      tgl_pemesanan:        k.tgl_pemesanan    ?? "",
      limit_pembayaran:     k.limit_pembayaran ?? "",
      pemesanan:            k.pemesanan        ?? "",
      agent:                k.agent            ?? "",
      harga_tiket:          k.harga_tiket != null ? String(k.harga_tiket) : "",
      klien:                k.klien            ?? "",
    });
    setGroups([{
      _key: uid(),
      kode_booking: k.kode_booking ?? "",
      unit: k.unit != null ? String(k.unit) : "",
      rows: [{ _key: uid(), id: k.id, no_etiket: k.no_etiket ?? "", peserta_id: k.peserta_id ?? "" }],
    }]);
    if (k.tiket_drive_file_id) setDriveFileId(k.tiket_drive_file_id);
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
        <span className="text-xs text-neutral-400">{list.length} tiket</span>
        <span className="text-xs text-neutral-400">Total harga tiket: {fmtCurrency(list.reduce((sum, k) => sum + (k.harga_tiket ?? 0) / Math.max(k.unit ?? 1, 1), 0))}</span>
        <span className="text-xs text-neutral-400">Rata rata per pax: {fmtCurrency(list.reduce((sum, k) => sum + (k.harga_tiket ?? 0) / Math.max(k.unit ?? 1, 1), 0)/list.length)}</span>
        <div className="flex items-center gap-2 flex-wrap">
          <input ref={tiketRef} type="file" accept=".pdf,application/pdf" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleSelectTiket(f); e.target.value = ""; }} />
          <button onClick={() => tiketRef.current?.click()} disabled={uploading}
            className="rounded-lg border border-neutral-700 hover:border-teal-500 hover:text-teal-400 text-neutral-400 text-xs py-1.5 px-3 transition-colors cursor-pointer disabled:opacity-40 whitespace-nowrap">
            {uploading ? "Uploading…" : tiketFile && !driveFileId ? `📄 ${tiketFile.name}` : "↑ Upload Tiket"}
          </button>
          <Button size="sm" variant="outline" onClick={() => {
            if (showForm) { resetForm(); }
            else { resetForm(); setShowForm(true); }
          }}>
            {showForm ? "Tutup form" : "+ Tambah manual"}
          </Button>
          <button onClick={async () => { try { await keberangkatanApi.exportCsv(tripId); } catch (e: any) { setMsg({ ok: false, text: e.message }); } }}
            disabled={list.length === 0}
            className="rounded-lg border border-neutral-700 hover:border-teal-500 hover:text-teal-400 text-neutral-400 text-xs py-1.5 px-3 transition-colors cursor-pointer disabled:opacity-40 whitespace-nowrap">
            ↓ Export CSV
          </button>
          <button
            onClick={async () => {
              setCsvUploading(true);
              setMsg(null);
              try {
                const res = await keberangkatanApi.uploadCsvToDrive(tripId);
                setMsg({ ok: true, text: `CSV terupload ke Drive: ${res.file_name}` });
              } catch (e: any) {
                setMsg({ ok: false, text: e.message ?? "Upload CSV gagal" });
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

      {/* ── Upload+Form Panel ────────────────────────────────────────────────── */}
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
                    {scanning ? "Scanning…" : "🔍 Scan AI (OCR) — auto-isi semua data"}
                  </button>
                  {msg && (
                    <span className={clsx("text-[11px] flex-1", msg.ok ? "text-teal-400" : "text-red-400")}>
                      {msg.ok ? "✓" : "⚠"} {msg.text}
                    </span>
                  )}
                </div>
              )}

              {/* Flight + Pemesanan info (shared) */}
              <div className="mb-4 space-y-3">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">Info Penerbangan & Pemesanan</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div className="col-span-2 md:col-span-1">
                    <label className={lbl}>Maskapai</label>
                    <input value={flight.maskapai} onChange={e => setF("maskapai")(e.target.value)} placeholder="Philippine Airlines" className={inp} />
                  </div>
                  <div>
                    <label className={lbl}>Rute Berangkat</label>
                    <input value={flight.rute_berangkat} onChange={e => setF("rute_berangkat")(e.target.value)} placeholder="CGK-MNL-KIX" className={inp} />
                  </div>
                  <div>
                    <label className={lbl}>Tgl Berangkat</label>
                    <input type="date" value={flight.tgl_berangkat_flight} onChange={e => setF("tgl_berangkat_flight")(e.target.value)} className={inp} />
                  </div>
                  <div>
                    <label className={lbl}>Jam Berangkat</label>
                    <input type="time" value={flight.jam_berangkat} onChange={e => setF("jam_berangkat")(e.target.value)} className={inp} />
                  </div>
                  <div>
                    <label className={lbl}>Rute Pulang</label>
                    <input value={flight.rute_pulang} onChange={e => setF("rute_pulang")(e.target.value)} placeholder="NRT-MNL-CGK" className={inp} />
                  </div>
                  <div>
                    <label className={lbl}>Tgl Pulang</label>
                    <input type="date" value={flight.tgl_pulang_flight} onChange={e => setF("tgl_pulang_flight")(e.target.value)} className={inp} />
                  </div>
                  <div>
                    <label className={lbl}>Jam Pulang</label>
                    <input type="time" value={flight.jam_pulang} onChange={e => setF("jam_pulang")(e.target.value)} className={inp} />
                  </div>
                  <div>
                    <label className={lbl}>Bagasi Kabin (kg)</label>
                    <FormattedInput value={flight.bagasi_kabin_kg} onChange={setF("bagasi_kabin_kg")} placeholder="7" className={inp} />
                  </div>
                  <div>
                    <label className={lbl}>Bagasi Check-in (kg)</label>
                    <FormattedInput value={flight.bagasi_checkin_kg} onChange={setF("bagasi_checkin_kg")} placeholder="30" className={inp} />
                  </div>

                  {/* Pemesanan fields — shared across all kode booking */}
                  <div>
                    <label className={lbl}>Tgl Pemesanan</label>
                    <input type="date" value={flight.tgl_pemesanan} onChange={e => setF("tgl_pemesanan")(e.target.value)} className={inp} />
                  </div>
                  <div>
                    <label className={lbl}>Deadline Pembayaran</label>
                    <input type="date" value={flight.limit_pembayaran} onChange={e => setF("limit_pembayaran")(e.target.value)} className={inp} />
                  </div>
                  <div>
                    <label className={lbl}>Pemesan</label>
                    <input value={flight.pemesanan} onChange={e => setF("pemesanan")(e.target.value)} placeholder="nama pemesan" className={inp} />
                  </div>
                  <div>
                    <label className={lbl}>Agent</label>
                    <input value={flight.agent} onChange={e => setF("agent")(e.target.value)} placeholder="nama agen" className={inp} />
                  </div>
                  <div>
                    <label className={lbl}>Harga Tiket (Rp)</label>
                    <FormattedInput value={flight.harga_tiket} onChange={setF("harga_tiket")} placeholder="0" className={inp} />
                  </div>
                  <div>
                    <label className={lbl}>Klien</label>
                    <input value={flight.klien} onChange={e => setF("klien")(e.target.value)} className={inp} />
                  </div>
                </div>
              </div>

              {/* Booking groups */}
              <div className="space-y-4">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">Kode Booking & Peserta</p>

                {groups.map((group, gi) => (
                  <div key={group._key} className="rounded-xl border border-neutral-700 bg-neutral-900/60 overflow-hidden">
                    {/* Group header — only kode_booking */}
                    <div className="px-3 py-2 bg-neutral-800/40 flex items-center gap-3">
                      <span className="text-[10px] text-neutral-500 uppercase tracking-wide whitespace-nowrap">Kode Booking #{gi + 1}</span>
                      <input value={group.kode_booking}
                        onChange={e => setGroup(gi, { kode_booking: e.target.value })}
                        placeholder="PNR / kode booking"
                        className={clsx(inp, "w-36 font-mono")} />
                      <div className="flex items-center gap-1">
                        <label className="text-[10px] text-neutral-500 whitespace-nowrap">Unit</label>
                        <FormattedInput
                          value={group.unit}
                          onChange={v => setGroup(gi, { unit: v })}
                          placeholder={String(group.rows.length)}
                          className={clsx(inp, "w-16")}
                        />
                      </div>
                      <span className="text-[10px] text-neutral-600">{group.rows.length} peserta</span>
                      {groups.length > 1 && (
                        <button onClick={() => removeGroup(gi)}
                          className="ml-auto text-neutral-600 hover:text-red-400 text-sm cursor-pointer px-1">×</button>
                      )}
                    </div>

                    {/* Peserta rows */}
                    <div className="divide-y divide-neutral-800/60">
                      {group.rows.map((row, ri) => {
                        const p = pesertaList.find(x => x.id === row.peserta_id);
                        return (
                          <div key={row._key} className="px-3 py-2 flex items-center gap-2 flex-wrap">
                            {/* E-tiket */}
                            <div className="w-40">
                              <label className={lbl}>E-Tiket</label>
                              <input value={row.no_etiket}
                                onChange={e => setRow(gi, ri, { no_etiket: e.target.value })}
                                placeholder="079-xxx/yy"
                                className={clsx(inp, "font-mono")} />
                            </div>

                            {/* Peserta dropdown */}
                            <div className="flex-1 min-w-[180px]">
                              <label className={lbl}>Peserta</label>
                              <select value={row.peserta_id}
                                onChange={e => setRow(gi, ri, { peserta_id: e.target.value })}
                                className={sel}>
                                <option value="">— Pilih peserta —</option>
                                {pesertaList.map(pp => (
                                  <option key={pp.id} value={pp.id}>
                                    {pp.title ? `${pp.title} ` : ""}{pp.nama_lengkap}
                                  </option>
                                ))}
                              </select>
                            </div>

                            {/* Passport info chip */}
                            {p && (
                              <div className="text-[10px] text-neutral-500 whitespace-nowrap hidden lg:flex gap-2">
                                <span>{p.no_paspor}</span>
                                <span>{p.tgl_lahir ? calcAge(p.tgl_lahir) + "y" : ""}</span>
                                <span className={clsx(
                                  p.expiry_date && new Date(p.expiry_date) < new Date(Date.now() + 180*86400000)
                                    ? "text-amber-500" : ""
                                )}>exp:{fmtDate(p.expiry_date)}</span>
                              </div>
                            )}

                            {/* Delete row */}
                            {group.rows.length > 1 && (
                              <button onClick={() => removeRow(gi, ri)}
                                className="text-neutral-600 hover:text-red-400 text-sm cursor-pointer mt-3 px-1">×</button>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Add row */}
                    <div className="px-3 py-2">
                      <button onClick={() => addRow(gi)}
                        className="text-[10px] text-neutral-500 hover:text-teal-400 cursor-pointer transition-colors">
                        + Tambah peserta ke group ini
                      </button>
                    </div>
                  </div>
                ))}

                <button onClick={addGroup}
                  className="w-full text-xs text-neutral-500 hover:text-teal-400 border border-dashed border-neutral-700 hover:border-teal-600 rounded-lg py-2 transition-colors cursor-pointer">
                  + Tambah kode booking baru
                </button>
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
              {["No","Tgl Pesan","Pemesan","Agent","Limit Bayar","Harga Tiket",
                "Kode Booking","Unit","E-Tiket No","Title","Nama","Klien",""].map((h, i) => (
                <th key={i} className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-neutral-600 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800/50">
            {list.length === 0 && (
              <tr><td colSpan={13} className="px-4 py-8 text-center text-xs text-neutral-600">Belum ada data tiket</td></tr>
            )}
            {list.map((k, i) => (
              <tr key={k.id} className="group hover:bg-white/[0.02] transition-colors">
                <td className="px-3 py-2 text-xs text-neutral-500">{i + 1}</td>
                <td className="px-3 py-2 text-xs text-neutral-400 whitespace-nowrap">{fmtDate(k.tgl_pemesanan)}</td>
                <td className="px-3 py-2 text-xs text-neutral-400">{k.pemesanan ?? "—"}</td>
                <td className="px-3 py-2 text-xs text-neutral-400">{k.agent ?? "—"}</td>
                <td className="px-3 py-2 text-xs text-neutral-400 whitespace-nowrap">{fmtDate(k.limit_pembayaran)}</td>
                <td className="px-3 py-2 text-xs text-teal-400 whitespace-nowrap">
                  {fmtCurrency(k.harga_tiket != null && k.unit ? k.harga_tiket / k.unit : k.harga_tiket)}
                </td>
                <td className="px-3 py-2 text-xs font-mono text-neutral-300">{k.kode_booking ?? "—"}</td>
                <td className="px-3 py-2 text-xs text-neutral-400 text-center">{k.unit ?? "—"}</td>
                <td className="px-3 py-2 text-xs font-mono text-neutral-400 whitespace-nowrap">{k.no_etiket ?? "—"}</td>
                <td className="px-3 py-2 text-xs text-neutral-400">{k.title ?? "—"}</td>
                <td className="px-3 py-2 text-xs font-medium text-neutral-100 whitespace-nowrap">{k.nama_lengkap ?? "—"}</td>
                <td className="px-3 py-2 text-xs text-neutral-400">{k.klien ?? "—"}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    {k.tiket_drive_file_id && (
                      <a href={`https://drive.google.com/file/d/${k.tiket_drive_file_id}/view`}
                        target="_blank" rel="noopener noreferrer"
                        className="text-[10px] text-teal-500 hover:text-teal-300 cursor-pointer" title="Lihat tiket">📄</a>
                    )}
                    <button onClick={() => startEdit(k)}
                      className="text-[10px] text-neutral-500 hover:text-teal-400 cursor-pointer">edit</button>
                    <button onClick={() => handleDelete(k.id!)}
                      className="text-[10px] text-neutral-500 hover:text-red-400 cursor-pointer">hapus</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

"use client";
import { useState, useEffect, useRef } from "react";
import { asuransiApi, pesertaApi } from "@/lib/trip/api";
import { Button } from "@/components/ui";
import type { TripAsuransi, ManifestPeserta } from "@/types/trip";
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

interface FormState {
  nama_polis: string;
  kode_booking: string;
  nama_pemegang: string;
  periode_mulai: string;
  periode_selesai: string;
  peserta_ids: string[];
}

function blankForm(): FormState {
  return {
    nama_polis: "",
    kode_booking: "",
    nama_pemegang: "",
    periode_mulai: "",
    periode_selesai: "",
    peserta_ids: [],
  };
}

interface Props { tripId: string; tripName: string }

export function ManifestAsuransi({ tripId }: Props) {
  const [list, setList]             = useState<TripAsuransi[]>([]);
  const [pesertaList, setPesertaList] = useState<ManifestPeserta[]>([]);
  const [loading, setLoading]       = useState(true);
  const [showForm, setShowForm]     = useState(false);

  // Form state
  const [form, setForm]             = useState<FormState>(blankForm());
  const [pesertaSearch, setPesertaSearch] = useState("");
  const [editId, setEditId]         = useState<string | null>(null);

  // File state
  const [asuransiFile, setAsuransiFile] = useState<File | null>(null);
  const [localPdfUrl, setLocalPdfUrl]   = useState<string | null>(null);

  // Per-row replace file
  const replaceFileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Action state
  const [saving, setSaving]         = useState(false);
  const [zipUploading, setZipUploading] = useState(false);
  const [msg, setMsg]               = useState<{ ok: boolean; text: string } | null>(null);

  const uploadRef = useRef<HTMLInputElement>(null);

  const load = () => {
    Promise.all([
      asuransiApi.list(tripId),
      pesertaApi.list(tripId),
    ]).then(([asuransi, peserta]) => {
      setList(asuransi);
      setPesertaList(peserta);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [tripId]);

  // ── File selection ────────────────────────────────────────────────────────

  const handleSelectFile = (file: File) => {
    if (localPdfUrl) URL.revokeObjectURL(localPdfUrl);
    setAsuransiFile(file);
    setLocalPdfUrl(URL.createObjectURL(file));
    setMsg(null);
    setShowForm(true);
  };

  // ── Peserta toggle ────────────────────────────────────────────────────────

  const togglePeserta = (pid: string) => {
    setForm(f => {
      const has = f.peserta_ids.includes(pid);
      return { ...f, peserta_ids: has ? f.peserta_ids.filter(x => x !== pid) : [...f.peserta_ids, pid] };
    });
  };

  const selectAllPeserta = () => {
    setForm(f => ({ ...f, peserta_ids: pesertaList.map(p => p.id) }));
  };

  const clearPeserta = () => {
    setForm(f => ({ ...f, peserta_ids: [] }));
  };

  // ── Save ──────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    setSaving(true);
    setMsg(null);
    try {
      if (editId) {
        // Update form data only (JSON)
        await asuransiApi.update(tripId, editId, {
          nama_polis:      form.nama_polis      || undefined,
          kode_booking:    form.kode_booking    || undefined,
          nama_pemegang:   form.nama_pemegang   || undefined,
          periode_mulai:   form.periode_mulai   || undefined,
          periode_selesai: form.periode_selesai || undefined,
          peserta_ids:     form.peserta_ids,
        });
      } else {
        // Create with optional file (multipart)
        const fd = new FormData();
        if (form.nama_polis)      fd.append("nama_polis",      form.nama_polis);
        if (form.kode_booking)    fd.append("kode_booking",    form.kode_booking);
        if (form.nama_pemegang)   fd.append("nama_pemegang",   form.nama_pemegang);
        if (form.periode_mulai)   fd.append("periode_mulai",   form.periode_mulai);
        if (form.periode_selesai) fd.append("periode_selesai", form.periode_selesai);
        fd.append("peserta_ids", JSON.stringify(form.peserta_ids));
        if (asuransiFile) fd.append("file", asuransiFile);
        await asuransiApi.create(tripId, fd);
      }

      resetForm();
      load();
      setMsg({ ok: true, text: "Data asuransi berhasil disimpan." });
    } catch (e: any) {
      setMsg({ ok: false, text: e.message ?? "Gagal menyimpan" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Hapus data asuransi ini?")) return;
    try {
      await asuransiApi.delete(tripId, id);
      load();
    } catch (e: any) {
      setMsg({ ok: false, text: e.message ?? "Gagal menghapus" });
    }
  };

  const handleReplaceFile = async (aid: string, file: File) => {
    try {
      const fd = new FormData();
      fd.append("file", file);
      await asuransiApi.replaceFile(tripId, aid, fd);
      load();
      setMsg({ ok: true, text: "File berhasil diganti." });
    } catch (e: any) {
      setMsg({ ok: false, text: e.message ?? "Gagal ganti file" });
    }
  };

  const resetForm = () => {
    if (localPdfUrl) URL.revokeObjectURL(localPdfUrl);
    setLocalPdfUrl(null);
    setAsuransiFile(null);
    setForm(blankForm());
    setEditId(null);
    setMsg(null);
    setShowForm(false);
  };

  const startEdit = (item: TripAsuransi) => {
    resetForm();
    setEditId(item.id);
    setForm({
      nama_polis:      item.nama_polis      ?? "",
      kode_booking:    item.kode_booking    ?? "",
      nama_pemegang:   item.nama_pemegang   ?? "",
      periode_mulai:   item.periode_mulai   ?? "",
      periode_selesai: item.periode_selesai ?? "",
      peserta_ids:     item.peserta_ids     ?? [],
    });
    setShowForm(true);
  };

  const pdfSrc = localPdfUrl ?? undefined;

  if (loading) return <div className="p-6 text-sm text-neutral-600">Memuat...</div>;

  return (
    <div>
      {/* ── Toolbar ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800 flex-wrap gap-2">
        <span className="text-xs text-neutral-400">{list.length} asuransi</span>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Hidden file input for upload */}
          <input
            ref={uploadRef}
            type="file"
            accept="*/*"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleSelectFile(f); e.target.value = ""; }}
          />
          <button
            onClick={() => uploadRef.current?.click()}
            className="rounded-lg border border-neutral-700 hover:border-teal-500 hover:text-teal-400 text-neutral-400 text-xs py-1.5 px-3 transition-colors cursor-pointer whitespace-nowrap"
          >
            {asuransiFile && !editId ? `📄 ${asuransiFile.name}` : "↑ Upload Asuransi"}
          </button>
          <Button size="sm" variant="outline" onClick={() => {
            if (showForm) { resetForm(); } else { resetForm(); setShowForm(true); }
          }}>
            {showForm ? "Tutup form" : "+ Tambah manual"}
          </Button>
          <button
            onClick={async () => {
              try { await asuransiApi.exportZip(tripId); }
              catch (e: any) { setMsg({ ok: false, text: e.message }); }
            }}
            disabled={list.length === 0}
            className="rounded-lg border border-neutral-700 hover:border-teal-500 hover:text-teal-400 text-neutral-400 text-xs py-1.5 px-3 transition-colors cursor-pointer disabled:opacity-40 whitespace-nowrap"
          >
            ↓ Export ZIP
          </button>
          <button
            onClick={async () => {
              setZipUploading(true);
              setMsg(null);
              try {
                const res = await asuransiApi.uploadZipToDrive(tripId);
                setMsg({ ok: true, text: `ZIP terupload ke Drive: ${res.file_name}` });
              } catch (e: any) {
                setMsg({ ok: false, text: e.message ?? "Upload ZIP gagal" });
              } finally { setZipUploading(false); }
            }}
            disabled={zipUploading || list.length === 0}
            className="rounded-lg border border-neutral-700 hover:border-teal-500 hover:text-teal-400 text-neutral-400 text-xs py-1.5 px-3 transition-colors cursor-pointer disabled:opacity-40 whitespace-nowrap"
          >
            {zipUploading ? "Uploading…" : "↑ Upload ZIP ke Drive"}
          </button>
        </div>
      </div>

      {/* ── Form Panel ──────────────────────────────────────────────────────── */}
      {showForm && (
        <div className="border-b border-neutral-800 bg-neutral-950/40">
          <div className="flex flex-col md:flex-row">
            {/* LEFT: PDF / file preview */}
            {pdfSrc && (
              <div className="w-full md:w-[45%] flex-shrink-0 p-4">
                <p className={lbl}>Preview File (lokal — akan diupload saat Simpan)</p>
                <embed
                  src={pdfSrc}
                  type="application/pdf"
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-900"
                  style={{ height: 520 }}
                />
              </div>
            )}

            {/* RIGHT: Form */}
            <div className={clsx("flex-1 p-4 overflow-y-auto", pdfSrc ? "" : "w-full")} style={{ maxHeight: 620 }}>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500 mb-3">
                {editId ? "Edit Data Asuransi" : "Tambah Asuransi"}
              </p>

              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="col-span-2 md:col-span-1">
                  <label className={lbl}>Nama Polis</label>
                  <input
                    value={form.nama_polis}
                    onChange={e => setForm(f => ({ ...f, nama_polis: e.target.value }))}
                    placeholder="Nama polis asuransi"
                    className={inp}
                  />
                </div>
                <div>
                  <label className={lbl}>Kode Booking</label>
                  <input
                    value={form.kode_booking}
                    onChange={e => setForm(f => ({ ...f, kode_booking: e.target.value }))}
                    placeholder="Kode booking"
                    className={inp}
                  />
                </div>
                <div>
                  <label className={lbl}>Nama Pemegang</label>
                  <input
                    value={form.nama_pemegang}
                    onChange={e => setForm(f => ({ ...f, nama_pemegang: e.target.value }))}
                    placeholder="Nama pemegang polis"
                    className={inp}
                  />
                </div>
                <div>
                  <label className={lbl}>Periode Mulai</label>
                  <input
                    type="date"
                    value={form.periode_mulai}
                    onChange={e => setForm(f => ({ ...f, periode_mulai: e.target.value }))}
                    className={inp}
                  />
                </div>
                <div>
                  <label className={lbl}>Periode Selesai</label>
                  <input
                    type="date"
                    value={form.periode_selesai}
                    onChange={e => setForm(f => ({ ...f, periode_selesai: e.target.value }))}
                    className={inp}
                  />
                </div>
              </div>

              {/* File info (create mode only) */}
              {!editId && (
                <div className="mb-3">
                  <label className={lbl}>File Asuransi</label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => uploadRef.current?.click()}
                      className="rounded-lg border border-neutral-700 hover:border-teal-500 hover:text-teal-400 text-neutral-400 text-xs py-1.5 px-3 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      {asuransiFile ? `📄 ${asuransiFile.name}` : "Pilih File"}
                    </button>
                    {asuransiFile && (
                      <span className="text-[10px] text-neutral-600">akan diupload saat Simpan</span>
                    )}
                  </div>
                </div>
              )}

              {/* Peserta multi-select */}
              <div className="mb-3">
                <div className="flex items-center justify-between mb-1">
                  <label className={lbl + " mb-0"}>Peserta ({form.peserta_ids.length} dipilih)</label>
                  <div className="flex gap-2">
                    <button onClick={selectAllPeserta} className="text-[9px] text-teal-600 hover:text-teal-400 cursor-pointer">Pilih Semua</button>
                    <button onClick={clearPeserta} className="text-[9px] text-neutral-600 hover:text-neutral-400 cursor-pointer">Kosongkan</button>
                  </div>
                </div>
                <input
                  type="text"
                  value={pesertaSearch}
                  onChange={e => setPesertaSearch(e.target.value)}
                  placeholder="Cari nama peserta…"
                  className={clsx(inp, "mb-1 text-[11px]")}
                />
                <div className="max-h-48 overflow-y-auto rounded-lg border border-neutral-700 bg-neutral-900/60">
                  {pesertaList.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-neutral-600">Belum ada peserta</div>
                  ) : (
                    <div className="divide-y divide-neutral-800/60">
                      {pesertaList
                        .filter(p => p.nama_lengkap.toLowerCase().includes(pesertaSearch.toLowerCase()))
                        .map(p => (
                          <label key={p.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-white/[0.02] cursor-pointer">
                            <input
                              type="checkbox"
                              checked={form.peserta_ids.includes(p.id)}
                              onChange={() => togglePeserta(p.id)}
                              className="accent-teal-500"
                            />
                            <span className="text-xs text-neutral-300">{p.nama_lengkap}</span>
                            {p.title && <span className="text-[10px] text-neutral-600 ml-1">{p.title}</span>}
                          </label>
                        ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Message */}
              {msg && (
                <p className={clsx("text-[11px] mb-3", msg.ok ? "text-teal-400" : "text-red-400")}>
                  {msg.ok ? "✓" : "⚠"} {msg.text}
                </p>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-3 border-t border-neutral-800">
                <Button size="sm" variant="ghost" onClick={resetForm}>Batal</Button>
                <Button size="sm" variant="primary" onClick={handleSave} loading={saving}>
                  {saving ? "Menyimpan…" : "Simpan"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-neutral-800">
              {["No", "Nama Polis", "Kode Booking", "Nama Pemegang", "Periode", "Peserta", "File", ""].map((h, i) => (
                <th key={i} className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-neutral-600 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800/50">
            {list.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-xs text-neutral-600">Belum ada data asuransi</td></tr>
            )}
            {list.map((item, i) => (
              <tr key={item.id} className="group hover:bg-white/[0.02] transition-colors">
                <td className="px-3 py-2 text-xs text-neutral-500">{i + 1}</td>
                <td className="px-3 py-2 text-xs font-medium text-neutral-100 whitespace-nowrap">{item.nama_polis ?? "—"}</td>
                <td className="px-3 py-2 text-xs font-mono text-neutral-400">{item.kode_booking ?? "—"}</td>
                <td className="px-3 py-2 text-xs text-neutral-400 whitespace-nowrap">{item.nama_pemegang ?? "—"}</td>
                <td className="px-3 py-2 text-xs text-neutral-400 whitespace-nowrap">
                  {item.periode_mulai || item.periode_selesai
                    ? `${fmtDate(item.periode_mulai)} — ${fmtDate(item.periode_selesai)}`
                    : "—"}
                </td>
                <td className="px-3 py-2 text-xs text-neutral-400 max-w-[200px]">
                  {item.peserta_names && item.peserta_names.length > 0
                    ? <span title={item.peserta_names.join(", ")} className="truncate block">
                        {item.peserta_names.length > 2
                          ? `${item.peserta_names.slice(0, 2).join(", ")} +${item.peserta_names.length - 2}`
                          : item.peserta_names.join(", ")}
                      </span>
                    : <span className="text-neutral-600">—</span>}
                </td>
                <td className="px-3 py-2 text-xs">
                  {item.drive_view_url ? (
                    <a
                      href={item.drive_view_url}
                      target="_blank" rel="noopener noreferrer"
                      className="text-teal-500 hover:text-teal-300 cursor-pointer"
                      title="Lihat file"
                    >
                      📄 {item.file_name ? item.file_name.slice(0, 20) + (item.file_name.length > 20 ? "…" : "") : "Lihat"}
                    </a>
                  ) : <span className="text-neutral-600">—</span>}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    {/* Replace file */}
                    <input
                      ref={el => { replaceFileRefs.current[item.id] = el; }}
                      type="file"
                      accept="*/*"
                      className="hidden"
                      onChange={e => {
                        const f = e.target.files?.[0];
                        if (f) handleReplaceFile(item.id, f);
                        e.target.value = "";
                      }}
                    />
                    <button
                      onClick={() => replaceFileRefs.current[item.id]?.click()}
                      className="text-[10px] text-neutral-500 hover:text-teal-400 cursor-pointer whitespace-nowrap"
                      title="Ganti file"
                    >
                      ↑ Ganti File
                    </button>
                    <button
                      onClick={() => startEdit(item)}
                      className="text-[10px] text-neutral-500 hover:text-teal-400 cursor-pointer"
                    >
                      ✏ Edit
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="text-[10px] text-neutral-500 hover:text-red-400 cursor-pointer"
                    >
                      🗑 Hapus
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

"use client";
import { useState, useEffect, useRef } from "react";
import { paymentsApi, pesertaApi } from "@/lib/trip/api";
import { Button, NumericInput } from "@/components/ui";
import type { TripPayment, ManifestPeserta, PaymentJenis } from "@/types/trip";
import { formatIDR } from "@/lib/rab/calculations";
import { clsx } from "clsx";

const JENIS: PaymentJenis[] = ["dp", "pelunasan", "lainnya"];

const inp = "w-full rounded-lg bg-neutral-900 border border-neutral-700 px-2 py-1.5 text-xs text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-teal-500 transition-colors";
const sel = "w-full rounded-lg bg-neutral-900 border border-neutral-700 px-2 py-1.5 text-xs text-neutral-100 focus:outline-none focus:border-teal-500 transition-colors";
const lbl = "block text-[10px] text-neutral-500 uppercase tracking-wide mb-1";

interface Props { tripId: string; tripName?: string }

export function TripPayments({ tripId }: Props) {
  const [payments, setPayments] = useState<TripPayment[]>([]);
  const [peserta, setPeserta] = useState<ManifestPeserta[]>([]);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [csvUploading, setCsvUploading] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [form, setForm] = useState<{
    peserta_id: string;
    jenis: PaymentJenis;
    amount: number | "";
    tgl_bayar: string;
    catatan: string;
    buktiFile: File | null;
  }>({
    peserta_id: "",
    jenis: "dp",
    amount: "",
    tgl_bayar: new Date().toISOString().slice(0, 10),
    catatan: "",
    buktiFile: null,
  });

  const buktiRef = useRef<HTMLInputElement>(null);

  const load = () => paymentsApi.list(tripId).then(setPayments);
  useEffect(() => {
    load();
    pesertaApi.list(tripId).then(setPeserta);
  }, [tripId]);

  const setF = <K extends keyof typeof form>(k: K) => (v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const resetForm = () => {
    setForm({
      peserta_id: "",
      jenis: "dp",
      amount: "",
      tgl_bayar: new Date().toISOString().slice(0, 10),
      catatan: "",
      buktiFile: null,
    });
    setAdding(false);
  };

  const handleSave = async () => {
    if (!form.amount || !form.tgl_bayar) return;
    setSaving(true);
    setMsg(null);
    try {
      const fd = new FormData();
      if (form.peserta_id) fd.append("peserta_id", form.peserta_id);
      fd.append("jenis", form.jenis);
      fd.append("amount", String(Number(form.amount)));
      fd.append("tgl_bayar", form.tgl_bayar);
      if (form.catatan) fd.append("catatan", form.catatan);
      if (form.buktiFile) fd.append("bukti", form.buktiFile);

      await paymentsApi.create(tripId, fd);
      resetForm();
      load();
      setMsg({ ok: true, text: "Pembayaran berhasil disimpan." });
    } catch (e: any) {
      setMsg({ ok: false, text: e.message ?? "Gagal menyimpan" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (payId: string) => {
    if (!confirm("Hapus pembayaran ini?")) return;
    try {
      await paymentsApi.delete(tripId, payId);
      load();
    } catch (e: any) {
      setMsg({ ok: false, text: e.message ?? "Hapus gagal" });
    }
  };

  const total = payments.reduce((s, p) => s + p.amount, 0);

  return (
    <div>
      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800 flex-wrap gap-2">
        <span className="text-xs text-neutral-400">
          Total:{" "}
          <span className="text-teal-400 font-mono">{formatIDR(total)}</span>
          <span className="ml-2 text-neutral-600">({payments.length} transaksi)</span>
        </span>
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={() => { setMsg(null); setAdding(!adding); }}>
            {adding ? "Tutup" : "+ Tambah"}
          </Button>
          <button
            onClick={async () => {
              try { await paymentsApi.exportCsv(tripId); }
              catch (e: any) { setMsg({ ok: false, text: e.message }); }
            }}
            disabled={payments.length === 0}
            className="rounded-lg border border-neutral-700 hover:border-teal-500 hover:text-teal-400 text-neutral-400 text-xs py-1.5 px-3 transition-colors cursor-pointer disabled:opacity-40 whitespace-nowrap"
          >
            ↓ Export CSV
          </button>
          <button
            onClick={async () => {
              setCsvUploading(true);
              setMsg(null);
              try {
                const res = await paymentsApi.uploadCsvToDrive(tripId);
                setMsg({ ok: true, text: `CSV terupload ke Drive: ${res.file_name}` });
              } catch (e: any) {
                setMsg({ ok: false, text: e.message ?? "Upload CSV gagal" });
              } finally {
                setCsvUploading(false);
              }
            }}
            disabled={csvUploading || payments.length === 0}
            className="rounded-lg border border-neutral-700 hover:border-teal-500 hover:text-teal-400 text-neutral-400 text-xs py-1.5 px-3 transition-colors cursor-pointer disabled:opacity-40 whitespace-nowrap"
          >
            {csvUploading ? "Uploading…" : "↑ Upload CSV ke Drive"}
          </button>
        </div>
      </div>

      {/* ── Message ──────────────────────────────────────────────────────────── */}
      {msg && (
        <div className={clsx("px-4 py-2 text-xs border-b border-neutral-800", msg.ok ? "text-teal-400" : "text-red-400")}>
          {msg.ok ? "✓" : "⚠"} {msg.text}
        </div>
      )}

      {/* ── Add form ─────────────────────────────────────────────────────────── */}
      {adding && (
        <div className="p-4 border-b border-neutral-800 bg-neutral-950/40">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <label className={lbl}>Peserta</label>
              <select
                value={form.peserta_id}
                onChange={(e) => setF("peserta_id")(e.target.value)}
                className={sel}
              >
                <option value="">— Umum —</option>
                {peserta.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title ? `${p.title} ` : ""}{p.nama_lengkap}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={lbl}>Jenis</label>
              <select
                value={form.jenis}
                onChange={(e) => setF("jenis")(e.target.value as PaymentJenis)}
                className={sel}
              >
                {JENIS.map((j) => (
                  <option key={j} value={j}>{j}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={lbl}>Tgl Bayar</label>
              <input
                type="date"
                value={form.tgl_bayar}
                onChange={(e) => setF("tgl_bayar")(e.target.value)}
                className={inp}
              />
            </div>
            <div>
              <label className={lbl}>Amount (IDR)</label>
              <NumericInput value={form.amount} onChange={setF("amount")} className="text-xs" />
            </div>
            <div>
              <label className={lbl}>Catatan</label>
              <input
                type="text"
                value={form.catatan}
                onChange={(e) => setF("catatan")(e.target.value)}
                placeholder="Opsional"
                className={inp}
              />
            </div>
            <div>
              <label className={lbl}>Bukti Pembayaran</label>
              <input
                ref={buktiRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,image/*,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  setF("buktiFile")(file);
                }}
              />
              <button
                type="button"
                onClick={() => buktiRef.current?.click()}
                className={clsx(
                  inp,
                  "text-left cursor-pointer",
                  form.buktiFile ? "text-teal-400" : "text-neutral-500"
                )}
              >
                {form.buktiFile ? `📄 ${form.buktiFile.name}` : "↑ Pilih file bukti…"}
              </button>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-3 pt-3 border-t border-neutral-800">
            <Button size="sm" variant="ghost" onClick={resetForm}>Batal</Button>
            <Button size="sm" variant="primary" onClick={handleSave} loading={saving}>
              {saving ? "Menyimpan…" : "Simpan"}
            </Button>
          </div>
        </div>
      )}

      {/* ── Table ───────────────────────────────────────────────────────────── */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-neutral-800">
              {["No", "Peserta", "Jenis", "Amount (Rp)", "Tgl Bayar", "Catatan", "Bukti", ""].map((h, i) => (
                <th key={i} className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-neutral-600 whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800/50">
            {payments.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-xs text-neutral-600">
                  Belum ada pembayaran
                </td>
              </tr>
            )}
            {payments.map((p, idx) => (
              <tr key={p.id} className="group hover:bg-white/[0.02] transition-colors">
                <td className="px-3 py-2 text-xs text-neutral-500">{idx + 1}</td>
                <td className="px-3 py-2 text-xs text-neutral-300">{p.nama_peserta ?? "Umum"}</td>
                <td className="px-3 py-2 text-xs text-neutral-400 capitalize">{p.jenis}</td>
                <td className="px-3 py-2 text-xs font-mono text-teal-300">{formatIDR(p.amount)}</td>
                <td className="px-3 py-2 text-xs text-neutral-400 whitespace-nowrap">{p.tgl_bayar}</td>
                <td className="px-3 py-2 text-xs text-neutral-500">{p.catatan ?? "—"}</td>
                <td className="px-3 py-2 text-xs">
                  {p.bukti_drive_file_id ? (
                    <a
                      href={`https://drive.google.com/file/d/${p.bukti_drive_file_id}/view`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-teal-500 hover:text-teal-300 cursor-pointer"
                      title="Lihat bukti pembayaran"
                    >
                      📄 Download
                    </a>
                  ) : (
                    <span className="text-neutral-700">—</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <button
                    onClick={() => handleDelete(p.id)}
                    className="opacity-0 group-hover:opacity-100 text-[10px] text-neutral-500 hover:text-red-400 transition-opacity cursor-pointer"
                  >
                    hapus
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          {payments.length > 0 && (
            <tfoot>
              <tr className="border-t border-neutral-700">
                <td colSpan={3} className="px-3 py-2 text-[10px] text-neutral-500 uppercase tracking-wide">Total</td>
                <td className="px-3 py-2 text-xs font-mono font-bold text-teal-300">{formatIDR(total)}</td>
                <td colSpan={4} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

"use client";
import { useState, useEffect } from "react";
import { paymentsApi, pesertaApi } from "@/lib/trip/api";
import { Button, NumericInput } from "@/components/ui";
import type { TripPayment, ManifestPeserta, PaymentJenis } from "@/types/trip";
import { formatIDR } from "@/lib/rab/calculations";

const JENIS: PaymentJenis[] = ["dp", "pelunasan", "lainnya"];

interface Props { tripId: string }

export function TripPayments({ tripId }: Props) {
  const [payments, setPayments] = useState<TripPayment[]>([]);
  const [peserta, setPeserta] = useState<ManifestPeserta[]>([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<{ peserta_id: string; jenis: PaymentJenis; amount: number | ""; tgl_bayar: string; catatan: string }>({
    peserta_id: "", jenis: "dp", amount: "", tgl_bayar: new Date().toISOString().slice(0, 10), catatan: "",
  });

  const load = () => paymentsApi.list(tripId).then(setPayments);
  useEffect(() => {
    load();
    pesertaApi.list(tripId).then(setPeserta);
  }, [tripId]);

  const setF = (k: keyof typeof form) => (v: any) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.amount || !form.tgl_bayar) return;
    await paymentsApi.create(tripId, {
      peserta_id: form.peserta_id || undefined,
      jenis: form.jenis,
      amount: Number(form.amount),
      tgl_bayar: form.tgl_bayar,
      catatan: form.catatan || undefined,
    });
    setAdding(false);
    setForm({ peserta_id: "", jenis: "dp", amount: "", tgl_bayar: new Date().toISOString().slice(0, 10), catatan: "" });
    load();
  };

  const handleDelete = async (payId: string) => {
    await paymentsApi.delete(tripId, payId);
    load();
  };

  const total = payments.reduce((s, p) => s + p.amount, 0);

  return (
    <div>
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
        <span className="text-xs text-neutral-400">
          Total: <span className="text-teal-400 font-mono">{formatIDR(total)}</span>
        </span>
        <Button size="sm" variant="outline" onClick={() => setAdding(!adding)}>
          {adding ? "Tutup" : "+ Tambah"}
        </Button>
      </div>

      {adding && (
        <div className="p-4 border-b border-neutral-800 bg-neutral-950/40 grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <label className="text-[10px] text-neutral-500 uppercase tracking-wide">Peserta</label>
            <select value={form.peserta_id} onChange={(e) => setF("peserta_id")(e.target.value)}
              className="w-full mt-1 rounded-lg bg-neutral-900 border border-neutral-700 px-2 py-1.5 text-xs text-neutral-100 focus:outline-none focus:border-teal-500">
              <option value="">— Umum —</option>
              {peserta.map((p) => <option key={p.id} value={p.id}>{p.nama_lengkap}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-neutral-500 uppercase tracking-wide">Jenis</label>
            <select value={form.jenis} onChange={(e) => setF("jenis")(e.target.value as PaymentJenis)}
              className="w-full mt-1 rounded-lg bg-neutral-900 border border-neutral-700 px-2 py-1.5 text-xs text-neutral-100 focus:outline-none focus:border-teal-500">
              {JENIS.map((j) => <option key={j}>{j}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-neutral-500 uppercase tracking-wide">Tgl Bayar</label>
            <input type="date" value={form.tgl_bayar} onChange={(e) => setF("tgl_bayar")(e.target.value)}
              className="w-full mt-1 rounded-lg bg-neutral-900 border border-neutral-700 px-2 py-1.5 text-xs text-neutral-100 focus:outline-none focus:border-teal-500" />
          </div>
          <div>
            <label className="text-[10px] text-neutral-500 uppercase tracking-wide">Amount (IDR)</label>
            <NumericInput value={form.amount} onChange={setF("amount")} className="mt-1 text-xs" />
          </div>
          <div className="col-span-2">
            <label className="text-[10px] text-neutral-500 uppercase tracking-wide">Catatan</label>
            <input type="text" value={form.catatan} onChange={(e) => setF("catatan")(e.target.value)}
              className="w-full mt-1 rounded-lg bg-neutral-900 border border-neutral-700 px-2 py-1.5 text-xs text-neutral-100 focus:outline-none focus:border-teal-500" />
          </div>
          <div className="col-span-full flex justify-end gap-2 pt-1">
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Batal</Button>
            <Button size="sm" variant="primary" onClick={handleSave}>Simpan</Button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-neutral-800">
              {["Peserta", "Jenis", "Amount", "Tanggal", "Catatan", ""].map((h) => (
                <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-neutral-600">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800/50">
            {payments.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-xs text-neutral-600">Belum ada pembayaran</td></tr>
            )}
            {payments.map((p) => (
              <tr key={p.id} className="group hover:bg-white/[0.02] transition-colors">
                <td className="px-3 py-2 text-xs text-neutral-300">{p.nama_peserta ?? "Umum"}</td>
                <td className="px-3 py-2 text-xs text-neutral-400">{p.jenis}</td>
                <td className="px-3 py-2 text-xs font-mono text-teal-300">{formatIDR(p.amount)}</td>
                <td className="px-3 py-2 text-xs text-neutral-400">{p.tgl_bayar}</td>
                <td className="px-3 py-2 text-xs text-neutral-500">{p.catatan ?? "—"}</td>
                <td className="px-3 py-2">
                  <button
                    onClick={() => handleDelete(p.id)}
                    className="opacity-0 group-hover:opacity-100 text-[10px] text-neutral-500 hover:text-red-400 transition-opacity cursor-pointer"
                  >hapus</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

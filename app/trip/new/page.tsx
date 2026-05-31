"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { tripApi } from "@/lib/trip/api";
import { rabDbApi } from "@/lib/rab/dbApi";
import { rabStorage } from "@/lib/rab/storage";
import { NumericInput, Button, FormField, SectionHeader } from "@/components/ui";
import type { RabMasterSummary } from "@/lib/rab/dbApi";

export default function NewTripPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rabList, setRabList] = useState<RabMasterSummary[]>([]);
  const [rabLoading, setRabLoading] = useState(true);

  const [form, setForm] = useState({
    nama_trip: "",
    rab_master_id: "",
    tgl_berangkat: "",
    jumlah_hari: 6,
    total_pax: 16,
  });

  const tgl_pulang = form.tgl_berangkat
    ? new Date(new Date(form.tgl_berangkat).getTime() + (form.jumlah_hari - 1) * 86400000)
        .toISOString().slice(0, 10)
    : "";

  const set = (k: keyof typeof form) => (v: any) => setForm((f) => ({ ...f, [k]: v }));

  // Load RAB list from Go backend; auto-sync from localStorage if DB is empty
  useEffect(() => {
    (async () => {
      try {
        let list = await rabDbApi.list();
        if (list.length === 0) {
          const localRabs = await rabStorage.list();
          if (localRabs.length > 0) {
            await Promise.all(localRabs.map((r) => rabDbApi.upsert(r).catch(() => {})));
            list = await rabDbApi.list();
          }
        }
        setRabList(list);
      } catch {
        setRabList([]);
      } finally {
        setRabLoading(false);
      }
    })();
  }, []);

  const handleRabSelect = (id: string) => {
    set("rab_master_id")(id);
    if (!id) return;
    const rab = rabList.find((r) => r.id === id);
    if (!rab) return;
    setForm((f) => ({
      ...f,
      rab_master_id: id,
      jumlah_hari: rab.jumlah_hari || f.jumlah_hari,
      total_pax: rab.jumlah_pax || f.total_pax,
    }));
  };

  const handleSubmit = async () => {
    if (!form.nama_trip.trim() || !form.tgl_berangkat) {
      setError("Nama trip dan tanggal berangkat wajib diisi."); return;
    }
    setSaving(true);
    setError(null);
    try {
      const trip = await tripApi.create({
        nama_trip: form.nama_trip,
        rab_master_id: form.rab_master_id || undefined,
        tgl_berangkat: form.tgl_berangkat,
        tgl_pulang,
        total_pax: form.total_pax,
      });
      router.push(`/trip/${trip.id}`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const selectedRab = rabList.find((r) => r.id === form.rab_master_id);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="max-w-lg mx-auto px-4 py-8">
        <button onClick={() => router.back()} className="text-xs text-neutral-500 hover:text-neutral-300 mb-6 flex items-center gap-1 cursor-pointer">
          ← Kembali
        </button>

        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
          <SectionHeader>Buat Open Trip</SectionHeader>

          <div className="flex flex-col gap-4">
            <FormField label="Nama Open Trip">
              <input
                type="text"
                value={form.nama_trip}
                onChange={(e) => set("nama_trip")(e.target.value)}
                placeholder="cth: JPN Winter Golden Route 6D5N"
                className="w-full rounded-lg bg-neutral-900 border border-neutral-700 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-teal-500 transition-colors"
              />
            </FormField>

            <FormField label="RAB Master">
              <select
                value={form.rab_master_id}
                onChange={(e) => handleRabSelect(e.target.value)}
                disabled={rabLoading}
                className="w-full rounded-lg bg-neutral-900 border border-neutral-700 px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:border-teal-500 transition-colors cursor-pointer disabled:opacity-50"
              >
                <option value="">{rabLoading ? "Memuat..." : "— Pilih RAB Master (opsional) —"}</option>
                {rabList.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nama} · {r.jumlah_pax} pax · {r.jumlah_hari} hari
                  </option>
                ))}
              </select>
              {rabList.length === 0 && !rabLoading && (
                <p className="text-[10px] text-neutral-600 mt-1">
                  Belum ada RAB. Simpan RAB di halaman{" "}
                  <a href="/rab" className="text-teal-500 hover:underline">RAB Master</a> terlebih dahulu.
                </p>
              )}
              {selectedRab && (
                <p className="text-[10px] text-neutral-500 mt-1">
                  Kurs {selectedRab.kurs} · Harga jual {selectedRab.harga_jual > 0 ? `Rp ${selectedRab.harga_jual.toLocaleString("id-ID")}` : "—"}
                </p>
              )}
            </FormField>

            <div className="grid grid-cols-2 gap-4">
              <FormField label="Tanggal Berangkat">
                <input
                  type="date"
                  value={form.tgl_berangkat}
                  onChange={(e) => set("tgl_berangkat")(e.target.value)}
                  className="w-full rounded-lg bg-neutral-900 border border-neutral-700 px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:border-teal-500 transition-colors"
                />
              </FormField>
              <FormField label="Jumlah Hari">
                <NumericInput value={form.jumlah_hari} onChange={set("jumlah_hari")} />
              </FormField>
            </div>

            {tgl_pulang && (
              <p className="text-xs text-neutral-500">
                Tanggal pulang: <span className="text-teal-400">{tgl_pulang}</span>
              </p>
            )}

            <FormField label="Total Pax">
              <NumericInput value={form.total_pax} onChange={set("total_pax")} />
            </FormField>

            {error && (
              <div className="bg-red-950/40 border border-red-800/50 rounded-lg px-4 py-3 text-sm text-red-400">
                ⚠ {error}
              </div>
            )}

            <div className="flex gap-3 justify-end pt-2">
              <Button variant="ghost" onClick={() => router.back()}>Batal</Button>
              <Button variant="primary" onClick={handleSubmit} loading={saving}>Simpan Trip</Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

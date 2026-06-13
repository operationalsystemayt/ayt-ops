"use client";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { tripApi } from "@/lib/trip/api";
import { rabStorage } from "@/lib/rab/storage";
import { NumericInput, TextInput, Select, Button, FormField, SectionHeader } from "@/components/ui";
import type { RabMaster } from "@/types/rab";
import type { TripCategory, TripType } from "@/types/trip";
import { n } from "@/lib/rab/calculations";

export default function NewTripPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-neutral-950" />}>
      <NewTripPageInner />
    </Suspense>
  );
}

function NewTripPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isPrivate = searchParams.get("type") === "private";
  const tripType: TripType = isPrivate ? "private_trip" : "open_trip";

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rabList, setRabList] = useState<RabMaster[]>([]);
  const [rabLoading, setRabLoading] = useState(true);

  const [form, setForm] = useState({
    nama_trip: "",
    rab_master_id: "",
    tgl_berangkat: "",
    jumlah_hari: 6,
    jumlah_malam: 5,
    total_pax: 16,
    trip_category: "domestik" as TripCategory,
    negara: "",
  });

  const tgl_pulang = form.tgl_berangkat
    ? new Date(new Date(form.tgl_berangkat).getTime() + (form.jumlah_hari - 1) * 86400000)
        .toISOString().slice(0, 10)
    : "";

  const set = (k: keyof typeof form) => (v: any) => setForm((f) => ({ ...f, [k]: v }));

  // Load RAB list — backend-first (rabStorage handles fallback to localStorage)
  useEffect(() => {
    rabStorage.list()
      .then(setRabList)
      .catch(() => setRabList([]))
      .finally(() => setRabLoading(false));
  }, []);

  const handleRabSelect = (id: string) => {
    set("rab_master_id")(id);
    if (!id) return;
    const rab = rabList.find((r) => r.id === id);
    if (!rab) return;
    setForm((f) => ({
      ...f,
      rab_master_id: id,
      jumlah_hari:  n(rab.header.jumlah_hari)  || f.jumlah_hari,
      jumlah_malam: n(rab.header.jumlah_malam) || f.jumlah_malam,
      total_pax:    n(rab.header.jumlah_pax)   || f.total_pax,
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
        nama_trip:      form.nama_trip,
        rab_master_id:  form.rab_master_id || undefined,
        tgl_berangkat:  form.tgl_berangkat,
        tgl_pulang,
        total_pax:      form.total_pax,
        jumlah_malam:   form.jumlah_malam,
        trip_category:  form.trip_category,
        negara:         form.negara || undefined,
        trip_type:      tripType,
      });
      router.push(`/trip/${trip.id}`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const selectedRab = rabList.find((r) => r.id === form.rab_master_id);
  const kurs       = selectedRab ? n(selectedRab.header.kurs_list?.[0]?.value) : 0;
  const hargaJual  = selectedRab ? n(selectedRab.harga_jual as any) : 0;

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="max-w-lg mx-auto px-4 py-8">
        <button onClick={() => router.back()} className="text-xs text-neutral-500 hover:text-neutral-300 mb-6 flex items-center gap-1 cursor-pointer">
          ← Kembali
        </button>

        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
          <SectionHeader>{isPrivate ? "Buat Private Trip" : "Buat Open Trip"}</SectionHeader>

          <div className="flex flex-col gap-4">
            <FormField label="Nama Open Trip">
              <input
                type="text"
                value={form.nama_trip}
                onChange={(e) => set("nama_trip")(e.target.value)}
                placeholder="cth: JPN Winter Golden Route 6D5N"
                className="w-full rounded-lg bg-neutral-900 border border-neutral-700 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-[#37bea3] transition-colors"
              />
            </FormField>

            <FormField label="RAB Master">
              <select
                value={form.rab_master_id}
                onChange={(e) => handleRabSelect(e.target.value)}
                disabled={rabLoading}
                className="w-full rounded-lg bg-neutral-900 border border-neutral-700 px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:border-[#37bea3] transition-colors cursor-pointer disabled:opacity-50"
              >
                <option value="">{rabLoading ? "Memuat..." : "— Pilih RAB Master (opsional) —"}</option>
                {rabList.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.header.nama} · {n(r.header.jumlah_pax)} pax · {n(r.header.jumlah_hari)} hari
                  </option>
                ))}
              </select>
              {rabList.length === 0 && !rabLoading && (
                <p className="text-[10px] text-neutral-600 mt-1">
                  Belum ada RAB. Simpan RAB di halaman{" "}
                  <a href="/rab" className="text-[#37bea3] hover:underline">RAB Master</a> terlebih dahulu.
                </p>
              )}
              {selectedRab && (
                <p className="text-[10px] text-neutral-500 mt-1">
                  Kurs {kurs} · Harga jual {hargaJual > 0 ? `Rp ${hargaJual.toLocaleString("id-ID")}` : "—"}
                </p>
              )}
            </FormField>

            <div className="grid grid-cols-2 gap-4">
              <FormField label="Tanggal Berangkat">
                <input
                  type="date"
                  value={form.tgl_berangkat}
                  onChange={(e) => set("tgl_berangkat")(e.target.value)}
                  className="w-full rounded-lg bg-neutral-900 border border-neutral-700 px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:border-[#37bea3] transition-colors"
                />
              </FormField>
              <FormField label="Jumlah Hari">
                <NumericInput value={form.jumlah_hari} onChange={set("jumlah_hari")} />
              </FormField>
            </div>

            {tgl_pulang && (
              <p className="text-xs text-neutral-500">
                Tanggal pulang: <span style={{ color: "var(--ayt-teal)" }}>{tgl_pulang}</span>
              </p>
            )}

            <div className="grid grid-cols-2 gap-4">
              <FormField label="Jumlah Malam">
                <NumericInput value={form.jumlah_malam} onChange={set("jumlah_malam")} />
              </FormField>
              <FormField label="Total Pax">
                <NumericInput value={form.total_pax} onChange={set("total_pax")} />
              </FormField>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField label="Domestik / Internasional">
                <Select
                  value={form.trip_category}
                  onChange={(v) => set("trip_category")(v as TripCategory)}
                  options={[
                    { value: "domestik", label: "Domestik" },
                    { value: "internasional", label: "Internasional" },
                  ]}
                />
              </FormField>
              <FormField label="Negara">
                <TextInput value={form.negara} onChange={set("negara")} placeholder="cth: Jepang" />
              </FormField>
            </div>

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

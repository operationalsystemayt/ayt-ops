"use client";
import { useState, useEffect } from "react";
import { pesertaApi } from "@/lib/trip/api";
import { TextInput, Button } from "@/components/ui";
import { getPesertaStatus, calcAge } from "@/types/trip";
import type { ManifestPeserta, PesertaTitle, RoomType, MealType } from "@/types/trip";
import { clsx } from "clsx";

const TITLES: PesertaTitle[] = ["MR", "MRS", "MS", "MISS", "MASTER", "TOUR_LEADER"];
const ROOMS: RoomType[] = ["DOUBLE", "TWIN", "SINGLE", "TRIPLE"];
const MEALS: MealType[] = ["MUSLIM", "NON_MUSLIM"];

const STATUS_UI = {
  valid:     { label: "✓ Valid",          cls: "text-teal-400" },
  expiring:  { label: "⚠ Expiry <6bln",   cls: "text-amber-400" },
  expired:   { label: "✗ Expired",         cls: "text-red-400" },
  no_paspor: { label: "⚠ Belum paspor",   cls: "text-amber-400" },
  no_ktp:    { label: "⚠ Belum KTP",      cls: "text-amber-400" },
};

function blankPeserta(): Partial<ManifestPeserta> {
  return { title: "MR", nama_lengkap: "", no_paspor: "", room_type: "DOUBLE", meals: "NON_MUSLIM" };
}

interface Props { tripId: string }

export function ManifestInti({ tripId }: Props) {
  const [list, setList] = useState<ManifestPeserta[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<Partial<ManifestPeserta>>(blankPeserta());
  const [editId, setEditId] = useState<string | null>(null);

  const load = () =>
    pesertaApi.list(tripId).then(setList).finally(() => setLoading(false));

  useEffect(() => { load(); }, [tripId]);

  const setF = (k: keyof ManifestPeserta) => (v: any) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.nama_lengkap?.trim()) return;
    const payload = { ...form, no_urut: list.length + 1 };
    if (editId) {
      await pesertaApi.update(tripId, editId, payload);
    } else {
      await pesertaApi.create(tripId, payload);
    }
    setAdding(false);
    setEditId(null);
    setForm(blankPeserta());
    load();
  };

  const handleDelete = async (pid: string) => {
    await pesertaApi.delete(tripId, pid);
    load();
  };

  const startEdit = (p: ManifestPeserta) => {
    setForm(p);
    setEditId(p.id);
    setAdding(true);
  };

  if (loading) return <div className="p-6 text-sm text-neutral-600">Memuat...</div>;

  return (
    <div>
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
        <span className="text-xs text-neutral-400">{list.length} peserta</span>
        <Button size="sm" variant="outline" onClick={() => { setAdding(!adding); setEditId(null); setForm(blankPeserta()); }}>
          {adding ? "Tutup form" : "+ Tambah"}
        </Button>
      </div>

      {adding && (
        <div className="p-4 border-b border-neutral-800 bg-neutral-950/40 grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <label className="text-[10px] text-neutral-500 uppercase tracking-wide">Title</label>
            <select value={form.title ?? "MR"} onChange={(e) => setF("title")(e.target.value)}
              className="w-full mt-1 rounded-lg bg-neutral-900 border border-neutral-700 px-2 py-1.5 text-xs text-neutral-100 focus:outline-none focus:border-teal-500">
              {TITLES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="text-[10px] text-neutral-500 uppercase tracking-wide">Nama Lengkap</label>
            <TextInput value={form.nama_lengkap ?? ""} onChange={setF("nama_lengkap")} placeholder="Sesuai paspor" className="mt-1 text-xs" />
          </div>
          <div>
            <label className="text-[10px] text-neutral-500 uppercase tracking-wide">No. Paspor</label>
            <TextInput value={form.no_paspor ?? ""} onChange={setF("no_paspor")} className="mt-1 text-xs" />
          </div>
          <div>
            <label className="text-[10px] text-neutral-500 uppercase tracking-wide">Tgl Lahir</label>
            <input type="date" value={form.tgl_lahir ?? ""} onChange={(e) => setF("tgl_lahir")(e.target.value)}
              className="w-full mt-1 rounded-lg bg-neutral-900 border border-neutral-700 px-2 py-1.5 text-xs text-neutral-100 focus:outline-none focus:border-teal-500" />
          </div>
          <div>
            <label className="text-[10px] text-neutral-500 uppercase tracking-wide">Expiry</label>
            <input type="date" value={form.expiry_date ?? ""} onChange={(e) => setF("expiry_date")(e.target.value)}
              className="w-full mt-1 rounded-lg bg-neutral-900 border border-neutral-700 px-2 py-1.5 text-xs text-neutral-100 focus:outline-none focus:border-teal-500" />
          </div>
          <div>
            <label className="text-[10px] text-neutral-500 uppercase tracking-wide">Room</label>
            <select value={form.room_type ?? "DOUBLE"} onChange={(e) => setF("room_type")(e.target.value)}
              className="w-full mt-1 rounded-lg bg-neutral-900 border border-neutral-700 px-2 py-1.5 text-xs text-neutral-100 focus:outline-none focus:border-teal-500">
              {ROOMS.map((r) => <option key={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-neutral-500 uppercase tracking-wide">Meals</label>
            <select value={form.meals ?? "NON_MUSLIM"} onChange={(e) => setF("meals")(e.target.value)}
              className="w-full mt-1 rounded-lg bg-neutral-900 border border-neutral-700 px-2 py-1.5 text-xs text-neutral-100 focus:outline-none focus:border-teal-500">
              {MEALS.map((m) => <option key={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-neutral-500 uppercase tracking-wide">Klien</label>
            <TextInput value={form.klien ?? ""} onChange={setF("klien")} className="mt-1 text-xs" />
          </div>
          <div className="col-span-full flex justify-end gap-2 pt-1">
            <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setEditId(null); }}>Batal</Button>
            <Button size="sm" variant="primary" onClick={handleSave}>Simpan</Button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-neutral-800">
              {["No", "Title", "Nama", "Paspor", "Usia", "Expiry", "Room", "Klien", "Meals", "Status", ""].map((h) => (
                <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-neutral-600 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800/50">
            {list.length === 0 && (
              <tr><td colSpan={10} className="px-4 py-8 text-center text-xs text-neutral-600">Belum ada peserta</td></tr>
            )}
            {list.map((p, i) => {
              const st = getPesertaStatus(p);
              return (
                <tr key={p.id} className="group hover:bg-white/[0.02] transition-colors">
                  <td className="px-3 py-2 text-xs text-neutral-500">{i + 1}</td>
                  <td className="px-3 py-2 text-xs text-neutral-400">{p.title ?? "—"}</td>
                  <td className="px-3 py-2 text-xs font-medium text-neutral-100 whitespace-nowrap">{p.nama_lengkap}</td>
                  <td className="px-3 py-2 text-xs font-mono text-neutral-400">{p.no_paspor ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-neutral-400">{p.tgl_lahir ? calcAge(p.tgl_lahir) : "—"}</td>
                  <td className="px-3 py-2 text-xs text-neutral-400 whitespace-nowrap">{p.expiry_date ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-neutral-400">{p.room_type ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-neutral-400">{p.klien ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-neutral-400">{p.meals ?? "—"}</td>
                  <td className={clsx("px-3 py-2 text-[10px] font-medium whitespace-nowrap", STATUS_UI[st].cls)}>
                    {STATUS_UI[st].label}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => startEdit(p)} className="text-[10px] text-neutral-500 hover:text-teal-400 cursor-pointer">edit</button>
                      <button onClick={() => handleDelete(p.id)} className="text-[10px] text-neutral-500 hover:text-red-400 cursor-pointer">hapus</button>
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

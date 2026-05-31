// components/rab/RabForm.tsx
"use client";
import { useState, useMemo } from "react";
import {
  NumericInput, TextInput, Button, SectionHeader,
  FormField, Divider,
} from "@/components/ui";
import { BudgetPanel, SummaryRow } from "@/components/rab/BudgetPanel";
import { computeRAB, formatIDR } from "@/lib/rab/calculations";
import { blankItem } from "@/lib/rab/factory";
import { exportRABtoCsv } from "@/lib/rab/export";
import type { RabMaster, RabItem } from "@/types/rab";
import { clsx } from "clsx";

interface Props {
  initial: RabMaster;
  onSave: (rab: RabMaster) => Promise<void>;
  onCancel: () => void;
  isSaving?: boolean;
}

export function RabForm({ initial, onSave, onCancel, isSaving }: Props) {
  const [rab, setRab] = useState<RabMaster>(initial);
  const [error, setError] = useState<string | null>(null);

  const comp = useMemo(() => computeRAB(rab), [rab]);
  const h = rab.header;

  // Header updater
  const setH = (key: keyof typeof h) => (val: any) =>
    setRab((r) => ({ ...r, header: { ...r.header, [key]: val } }));

  // Peserta rows
  const addPRow = () => setRab((r) => ({ ...r, peserta_rows: [...r.peserta_rows, blankItem(r.peserta_rows.length)] }));
  const updPRow = (i: number, v: RabItem) => setRab((r) => { const rows = [...r.peserta_rows]; rows[i] = v; return { ...r, peserta_rows: rows }; });
  const delPRow = (i: number) => setRab((r) => ({ ...r, peserta_rows: r.peserta_rows.filter((_, j) => j !== i) }));

  // TL rows
  const addTRow = () => setRab((r) => ({ ...r, tl_rows: [...r.tl_rows, blankItem(r.tl_rows.length)] }));
  const updTRow = (i: number, v: RabItem) => setRab((r) => { const rows = [...r.tl_rows]; rows[i] = v; return { ...r, tl_rows: rows }; });
  const delTRow = (i: number) => setRab((r) => ({ ...r, tl_rows: r.tl_rows.filter((_, j) => j !== i) }));

  const handleSave = async () => {
    if (!rab.header.nama.trim()) { setError("Nama RAB wajib diisi."); return; }
    if (comp.harga_jual_error) { setError(comp.harga_jual_error); return; }
    setError(null);
    await onSave(rab);
  };

  return (
    <div className="flex flex-col gap-6 pb-12">

      {/* ── Header ── */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
        <SectionHeader>Informasi RAB</SectionHeader>
        <div className="grid grid-cols-1 gap-4">
          <FormField label="Nama RAB Master" className="col-span-full">
            <TextInput
              value={h.nama}
              onChange={setH("nama")}
              placeholder="cth: Open Trip Osaka-Kyoto-Nagoya 6D5N"
              className="text-sm py-2.5"
            />
          </FormField>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <FormField label="Tiket Pesawat (IDR/pax)">
              <NumericInput value={h.tiket_pesawat} onChange={setH("tiket_pesawat")} placeholder="9000000" />
            </FormField>
            <FormField label="Hotel Peserta (IDR/malam)">
              <NumericInput value={h.hotel_peserta} onChange={setH("hotel_peserta")} placeholder="700000" />
            </FormField>
            <FormField label="Hotel TL (IDR/malam)">
              <NumericInput value={h.hotel_tl} onChange={setH("hotel_tl")} placeholder="1000000" />
            </FormField>
            <FormField label="Kurs (IDR per unit asing)">
              <NumericInput value={h.kurs} onChange={setH("kurs")} placeholder="1 = IDR langsung" />
            </FormField>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <FormField label="Jumlah Pax">
              <NumericInput value={h.jumlah_pax} onChange={setH("jumlah_pax")} />
            </FormField>
            <FormField label="Jumlah Hari">
              <NumericInput value={h.jumlah_hari} onChange={setH("jumlah_hari")} />
            </FormField>
            <FormField label="Jumlah Malam">
              <NumericInput value={h.jumlah_malam} onChange={setH("jumlah_malam")} />
            </FormField>
            <FormField label="Jumlah TL">
              <NumericInput value={h.jumlah_tl} onChange={setH("jumlah_tl")} />
            </FormField>
          </div>
        </div>
      </div>

      {/* ── Budget Peserta + TL side by side on large, stacked on mobile ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* Budget Peserta */}
        <BudgetPanel
          title="Budget Peserta"
          accent="teal"
          fixedRows={[
            { label: `Tiket pesawat ${h.tiket_pesawat ? formatIDR(h.tiket_pesawat as number) : "—"}/pax`, final: comp.tiket_peserta_final },
            { label: `Hotel ${h.hotel_peserta ? formatIDR(h.hotel_peserta as number) : "—"}/malam/pax`, final: comp.hotel_peserta_final },
          ]}
          rows={rab.peserta_rows}
          dynamicFinals={comp.peserta_dynamic}
          onAdd={addPRow}
          onUpdate={updPRow}
          onDelete={delPRow}
          summaryRows={
            <>
              <SummaryRow
                label={`Beban TL (total TL ÷ ${h.jumlah_pax || 0} pax)`}
                value={comp.beban_tl}
              />
              <SummaryRow
                label="Total Biaya Final"
                value={comp.total_peserta}
                variant="total"
              />
              <SummaryRow
                label="Harga Jual"
                value={Number(rab.harga_jual) || 0}
                editable
                rawValue={rab.harga_jual}
                onChange={(v) => setRab((r) => ({ ...r, harga_jual: v }))}
                variant={comp.harga_jual_error ? "danger" : rab.harga_jual !== "" ? "success" : "default"}
              />
              <SummaryRow
                label="Laba / pax"
                value={comp.laba_pax}
                variant={comp.laba_pax > 0 ? "success" : comp.laba_pax < 0 ? "danger" : "default"}
              />
              <SummaryRow
                label="Tipping"
                value={Number(rab.tipping) || 0}
                editable
                rawValue={rab.tipping}
                onChange={(v) => setRab((r) => ({ ...r, tipping: v }))}
              />
              <SummaryRow
                label={`Laba + Tipping (${h.jumlah_pax || 0} pax)`}
                value={comp.laba_plus_tipping}
                variant="highlight"
              />
            </>
          }
        />

        {/* Budget TL */}
        <BudgetPanel
          title="Budget TL"
          accent="amber"
          fixedRows={[
            { label: `Tiket pesawat TL`, final: comp.tiket_tl_final },
            { label: `Hotel TL`, final: comp.hotel_tl_final },
          ]}
          rows={rab.tl_rows}
          dynamicFinals={comp.tl_dynamic}
          onAdd={addTRow}
          onUpdate={updTRow}
          onDelete={delTRow}
          summaryRows={
            <SummaryRow
              label="Jumlah Beban TL"
              value={comp.total_tl}
              variant="total"
            />
          }
        />
      </div>

      {/* ── Landtour Panel ── */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-800 text-xs font-bold uppercase tracking-widest text-neutral-400">
          Landtour
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-neutral-800">
                <th colSpan={3} className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-neutral-600">Keterangan</th>
                <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-neutral-600">Nilai</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/50">
              <SummaryRow
                label="Total pengeluaran peserta (ex-tiket)"
                value={comp.total_landtour}
                variant="total"
              />
              <SummaryRow
                label="Harga Jual Landtour"
                value={Number(rab.harga_jual_landtour) || 0}
                editable
                rawValue={rab.harga_jual_landtour}
                onChange={(v) => setRab((r) => ({ ...r, harga_jual_landtour: v }))}
              />
              <SummaryRow
                label="Laba / pax Landtour"
                value={comp.laba_pax_landtour}
                variant={comp.laba_pax_landtour > 0 ? "success" : comp.laba_pax_landtour < 0 ? "danger" : "default"}
              />
              <SummaryRow
                label="Tipping Landtour"
                value={Number(rab.tipping_landtour) || 0}
                editable
                rawValue={rab.tipping_landtour}
                onChange={(v) => setRab((r) => ({ ...r, tipping_landtour: v }))}
              />
              <SummaryRow
                label={`Laba + Tipping Landtour (${h.jumlah_pax || 0} pax)`}
                value={comp.laba_plus_tipping_landtour}
                variant="highlight"
              />
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Notes ── */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
        <SectionHeader>Catatan <span className="text-neutral-600 normal-case font-normal tracking-normal">(opsional)</span></SectionHeader>
        <textarea
          value={rab.notes ?? ""}
          onChange={(e) => setRab((r) => ({ ...r, notes: e.target.value }))}
          placeholder="Tambahkan catatan, syarat, atau informasi tambahan di sini..."
          rows={4}
          className="w-full rounded-lg bg-neutral-900 border border-neutral-700 px-3 py-2.5 text-sm text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-teal-500 transition-colors resize-y"
        />
      </div>

      {/* ── Error + Actions ── */}
      {error && (
        <div className="bg-red-950/40 border border-red-800/50 rounded-lg px-4 py-3 text-sm text-red-400">
          ⚠ {error}
        </div>
      )}

      <div className="flex items-center gap-3 justify-end">
        <Button variant="ghost" onClick={onCancel}>Batal</Button>
        <Button variant="outline" onClick={() => exportRABtoCsv(rab, comp)}>
          ↓ Export CSV
        </Button>
        <Button variant="primary" onClick={handleSave} loading={isSaving}>
          Simpan RAB
        </Button>
      </div>
    </div>
  );
}

// components/rab/RabForm.tsx
"use client";
import { useState, useMemo } from "react";
import {
  NumericInput, TextInput, Button, SectionHeader,
  FormField, Divider,
} from "@/components/ui";
import { BudgetPanel, SummaryRow } from "@/components/rab/BudgetPanel";
import { computeRAB, formatIDR } from "@/lib/rab/calculations";
import { blankItem, blankKursEntry } from "@/lib/rab/factory";
import { exportRABtoCsv } from "@/lib/rab/export";
import type { RabMaster, RabItem, KursEntry } from "@/types/rab";
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

  // Default kurs entry id for newly added rows
  const defaultKursId = () => h.kurs_list[0]?.id ?? null;

  // Peserta rows
  const addPRow = () => setRab((r) => ({ ...r, peserta_rows: [...r.peserta_rows, blankItem(r.peserta_rows.length, defaultKursId())] }));
  const updPRow = (i: number, v: RabItem) => setRab((r) => { const rows = [...r.peserta_rows]; rows[i] = v; return { ...r, peserta_rows: rows }; });
  const delPRow = (i: number) => setRab((r) => ({ ...r, peserta_rows: r.peserta_rows.filter((_, j) => j !== i) }));

  // Tour Leader rows
  const addTRow = () => setRab((r) => ({ ...r, tl_rows: [...r.tl_rows, blankItem(r.tl_rows.length, defaultKursId())] }));
  const updTRow = (i: number, v: RabItem) => setRab((r) => { const rows = [...r.tl_rows]; rows[i] = v; return { ...r, tl_rows: rows }; });
  const delTRow = (i: number) => setRab((r) => ({ ...r, tl_rows: r.tl_rows.filter((_, j) => j !== i) }));

  // Tour Guide rows
  const addGRow = () => setRab((r) => ({ ...r, guide_rows: [...r.guide_rows, blankItem(r.guide_rows.length, defaultKursId())] }));
  const updGRow = (i: number, v: RabItem) => setRab((r) => { const rows = [...r.guide_rows]; rows[i] = v; return { ...r, guide_rows: rows }; });
  const delGRow = (i: number) => setRab((r) => ({ ...r, guide_rows: r.guide_rows.filter((_, j) => j !== i) }));

  // Driver rows
  const addDRow = () => setRab((r) => ({ ...r, driver_rows: [...r.driver_rows, blankItem(r.driver_rows.length, defaultKursId())] }));
  const updDRow = (i: number, v: RabItem) => setRab((r) => { const rows = [...r.driver_rows]; rows[i] = v; return { ...r, driver_rows: rows }; });
  const delDRow = (i: number) => setRab((r) => ({ ...r, driver_rows: r.driver_rows.filter((_, j) => j !== i) }));

  // Kurs list
  const addKurs = () => setRab((r) => ({ ...r, header: { ...r.header, kurs_list: [...r.header.kurs_list, blankKursEntry()] } }));
  const updKurs = (i: number, v: KursEntry) => setRab((r) => { const list = [...r.header.kurs_list]; list[i] = v; return { ...r, header: { ...r.header, kurs_list: list } }; });
  const delKurs = (i: number) => setRab((r) => ({ ...r, header: { ...r.header, kurs_list: r.header.kurs_list.filter((_, j) => j !== i) } }));

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
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <FormField label="Tiket Pesawat (IDR/pax)">
              <NumericInput value={h.tiket_pesawat} onChange={setH("tiket_pesawat")} placeholder="9000000" />
            </FormField>
            <FormField label="Hotel Peserta (IDR/malam)">
              <NumericInput value={h.hotel_peserta} onChange={setH("hotel_peserta")} placeholder="700000" />
            </FormField>
            <FormField label="Hotel Tour Leader (IDR/malam)">
              <NumericInput value={h.hotel_tl} onChange={setH("hotel_tl")} placeholder="1000000" />
            </FormField>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <FormField label="Jumlah Pax">
              <NumericInput value={h.jumlah_pax} onChange={setH("jumlah_pax")} />
            </FormField>
            <FormField label="Jumlah Hari">
              <NumericInput value={h.jumlah_hari} onChange={setH("jumlah_hari")} />
            </FormField>
            <FormField label="Jumlah Malam">
              <NumericInput value={h.jumlah_malam} onChange={setH("jumlah_malam")} />
            </FormField>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <FormField label="Jumlah Tour Leader">
              <NumericInput value={h.jumlah_tl} onChange={setH("jumlah_tl")} />
            </FormField>
            <FormField label="Jumlah Guide">
              <NumericInput value={h.jumlah_guide} onChange={setH("jumlah_guide")} />
            </FormField>
            <FormField label="Jumlah Driver">
              <NumericInput value={h.jumlah_driver} onChange={setH("jumlah_driver")} />
            </FormField>
          </div>

          {/* Kurs (multi) */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Kurs (IDR per unit asing)</span>
              <button
                onClick={addKurs}
                className="text-xs text-teal-400 hover:text-teal-300 transition-colors cursor-pointer"
              >
                + Tambah Kurs
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {h.kurs_list.map((k, i) => (
                <div key={k.id} className="flex items-center gap-2">
                  <TextInput
                    value={k.label}
                    onChange={(v) => updKurs(i, { ...k, label: v })}
                    placeholder="Label kurs (cth: JPY, USD)"
                    className="flex-[1] min-w-0"
                  />
                  <NumericInput
                    value={k.value}
                    onChange={(v) => updKurs(i, { ...k, value: v })}
                    placeholder="1 = IDR langsung"
                    className="flex-1 min-w-0"
                  />
                  {h.kurs_list.length > 1 && (
                    <button
                      onClick={() => delKurs(i)}
                      className="text-neutral-600 hover:text-red-400 text-lg leading-none cursor-pointer px-1"
                      title="Hapus kurs"
                    >×</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Budget Peserta + Tour Leader side by side on large, stacked on mobile ── */}
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
          kursList={h.kurs_list}
          onAdd={addPRow}
          onUpdate={updPRow}
          onDelete={delPRow}
          summaryRows={
            <>
              <SummaryRow
                label={`Beban Tour Leader (total Tour Leader ÷ ${h.jumlah_pax || 0} pax)`}
                value={comp.beban_tl}
              />
              <SummaryRow
                label={`Beban Tour Guide (total Tour Guide ÷ ${h.jumlah_pax || 0} pax)`}
                value={comp.beban_guide}
              />
              <SummaryRow
                label={`Beban Driver (total Driver ÷ ${h.jumlah_pax || 0} pax)`}
                value={comp.beban_driver}
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

        {/* Budget Tour Leader */}
        <BudgetPanel
          title="Budget Tour Leader"
          accent="amber"
          fixedRows={[
            { label: `Tiket pesawat Tour Leader`, final: comp.tiket_tl_final },
            { label: `Hotel Tour Leader`, final: comp.hotel_tl_final },
          ]}
          rows={rab.tl_rows}
          dynamicFinals={comp.tl_dynamic}
          kursList={h.kurs_list}
          onAdd={addTRow}
          onUpdate={updTRow}
          onDelete={delTRow}
          summaryRows={
            <SummaryRow
              label="Jumlah Beban Tour Leader"
              value={comp.total_tl}
              variant="total"
            />
          }
        />
      </div>

      {/* ── Budget Tour Guide + Driver side by side on large, stacked on mobile ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* Budget Tour Guide */}
        <BudgetPanel
          title="Budget Tour Guide"
          accent="amber"
          toggle={{
            label: "Gunakan tiket pesawat & hotel",
            checked: !!rab.guide_use_tiket_hotel,
            onChange: (v) => setRab((r) => ({ ...r, guide_use_tiket_hotel: v })),
          }}
          fixedRows={rab.guide_use_tiket_hotel ? [
            { label: `Tiket pesawat Tour Guide`, final: comp.tiket_guide_final },
            { label: `Hotel Tour Guide`, final: comp.hotel_guide_final },
          ] : []}
          rows={rab.guide_rows}
          dynamicFinals={comp.guide_dynamic}
          kursList={h.kurs_list}
          onAdd={addGRow}
          onUpdate={updGRow}
          onDelete={delGRow}
          summaryRows={
            <SummaryRow
              label="Jumlah Beban Tour Guide"
              value={comp.total_guide}
              variant="total"
            />
          }
        />

        {/* Budget Driver */}
        <BudgetPanel
          title="Budget Driver"
          accent="amber"
          toggle={{
            label: "Gunakan tiket pesawat & hotel",
            checked: !!rab.driver_use_tiket_hotel,
            onChange: (v) => setRab((r) => ({ ...r, driver_use_tiket_hotel: v })),
          }}
          fixedRows={rab.driver_use_tiket_hotel ? [
            { label: `Tiket pesawat Driver`, final: comp.tiket_driver_final },
            { label: `Hotel Driver`, final: comp.hotel_driver_final },
          ] : []}
          rows={rab.driver_rows}
          dynamicFinals={comp.driver_dynamic}
          kursList={h.kurs_list}
          onAdd={addDRow}
          onUpdate={updDRow}
          onDelete={delDRow}
          summaryRows={
            <SummaryRow
              label="Jumlah Beban Driver"
              value={comp.total_driver}
              variant="total"
            />
          }
        />
      </div>

      {/* ── Landtour Panel ── */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-800 text-xs font-bold uppercase tracking-widest text-neutral-400">
          Harga Landtour
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

// components/rab/RabCard.tsx
"use client";
import { useMemo } from "react";
import { Badge, Modal, Button } from "@/components/ui";
import { computeRAB, formatIDR, formatIDRCompact } from "@/lib/rab/calculations";
import { exportRABtoCsv } from "@/lib/rab/export";
import type { RabMaster } from "@/types/rab";
import { clsx } from "clsx";

// ─── List Card ────────────────────────────────────────────────────────────────
interface RabCardProps {
  rab: RabMaster;
  onClick: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function RabCard({ rab, onClick, onEdit, onDelete }: RabCardProps) {
  const comp = useMemo(() => computeRAB(rab), [rab]);
  const h = rab.header;
  const isProfit = comp.laba_pax >= 0;

  return (
    <div
      onClick={onClick}
      className="bg-neutral-900 border border-neutral-800 hover:border-neutral-700 rounded-xl p-5 cursor-pointer transition-all group"
    >
      {/* Top */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="font-medium text-sm text-neutral-100 leading-snug line-clamp-2">
          {h.nama || <span className="text-neutral-600 italic">Tanpa nama</span>}
        </div>
        <Badge variant={isProfit ? "success" : "danger"} className="shrink-0">
          {isProfit ? "✓" : "⚠"} {formatIDRCompact(comp.laba_pax)}/pax
        </Badge>
      </div>

      {/* Meta */}
      <div className="text-xs text-neutral-500 mb-4">
        {h.jumlah_pax} pax · {h.jumlah_hari}D{h.jumlah_malam}N
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-neutral-800/50 rounded-lg p-2.5">
          <div className="text-[10px] text-neutral-500 mb-1">Harga Jual</div>
          <div className="text-sm font-mono font-medium text-neutral-200">{formatIDRCompact(Number(rab.harga_jual) || 0)}</div>
        </div>
        <div className="bg-neutral-800/50 rounded-lg p-2.5">
          <div className="text-[10px] text-neutral-500 mb-1">Laba + Tipping</div>
          <div className={clsx("text-sm font-mono font-medium", comp.laba_plus_tipping >= 0 ? "text-teal-400" : "text-red-400")}>
            {formatIDRCompact(comp.laba_plus_tipping)}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-neutral-800">
        <span className="text-[10px] text-neutral-600">Update: {rab.updated_at}</span>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={onEdit}
            className="text-xs px-2.5 py-1 rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-neutral-100 cursor-pointer transition-colors"
          >Edit</button>
          <button
            onClick={onDelete}
            className="text-xs px-2.5 py-1 rounded-md bg-neutral-800 hover:bg-red-950 text-neutral-400 hover:text-red-400 cursor-pointer transition-colors"
          >Hapus</button>
        </div>
      </div>
    </div>
  );
}

// ─── Detail Popup ─────────────────────────────────────────────────────────────
interface RabDetailProps {
  rab: RabMaster;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function KV({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={clsx("rounded-lg p-3 flex flex-col gap-1", accent ? "bg-teal-950/40" : "bg-neutral-800/60")}>
      <span className="text-[10px] text-neutral-500 uppercase tracking-wider">{label}</span>
      <span className="text-sm font-mono font-medium text-neutral-200">{value}</span>
    </div>
  );
}

export function RabDetail({ rab, onClose, onEdit, onDelete }: RabDetailProps) {
  const comp = useMemo(() => computeRAB(rab), [rab]);
  const h = rab.header;

  return (
    <Modal onClose={onClose} title={h.nama || "Detail RAB"}>
      <div className="px-6 py-4 flex flex-col gap-5">
        {/* Meta */}
        <div className="text-xs text-neutral-500">
          Dibuat: {rab.created_at} · Diupdate: {rab.updated_at} · Oleh: {rab.created_by}
        </div>

        {/* Header stats */}
        <div className="grid grid-cols-3 gap-2">
          <KV label="Pax" value={String(h.jumlah_pax)} />
          <KV label="Hari / Malam" value={`${h.jumlah_hari}D / ${h.jumlah_malam}N`} />
          <KV
            label="Kurs"
            value={(h.kurs_list ?? []).map((k) => `${k.label}: Rp ${(Number(k.value) || 0).toLocaleString("id-ID")}`).join(", ") || "—"}
          />
          <KV label="Tiket" value={formatIDR(h.tiket_pesawat as number)} />
          <KV label="Hotel/malam" value={formatIDR(h.hotel_peserta as number)} />
          <KV label="Jumlah Tour Leader" value={String(h.jumlah_tl)} />
        </div>

        {/* Budget summary */}
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-neutral-600 mb-3">Ringkasan Budget</div>
          <div className="grid grid-cols-2 gap-2">
            <KV label="Total Biaya Peserta" value={formatIDR(comp.total_peserta)} />
            <KV label="Total Beban Tour Leader" value={formatIDR(comp.total_tl)} />
            <KV label="Total Beban Tour Guide" value={formatIDR(comp.total_guide)} />
            <KV label="Total Beban Driver" value={formatIDR(comp.total_driver)} />
            <KV label="Harga Jual" value={formatIDR(rab.harga_jual as number)} accent />
            <KV label="Harga Jual Landtour" value={formatIDR(rab.harga_jual_landtour as number)} />
          </div>
        </div>

        {/* Profit summary */}
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-neutral-600 mb-3">Laba</div>
          <div className="grid grid-cols-2 gap-2">
            <div className={clsx("rounded-lg p-3 flex flex-col gap-1", comp.laba_pax >= 0 ? "bg-teal-950/40" : "bg-red-950/40")}>
              <span className="text-[10px] text-neutral-500 uppercase tracking-wider">Laba / pax</span>
              <span className={clsx("text-sm font-mono font-medium", comp.laba_pax >= 0 ? "text-teal-400" : "text-red-400")}>
                {formatIDR(comp.laba_pax)}
              </span>
            </div>
            <KV label="Tipping" value={formatIDR(rab.tipping as number)} />
            <div className="col-span-2 bg-blue-950/30 rounded-lg p-3 flex flex-col gap-1">
              <span className="text-[10px] text-neutral-500 uppercase tracking-wider">Laba + Tipping ({h.jumlah_pax} pax)</span>
              <span className="text-base font-mono font-bold text-blue-300">{formatIDR(comp.laba_plus_tipping)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 px-6 py-4 border-t border-neutral-800">
        <Button variant="danger" size="sm" onClick={onDelete}>Hapus dari list</Button>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={() => exportRABtoCsv(rab, computeRAB(rab))}>↓ CSV</Button>
        <Button variant="primary" size="sm" onClick={onEdit}>Edit RAB</Button>
      </div>
    </Modal>
  );
}

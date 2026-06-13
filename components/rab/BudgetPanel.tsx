// components/rab/BudgetPanel.tsx
"use client";
import { useState, useRef, useCallback } from "react";
import { NumericInput, TextInput, Select, Button } from "@/components/ui";
import { formatIDR } from "@/lib/rab/calculations";
import { DIVISOR_OPTIONS } from "@/lib/rab/factory";
import type { RabItem, KursEntry } from "@/types/rab";
import { clsx } from "clsx";

interface FixedRowProps {
  label: string;
  final: number;
  detailWidth: number;
}
function FixedRow({ label, final, detailWidth }: FixedRowProps) {
  return (
    <tr className="bg-teal-950/30">
      <td style={{ width: detailWidth, minWidth: detailWidth }} className="px-3 py-2 text-xs text-neutral-400 italic" colSpan={2}>
        {label}
      </td>
      <td className="px-2 py-2 w-48" />
      <td className="px-3 py-2 text-right text-xs font-mono text-neutral-300 font-medium whitespace-nowrap">
        {formatIDR(final)}
      </td>
      <td />
    </tr>
  );
}

interface DynamicRowProps {
  row: RabItem;
  final: number;
  onChange: (row: RabItem) => void;
  onDelete: () => void;
  detailWidth: number;
  kursList: KursEntry[];
}
function DynamicRow({ row, final, onChange, onDelete, detailWidth, kursList }: DynamicRowProps) {
  const kursOptions = [
    { value: "", label: "×1 (tanpa kurs)" },
    ...kursList.map((k) => ({ value: k.id, label: k.label || "Kurs" })),
  ];
  return (
    <tr className="group hover:bg-white/[0.02] transition-colors">
      {/* Detail Kegiatan — resizable width */}
      <td style={{ width: detailWidth, minWidth: detailWidth }} className="px-2 py-1.5">
        <TextInput
          value={row.detail}
          onChange={(v) => onChange({ ...row, detail: v })}
          placeholder="Detail kegiatan..."
          className="text-xs"
        />
      </td>

      {/* Biaya */}
      <td className="px-2 py-1.5 w-36">
        <NumericInput
          value={row.biaya}
          onChange={(v) => onChange({ ...row, biaya: v })}
          placeholder="0"
          className="text-xs"
        />
      </td>

      {/* Kalkulasi — select + optional custom formula */}
      <td className="px-2 py-1.5 w-48">
        <Select
          value={row.divisor}
          onChange={(v) => onChange({ ...row, divisor: v as RabItem["divisor"] })}
          options={DIVISOR_OPTIONS as any}
          className="text-xs"
        />
        {row.divisor === "custom" && (
          <TextInput
            value={row.custom_formula ?? ""}
            onChange={(v) => onChange({ ...row, custom_formula: v })}
            placeholder="biaya*2/5"
            className="text-xs mt-1 font-mono"
          />
        )}
      </td>

      {/* Biaya Final — value + kurs selector */}
      <td className="px-3 py-1.5 text-right text-xs font-mono text-neutral-300 whitespace-nowrap">
        <div>{final > 0 ? formatIDR(final) : <span className="text-neutral-600">—</span>}</div>
        <Select
          value={row.kurs_id ?? ""}
          onChange={(v) => onChange({ ...row, kurs_id: v || null })}
          options={kursOptions}
          className="text-[10px] mt-0.5"
        />
      </td>

      {/* Delete */}
      <td className="px-2 py-1.5 w-8">
        <button
          onClick={onDelete}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-neutral-600 hover:text-red-400 text-lg leading-none cursor-pointer"
          title="Hapus baris"
        >×</button>
      </td>
    </tr>
  );
}

interface SummaryRowProps {
  label: string;
  value: number;
  editable?: boolean;
  rawValue?: number | "";
  onChange?: (v: number | "") => void;
  variant?: "default" | "highlight" | "success" | "danger" | "total";
}
export function SummaryRow({ label, value, editable, rawValue, onChange, variant = "default" }: SummaryRowProps) {
  const bg = {
    default: "",
    highlight: "bg-blue-950/30",
    success: "bg-teal-950/30",
    danger: "bg-red-950/30",
    total: "bg-neutral-800/60 border-t border-neutral-700",
  }[variant];

  const textColor = {
    default: "text-neutral-300",
    highlight: "text-blue-300 font-semibold",
    success: "text-teal-300",
    danger: "text-red-400",
    total: "text-neutral-100 font-bold",
  }[variant];

  return (
    <tr className={clsx("transition-colors", bg)}>
      <td colSpan={3} className={clsx("px-3 py-2 text-xs font-medium", variant === "total" ? "text-neutral-200 font-semibold" : "text-neutral-400")}>
        {label}
      </td>
      <td className={clsx("px-3 py-2 text-right text-xs font-mono whitespace-nowrap", textColor)}>
        {editable && onChange ? (
          <NumericInput
            value={rawValue ?? ""}
            onChange={onChange}
            className="text-xs text-right w-36 ml-auto"
          />
        ) : (
          formatIDR(value)
        )}
      </td>
      <td />
    </tr>
  );
}

interface BudgetPanelProps {
  title: string;
  accent?: "teal" | "amber";
  fixedRows: { label: string; final: number }[];
  rows: RabItem[];
  dynamicFinals: number[];
  kursList?: KursEntry[];
  summaryRows?: React.ReactNode;
  toggle?: { label: string; checked: boolean; onChange: (v: boolean) => void };
  onAdd: () => void;
  onUpdate: (i: number, row: RabItem) => void;
  onDelete: (i: number) => void;
}

export function BudgetPanel({
  title, accent = "teal", fixedRows, rows, dynamicFinals, kursList = [],
  summaryRows, toggle, onAdd, onUpdate, onDelete,
}: BudgetPanelProps) {
  const [detailWidth, setDetailWidth] = useState(180);
  const resizeRef = useRef<{ startX: number; startW: number } | null>(null);

  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizeRef.current = { startX: e.clientX, startW: detailWidth };
    const onMove = (me: MouseEvent) => {
      if (!resizeRef.current) return;
      setDetailWidth(Math.max(80, resizeRef.current.startW + (me.clientX - resizeRef.current.startX)));
    };
    const onUp = () => {
      resizeRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [detailWidth]);

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
      <div className={clsx(
        "px-4 py-3 border-b border-neutral-800 text-xs font-bold uppercase tracking-widest flex items-center justify-between gap-3"
      )}>
        <span className={accent === "teal" ? "text-teal-400" : "text-amber-400"}>{title}</span>
        {toggle && (
          <label className="flex items-center gap-1.5 text-[10px] font-normal uppercase tracking-wider text-neutral-500 cursor-pointer normal-case">
            <input
              type="checkbox"
              checked={toggle.checked}
              onChange={(e) => toggle.onChange(e.target.checked)}
              className="cursor-pointer accent-teal-500"
            />
            {toggle.label}
          </label>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-neutral-800">
              {/* Resizable Detail Kegiatan header */}
              <th
                style={{ width: detailWidth, minWidth: 80 }}
                className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-neutral-600 relative select-none"
              >
                Detail Kegiatan
                <div
                  onMouseDown={handleResizeMouseDown}
                  className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-neutral-600/60 transition-colors"
                  title="Drag to resize"
                />
              </th>
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-neutral-600 w-36">Biaya</th>
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-neutral-600 w-48">Kalkulasi</th>
              <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-neutral-600">Biaya Final</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800/50">
            {fixedRows.map((r, i) => <FixedRow key={i} {...r} detailWidth={detailWidth} />)}
            {rows.map((row, i) => (
              <DynamicRow
                key={row.id}
                row={row}
                final={dynamicFinals[i] ?? 0}
                onChange={(v) => onUpdate(i, v)}
                onDelete={() => onDelete(i)}
                detailWidth={detailWidth}
                kursList={kursList}
              />
            ))}
            <tr>
              <td colSpan={5} className="px-3 py-2">
                <button
                  onClick={onAdd}
                  className="w-full border border-dashed border-neutral-700 hover:border-teal-600 hover:text-teal-400 text-neutral-600 text-xs rounded-lg py-2 transition-colors cursor-pointer"
                >
                  + Tambah baris
                </button>
              </td>
            </tr>
            {summaryRows}
          </tbody>
        </table>
      </div>
    </div>
  );
}

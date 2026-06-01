"use client";
import { useState, useEffect, useRef } from "react";
import { pesertaApi, visaApi } from "@/lib/trip/api";
import type { ManifestPeserta, VisaStatus } from "@/types/trip";
import { clsx } from "clsx";

interface Props {
  tripId: string;
  tripName: string;
  tglBerangkat: string;
  tglPulang: string;
}

// ── Status badge ───────────────────────────────────────────────────────────────

function VisaBadge({ status }: { status: VisaStatus }) {
  switch (status) {
    case "uploaded":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-teal-900/50 border border-teal-700/50 px-2 py-0.5 text-[10px] text-teal-400">
          ✓ Terupload
        </span>
      );
    case "approved":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-teal-900/50 border border-teal-700/50 px-2 py-0.5 text-[10px] text-teal-300">
          ✓ Approved
        </span>
      );
    case "pending":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-900/40 border border-amber-700/50 px-2 py-0.5 text-[10px] text-amber-400">
          ⚠ Belum
        </span>
      );
    case "not_required":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-neutral-800 border border-neutral-700 px-2 py-0.5 text-[10px] text-neutral-500">
          Tidak perlu
        </span>
      );
    case "rejected":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-900/40 border border-red-700/50 px-2 py-0.5 text-[10px] text-red-400">
          ✕ Rejected
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center rounded-full bg-neutral-800 px-2 py-0.5 text-[10px] text-neutral-500">
          {status}
        </span>
      );
  }
}

export function ManifestVisa({ tripId }: Props) {
  const [list, setList] = useState<ManifestPeserta[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingPid, setUploadingPid] = useState<string | null>(null);
  const [deletingPid, setDeletingPid] = useState<string | null>(null);
  const [csvUploading, setCsvUploading] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Per-row hidden file inputs
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const load = () =>
    pesertaApi.list(tripId).then(setList).finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, [tripId]);

  const handleUpload = async (pid: string, file: File) => {
    setUploadingPid(pid);
    setMsg(null);
    try {
      await visaApi.upload(tripId, pid, file);
      await load();
      setMsg({ ok: true, text: "Visa berhasil diupload." });
    } catch (e: any) {
      setMsg({ ok: false, text: e.message ?? "Upload gagal" });
    } finally {
      setUploadingPid(null);
    }
  };

  const handleDelete = async (pid: string) => {
    if (!confirm("Hapus visa ini?")) return;
    setDeletingPid(pid);
    setMsg(null);
    try {
      await visaApi.delete(tripId, pid);
      await load();
      setMsg({ ok: true, text: "Visa dihapus." });
    } catch (e: any) {
      setMsg({ ok: false, text: e.message ?? "Hapus gagal" });
    } finally {
      setDeletingPid(null);
    }
  };

  if (loading) return <div className="p-6 text-sm text-neutral-600">Memuat...</div>;

  const uploaded = list.filter((p) => p.visa_status === "uploaded" || p.visa_status === "approved").length;
  const notRequired = list.filter((p) => p.visa_status === "not_required").length;

  return (
    <div>
      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800 flex-wrap gap-2">
        <span className="text-xs text-neutral-400">
          {uploaded}/{list.length - notRequired} visa terupload
          {notRequired > 0 && <span className="ml-2 text-neutral-600">({notRequired} tidak perlu)</span>}
        </span>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={async () => {
              try { await visaApi.exportCsv(tripId); }
              catch (e: any) { setMsg({ ok: false, text: e.message }); }
            }}
            disabled={list.length === 0}
            className="rounded-lg border border-neutral-700 hover:border-teal-500 hover:text-teal-400 text-neutral-400 text-xs py-1.5 px-3 transition-colors cursor-pointer disabled:opacity-40 whitespace-nowrap"
          >
            ↓ Export CSV
          </button>
          <button
            onClick={async () => {
              setCsvUploading(true);
              setMsg(null);
              try {
                const res = await visaApi.uploadCsvToDrive(tripId);
                setMsg({ ok: true, text: `CSV terupload ke Drive: ${res.file_name}` });
              } catch (e: any) {
                setMsg({ ok: false, text: e.message ?? "Upload CSV gagal" });
              } finally {
                setCsvUploading(false);
              }
            }}
            disabled={csvUploading || list.length === 0}
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

      {/* ── Table ───────────────────────────────────────────────────────────── */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-neutral-800">
              {["NO", "TITLE", "NAMA LENGKAP", "NO PASPOR", "STATUS VISA", "AKSI"].map((col, i) => (
                <th key={i} className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-neutral-600 whitespace-nowrap">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800/50">
            {list.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-xs text-neutral-600">
                  Belum ada peserta
                </td>
              </tr>
            )}
            {list.map((p) => (
              <tr key={p.id} className="group hover:bg-white/[0.02] transition-colors">
                <td className="px-3 py-2 text-xs text-neutral-500">{p.no_urut}</td>
                <td className="px-3 py-2 text-xs text-neutral-400">{p.title ?? "—"}</td>
                <td className="px-3 py-2 text-xs font-medium text-neutral-100">{p.nama_lengkap}</td>
                <td className="px-3 py-2 text-xs font-mono text-neutral-300">{p.no_paspor ?? "—"}</td>
                <td className="px-3 py-2">
                  <VisaBadge status={p.visa_status} />
                </td>
                <td className="px-3 py-2">
                  {/* Hidden file input per row */}
                  <input
                    ref={(el) => { fileRefs.current[p.id] = el; }}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,image/*,application/pdf"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) await handleUpload(p.id, file);
                      e.target.value = "";
                    }}
                  />
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    {(p.visa_status === "uploaded" || p.visa_status === "approved") && p.visa_drive_file_id && (
                      <a
                        href={`https://drive.google.com/file/d/${p.visa_drive_file_id}/view`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-teal-500 hover:text-teal-300 cursor-pointer whitespace-nowrap"
                      >
                        ↓ Download
                      </a>
                    )}
                    {(p.visa_status === "uploaded" || p.visa_status === "approved") ? (
                      <button
                        onClick={() => fileRefs.current[p.id]?.click()}
                        disabled={uploadingPid === p.id}
                        className="text-[10px] text-neutral-500 hover:text-teal-400 cursor-pointer disabled:opacity-40 whitespace-nowrap"
                      >
                        {uploadingPid === p.id ? "Uploading…" : "↑ Ganti"}
                      </button>
                    ) : (
                      <button
                        onClick={() => fileRefs.current[p.id]?.click()}
                        disabled={uploadingPid === p.id}
                        className="text-[10px] text-neutral-500 hover:text-teal-400 cursor-pointer disabled:opacity-40 whitespace-nowrap"
                      >
                        {uploadingPid === p.id ? "Uploading…" : "↑ Upload Visa"}
                      </button>
                    )}
                    {p.visa_drive_file_id && (
                      <button
                        onClick={() => handleDelete(p.id)}
                        disabled={deletingPid === p.id}
                        className="text-[10px] text-neutral-500 hover:text-red-400 cursor-pointer disabled:opacity-40 whitespace-nowrap"
                      >
                        {deletingPid === p.id ? "Menghapus…" : "✕ Hapus"}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

"use client";
import { useState, useEffect, useRef } from "react";
import { itineraryApi } from "@/lib/trip/api";
import type { TripItinerary } from "@/types/trip";
import { clsx } from "clsx";

interface Props {
  tripId: string;
  tripName: string;
}

export function ManifestItinerary({ tripId }: Props) {
  const [list, setList] = useState<TripItinerary[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingIid, setUploadingIid] = useState<string | null>(null);
  const [deletingIid, setDeletingIid] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [zipUploading, setZipUploading] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Per-row hidden file inputs (for replace)
  const replaceRefs = useRef<Record<string, HTMLInputElement | null>>({});
  // Global upload file input
  const uploadRef = useRef<HTMLInputElement | null>(null);

  const load = () =>
    itineraryApi.list(tripId).then(setList).finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, [tripId]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await itineraryApi.upload(tripId, fd);
      await load();
      setMsg({ ok: true, text: "Itinerary berhasil diupload." });
    } catch (e: any) {
      setMsg({ ok: false, text: e.message ?? "Upload gagal" });
    } finally {
      setUploading(false);
    }
  };

  const handleReplace = async (iid: string, file: File) => {
    setUploadingIid(iid);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await itineraryApi.replace(tripId, iid, fd);
      await load();
      setMsg({ ok: true, text: "File berhasil diganti." });
    } catch (e: any) {
      setMsg({ ok: false, text: e.message ?? "Ganti gagal" });
    } finally {
      setUploadingIid(null);
    }
  };

  const handleDelete = async (iid: string) => {
    if (!confirm("Hapus file itinerary ini?")) return;
    setDeletingIid(iid);
    setMsg(null);
    try {
      await itineraryApi.delete(tripId, iid);
      await load();
      setMsg({ ok: true, text: "File dihapus." });
    } catch (e: any) {
      setMsg({ ok: false, text: e.message ?? "Hapus gagal" });
    } finally {
      setDeletingIid(null);
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateStr;
    }
  };

  if (loading) return <div className="p-6 text-sm text-neutral-600">Memuat...</div>;

  return (
    <div>
      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800 flex-wrap gap-2">
        <span className="text-xs text-neutral-400">
          {list.length} file itinerary
        </span>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Global upload input */}
          <input
            ref={uploadRef}
            type="file"
            accept="*/*"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) await handleUpload(file);
              e.target.value = "";
            }}
          />
          <button
            onClick={() => uploadRef.current?.click()}
            disabled={uploading}
            className="rounded-lg border border-neutral-700 hover:border-teal-500 hover:text-teal-400 text-neutral-400 text-xs py-1.5 px-3 transition-colors cursor-pointer disabled:opacity-40 whitespace-nowrap"
          >
            {uploading ? "Uploading…" : "↑ Upload Itinerary"}
          </button>
          <button
            onClick={async () => {
              try { await itineraryApi.exportZip(tripId); }
              catch (e: any) { setMsg({ ok: false, text: e.message }); }
            }}
            disabled={list.length === 0}
            className="rounded-lg border border-neutral-700 hover:border-teal-500 hover:text-teal-400 text-neutral-400 text-xs py-1.5 px-3 transition-colors cursor-pointer disabled:opacity-40 whitespace-nowrap"
          >
            ↓ Export ZIP
          </button>
          <button
            onClick={async () => {
              setZipUploading(true);
              setMsg(null);
              try {
                const res = await itineraryApi.uploadZipToDrive(tripId);
                setMsg({ ok: true, text: `ZIP terupload ke Drive: ${res.file_name}` });
              } catch (e: any) {
                setMsg({ ok: false, text: e.message ?? "Upload ZIP gagal" });
              } finally {
                setZipUploading(false);
              }
            }}
            disabled={zipUploading || list.length === 0}
            className="rounded-lg border border-neutral-700 hover:border-teal-500 hover:text-teal-400 text-neutral-400 text-xs py-1.5 px-3 transition-colors cursor-pointer disabled:opacity-40 whitespace-nowrap"
          >
            {zipUploading ? "Uploading…" : "↑ Upload ZIP ke Drive"}
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
              {["NO", "FILE NAME", "UPLOADED AT", "ACTIONS"].map((col, i) => (
                <th key={i} className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-neutral-600 whitespace-nowrap">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800/50">
            {list.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-xs text-neutral-600">
                  Belum ada file itinerary
                </td>
              </tr>
            )}
            {list.map((item, idx) => (
              <tr key={item.id} className="group hover:bg-white/[0.02] transition-colors">
                <td className="px-3 py-2 text-xs text-neutral-500">{idx + 1}</td>
                <td className="px-3 py-2 text-xs font-medium text-neutral-100">{item.file_name}</td>
                <td className="px-3 py-2 text-xs text-neutral-400">{formatDate(item.created_at)}</td>
                <td className="px-3 py-2">
                  {/* Hidden file input per row (replace) */}
                  <input
                    ref={(el) => { replaceRefs.current[item.id] = el; }}
                    type="file"
                    accept="*/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) await handleReplace(item.id, file);
                      e.target.value = "";
                    }}
                  />
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    {item.drive_view_url && (
                      <a
                        href={item.drive_view_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-teal-500 hover:text-teal-300 cursor-pointer whitespace-nowrap"
                      >
                        📄 Download
                      </a>
                    )}
                    <button
                      onClick={() => replaceRefs.current[item.id]?.click()}
                      disabled={uploadingIid === item.id}
                      className="text-[10px] text-neutral-500 hover:text-teal-400 cursor-pointer disabled:opacity-40 whitespace-nowrap"
                    >
                      {uploadingIid === item.id ? "Uploading…" : "↑ Ganti"}
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      disabled={deletingIid === item.id}
                      className="text-[10px] text-neutral-500 hover:text-red-400 cursor-pointer disabled:opacity-40 whitespace-nowrap"
                    >
                      {deletingIid === item.id ? "Menghapus…" : "🗑 Hapus"}
                    </button>
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

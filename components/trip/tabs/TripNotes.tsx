"use client";
import { useState, useEffect } from "react";
import { notesApi } from "@/lib/trip/api";
import { Button } from "@/components/ui";
import type { TripNote } from "@/types/trip";

interface Props { tripId: string }

export function TripNotes({ tripId }: Props) {
  const [notes, setNotes] = useState<TripNote[]>([]);
  const [draft, setDraft] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");

  const load = () => notesApi.list(tripId).then(setNotes);
  useEffect(() => { load(); }, [tripId]);

  const handleAdd = async () => {
    if (!draft.trim()) return;
    await notesApi.create(tripId, draft.trim());
    setDraft("");
    load();
  };

  const handleUpdate = async (nid: string) => {
    if (!editContent.trim()) return;
    await notesApi.update(tripId, nid, editContent.trim());
    setEditId(null);
    load();
  };

  const handleDelete = async (nid: string) => {
    await notesApi.delete(tripId, nid);
    load();
  };

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });

  return (
    <div className="p-4 flex flex-col gap-4">
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Tulis catatan baru..."
        rows={3}
        className="w-full rounded-lg bg-neutral-950 border border-neutral-700 px-3 py-2.5 text-sm text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-teal-500 transition-colors resize-y"
      />
      <div className="flex justify-end">
        <Button size="sm" variant="primary" onClick={handleAdd}>Tambah Catatan</Button>
      </div>

      <div className="flex flex-col gap-3">
        {notes.length === 0 && (
          <p className="text-xs text-neutral-600 text-center py-6">Belum ada catatan</p>
        )}
        {notes.map((n) => (
          <div key={n.id} className="bg-neutral-950/60 border border-neutral-800 rounded-xl p-4">
            {editId === n.id ? (
              <>
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg bg-neutral-900 border border-neutral-700 px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:border-teal-500 resize-y mb-3"
                />
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>Batal</Button>
                  <Button size="sm" variant="primary" onClick={() => handleUpdate(n.id)}>Simpan</Button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-neutral-200 whitespace-pre-wrap mb-3">{n.content}</p>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-neutral-600">
                    {n.created_by ?? "ops"} · {fmt(n.created_at)}
                    {n.updated_at !== n.created_at && " (diedit)"}
                  </span>
                  <div className="flex gap-3">
                    <button
                      onClick={() => { setEditId(n.id); setEditContent(n.content); }}
                      className="text-[10px] text-neutral-500 hover:text-teal-400 cursor-pointer"
                    >edit</button>
                    <button
                      onClick={() => handleDelete(n.id)}
                      className="text-[10px] text-neutral-500 hover:text-red-400 cursor-pointer"
                    >hapus</button>
                  </div>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

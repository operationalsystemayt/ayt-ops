"use client";
// app/rab/[id]/page.tsx
import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import toast from "react-hot-toast";
import { useRabStore } from "@/store/rab";
import { RabForm } from "@/components/rab/RabForm";
import { Spinner } from "@/components/ui";
import type { RabMaster } from "@/types/rab";

export default function RabEditPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;
  const { list, fetchList, saveRab } = useRabStore();
  const [rab, setRab] = useState<RabMaster | null>(null);
  const [saving, setSaving] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (list.length === 0) {
      fetchList().then(() => {
        const found = useRabStore.getState().list.find((r) => r.id === id);
        if (found) setRab(found);
        else setNotFound(true);
      });
    } else {
      const found = list.find((r) => r.id === id);
      if (found) setRab(found);
      else setNotFound(true);
    }
  }, [id, list, fetchList]);

  const handleSave = async (updated: RabMaster) => {
    setSaving(true);
    try {
      await saveRab(updated);
      toast.success("RAB berhasil diupdate");
      router.push("/rab");
    } catch (e: any) {
      toast.error(e.message ?? "Gagal menyimpan RAB");
    } finally {
      setSaving(false);
    }
  };

  if (notFound) return (
    <div className="text-center py-24 text-neutral-500">
      RAB tidak ditemukan.{" "}
      <button onClick={() => router.push("/rab")} className="text-teal-400 underline cursor-pointer">Kembali</button>
    </div>
  );

  if (!rab) return <Spinner />;

  return (
    <div>
      <div className="mb-6">
        <button
          onClick={() => router.push("/rab")}
          className="text-sm text-neutral-500 hover:text-neutral-300 transition-colors mb-3 cursor-pointer"
        >
          ← Kembali ke list
        </button>
        <h1 className="text-xl font-semibold text-neutral-100">Edit RAB Master</h1>
        <p className="text-sm text-neutral-500 mt-0.5">{rab.header.nama}</p>
      </div>
      <RabForm initial={rab} onSave={handleSave} onCancel={() => router.push("/rab")} isSaving={saving} />
    </div>
  );
}

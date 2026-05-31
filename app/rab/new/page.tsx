"use client";
// app/rab/new/page.tsx
import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { useRabStore } from "@/store/rab";
import { RabForm } from "@/components/rab/RabForm";
import { newRab } from "@/lib/rab/factory";

export default function RabNewPage() {
  const router = useRouter();
  const { saveRab } = useRabStore();
  const [saving, setSaving] = useState(false);
  const [initial] = useState(() => newRab());

  const handleSave = async (rab: any) => {
    setSaving(true);
    try {
      await saveRab(rab);
      toast.success("RAB berhasil disimpan");
      router.push("/rab");
    } catch (e: any) {
      toast.error(e.message ?? "Gagal menyimpan RAB");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <button
          onClick={() => router.push("/rab")}
          className="text-sm text-neutral-500 hover:text-neutral-300 transition-colors mb-3 cursor-pointer"
        >
          ← Kembali ke list
        </button>
        <h1 className="text-xl font-semibold text-neutral-100">Buat RAB Master Baru</h1>
      </div>
      <RabForm initial={initial} onSave={handleSave} onCancel={() => router.push("/rab")} isSaving={saving} />
    </div>
  );
}

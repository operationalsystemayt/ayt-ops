"use client";
// app/rab/page.tsx
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { useRabStore } from "@/store/rab";
import { RabCard } from "@/components/rab/RabCard";
import { RabDetail } from "@/components/rab/RabCard";
import { Button, EmptyState, Spinner } from "@/components/ui";
import type { RabMaster } from "@/types/rab";

export default function RabListPage() {
  const router = useRouter();
  const { list, loading, fetchList, deleteRab } = useRabStore();
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<RabMaster | null>(null);

  useEffect(() => { fetchList(); }, [fetchList]);

  const filtered = list.filter((r) =>
    r.header.nama.toLowerCase().includes(search.toLowerCase())
  );

  const handleDelete = async (id: string) => {
    if (!confirm("Hapus RAB ini dari list? File di Drive tidak terpengaruh.")) return;
    try {
      await deleteRab(id);
      setDetail(null);
      toast.success("RAB berhasil dihapus");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-neutral-100">RAB Master</h1>
          <p className="text-sm text-neutral-500 mt-0.5">Rencana Anggaran Biaya per trip</p>
        </div>
        <Button variant="primary" onClick={() => router.push("/rab/new")}>
          + Buat RAB Baru
        </Button>
      </div>

      {/* Search */}
      <div className="flex items-center gap-3 mb-6">
        <input
          className="flex-1 bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-2.5 text-sm text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-neutral-600 transition-colors"
          placeholder="Cari nama RAB..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span className="text-xs text-neutral-600 whitespace-nowrap">{filtered.length} RAB</span>
      </div>

      {/* Content */}
      {loading ? (
        <Spinner />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="📋"
          title={search ? "Tidak ada hasil" : "Belum ada RAB"}
          desc={search ? `Tidak ada RAB dengan nama "${search}"` : 'Klik "Buat RAB Baru" untuk mulai membuat Rencana Anggaran Biaya'}
          action={!search ? (
            <Button variant="primary" onClick={() => router.push("/rab/new")}>
              + Buat RAB Pertama
            </Button>
          ) : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((rab) => (
            <RabCard
              key={rab.id}
              rab={rab}
              onClick={() => setDetail(rab)}
              onEdit={() => router.push(`/rab/${rab.id}`)}
              onDelete={() => handleDelete(rab.id)}
            />
          ))}
        </div>
      )}

      {/* Detail popup */}
      {detail && (
        <RabDetail
          rab={detail}
          onClose={() => setDetail(null)}
          onEdit={() => { setDetail(null); router.push(`/rab/${detail.id}`); }}
          onDelete={() => handleDelete(detail.id)}
        />
      )}
    </div>
  );
}

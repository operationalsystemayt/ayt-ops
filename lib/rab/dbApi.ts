// lib/rab/dbApi.ts — Go backend persistence for RAB Master
import type { RabMaster } from "@/types/rab";

const BASE = process.env.NEXT_PUBLIC_TRIP_API_URL ?? "http://localhost:8080";

export interface RabMasterSummary {
  id: string;
  nama: string;
  jumlah_pax: number;
  jumlah_hari: number;
  jumlah_malam: number;
  jumlah_tl: number;
  kurs: number;
  harga_jual: number;
  updated_at: string;
}

export const rabDbApi = {
  list: async (): Promise<RabMasterSummary[]> => {
    const res = await fetch(`${BASE}/api/rab`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },

  upsert: async (rab: RabMaster): Promise<void> => {
    const res = await fetch(`${BASE}/api/rab`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rab),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  },

  delete: async (id: string): Promise<void> => {
    await fetch(`${BASE}/api/rab/${id}`, { method: "DELETE" });
  },
};

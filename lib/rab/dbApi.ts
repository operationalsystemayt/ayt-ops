// lib/rab/dbApi.ts — Go backend API for RAB Master (backend-first source of truth)
import type { RabMaster } from "@/types/rab";

const BASE = process.env.NEXT_PUBLIC_TRIP_API_URL ?? "http://localhost:8080";

// Kept for the trip-creation dropdown which only needs minimal fields
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

// Extract summary from a full RabMaster (used by the trip dropdown)
export function toRabSummary(rab: RabMaster): RabMasterSummary {
  return {
    id: rab.id,
    nama: rab.header.nama,
    jumlah_pax:   Number(rab.header.jumlah_pax)   || 0,
    jumlah_hari:  Number(rab.header.jumlah_hari)  || 0,
    jumlah_malam: Number(rab.header.jumlah_malam) || 0,
    jumlah_tl:    Number(rab.header.jumlah_tl)    || 0,
    kurs:         Number(rab.header.kurs)         || 1,
    harga_jual:   Number(rab.harga_jual)          || 0,
    updated_at:   rab.updated_at,
  };
}

export const rabDbApi = {
  // Returns full RabMaster[] from JSONB data column
  list: async (): Promise<RabMaster[]> => {
    const res = await fetch(`${BASE}/api/rab`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },

  // Returns a single full RabMaster from JSONB data column
  get: async (id: string): Promise<RabMaster> => {
    const res = await fetch(`${BASE}/api/rab/${id}`);
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

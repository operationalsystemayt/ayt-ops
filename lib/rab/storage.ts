// lib/rab/storage.ts
// Storage adapter — switches backend based on NEXT_PUBLIC_STORAGE_BACKEND.
// Phase 1: "local" = localStorage (no backend needed)
// Phase 2: "supabase" = Supabase DB + Google Drive

import type { RabMaster } from "@/types/rab";
import { appConfig } from "@/config/app";

const LS_KEY = "ayt_rab_list_v1";

// ─── Local Storage adapter ────────────────────────────────────────────────────
const localAdapter = {
  async list(): Promise<RabMaster[]> {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  async get(id: string): Promise<RabMaster | null> {
    const list = await localAdapter.list();
    return list.find((r) => r.id === id) ?? null;
  },

  async save(rab: RabMaster): Promise<RabMaster> {
    const list = await localAdapter.list();
    const idx = list.findIndex((r) => r.id === rab.id);
    if (idx >= 0) {
      list[idx] = rab;
    } else {
      list.unshift(rab);
    }
    localStorage.setItem(LS_KEY, JSON.stringify(list));
    return rab;
  },

  async delete(id: string): Promise<void> {
    const list = await localAdapter.list();
    localStorage.setItem(LS_KEY, JSON.stringify(list.filter((r) => r.id !== id)));
  },
};

// ─── Supabase adapter (Phase 2 — wired up when backend is ready) ──────────────
const supabaseAdapter = {
  async list(): Promise<RabMaster[]> {
    const res = await fetch("/api/rab");
    if (!res.ok) throw new Error("Failed to fetch RAB list");
    return res.json();
  },

  async get(id: string): Promise<RabMaster | null> {
    const res = await fetch(`/api/rab/${id}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error("Failed to fetch RAB");
    return res.json();
  },

  async save(rab: RabMaster): Promise<RabMaster> {
    const isNew = !rab.db_id;
    const res = await fetch(isNew ? "/api/rab" : `/api/rab/${rab.id}`, {
      method: isNew ? "POST" : "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rab),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message ?? "Failed to save RAB");
    }
    return res.json();
  },

  async delete(id: string): Promise<void> {
    const res = await fetch(`/api/rab/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to delete RAB");
  },
};

// ─── Public adapter (auto-selected by env) ───────────────────────────────────
export const rabStorage =
  appConfig.storageBackend === "supabase" ? supabaseAdapter : localAdapter;

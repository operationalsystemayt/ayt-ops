// lib/rab/storage.ts
// Backend-first storage: Go backend is the source of truth.
// localStorage is an offline cache — used only when backend is unreachable.

import type { RabMaster } from "@/types/rab";
import { rabDbApi } from "./dbApi";

const LS_KEY = "ayt_rab_list_v1";

// ── localStorage cache (offline fallback) ────────────────────────────────────
const localCache = {
  list(): RabMaster[] {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  },
  set(list: RabMaster[]) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(list)); } catch {}
  },
  upsert(rab: RabMaster) {
    const list = localCache.list();
    const idx = list.findIndex((r) => r.id === rab.id);
    if (idx >= 0) list[idx] = rab; else list.unshift(rab);
    localCache.set(list);
  },
  remove(id: string) {
    localCache.set(localCache.list().filter((r) => r.id !== id));
  },
  get(id: string): RabMaster | null {
    return localCache.list().find((r) => r.id === id) ?? null;
  },
};

// ── Backend-first adapter ─────────────────────────────────────────────────────
export const rabStorage = {
  async list(): Promise<RabMaster[]> {
    try {
      const list = await rabDbApi.list();
      localCache.set(list); // update offline cache
      return list;
    } catch (e) {
      console.warn("[RAB] backend unreachable — using localStorage cache", e);
      return localCache.list();
    }
  },

  async get(id: string): Promise<RabMaster | null> {
    try {
      return await rabDbApi.get(id);
    } catch {
      return localCache.get(id);
    }
  },

  async save(rab: RabMaster): Promise<RabMaster> {
    localCache.upsert(rab); // always cache locally (instant feedback)
    try {
      await rabDbApi.upsert(rab);
    } catch (e) {
      console.warn("[RAB] backend save failed — saved to localStorage only", e);
    }
    return rab;
  },

  async delete(id: string): Promise<void> {
    localCache.remove(id); // always remove from local cache
    try {
      await rabDbApi.delete(id);
    } catch (e) {
      console.warn("[RAB] backend delete failed", e);
    }
  },
};

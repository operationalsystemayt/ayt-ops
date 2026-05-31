// store/rab.ts
import { create } from "zustand";
import type { RabMaster } from "@/types/rab";
import { rabStorage } from "@/lib/rab/storage";

interface RabStore {
  list: RabMaster[];
  loading: boolean;
  error: string | null;

  fetchList: () => Promise<void>;
  saveRab: (rab: RabMaster) => Promise<RabMaster>;
  deleteRab: (id: string) => Promise<void>;
}

export const useRabStore = create<RabStore>((set, get) => ({
  list: [],
  loading: false,
  error: null,

  fetchList: async () => {
    set({ loading: true, error: null });
    try {
      const list = await rabStorage.list();
      set({ list, loading: false });
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  saveRab: async (rab: RabMaster) => {
    const saved = await rabStorage.save({
      ...rab,
      updated_at: new Date().toISOString().slice(0, 10),
    });
    set((state) => {
      const exists = state.list.find((r) => r.id === saved.id);
      return {
        list: exists
          ? state.list.map((r) => (r.id === saved.id ? saved : r))
          : [saved, ...state.list],
      };
    });
    return saved;
  },

  deleteRab: async (id: string) => {
    await rabStorage.delete(id);
    set((state) => ({ list: state.list.filter((r) => r.id !== id) }));
  },
}));

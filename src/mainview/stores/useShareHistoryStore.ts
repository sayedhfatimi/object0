import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { ShareHistoryEntry } from "../../shared/s3.types";
import { useUIStore } from "./useUIStore";

interface ShareHistoryState {
  entries: ShareHistoryEntry[];
  addEntry: (entry: Omit<ShareHistoryEntry, "id" | "createdAt">) => void;
  removeEntry: (id: string) => void;
  clearExpired: () => void;
  clearAll: () => void;
}

const MAX_HISTORY_ENTRIES = 50;

export const useShareHistoryStore = create<ShareHistoryState>()(
  persist(
    (set) => ({
      entries: [],

      addEntry: (entry) => {
        if (!useUIStore.getState().persistShareHistory) {
          return;
        }

        const newEntry: ShareHistoryEntry = {
          ...entry,
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
        };

        set((state) => ({
          entries: [newEntry, ...state.entries].slice(0, MAX_HISTORY_ENTRIES),
        }));
      },

      removeEntry: (id) => {
        set((state) => ({
          entries: state.entries.filter((e) => e.id !== id),
        }));
      },

      clearExpired: () => {
        const now = Date.now();
        set((state) => {
          const entries = state.entries.filter(
            (e) => new Date(e.expiresAt).getTime() > now,
          );
          if (entries.length === state.entries.length) {
            return state;
          }
          return { entries };
        });
      },

      clearAll: () => {
        set({ entries: [] });
      },
    }),
    {
      name: "object0-share-history",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

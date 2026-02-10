import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export interface BrowserTab {
  id: string;
  profileId: string;
  profileName: string;
  bucket: string;
  prefix: string;
}

interface TabState {
  tabs: BrowserTab[];
  activeTabId: string | null;

  addTab: (tab: Omit<BrowserTab, "id">) => string;
  removeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  updateTabPrefix: (id: string, prefix: string) => void;

  /** Open a bucket in a new tab or switch to existing tab for that bucket */
  openBucket: (profileId: string, profileName: string, bucket: string) => void;
}

export const useTabStore = create<TabState>()(
  persist(
    (set, get) => ({
      tabs: [],
      activeTabId: null,

      addTab: (tab) => {
        const id = crypto.randomUUID();
        const newTab: BrowserTab = { ...tab, id };
        set((s) => ({
          tabs: [...s.tabs, newTab],
          activeTabId: id,
        }));
        return id;
      },

      removeTab: (id) => {
        const { tabs, activeTabId } = get();
        const idx = tabs.findIndex((t) => t.id === id);
        const next = tabs.filter((t) => t.id !== id);

        let nextActive = activeTabId;
        if (activeTabId === id) {
          // Activate adjacent tab
          if (next.length === 0) {
            nextActive = null;
          } else if (idx >= next.length) {
            nextActive = next[next.length - 1].id;
          } else {
            nextActive = next[idx].id;
          }
        }

        set({ tabs: next, activeTabId: nextActive });
      },

      setActiveTab: (id) => set({ activeTabId: id }),

      updateTabPrefix: (id, prefix) => {
        set((s) => ({
          tabs: s.tabs.map((t) => (t.id === id ? { ...t, prefix } : t)),
        }));
      },

      openBucket: (profileId, profileName, bucket) => {
        const { tabs, setActiveTab, addTab } = get();
        // Check for existing tab
        const existing = tabs.find(
          (t) => t.profileId === profileId && t.bucket === bucket,
        );
        if (existing) {
          setActiveTab(existing.id);
          return;
        }
        addTab({ profileId, profileName, bucket, prefix: "" });
      },
    }),
    {
      name: "object0-tabs",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        tabs: state.tabs,
        activeTabId: state.activeTabId,
      }),
    },
  ),
);

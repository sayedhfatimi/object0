import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type Theme = "dark-dim" | "light-nord";

interface ThemeState {
  theme: Theme;
  toggle: () => void;
  setTheme: (theme: Theme) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: "dark-dim",
      toggle: () =>
        set((s) => ({
          theme: s.theme === "dark-dim" ? "light-nord" : "dark-dim",
        })),
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: "object0-theme",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

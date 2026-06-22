import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type Theme = "light" | "dark";

interface ThemeState {
  theme: Theme;
  toggle: () => void;
  setTheme: (theme: Theme) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: "dark",
      toggle: () =>
        set((s) => ({ theme: s.theme === "dark" ? "light" : "dark" })),
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: "object0-theme",
      storage: createJSONStorage(() => localStorage),
      // Migrate the old daisyUI theme names to the new values.
      migrate: (persisted) => {
        const state = persisted as { theme?: string } | undefined;
        const old = state?.theme;
        const theme: Theme =
          old === "light-nord" ? "light" : old === "dark-dim" ? "dark" : (old as Theme) ?? "dark";
        return { theme } as ThemeState;
      },
      version: 1,
    },
  ),
);

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
        const old = (persisted as { theme?: string } | undefined)?.theme;
        const theme: Theme =
          old === "light-nord" || old === "light"
            ? "light"
            : old === "dark-dim" || old === "dark"
              ? "dark"
              : "dark";
        return { theme } as Pick<ThemeState, "theme">;
      },
      version: 1,
    },
  ),
);

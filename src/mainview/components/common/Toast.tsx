import { toast as sonnerToast, Toaster } from "sonner";
import { useThemeStore } from "../../stores/useThemeStore";

export { sonnerToast as toast };

/**
 * Sonner-powered Toast root component.
 * Mount once at the app root (e.g. in App.tsx).
 */
export function Toast() {
  const theme = useThemeStore((s) => s.theme);
  const sonnerTheme = theme === "dark-dim" ? "dark" : "light";

  return (
    <Toaster
      theme={sonnerTheme}
      position="bottom-right"
      richColors
      closeButton
      toastOptions={{
        duration: 4000,
      }}
    />
  );
}

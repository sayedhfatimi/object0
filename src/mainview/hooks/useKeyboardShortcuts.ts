import { useEffect } from "react";

interface ShortcutMap {
  [combo: string]: (e: KeyboardEvent) => void;
}

/**
 * Registers global keyboard shortcuts.
 * Combo format: "ctrl+k", "ctrl+shift+a", "delete", etc.
 */
export function useKeyboardShortcuts(shortcuts: ShortcutMap) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const parts: string[] = [];
      if (e.ctrlKey || e.metaKey) parts.push("ctrl");
      if (e.shiftKey) parts.push("shift");
      if (e.altKey) parts.push("alt");
      parts.push(e.key.toLowerCase());
      const combo = parts.join("+");

      const fn = shortcuts[combo];
      if (fn) {
        e.preventDefault();
        fn(e);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [shortcuts]);
}

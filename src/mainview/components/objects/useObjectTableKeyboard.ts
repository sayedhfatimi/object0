import type { S3Object, S3Prefix } from "@shared/s3.types";
import { useCallback, useEffect, useRef, useState } from "react";
import { useObjectStore } from "@/stores";

interface UseObjectTableKeyboardParams {
  objects: S3Object[];
  prefixes: S3Prefix[];
  sorted: S3Object[];
  selectedKeys: Set<string>;
  renamingKey: string | null;
  profileId: string | null;
  bucket: string | null;
  onToggleSelect: (key: string) => void;
  onNavigate: (prefix: string) => void;
  onClearSelection: () => void;
  onSelectAll: () => void;
  startRename: (key: string) => void;
}

// Keyboard navigation + context-menu triggering for the object table: arrow/Home/
// End focus movement, Space/Enter/Escape, Ctrl+A, F2 rename, Backspace back, and
// ContextMenu/Shift+F10. Owns the focused-row index and scroll-into-view.
export function useObjectTableKeyboard({
  objects,
  prefixes,
  sorted,
  selectedKeys,
  renamingKey,
  profileId,
  bucket,
  onToggleSelect,
  onNavigate,
  onClearSelection,
  onSelectAll,
  startRename,
}: UseObjectTableKeyboardParams) {
  const tableRef = useRef<HTMLDivElement>(null);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const totalRows = prefixes.length + objects.length;

  // Reset focus when items change
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on data change
  useEffect(() => {
    setFocusedIndex(-1);
  }, [objects, prefixes]);

  // Scroll focused row into view
  useEffect(() => {
    if (focusedIndex < 0) return;
    const row = tableRef.current?.querySelector(
      `[data-row-index="${focusedIndex}"]`,
    );
    row?.scrollIntoView({ block: "nearest" });
  }, [focusedIndex]);

  const openContextMenuForIndex = useCallback(
    (rowIndex: number) => {
      if (rowIndex < 0 || rowIndex >= totalRows) return;
      const isFolder = rowIndex < prefixes.length;
      const key = isFolder
        ? prefixes[rowIndex]?.prefix
        : sorted[rowIndex - prefixes.length]?.key;
      if (!key) return;

      const row = tableRef.current?.querySelector<HTMLElement>(
        `[data-row-index="${rowIndex}"]`,
      );
      const rect = row?.getBoundingClientRect();
      const x = rect ? rect.left + Math.min(rect.width - 12, 220) : 200;
      const y = rect ? rect.top + rect.height / 2 : 160;

      // Dispatch a synthetic contextmenu event on the row element so the
      // Base UI ContextMenu primitive can open at the keyboard-triggered position.
      if (row) {
        const syntheticEvent = new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y,
        });
        row.dispatchEvent(syntheticEvent);
      }
    },
    [prefixes, sorted, totalRows],
  );

  const handleTableKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Don't intercept if renaming
      if (renamingKey) return;

      switch (e.key) {
        case "ArrowDown": {
          e.preventDefault();
          setFocusedIndex((prev) => Math.min(prev + 1, totalRows - 1));
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          setFocusedIndex((prev) => Math.max(prev - 1, 0));
          break;
        }
        case "Home": {
          e.preventDefault();
          setFocusedIndex(0);
          break;
        }
        case "End": {
          e.preventDefault();
          setFocusedIndex(totalRows - 1);
          break;
        }
        case " ": {
          e.preventDefault();
          if (focusedIndex < 0) break;
          // Toggle selection on focused row
          const key =
            focusedIndex < prefixes.length
              ? prefixes[focusedIndex].prefix
              : sorted[focusedIndex - prefixes.length]?.key;
          if (key) onToggleSelect(key);
          break;
        }
        case "Enter": {
          e.preventDefault();
          if (focusedIndex < 0) break;
          if (focusedIndex < prefixes.length) {
            // Navigate into folder
            onNavigate(prefixes[focusedIndex].prefix);
          }
          break;
        }
        case "Escape": {
          e.preventDefault();
          if (selectedKeys.size > 0) {
            onClearSelection();
          } else {
            setFocusedIndex(-1);
            if (document.activeElement instanceof HTMLElement) {
              document.activeElement.blur();
            }
          }
          break;
        }
        case "a": {
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            onSelectAll();
          }
          break;
        }
        case "F2": {
          e.preventDefault();
          if (focusedIndex >= prefixes.length) {
            const obj = sorted[focusedIndex - prefixes.length];
            if (obj) startRename(obj.key);
          }
          break;
        }
        case "Backspace": {
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            const store = useObjectStore.getState();
            if (store.prefixHistory.length > 0) {
              store.navigateBack();
              if (profileId && bucket) {
                const prevPrefix =
                  store.prefixHistory[store.prefixHistory.length - 1] ?? "";
                store.loadObjects(profileId, bucket, prevPrefix);
              }
            }
          }
          break;
        }
        case "ContextMenu": {
          e.preventDefault();
          openContextMenuForIndex(focusedIndex);
          break;
        }
        case "F10": {
          if (e.shiftKey) {
            e.preventDefault();
            openContextMenuForIndex(focusedIndex);
          }
          break;
        }
      }
    },
    [
      focusedIndex,
      totalRows,
      prefixes,
      sorted,
      selectedKeys.size,
      renamingKey,
      onToggleSelect,
      onNavigate,
      onClearSelection,
      onSelectAll,
      profileId,
      bucket,
      startRename,
      openContextMenuForIndex,
    ],
  );

  return { tableRef, focusedIndex, setFocusedIndex, handleTableKeyDown };
}

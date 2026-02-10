import { useCallback, useEffect, useRef, useState } from "react";
import type { S3Object, S3Prefix } from "../../../shared/s3.types";
import {
  formatBytes,
  formatRelativeDate,
  getFileName,
} from "../../lib/formatters";
import { rpcCall } from "../../lib/rpc-client";
import { useBucketStore } from "../../stores/useBucketStore";
import { useObjectStore } from "../../stores/useObjectStore";
import { useProfileStore } from "../../stores/useProfileStore";
import { FileIcon } from "../common/FileIcon";
import { toast } from "../common/Toast";
import { type ContextMenuState, ObjectContextMenu } from "./ObjectContextMenu";

interface ObjectTableProps {
  objects: S3Object[];
  prefixes: S3Prefix[];
  selectedKeys: Set<string>;
  sortField: "key" | "size" | "lastModified";
  sortDir: "asc" | "desc";
  loading: boolean;
  onNavigate: (prefix: string) => void;
  onSort: (field: "key" | "size" | "lastModified") => void;
  onToggleSelect: (key: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
}

export function ObjectTable({
  objects,
  prefixes,
  selectedKeys,
  sortField,
  sortDir,
  loading,
  onNavigate,
  onSort,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
}: ObjectTableProps) {
  const totalItems = objects.length + prefixes.length;
  const allSelected = totalItems > 0 && selectedKeys.size === totalItems;
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [renamingKey, setRenamingKey] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameRef = useRef<HTMLInputElement>(null);
  const profileId = useProfileStore((s) => s.activeProfileId);
  const bucket = useBucketStore((s) => s.selectedBucket);
  const tableRef = useRef<HTMLDivElement>(null);
  const [focusedIndex, setFocusedIndex] = useState(-1);

  // All rows: prefixes first, then sorted objects
  const totalRows = prefixes.length + objects.length;

  // Reset focus when items change
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on data change
  useEffect(() => {
    setFocusedIndex(-1);
  }, [objects, prefixes]);

  const startRename = useCallback((key: string) => {
    const name = getFileName(key);
    setRenamingKey(key);
    setRenameValue(name);
  }, []);

  // Sort objects locally
  const sorted = [...objects].sort((a, b) => {
    let cmp = 0;
    switch (sortField) {
      case "key":
        cmp = a.key.localeCompare(b.key);
        break;
      case "size":
        cmp = a.size - b.size;
        break;
      case "lastModified":
        cmp =
          new Date(a.lastModified).getTime() -
          new Date(b.lastModified).getTime();
        break;
    }
    return sortDir === "asc" ? cmp : -cmp;
  });

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
      setContextMenu({ x, y, key, isFolder });
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

  // Focus rename input when it appears
  useEffect(() => {
    if (renamingKey && renameRef.current) {
      renameRef.current.focus();
      // Select just the name part, not extension
      const dot = renameValue.lastIndexOf(".");
      if (dot > 0) {
        renameRef.current.setSelectionRange(0, dot);
      } else {
        renameRef.current.select();
      }
    }
  }, [renamingKey, renameValue]);

  const commitRename = async () => {
    if (!renamingKey || !renameValue.trim() || !profileId || !bucket) {
      setRenamingKey(null);
      return;
    }

    const oldName = getFileName(renamingKey);
    const newName = renameValue.trim();
    if (newName === oldName) {
      setRenamingKey(null);
      return;
    }

    // Build the new key by replacing the filename portion
    const prefix = renamingKey.substring(
      0,
      renamingKey.length - oldName.length,
    );
    const newKey = `${prefix}${newName}`;

    try {
      await rpcCall("objects:rename", {
        profileId,
        bucket,
        oldKey: renamingKey,
        newKey,
      });
      toast.success(`Renamed to "${newName}"`);
      const currentPrefix = useObjectStore.getState().currentPrefix;
      useObjectStore.getState().loadObjects(profileId, bucket, currentPrefix);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Rename failed");
    }
    setRenamingKey(null);
  };

  const handleContextMenu = (
    e: React.MouseEvent,
    key: string,
    isFolder: boolean,
  ) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, key, isFolder });
  };

  const sortIcon = (field: string) => {
    if (sortField !== field) return "";
    return sortDir === "asc" ? " ↑" : " ↓";
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: keyboard row navigation container
    <div
      ref={tableRef}
      className="flex-1 overflow-auto outline-none"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: keyboard row navigation container
      tabIndex={0}
      onKeyDown={handleTableKeyDown}
    >
      <table
        className="table-pin-rows table-sm table"
        aria-label="Object table"
      >
        <thead>
          <tr className="bg-base-200">
            <th className="w-8">
              <input
                type="checkbox"
                className="checkbox checkbox-xs"
                checked={allSelected}
                onChange={() =>
                  allSelected ? onClearSelection() : onSelectAll()
                }
              />
            </th>
            <th
              className="select-none"
              scope="col"
              aria-sort={
                sortField === "key"
                  ? sortDir === "asc"
                    ? "ascending"
                    : "descending"
                  : "none"
              }
            >
              <button
                type="button"
                className="flex w-full items-center gap-1 text-left"
                onClick={() => onSort("key")}
              >
                Name
                <span aria-hidden>{sortIcon("key")}</span>
              </button>
            </th>
            <th
              className="w-24 select-none text-right"
              scope="col"
              aria-sort={
                sortField === "size"
                  ? sortDir === "asc"
                    ? "ascending"
                    : "descending"
                  : "none"
              }
            >
              <button
                type="button"
                className="ml-auto flex items-center gap-1 text-right"
                onClick={() => onSort("size")}
              >
                Size
                <span aria-hidden>{sortIcon("size")}</span>
              </button>
            </th>
            <th
              className="w-36 select-none text-right"
              scope="col"
              aria-sort={
                sortField === "lastModified"
                  ? sortDir === "asc"
                    ? "ascending"
                    : "descending"
                  : "none"
              }
            >
              <button
                type="button"
                className="ml-auto flex items-center gap-1 text-right"
                onClick={() => onSort("lastModified")}
              >
                Modified
                <span aria-hidden>{sortIcon("lastModified")}</span>
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {/* Prefixes (folders) */}
          {prefixes.map((p, i) => (
            <tr
              key={p.prefix}
              data-row-index={i}
              aria-selected={selectedKeys.has(p.prefix)}
              className={`cursor-pointer transition-colors duration-150 hover:bg-base-200/50 ${
                selectedKeys.has(p.prefix)
                  ? "border-primary border-l-2 bg-primary/10"
                  : "border-transparent border-l-2"
              } ${focusedIndex === i ? "outline-1 outline-primary/60" : ""}`}
              onDoubleClick={() => onNavigate(p.prefix)}
              onClick={() => setFocusedIndex(i)}
              onContextMenu={(e) => handleContextMenu(e, p.prefix, true)}
            >
              <td>
                <input
                  type="checkbox"
                  className="checkbox checkbox-xs"
                  checked={selectedKeys.has(p.prefix)}
                  onChange={() => onToggleSelect(p.prefix)}
                />
              </td>
              <td>
                <div className="flex items-center gap-2">
                  <FileIcon name="" isFolder />
                  <button
                    type="button"
                    className="cursor-pointer border-none bg-transparent p-0 font-inherit text-inherit hover:underline"
                    onClick={() => onNavigate(p.prefix)}
                  >
                    {p.prefix.split("/").filter(Boolean).pop()}/
                  </button>
                </div>
              </td>
              <td className="text-right text-base-content/40">—</td>
              <td className="text-right text-base-content/40">—</td>
            </tr>
          ))}

          {/* Objects (files) */}
          {sorted.map((obj, i) => {
            const rowIdx = prefixes.length + i;
            return (
              <tr
                key={obj.key}
                data-row-index={rowIdx}
                aria-selected={selectedKeys.has(obj.key)}
                className={`transition-colors duration-150 hover:bg-base-200/50 ${
                  selectedKeys.has(obj.key)
                    ? "border-primary border-l-2 bg-primary/10"
                    : "border-transparent border-l-2"
                } ${focusedIndex === rowIdx ? "outline-1 outline-primary/60" : ""}`}
                onClick={() => setFocusedIndex(rowIdx)}
                onContextMenu={(e) => handleContextMenu(e, obj.key, false)}
              >
                <td>
                  <input
                    type="checkbox"
                    className="checkbox checkbox-xs"
                    checked={selectedKeys.has(obj.key)}
                    onChange={() => onToggleSelect(obj.key)}
                  />
                </td>
                <td>
                  <div className="flex items-center gap-2">
                    <FileIcon name={obj.key} />
                    {renamingKey === obj.key ? (
                      <input
                        ref={renameRef}
                        type="text"
                        className="input input-sm max-w-md font-mono text-xs"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitRename();
                          if (e.key === "Escape") setRenamingKey(null);
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        className="max-w-md cursor-text truncate border-none bg-transparent p-0 text-left font-inherit text-inherit"
                        onDoubleClick={() => startRename(obj.key)}
                        onKeyDown={(e) => {
                          if (e.key === "F2") startRename(obj.key);
                        }}
                        aria-label={`Rename ${getFileName(obj.key)}`}
                      >
                        {getFileName(obj.key)}
                      </button>
                    )}
                  </div>
                </td>
                <td className="text-right font-mono text-base-content/60">
                  {formatBytes(obj.size)}
                </td>
                <td className="text-right text-base-content/60">
                  {formatRelativeDate(obj.lastModified)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {loading && (
        <div className="flex justify-center py-3">
          <span className="loading loading-spinner loading-sm text-primary" />
        </div>
      )}

      {/* Context Menu */}
      <ObjectContextMenu
        menu={contextMenu}
        onClose={() => setContextMenu(null)}
        onRename={startRename}
      />
    </div>
  );
}

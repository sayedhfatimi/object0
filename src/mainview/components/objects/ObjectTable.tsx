import type {
  S3Object,
  S3Prefix,
  SortDirection,
  SortField,
} from "@shared/s3.types";
import { useCallback, useEffect, useRef, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
} from "@/components/ui/table";
import { formatBytes, formatRelativeDate, getFileName } from "@/lib/formatters";
import { rpcCall } from "@/lib/rpc-client";
import { useBucketStore, useObjectStore, useProfileStore } from "@/stores";
import { FileIcon } from "../common/FileIcon";
import { toast } from "../common/Toast";
import { ObjectContextMenu } from "./ObjectContextMenu";

interface ObjectTableProps {
  objects: S3Object[];
  prefixes: S3Prefix[];
  selectedKeys: Set<string>;
  sortField: SortField;
  sortDir: SortDirection;
  loading: boolean;
  onNavigate: (prefix: string) => void;
  onSort: (field: SortField) => void;
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

  const getSortIndicator = (field: string) => {
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
      <Table aria-label="Object table" className="table-fixed">
        <TableHeader className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
          <tr className="hover:bg-transparent border-b">
            <TableHead className="w-8 px-2">
              <Checkbox
                checked={allSelected}
                onCheckedChange={() =>
                  allSelected ? onClearSelection() : onSelectAll()
                }
                aria-label="Select all"
              />
            </TableHead>
            <TableHead
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
                <span aria-hidden>{getSortIndicator("key")}</span>
              </button>
            </TableHead>
            <TableHead
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
                <span aria-hidden>{getSortIndicator("size")}</span>
              </button>
            </TableHead>
            <TableHead
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
                <span aria-hidden>{getSortIndicator("lastModified")}</span>
              </button>
            </TableHead>
          </tr>
        </TableHeader>
        <TableBody>
          {/* Prefixes (folders) */}
          {prefixes.map((p, i) => (
            <ObjectContextMenu
              key={p.prefix}
              objectKey={p.prefix}
              isFolder
              onRename={startRename}
              triggerRender={
                <tr
                  data-row-index={i}
                  aria-selected={selectedKeys.has(p.prefix)}
                  className={`cursor-pointer transition-colors duration-150 ${
                    selectedKeys.has(p.prefix)
                      ? "border-l-2 border-l-primary bg-primary/10"
                      : "border-l-2 border-l-transparent hover:bg-muted/50"
                  } ${focusedIndex === i ? "outline outline-1 outline-primary/60" : ""}`}
                  onDoubleClick={() => onNavigate(p.prefix)}
                  onClick={() => setFocusedIndex(i)}
                />
              }
            >
              <TableCell className="px-2">
                <Checkbox
                  checked={selectedKeys.has(p.prefix)}
                  onCheckedChange={() => onToggleSelect(p.prefix)}
                  aria-label={`Select ${p.prefix}`}
                />
              </TableCell>
              <TableCell>
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
              </TableCell>
              <TableCell className="text-right text-foreground/40">—</TableCell>
              <TableCell className="text-right text-foreground/40">—</TableCell>
            </ObjectContextMenu>
          ))}

          {/* Objects (files) */}
          {sorted.map((obj, i) => {
            const rowIdx = prefixes.length + i;
            return (
              <ObjectContextMenu
                key={obj.key}
                objectKey={obj.key}
                isFolder={false}
                onRename={startRename}
                triggerRender={
                  <tr
                    data-row-index={rowIdx}
                    aria-selected={selectedKeys.has(obj.key)}
                    className={`cursor-pointer transition-colors duration-150 ${
                      selectedKeys.has(obj.key)
                        ? "border-l-2 border-l-primary bg-primary/10"
                        : "border-l-2 border-l-transparent hover:bg-muted/50"
                    } ${focusedIndex === rowIdx ? "outline outline-1 outline-primary/60" : ""}`}
                    onClick={() => setFocusedIndex(rowIdx)}
                  />
                }
              >
                <TableCell className="px-2">
                  <Checkbox
                    checked={selectedKeys.has(obj.key)}
                    onCheckedChange={() => onToggleSelect(obj.key)}
                    aria-label={`Select ${getFileName(obj.key)}`}
                  />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <FileIcon name={obj.key} />
                    {renamingKey === obj.key ? (
                      <Input
                        ref={renameRef}
                        type="text"
                        className="h-6 max-w-md font-mono text-xs"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={() => void commitRename()}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void commitRename();
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
                </TableCell>
                <TableCell className="text-right font-mono text-foreground/60">
                  {formatBytes(obj.size)}
                </TableCell>
                <TableCell className="text-right text-foreground/60">
                  {formatRelativeDate(obj.lastModified)}
                </TableCell>
              </ObjectContextMenu>
            );
          })}
        </TableBody>
      </Table>

      {loading && (
        <div className="flex justify-center py-3">
          <div className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}
    </div>
  );
}

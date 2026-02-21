import { create } from "zustand";
import type { ObjectFilters, S3Object, S3Prefix } from "../../shared/s3.types";
import { DEFAULT_PAGE_SIZE } from "../lib/constants";
import { rpcCall } from "../lib/rpc-client";
import { useUIStore } from "./useUIStore";

interface ObjectState {
  objects: S3Object[];
  prefixes: S3Prefix[];
  loading: boolean;
  error: string | null;

  // Navigation
  currentPrefix: string;
  prefixHistory: string[];

  // Pagination
  isTruncated: boolean;
  nextCursor: string | undefined;
  pageHistory: string[]; // stack of startAfter cursors

  // Sorting
  sortField: "key" | "size" | "lastModified";
  sortDir: "asc" | "desc";

  // Filters
  filters: ObjectFilters;

  // Selection
  selectedKeys: Set<string>;

  // Actions
  loadObjects: (
    profileId: string,
    bucket: string,
    prefix?: string,
    pageSize?: number,
    startAfter?: string,
  ) => Promise<void>;
  navigateToPrefix: (prefix: string) => void;
  navigateBack: () => void;
  setSort: (field: "key" | "size" | "lastModified") => void;
  setFilters: (filters: Partial<ObjectFilters>) => void;
  toggleSelect: (key: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
  reset: () => void;
}

const defaultFilters: ObjectFilters = {
  fileType: "all",
  size: "any",
  date: { type: "any" },
  search: "",
};

export const useObjectStore = create<ObjectState>()((set, get) => ({
  objects: [],
  prefixes: [],
  loading: false,
  error: null,
  currentPrefix: "",
  prefixHistory: [],
  isTruncated: false,
  nextCursor: undefined,
  pageHistory: [],
  sortField: "key",
  sortDir: "asc",
  filters: { ...defaultFilters },
  selectedKeys: new Set(),

  loadObjects: async (profileId, bucket, prefix, pageSize, startAfter) => {
    try {
      set({ loading: true, error: null });
      const resolvedPageSize =
        pageSize ?? useUIStore.getState().pageSize ?? DEFAULT_PAGE_SIZE;

      const result = await rpcCall("objects:list", {
        profileId,
        bucket,
        prefix: prefix ?? get().currentPrefix,
        maxKeys: resolvedPageSize,
        startAfter,
      });

      set({
        objects: result.objects,
        prefixes: result.prefixes,
        isTruncated: result.isTruncated,
        nextCursor: result.nextCursor,
        loading: false,
        selectedKeys: new Set(),
      });
    } catch (err: unknown) {
      set({
        error: err instanceof Error ? err.message : "Unknown error",
        loading: false,
      });
    }
  },

  navigateToPrefix: (prefix) => {
    const current = get().currentPrefix;
    set((s) => ({
      currentPrefix: prefix,
      prefixHistory: [...s.prefixHistory, current],
      selectedKeys: new Set(),
      pageHistory: [],
    }));
  },

  navigateBack: () => {
    const history = get().prefixHistory;
    if (history.length === 0) return;

    const previous = history[history.length - 1];
    set({
      currentPrefix: previous,
      prefixHistory: history.slice(0, -1),
      selectedKeys: new Set(),
      pageHistory: [],
    });
  },

  setSort: (field) => {
    const { sortField, sortDir } = get();
    if (sortField === field) {
      set({ sortDir: sortDir === "asc" ? "desc" : "asc" });
    } else {
      set({ sortField: field, sortDir: "asc" });
    }
  },

  setFilters: (partial) => {
    set((s) => ({ filters: { ...s.filters, ...partial } }));
  },

  toggleSelect: (key) => {
    set((s) => {
      const next = new Set(s.selectedKeys);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return { selectedKeys: next };
    });
  },

  selectAll: () => {
    set((s) => ({
      selectedKeys: new Set([
        ...s.objects.map((o) => o.key),
        ...s.prefixes.map((p) => p.prefix),
      ]),
    }));
  },

  clearSelection: () => set({ selectedKeys: new Set() }),

  reset: () =>
    set({
      objects: [],
      prefixes: [],
      loading: false,
      error: null,
      currentPrefix: "",
      prefixHistory: [],
      isTruncated: false,
      nextCursor: undefined,
      pageHistory: [],
      selectedKeys: new Set(),
      filters: { ...defaultFilters },
    }),
}));

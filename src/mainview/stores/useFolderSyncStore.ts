import { create } from "zustand";
import type {
  FolderSyncConflict,
  FolderSyncConflictEvent,
  FolderSyncDiff,
  FolderSyncErrorEvent,
  FolderSyncRule,
  FolderSyncRuleInput,
  FolderSyncRuleStatus,
  FolderSyncState,
  FolderSyncStatusEvent,
} from "../../shared/folder-sync.types";
import { onEvent, rpcCall } from "../lib/rpc-client";

const MAX_CONFLICTS = 200;

interface FolderSyncStore {
  // ── Data ──
  rules: FolderSyncRule[];
  statuses: Map<string, FolderSyncState>;
  conflicts: FolderSyncConflict[];
  errors: Map<string, string>; // ruleId → last error message
  loading: boolean;
  previewDiff: FolderSyncDiff | null;
  previewRuleId: string | null;

  // ── UI state ──
  folderSyncPanelOpen: boolean;
  addRuleDialogOpen: boolean;
  editingRule: FolderSyncRule | null;

  // ── Actions ──
  init: () => void;
  loadRules: () => Promise<void>;
  addRule: (input: FolderSyncRuleInput) => Promise<FolderSyncRule>;
  updateRule: (input: FolderSyncRuleInput & { id: string }) => Promise<void>;
  removeRule: (id: string) => Promise<void>;
  toggleRule: (id: string, enabled: boolean) => Promise<void>;
  syncNow: (id: string) => Promise<void>;
  refreshStatuses: () => Promise<void>;
  previewRule: (id: string) => Promise<void>;
  clearPreview: () => void;
  clearConflicts: (ruleId?: string) => void;
  pickFolder: () => Promise<string | null>;
  startAll: () => Promise<void>;
  stopAll: () => Promise<void>;
  pauseAll: () => Promise<void>;
  resumeAll: () => Promise<void>;

  // ── UI actions ──
  setFolderSyncPanelOpen: (open: boolean) => void;
  setAddRuleDialogOpen: (open: boolean) => void;
  setEditingRule: (rule: FolderSyncRule | null) => void;

  // ── Helpers ──
  getRuleStatus: (ruleId: string) => FolderSyncRuleStatus;
  getActiveCount: () => number;
  getSyncingCount: () => number;
}

let initialized = false;

export const useFolderSyncStore = create<FolderSyncStore>()((set, get) => ({
  rules: [],
  statuses: new Map(),
  conflicts: [],
  errors: new Map(),
  loading: false,
  previewDiff: null,
  previewRuleId: null,
  folderSyncPanelOpen: false,
  addRuleDialogOpen: false,
  editingRule: null,

  init: () => {
    if (initialized) return;
    initialized = true;

    // Subscribe to folder-sync events from bun process
    onEvent("folder-sync:status", (data: FolderSyncStatusEvent) => {
      set((state) => {
        const newStatuses = new Map(state.statuses);
        newStatuses.set(data.ruleId, {
          ruleId: data.ruleId,
          status: data.status,
          filesWatching: data.filesWatching,
          lastChange: data.lastChange,
          currentFile: data.currentFile,
          progress: data.progress,
        });
        return { statuses: newStatuses };
      });
    });

    onEvent("folder-sync:conflict", (data: FolderSyncConflictEvent) => {
      set((state) => ({
        conflicts: [
          {
            ruleId: data.ruleId,
            relativePath: data.relativePath,
            localSize: data.localSize,
            localMtime: data.localMtime,
            remoteSize: data.remoteSize,
            remoteLastModified: data.remoteLastModified,
            remoteEtag: "",
          },
          ...state.conflicts.filter(
            (conflict) =>
              !(
                conflict.ruleId === data.ruleId &&
                conflict.relativePath === data.relativePath
              ),
          ),
        ].slice(0, MAX_CONFLICTS),
      }));
    });

    onEvent("folder-sync:error", (data: FolderSyncErrorEvent) => {
      set((state) => {
        const newErrors = new Map(state.errors);
        newErrors.set(data.ruleId, data.error);
        return { errors: newErrors };
      });
    });
  },

  loadRules: async () => {
    set({ loading: true });
    try {
      const rules = await rpcCall("folder-sync:list-rules", undefined);
      set({ rules, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  addRule: async (input) => {
    const rule = await rpcCall("folder-sync:add-rule", input);
    set((state) => ({ rules: [...state.rules, rule] }));
    return rule;
  },

  updateRule: async (input) => {
    const updated = await rpcCall("folder-sync:update-rule", input);
    set((state) => ({
      rules: state.rules.map((r) => (r.id === updated.id ? updated : r)),
      editingRule: null,
    }));
  },

  removeRule: async (id) => {
    await rpcCall("folder-sync:remove-rule", { id });
    set((state) => ({
      rules: state.rules.filter((r) => r.id !== id),
      conflicts: state.conflicts.filter((conflict) => conflict.ruleId !== id),
      errors: (() => {
        const m = new Map(state.errors);
        m.delete(id);
        return m;
      })(),
      statuses: (() => {
        const m = new Map(state.statuses);
        m.delete(id);
        return m;
      })(),
    }));
  },

  toggleRule: async (id, enabled) => {
    const updated = await rpcCall("folder-sync:toggle-rule", { id, enabled });
    set((state) => ({
      rules: state.rules.map((r) => (r.id === updated.id ? updated : r)),
    }));
  },

  syncNow: async (id) => {
    await rpcCall("folder-sync:sync-now", { id });
  },

  refreshStatuses: async () => {
    const states = await rpcCall("folder-sync:get-status", undefined);
    const newStatuses = new Map<string, FolderSyncState>();
    for (const s of states) {
      newStatuses.set(s.ruleId, s);
    }
    set({ statuses: newStatuses });
  },

  previewRule: async (id) => {
    set({ previewDiff: null, previewRuleId: id });
    const diff = await rpcCall("folder-sync:preview", { id });
    set({ previewDiff: diff });
  },

  clearPreview: () => set({ previewDiff: null, previewRuleId: null }),

  clearConflicts: (ruleId) =>
    set((state) => ({
      conflicts: ruleId
        ? state.conflicts.filter((conflict) => conflict.ruleId !== ruleId)
        : [],
    })),

  pickFolder: async () => {
    const result = await rpcCall("folder-sync:pick-folder", undefined);
    return result.path;
  },

  startAll: async () => {
    await rpcCall("folder-sync:start-all", undefined);
  },

  stopAll: async () => {
    await rpcCall("folder-sync:stop-all", undefined);
  },

  pauseAll: async () => {
    await rpcCall("folder-sync:pause-all", undefined);
  },

  resumeAll: async () => {
    await rpcCall("folder-sync:resume-all", undefined);
  },

  setFolderSyncPanelOpen: (open) => set({ folderSyncPanelOpen: open }),
  setAddRuleDialogOpen: (open) => set({ addRuleDialogOpen: open }),
  setEditingRule: (rule) => set({ editingRule: rule }),

  getRuleStatus: (ruleId) => {
    return get().statuses.get(ruleId)?.status ?? "idle";
  },

  getActiveCount: () => {
    return [...get().statuses.values()].filter(
      (s) => s.status === "watching" || s.status === "syncing",
    ).length;
  },

  getSyncingCount: () => {
    return [...get().statuses.values()].filter((s) => s.status === "syncing")
      .length;
  },
}));

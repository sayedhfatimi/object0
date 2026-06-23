import type {
  FolderSyncListDensity,
  Platform,
  SyncEntryPreference,
} from "@shared/ui.types";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { ViewMode } from "../lib/constants";

// Dialog-local UI targets — scoped to this store, not shared with the backend.
interface ShareTarget {
  key: string;
  bucket: string;
  profileId: string;
}

interface TransferTarget {
  keys: string[];
  defaultMode?: "copy" | "move";
}

export type {
  FolderSyncListDensity,
  Platform,
  SyncEntryPreference,
} from "@shared/ui.types";

interface UIState {
  sidebarCollapsed: boolean;
  viewMode: ViewMode;
  pageSize: number;
  jobPanelOpen: boolean;
  syncDialogOpen: boolean;
  syncChooserOpen: boolean;
  syncEntryPreference: SyncEntryPreference | null;
  shareDialogOpen: boolean;
  shareTarget: ShareTarget | null;
  transferDialogOpen: boolean;
  transferTarget: TransferTarget | null;
  detailKey: string | null;
  shareHistoryOpen: boolean;
  settingsOpen: boolean;
  desktopNotifications: boolean;
  persistShareHistory: boolean;
  jobConcurrency: number;
  folderSyncPanelOpen: boolean;
  folderSyncListDensity: FolderSyncListDensity;
  objectSearchOpen: boolean;
  // Host OS, resolved once at startup via the "system:platform" RPC. Drives the
  // platform-aware window decorations (custom controls on Windows/Linux, native
  // traffic lights on macOS). Not persisted — it is environment-derived.
  platform: Platform | null;

  toggleSidebar: () => void;
  setViewMode: (mode: ViewMode) => void;
  setPageSize: (size: number) => void;
  setJobPanelOpen: (open: boolean) => void;
  setSyncDialogOpen: (open: boolean) => void;
  openSyncEntry: () => void;
  openSyncChooser: () => void;
  closeSyncChooser: () => void;
  setSyncEntryPreference: (preference: SyncEntryPreference | null) => void;
  openShareDialog: (target: ShareTarget) => void;
  closeShareDialog: () => void;
  openTransferDialog: (target: TransferTarget) => void;
  closeTransferDialog: () => void;
  setDetailKey: (key: string | null) => void;
  setShareHistoryOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setDesktopNotifications: (on: boolean) => void;
  setPersistShareHistory: (on: boolean) => void;
  setJobConcurrency: (n: number) => void;
  setFolderSyncPanelOpen: (open: boolean) => void;
  setFolderSyncListDensity: (density: FolderSyncListDensity) => void;
  setObjectSearchOpen: (open: boolean) => void;
  setPlatform: (platform: Platform) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      viewMode: "table",
      pageSize: 100,
      jobPanelOpen: false,
      syncDialogOpen: false,
      syncChooserOpen: false,
      syncEntryPreference: null,
      shareDialogOpen: false,
      shareTarget: null,
      transferDialogOpen: false,
      transferTarget: null,
      detailKey: null,
      shareHistoryOpen: false,
      settingsOpen: false,
      desktopNotifications: true,
      persistShareHistory: false,
      jobConcurrency: 3,
      folderSyncPanelOpen: false,
      folderSyncListDensity: "comfortable",
      objectSearchOpen: false,
      platform: null,

      toggleSidebar: () =>
        set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setViewMode: (mode) => set({ viewMode: mode }),
      setPageSize: (size) => set({ pageSize: size }),
      setJobPanelOpen: (open) => set({ jobPanelOpen: open }),
      setSyncDialogOpen: (open) => set({ syncDialogOpen: open }),
      openSyncEntry: () =>
        set((s) => {
          if (s.syncEntryPreference === "object-sync") {
            return { syncDialogOpen: true, syncChooserOpen: false };
          }
          if (s.syncEntryPreference === "live-folder-sync") {
            return { folderSyncPanelOpen: true, syncChooserOpen: false };
          }
          return { syncChooserOpen: true };
        }),
      openSyncChooser: () => set({ syncChooserOpen: true }),
      closeSyncChooser: () => set({ syncChooserOpen: false }),
      setSyncEntryPreference: (preference) =>
        set({ syncEntryPreference: preference }),
      openShareDialog: (target) =>
        set({ shareDialogOpen: true, shareTarget: target }),
      closeShareDialog: () =>
        set({ shareDialogOpen: false, shareTarget: null }),
      openTransferDialog: (target) =>
        set({ transferDialogOpen: true, transferTarget: target }),
      closeTransferDialog: () =>
        set({ transferDialogOpen: false, transferTarget: null }),
      setDetailKey: (key) => set({ detailKey: key }),
      setShareHistoryOpen: (open) => set({ shareHistoryOpen: open }),
      setSettingsOpen: (open) => set({ settingsOpen: open }),
      setDesktopNotifications: (on) => set({ desktopNotifications: on }),
      setPersistShareHistory: (on) => set({ persistShareHistory: on }),
      setJobConcurrency: (n) => set({ jobConcurrency: n }),
      setFolderSyncPanelOpen: (open) => set({ folderSyncPanelOpen: open }),
      setFolderSyncListDensity: (density) =>
        set({ folderSyncListDensity: density }),
      setObjectSearchOpen: (open) => set({ objectSearchOpen: open }),
      setPlatform: (platform) => set({ platform }),
    }),
    {
      name: "object0-ui",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        viewMode: state.viewMode,
        pageSize: state.pageSize,
        desktopNotifications: state.desktopNotifications,
        persistShareHistory: state.persistShareHistory,
        jobConcurrency: state.jobConcurrency,
        syncEntryPreference: state.syncEntryPreference,
        folderSyncListDensity: state.folderSyncListDensity,
      }),
    },
  ),
);

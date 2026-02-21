import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { ViewMode } from "../lib/constants";

interface ShareTarget {
  key: string;
  bucket: string;
  profileId: string;
}

interface TransferTarget {
  keys: string[];
  defaultMode?: "copy" | "move";
}

export type SyncEntryPreference = "object-sync" | "live-folder-sync";
export type FolderSyncListDensity = "comfortable" | "compact";

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
  sidebarWidth: number;
  detailPanelWidth: number;
  folderSyncPanelOpen: boolean;
  folderSyncListDensity: FolderSyncListDensity;

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
  setSidebarWidth: (width: number) => void;
  setDetailPanelWidth: (width: number) => void;
  setFolderSyncPanelOpen: (open: boolean) => void;
  setFolderSyncListDensity: (density: FolderSyncListDensity) => void;
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
      sidebarWidth: 256,
      detailPanelWidth: 320,
      folderSyncPanelOpen: false,
      folderSyncListDensity: "comfortable",

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
      setSidebarWidth: (width) => set({ sidebarWidth: width }),
      setDetailPanelWidth: (width) => set({ detailPanelWidth: width }),
      setFolderSyncPanelOpen: (open) => set({ folderSyncPanelOpen: open }),
      setFolderSyncListDensity: (density) =>
        set({ folderSyncListDensity: density }),
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
        sidebarWidth: state.sidebarWidth,
        detailPanelWidth: state.detailPanelWidth,
        syncEntryPreference: state.syncEntryPreference,
        folderSyncListDensity: state.folderSyncListDensity,
      }),
    },
  ),
);

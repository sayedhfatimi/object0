import { useCallback, useEffect, useRef, useState } from "react";
import { useS3Objects } from "../../hooks/useS3Objects";
import { OBJECT_TOOLBAR_EVENTS } from "../../lib/object-toolbar-events";
import { rpcCall } from "../../lib/rpc-client";
import { useBucketStore } from "../../stores/useBucketStore";
import { useObjectStore } from "../../stores/useObjectStore";
import { useProfileStore } from "../../stores/useProfileStore";
import { useUIStore } from "../../stores/useUIStore";
import { ConfirmDialog } from "../common/ConfirmDialog";
import { toast } from "../common/Toast";
import { CreateFolderDialog } from "./CreateFolderDialog";

// Pending delete that can be undone
interface PendingDelete {
  keys: string[];
  timerId: ReturnType<typeof setTimeout>;
}

export function ObjectToolbar() {
  const profileId = useProfileStore((s) => s.activeProfileId);
  const bucket = useBucketStore((s) => s.selectedBucket);
  const { selectedKeys, clearSelection, refresh, filters, setFilters } =
    useS3Objects();
  const viewMode = useUIStore((s) => s.viewMode);
  const setViewMode = useUIStore((s) => s.setViewMode);
  const openSyncEntry = useUIStore((s) => s.openSyncEntry);
  const syncEntryPreference = useUIStore((s) => s.syncEntryPreference);
  const openShareDialog = useUIStore((s) => s.openShareDialog);
  const openTransferDialog = useUIStore((s) => s.openTransferDialog);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const pendingDeleteRef = useRef<PendingDelete | null>(null);

  const selected = Array.from(selectedKeys);
  const singleSelectedKey = selected.length === 1 ? selected[0] : null;
  const hasSelection = selectedKeys.size > 0;
  const canShare =
    !!singleSelectedKey &&
    !!profileId &&
    !!bucket &&
    !singleSelectedKey.endsWith("/");
  const syncButtonLabel =
    syncEntryPreference === "object-sync"
      ? "Object Sync"
      : syncEntryPreference === "live-folder-sync"
        ? "Live Sync"
        : "Sync";
  const syncButtonIcon =
    syncEntryPreference === "live-folder-sync"
      ? "fa-solid fa-folder-open"
      : "fa-solid fa-rotate";
  const syncButtonTitle =
    syncEntryPreference === null
      ? "Choose Object Sync (one-time) or Live Folder Sync"
      : "Open your default sync type (use Command Palette to change)";

  const openSearch = useCallback(() => {
    setSearchOpen(true);
    requestAnimationFrame(() => searchRef.current?.focus());
  }, []);

  const handleUpload = useCallback(async () => {
    if (!profileId || !bucket) return;
    const prefix = useObjectStore.getState().currentPrefix;

    try {
      const result = await rpcCall("transfer:pick-and-upload", {
        profileId,
        bucket,
        prefix,
      });
      if (result.jobIds.length > 0) {
        useUIStore.getState().setJobPanelOpen(true);
        toast.success(`Uploading ${result.jobIds.length} file(s)`);
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.message === "No files selected") return;
      toast.error(
        `Upload failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    }
  }, [profileId, bucket]);

  const handleUploadFolder = useCallback(async () => {
    if (!profileId || !bucket) return;
    const prefix = useObjectStore.getState().currentPrefix;

    try {
      const result = await rpcCall("transfer:pick-and-upload-folder", {
        profileId,
        bucket,
        prefix,
      });
      if (result.jobIds.length > 0) {
        useUIStore.getState().setJobPanelOpen(true);
        toast.success(`Uploading ${result.jobIds.length} file(s) from folder`);
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.message === "No folder selected") return;
      toast.error(
        `Folder upload failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    }
  }, [profileId, bucket]);

  const executeDelete = useCallback(
    async (keys: string[]) => {
      if (!profileId || !bucket) return;
      try {
        await rpcCall("objects:delete", { profileId, bucket, keys });
        toast.success(`Deleted ${keys.length} object(s)`);
        refresh();
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : "Unknown error");
      }
    },
    [profileId, bucket, refresh],
  );

  const handleDelete = useCallback(async () => {
    if (!profileId || !bucket || selectedKeys.size === 0) return;

    const keysToDelete = Array.from(selectedKeys);
    const count = keysToDelete.length;
    clearSelection();

    // Cancel any previous pending delete
    if (pendingDeleteRef.current) {
      clearTimeout(pendingDeleteRef.current.timerId);
      // Execute the previous pending delete immediately
      const prev = pendingDeleteRef.current;
      pendingDeleteRef.current = null;
      void executeDelete(prev.keys);
    }

    // Show undo toast; actual delete happens after timeout
    const timerId = setTimeout(() => {
      pendingDeleteRef.current = null;
      void executeDelete(keysToDelete);
    }, 5000);

    pendingDeleteRef.current = { keys: keysToDelete, timerId };

    toast.warning(`Deleting ${count} object(s)...`, {
      duration: 5000,
      action: {
        label: "Undo",
        onClick: () => {
          if (pendingDeleteRef.current?.timerId === timerId) {
            clearTimeout(timerId);
            pendingDeleteRef.current = null;
            toast.info("Delete cancelled");
            refresh();
          }
        },
      },
    });
  }, [profileId, bucket, selectedKeys, clearSelection, executeDelete, refresh]);

  const handleDownload = useCallback(async () => {
    if (!profileId || !bucket || selectedKeys.size === 0) return;

    let started = false;
    for (const key of selectedKeys) {
      try {
        const isFolder = key.endsWith("/");

        if (isFolder) {
          const result = await rpcCall("transfer:download-folder", {
            profileId,
            bucket,
            prefix: key,
          });
          if (result.jobIds.length > 0) {
            if (!started) {
              useUIStore.getState().setJobPanelOpen(true);
              started = true;
            }
            const folderName = key.slice(0, -1).split("/").pop() || key;
            toast.info(
              `Downloading folder ${folderName} (${result.jobIds.length} files)`,
            );
          }
        } else {
          await rpcCall("transfer:download", {
            profileId,
            bucket,
            key,
            localPath: `~/Downloads/${key.split("/").pop()}`,
          });
          if (!started) {
            useUIStore.getState().setJobPanelOpen(true);
            started = true;
          }
          toast.info(`Downloading ${key.split("/").pop()}`);
        }
      } catch (err: unknown) {
        if (
          err instanceof Error &&
          err.message === "No destination folder selected"
        )
          return;
        toast.error(err instanceof Error ? err.message : "Unknown error");
      }
    }
  }, [profileId, bucket, selectedKeys]);

  const handleDownloadArchive = useCallback(async () => {
    if (!profileId || !bucket || selectedKeys.size === 0) return;

    try {
      const keys = Array.from(selectedKeys);
      const prefix = useObjectStore.getState().currentPrefix;

      await rpcCall("transfer:download-archive", {
        profileId,
        bucket,
        keys,
        prefix: prefix || undefined,
      });

      useUIStore.getState().setJobPanelOpen(true);
      toast.info(`Archiving ${keys.length} object(s) as .tar.gz`);
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        err.message === "No destination folder selected"
      )
        return;
      toast.error(
        `Archive failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    }
  }, [profileId, bucket, selectedKeys]);

  const handleShare = useCallback(() => {
    if (!canShare || !profileId || !bucket || !singleSelectedKey) return;
    openShareDialog({ key: singleSelectedKey, bucket, profileId });
  }, [canShare, profileId, bucket, singleSelectedKey, openShareDialog]);

  const handleTransfer = useCallback(() => {
    if (selectedKeys.size === 0) return;
    openTransferDialog({
      keys: Array.from(selectedKeys),
      defaultMode: "copy",
    });
  }, [selectedKeys, openTransferDialog]);

  const openDeleteConfirm = useCallback(() => {
    if (selectedKeys.size === 0) return;
    setConfirmDelete(true);
  }, [selectedKeys.size]);

  useEffect(() => {
    if (searchOpen) {
      searchRef.current?.focus();
    }
  }, [searchOpen]);

  useEffect(() => {
    // Keep event-driven toolbar actions centralized for shortcuts and command palette.
    const registrations = [
      [OBJECT_TOOLBAR_EVENTS.OPEN_SEARCH, openSearch],
      [OBJECT_TOOLBAR_EVENTS.UPLOAD_FILES, () => void handleUpload()],
      [OBJECT_TOOLBAR_EVENTS.UPLOAD_FOLDER, () => void handleUploadFolder()],
      [OBJECT_TOOLBAR_EVENTS.NEW_FOLDER, () => setCreateFolderOpen(true)],
      [OBJECT_TOOLBAR_EVENTS.DOWNLOAD_SELECTION, () => void handleDownload()],
      [OBJECT_TOOLBAR_EVENTS.DELETE_SELECTION, openDeleteConfirm],
      [OBJECT_TOOLBAR_EVENTS.REFRESH_OBJECTS, refresh],
      [OBJECT_TOOLBAR_EVENTS.OPEN_SYNC, openSyncEntry],
      [OBJECT_TOOLBAR_EVENTS.OPEN_TRANSFER, handleTransfer],
      [OBJECT_TOOLBAR_EVENTS.SHARE_SELECTION, handleShare],
    ] as const;

    const listeners = registrations.map(([name, action]) => {
      const listener = () => {
        action();
      };
      window.addEventListener(name, listener);
      return [name, listener] as const;
    });

    return () => {
      for (const [name, listener] of listeners) {
        window.removeEventListener(name, listener);
      }
    };
  }, [
    openSearch,
    handleUpload,
    handleUploadFolder,
    handleDownload,
    openDeleteConfirm,
    refresh,
    openSyncEntry,
    handleTransfer,
    handleShare,
  ]);

  useEffect(() => {
    return () => {
      if (pendingDeleteRef.current) {
        clearTimeout(pendingDeleteRef.current.timerId);
      }
    };
  }, []);

  return (
    <div className="no-drag flex items-center gap-2 border-base-300 border-t px-3 py-2">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => void handleUpload()}
          title="Upload Files"
        >
          <i className="fa-solid fa-cloud-arrow-up" /> Upload
        </button>

        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => setCreateFolderOpen(true)}
          title="Create Folder"
        >
          <i className="fa-regular fa-folder" /> New Folder
        </button>

        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => void handleDownload()}
          disabled={!hasSelection}
          title="Download selected"
        >
          <i className="fa-solid fa-cloud-arrow-down" /> Download
        </button>

        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={openSyncEntry}
          title={syncButtonTitle}
        >
          <i className={syncButtonIcon} /> {syncButtonLabel}
        </button>

        <button
          type="button"
          className={`btn btn-ghost btn-sm ${
            hasSelection
              ? "text-error hover:bg-error/10"
              : "text-base-content/35 opacity-60"
          }`}
          onClick={openDeleteConfirm}
          disabled={!hasSelection}
          title={
            hasSelection ? "Delete selected" : "Select object(s) to delete"
          }
        >
          <i className="fa-regular fa-trash-can" /> Delete
        </button>

        <div className="dropdown dropdown-bottom">
          <button type="button" tabIndex={0} className="btn btn-ghost btn-sm">
            More <i className="fa-solid fa-chevron-down text-[11px]" />
          </button>
          <ul className="dropdown-content menu z-30 mt-1 w-52 rounded-box border border-base-300 bg-base-100 p-1 shadow-xl">
            <li>
              <button type="button" onClick={() => void handleUploadFolder()}>
                <i className="fa-solid fa-folder-plus w-4 text-center" /> Upload
                Folder
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => void handleDownloadArchive()}
                disabled={!hasSelection}
              >
                <i className="fa-solid fa-file-zipper w-4 text-center" />
                Download as Archive
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={handleTransfer}
                disabled={!hasSelection}
              >
                <i className="fa-solid fa-arrow-right-arrow-left w-4 text-center" />
                Transfer
              </button>
            </li>
            <li>
              <button type="button" onClick={handleShare} disabled={!canShare}>
                <i className="fa-solid fa-share-nodes w-4 text-center" /> Share
              </button>
            </li>
          </ul>
        </div>
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        {searchOpen ? (
          <div className="flex items-center gap-1">
            <div className="relative">
              <i className="fa-solid fa-magnifying-glass absolute top-1/2 left-2 -translate-y-1/2 text-[11px] text-base-content/40" />
              <input
                ref={searchRef}
                type="text"
                className="input input-sm w-56 pl-7 font-mono text-xs"
                placeholder="Filter by name..."
                value={filters.search}
                onChange={(e) => setFilters({ search: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setFilters({ search: "" });
                    setSearchOpen(false);
                  }
                }}
              />
              {filters.search && (
                <button
                  type="button"
                  className="absolute top-1/2 right-1.5 -translate-y-1/2 text-base-content/40 hover:text-base-content"
                  onClick={() => {
                    setFilters({ search: "" });
                    searchRef.current?.focus();
                  }}
                  aria-label="Clear search"
                >
                  <i className="fa-solid fa-xmark text-[11px]" />
                </button>
              )}
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm btn-square"
              onClick={() => {
                setFilters({ search: "" });
                setSearchOpen(false);
              }}
              title="Close search"
              aria-label="Close search"
            >
              <i className="fa-solid fa-xmark" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="btn btn-ghost btn-sm btn-square"
            onClick={openSearch}
            title="Search objects (Ctrl+F)"
            aria-label="Search objects"
          >
            <i className="fa-solid fa-magnifying-glass" />
          </button>
        )}

        <button
          type="button"
          className="btn btn-ghost btn-sm btn-square"
          onClick={refresh}
          title="Refresh"
          aria-label="Refresh objects"
        >
          <i className="fa-solid fa-arrows-rotate" />
        </button>

        <div className="join">
          <button
            type="button"
            className={`btn join-item btn-sm ${
              viewMode === "table" ? "btn-active" : "btn-ghost"
            }`}
            onClick={() => setViewMode("table")}
            title="Table view"
            aria-label="Switch to table view"
          >
            <i className="fa-solid fa-table-list" />
          </button>
          <button
            type="button"
            className={`btn join-item btn-sm ${
              viewMode === "grid" ? "btn-active" : "btn-ghost"
            }`}
            onClick={() => setViewMode("grid")}
            title="Grid view"
            aria-label="Switch to grid view"
          >
            <i className="fa-solid fa-grip" />
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => void handleDelete()}
        title="Delete Objects"
        message={`Are you sure you want to delete ${selectedKeys.size} object(s)? This action cannot be undone.`}
        confirmLabel="Delete"
      />

      <CreateFolderDialog
        open={createFolderOpen}
        onClose={() => setCreateFolderOpen(false)}
      />
    </div>
  );
}

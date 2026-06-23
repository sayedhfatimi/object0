import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  IconArrowRightArrowLeft,
  IconArrowsRotate,
  IconChevronDown,
  IconCloudArrowDown,
  IconCloudArrowUp,
  IconFileZipper,
  IconFolder,
  IconFolderOpen,
  IconFolderPlus,
  IconGrip,
  IconMagnifyingGlass,
  IconRotate,
  IconShareNodes,
  IconTableList,
  IconTrashCan,
  IconXmark,
} from "@/lib/icons";
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
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
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
  const SyncButtonIcon =
    syncEntryPreference === "live-folder-sync" ? IconFolderOpen : IconRotate;
  const syncButtonTitle =
    syncEntryPreference === null
      ? "Choose Object Sync (one-time) or Live Folder Sync"
      : "Open your default sync type (use Command Palette to change)";

  const openSearch = useCallback(() => {
    useUIStore.getState().setObjectSearchOpen(true);
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
      // Tauri rejects with the raw error string, not an Error instance.
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Upload failed: ${msg}`);
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
      // Tauri rejects with the raw error string, not an Error instance.
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Folder upload failed: ${msg}`);
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
    <div className="no-drag flex items-center gap-2 border-t border-border px-3 py-2">
      <div className="flex items-center gap-1.5">
        <Button
          size="sm"
          onClick={() => void handleUpload()}
          title="Upload Files"
        >
          <IconCloudArrowUp /> Upload
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCreateFolderOpen(true)}
          title="Create Folder"
        >
          <IconFolder /> New Folder
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => void handleDownload()}
          disabled={!hasSelection}
          title="Download selected"
        >
          <IconCloudArrowDown /> Download
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={openSyncEntry}
          title={syncButtonTitle}
        >
          <SyncButtonIcon /> {syncButtonLabel}
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className={
            hasSelection
              ? "text-destructive hover:bg-destructive/10 hover:text-destructive"
              : "text-foreground/35 opacity-60"
          }
          onClick={openDeleteConfirm}
          disabled={!hasSelection}
          title={
            hasSelection ? "Delete selected" : "Select object(s) to delete"
          }
        >
          <IconTrashCan /> Delete
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="sm">
                More <IconChevronDown className="size-3" />
              </Button>
            }
          />
          <DropdownMenuContent align="start" className="w-52">
            <DropdownMenuItem onClick={() => void handleUploadFolder()}>
              <IconFolderPlus /> Upload Folder
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => void handleDownloadArchive()}
              disabled={!hasSelection}
            >
              <IconFileZipper /> Download as Archive
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleTransfer} disabled={!hasSelection}>
              <IconArrowRightArrowLeft /> Transfer
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleShare} disabled={!canShare}>
              <IconShareNodes /> Share
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        {filters.search && (
          <button
            type="button"
            className="flex h-7 items-center gap-1.5 rounded-md bg-muted px-2 text-foreground/80 text-xs hover:bg-muted/70"
            onClick={() => setFilters({ search: "" })}
            title="Clear filter"
            aria-label="Clear filter"
          >
            <span className="max-w-32 truncate font-mono">
              {filters.search}
            </span>
            <IconXmark className="size-3 shrink-0" />
          </button>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={openSearch}
          title="Search objects (Ctrl+F)"
          aria-label="Search objects"
        >
          <IconMagnifyingGlass />
        </Button>

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={refresh}
          title="Refresh"
          aria-label="Refresh objects"
        >
          <IconArrowsRotate />
        </Button>

        <div className="flex rounded-lg border border-border overflow-hidden">
          <Button
            variant={viewMode === "table" ? "secondary" : "ghost"}
            size="icon-sm"
            className="rounded-none border-0"
            onClick={() => setViewMode("table")}
            title="Table view"
            aria-label="Switch to table view"
          >
            <IconTableList />
          </Button>
          <Button
            variant={viewMode === "grid" ? "secondary" : "ghost"}
            size="icon-sm"
            className="rounded-none border-0 border-l border-border"
            onClick={() => setViewMode("grid")}
            title="Grid view"
            aria-label="Switch to grid view"
          >
            <IconGrip />
          </Button>
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

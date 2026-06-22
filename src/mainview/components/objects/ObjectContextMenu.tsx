import { useEffect, useRef } from "react";
import { rpcCall } from "../../lib/rpc-client";
import { useBucketStore } from "../../stores/useBucketStore";
import { useObjectStore } from "../../stores/useObjectStore";
import { useProfileStore } from "../../stores/useProfileStore";
import { useUIStore } from "../../stores/useUIStore";
import { toast } from "../common/Toast";
import {
  IconCircleInfo,
  IconCloudArrowDown,
  IconShareNodes,
  IconPen,
  IconCopy,
  IconArrowRightArrowLeft,
  IconClipboard,
  IconTrashCan,
} from "@/lib/icons";

interface ContextMenuState {
  x: number;
  y: number;
  key: string;
  isFolder: boolean;
}

interface ObjectContextMenuProps {
  menu: ContextMenuState | null;
  onClose: () => void;
  onRename: (key: string) => void;
}

export type { ContextMenuState };

const MENU_WIDTH = 192;
const MENU_MARGIN = 8;
const FILE_MENU_HEIGHT = 356;
const FOLDER_MENU_HEIGHT = 316;

function clampMenuPosition(
  x: number,
  y: number,
  width: number,
  height: number,
): { x: number; y: number } {
  const maxX = window.innerWidth - width - MENU_MARGIN;
  const maxY = window.innerHeight - height - MENU_MARGIN;
  return {
    x: Math.min(Math.max(x, MENU_MARGIN), Math.max(MENU_MARGIN, maxX)),
    y: Math.min(Math.max(y, MENU_MARGIN), Math.max(MENU_MARGIN, maxY)),
  };
}

export function ObjectContextMenu({
  menu,
  onClose,
  onRename,
}: ObjectContextMenuProps) {
  const profileId = useProfileStore((s) => s.activeProfileId);
  const bucket = useBucketStore((s) => s.selectedBucket);
  const openShareDialog = useUIStore((s) => s.openShareDialog);
  const setDetailKey = useUIStore((s) => s.setDetailKey);
  const openTransferDialog = useUIStore((s) => s.openTransferDialog);

  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape
  useEffect(() => {
    if (!menu) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menu, onClose]);

  if (!menu || !profileId || !bucket) return null;

  const fileName = menu.key.split("/").filter(Boolean).pop() ?? menu.key;
  const menuPosition = clampMenuPosition(
    menu.x,
    menu.y,
    MENU_WIDTH,
    menu.isFolder ? FOLDER_MENU_HEIGHT : FILE_MENU_HEIGHT,
  );

  const handleCopyKey = async () => {
    try {
      await navigator.clipboard.writeText(menu.key);
      toast.success("Key copied to clipboard");
    } catch {
      toast.error("Failed to copy");
    }
    onClose();
  };

  const handleDownload = async () => {
    try {
      if (menu.isFolder) {
        const result = await rpcCall("transfer:download-folder", {
          profileId,
          bucket,
          prefix: menu.key,
        });
        if (result.jobIds.length > 0) {
          useUIStore.getState().setJobPanelOpen(true);
          toast.info(`Downloading folder (${result.jobIds.length} files)`);
        }
      } else {
        await rpcCall("transfer:download", {
          profileId,
          bucket,
          key: menu.key,
          localPath: `~/Downloads/${fileName}`,
        });
        useUIStore.getState().setJobPanelOpen(true);
        toast.info(`Downloading ${fileName}`);
      }
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        err.message === "No destination folder selected"
      )
        return;
      toast.error(err instanceof Error ? err.message : "Unknown error");
    }
    onClose();
  };

  const handleShare = () => {
    if (menu.isFolder) return;
    openShareDialog({ key: menu.key, bucket, profileId });
    onClose();
  };

  const handleDetails = () => {
    setDetailKey(menu.key);
    onClose();
  };

  const handleRename = () => {
    onRename(menu.key);
    onClose();
  };

  const handleDelete = async () => {
    try {
      await rpcCall("objects:delete", {
        profileId,
        bucket,
        keys: [menu.key],
      });
      toast.success(`Deleted "${fileName}"`);
      const prefix = useObjectStore.getState().currentPrefix;
      useObjectStore.getState().loadObjects(profileId, bucket, prefix);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Unknown error");
    }
    onClose();
  };

  return (
    <>
      {/* Dismiss overlay */}
      <button
        type="button"
        className="fixed inset-0 z-50 cursor-default bg-transparent"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
        aria-hidden
      />

      {/* Menu panel */}
      <div
        ref={menuRef}
        role="menu"
        aria-label="Object actions"
        className="fixed z-60 w-48 rounded-lg border border-foreground/10 bg-popover p-1 text-popover-foreground shadow-md"
        style={{
          top: menuPosition.y,
          left: menuPosition.x,
        }}
      >
        {/* Details (files only) */}
        {!menu.isFolder && (
          <button
            type="button"
            role="menuitem"
            className="flex w-full cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
            onClick={handleDetails}
          >
            <IconCircleInfo className="size-4 shrink-0" /> Details
          </button>
        )}

        {/* Download */}
        <button
          type="button"
          role="menuitem"
          className="flex w-full cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
          onClick={() => void handleDownload()}
        >
          <IconCloudArrowDown className="size-4 shrink-0" /> Download
        </button>

        {/* Share (files only) */}
        {!menu.isFolder && (
          <button
            type="button"
            role="menuitem"
            className="flex w-full cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
            onClick={handleShare}
          >
            <IconShareNodes className="size-4 shrink-0" /> Share
          </button>
        )}

        {/* Rename */}
        <button
          type="button"
          role="menuitem"
          className="flex w-full cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
          onClick={handleRename}
        >
          <IconPen className="size-4 shrink-0" /> Rename
        </button>

        {/* Copy to bucket */}
        <button
          type="button"
          role="menuitem"
          className="flex w-full cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
          onClick={() => {
            openTransferDialog({ keys: [menu.key], defaultMode: "copy" });
            onClose();
          }}
        >
          <IconCopy className="size-4 shrink-0" /> Copy to Bucket
        </button>

        {/* Move to bucket */}
        <button
          type="button"
          role="menuitem"
          className="flex w-full cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
          onClick={() => {
            openTransferDialog({ keys: [menu.key], defaultMode: "move" });
            onClose();
          }}
        >
          <IconArrowRightArrowLeft className="size-4 shrink-0" /> Move to Bucket
        </button>

        {/* Copy key */}
        <button
          type="button"
          role="menuitem"
          className="flex w-full cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
          onClick={() => void handleCopyKey()}
        >
          <IconClipboard className="size-4 shrink-0" /> Copy Key
        </button>

        <hr className="-mx-1 my-1 border-t border-border" />

        {/* Delete */}
        <button
          type="button"
          role="menuitem"
          className="flex w-full cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm text-destructive outline-hidden select-none hover:bg-destructive/10 hover:text-destructive focus:bg-destructive/10 focus:text-destructive"
          onClick={() => void handleDelete()}
        >
          <IconTrashCan className="size-4 shrink-0 text-destructive" /> Delete
        </button>
      </div>
    </>
  );
}

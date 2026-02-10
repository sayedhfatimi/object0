import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { scaleVariants, transitions } from "../../lib/animations";
import { rpcCall } from "../../lib/rpc-client";
import { useBucketStore } from "../../stores/useBucketStore";
import { useObjectStore } from "../../stores/useObjectStore";
import { useProfileStore } from "../../stores/useProfileStore";
import { useUIStore } from "../../stores/useUIStore";
import { toast } from "../common/Toast";

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
  const [deleting, setDeleting] = useState(false);

  if (!profileId || !bucket) return null;

  return (
    <AnimatePresence>
      {menu && (
        <ObjectContextMenuInner
          menu={menu}
          onClose={onClose}
          onRename={onRename}
          profileId={profileId}
          bucket={bucket}
          openShareDialog={openShareDialog}
          setDetailKey={setDetailKey}
          deleting={deleting}
          setDeleting={setDeleting}
        />
      )}
    </AnimatePresence>
  );
}

function ObjectContextMenuInner({
  menu,
  onClose,
  onRename,
  profileId,
  bucket,
  openShareDialog,
  setDetailKey,
  deleting,
  setDeleting,
}: {
  menu: ContextMenuState;
  onClose: () => void;
  onRename: (key: string) => void;
  profileId: string;
  bucket: string;
  openShareDialog: (opts: {
    key: string;
    bucket: string;
    profileId: string;
  }) => void;
  setDetailKey: (key: string | null) => void;
  deleting: boolean;
  setDeleting: (v: boolean) => void;
}) {
  const fileName = menu.key.split("/").filter(Boolean).pop() ?? menu.key;
  const openTransferDialog = useUIStore((s) => s.openTransferDialog);
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
    setDeleting(true);
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
    setDeleting(false);
    onClose();
  };

  return (
    <>
      {/* Dismiss overlay */}
      <motion.button
        type="button"
        className="fixed inset-0 z-50 cursor-default bg-transparent"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      />

      <motion.ul
        className="menu menu-sm fixed z-60 w-48 rounded-box bg-base-300 p-1 shadow-lg"
        style={{
          top: menuPosition.y,
          left: menuPosition.x,
          transformOrigin: "top left",
        }}
        variants={scaleVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={transitions.fast}
      >
        {/* Details */}
        {!menu.isFolder && (
          <li>
            <button type="button" onClick={handleDetails}>
              <i className="fa-solid fa-circle-info w-4 text-center" /> Details
            </button>
          </li>
        )}

        {/* Download */}
        <li>
          <button type="button" onClick={handleDownload}>
            <i className="fa-solid fa-cloud-arrow-down w-4 text-center" />{" "}
            Download
          </button>
        </li>

        {/* Share (files only) */}
        {!menu.isFolder && (
          <li>
            <button type="button" onClick={handleShare}>
              <i className="fa-solid fa-share-nodes w-4 text-center" /> Share
            </button>
          </li>
        )}

        {/* Rename */}
        <li>
          <button type="button" onClick={handleRename}>
            <i className="fa-solid fa-pen w-4 text-center" /> Rename
          </button>
        </li>

        {/* Copy to bucket */}
        <li>
          <button
            type="button"
            onClick={() => {
              openTransferDialog({ keys: [menu.key], defaultMode: "copy" });
              onClose();
            }}
          >
            <i className="fa-regular fa-copy w-4 text-center" /> Copy to Bucket
          </button>
        </li>

        {/* Move to bucket */}
        <li>
          <button
            type="button"
            onClick={() => {
              openTransferDialog({ keys: [menu.key], defaultMode: "move" });
              onClose();
            }}
          >
            <i className="fa-solid fa-arrow-right-arrow-left w-4 text-center" />{" "}
            Move to Bucket
          </button>
        </li>

        {/* Copy key */}
        <li>
          <button type="button" onClick={handleCopyKey}>
            <i className="fa-regular fa-clipboard w-4 text-center" /> Copy Key
          </button>
        </li>

        <li className="my-0.5 border-base-content/10 border-t" />

        {/* Delete */}
        <li>
          <button
            type="button"
            className="text-error"
            onClick={handleDelete}
            disabled={deleting}
          >
            <i className="fa-regular fa-trash-can w-4 text-center" /> Delete
          </button>
        </li>
      </motion.ul>
    </>
  );
}

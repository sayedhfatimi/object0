import { motion } from "framer-motion";
import { useCallback, useState } from "react";
import type { S3Object, S3Prefix } from "../../../shared/s3.types";
import { staggerItemVariants, transitions } from "../../lib/animations";
import { formatBytes, getFileName } from "../../lib/formatters";
import { rpcCall } from "../../lib/rpc-client";
import { useBucketStore } from "../../stores/useBucketStore";
import { useObjectStore } from "../../stores/useObjectStore";
import { useProfileStore } from "../../stores/useProfileStore";
import { FileIcon } from "../common/FileIcon";
import { Modal } from "../common/Modal";
import { toast } from "../common/Toast";
import { type ContextMenuState, ObjectContextMenu } from "./ObjectContextMenu";

interface ObjectGridProps {
  objects: S3Object[];
  prefixes: S3Prefix[];
  selectedKeys: Set<string>;
  onNavigate: (prefix: string) => void;
  onToggleSelect: (key: string) => void;
}

export function ObjectGrid({
  objects,
  prefixes,
  selectedKeys,
  onNavigate,
  onToggleSelect,
}: ObjectGridProps) {
  const profileId = useProfileStore((s) => s.activeProfileId);
  const bucket = useBucketStore((s) => s.selectedBucket);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [renamingKey, setRenamingKey] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);

  const handleContextMenu = (
    e: React.MouseEvent,
    key: string,
    isFolder: boolean,
  ) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, key, isFolder });
  };

  const startRename = useCallback((key: string) => {
    if (key.endsWith("/")) {
      toast.info("Folder rename is not available in grid view");
      return;
    }
    setRenamingKey(key);
    setRenameValue(getFileName(key));
  }, []);

  const closeRename = useCallback(() => {
    setRenamingKey(null);
    setRenameValue("");
    setRenaming(false);
  }, []);

  const commitRename = useCallback(async () => {
    if (!renamingKey || !renameValue.trim() || !profileId || !bucket) {
      closeRename();
      return;
    }

    const oldName = getFileName(renamingKey);
    const newName = renameValue.trim();
    if (newName === oldName) {
      closeRename();
      return;
    }

    const prefix = renamingKey.substring(
      0,
      renamingKey.length - oldName.length,
    );
    const newKey = `${prefix}${newName}`;

    setRenaming(true);
    try {
      await rpcCall("objects:rename", {
        profileId,
        bucket,
        oldKey: renamingKey,
        newKey,
      });
      toast.success(`Renamed to "${newName}"`);
      const currentPrefix = useObjectStore.getState().currentPrefix;
      await useObjectStore
        .getState()
        .loadObjects(profileId, bucket, currentPrefix);
      closeRename();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Rename failed");
      setRenaming(false);
    }
  }, [renamingKey, renameValue, profileId, bucket, closeRename]);

  return (
    <>
      <motion.div
        className="grid grid-cols-[repeat(auto-fill,minmax(120px,140px))] gap-2 p-3"
        initial="initial"
        animate="animate"
        transition={{ staggerChildren: 0.03 }}
      >
        {prefixes.map((p, i) => {
          const folderName =
            p.prefix.split("/").filter(Boolean).pop() ?? p.prefix;
          return (
            <motion.div
              key={p.prefix}
              variants={staggerItemVariants}
              transition={{ ...transitions.spring, delay: i * 0.03 }}
              className={`group/folder relative rounded-lg p-2 transition-all duration-150 ${
                selectedKeys.has(p.prefix)
                  ? "scale-[1.02] bg-primary/20 shadow-sm ring-2 ring-primary"
                  : "bg-base-200 ring-1 ring-transparent hover:bg-base-300"
              }`}
            >
              <button
                type="button"
                className="btn btn-ghost btn-sm btn-square absolute top-1 right-1 opacity-80 transition-opacity group-hover/folder:opacity-100"
                onClick={() => onNavigate(p.prefix)}
                title={`Open ${folderName}`}
                aria-label={`Open folder ${folderName}`}
              >
                <i className="fa-solid fa-arrow-up-right-from-square" />
              </button>

              <button
                type="button"
                className="flex w-full cursor-pointer flex-col items-center gap-1 pt-4 text-center"
                onDoubleClick={() => onNavigate(p.prefix)}
                onClick={() => onToggleSelect(p.prefix)}
                onContextMenu={(e) => handleContextMenu(e, p.prefix, true)}
              >
                <FileIcon name="" isFolder className="text-2xl" />
                <span className="w-full truncate text-xs">{folderName}/</span>
              </button>
            </motion.div>
          );
        })}

        {objects.map((obj, i) => (
          <motion.button
            type="button"
            key={obj.key}
            variants={staggerItemVariants}
            transition={{
              ...transitions.spring,
              delay: (prefixes.length + i) * 0.03,
            }}
            className={`cursor-pointer rounded-lg p-2 text-left transition-all duration-150 ${
              selectedKeys.has(obj.key)
                ? "scale-[1.02] bg-primary/20 shadow-sm ring-2 ring-primary"
                : "bg-base-200 ring-1 ring-transparent hover:bg-base-300"
            }`}
            onClick={() => onToggleSelect(obj.key)}
            onContextMenu={(e) => handleContextMenu(e, obj.key, false)}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.98 }}
          >
            <div className="flex flex-col items-center gap-1 text-center">
              <FileIcon name={obj.key} className="text-2xl" />
              <span className="w-full truncate text-xs">
                {getFileName(obj.key)}
              </span>
              <span className="text-[11px] text-base-content/40">
                {formatBytes(obj.size)}
              </span>
            </div>
          </motion.button>
        ))}
      </motion.div>

      <ObjectContextMenu
        menu={contextMenu}
        onClose={() => setContextMenu(null)}
        onRename={startRename}
      />

      <Modal
        open={!!renamingKey}
        onClose={closeRename}
        title="Rename Object"
        actions={
          <>
            <button type="button" className="btn" onClick={closeRename}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void commitRename()}
              disabled={!renameValue.trim() || renaming}
            >
              {renaming ? (
                <span className="loading loading-spinner loading-xs" />
              ) : (
                "Rename"
              )}
            </button>
          </>
        }
      >
        <input
          type="text"
          className="input input-bordered w-full"
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void commitRename();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              closeRename();
            }
          }}
          // biome-ignore lint/a11y/noAutofocus: focus on open is intentional UX
          autoFocus
        />
      </Modal>
    </>
  );
}

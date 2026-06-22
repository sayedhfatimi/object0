import { useCallback, useState } from "react";
import type { S3Object, S3Prefix } from "../../../shared/s3.types";
import { formatBytes, getFileName } from "../../lib/formatters";
import { rpcCall } from "../../lib/rpc-client";
import { useBucketStore } from "../../stores/useBucketStore";
import { useObjectStore } from "../../stores/useObjectStore";
import { useProfileStore } from "../../stores/useProfileStore";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileIcon } from "../common/FileIcon";
import { Modal } from "../common/Modal";
import { toast } from "../common/Toast";
import { IconArrowUpRightFromSquare } from "@/lib/icons";
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
      <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,140px))] gap-2 p-3">
        {prefixes.map((p) => {
          const folderName =
            p.prefix.split("/").filter(Boolean).pop() ?? p.prefix;
          const isSelected = selectedKeys.has(p.prefix);
          return (
            <div key={p.prefix} className="group/folder relative">
              <Card
                className={`cursor-pointer p-2 transition-all duration-150 rounded-lg ring-1 ${
                  isSelected
                    ? "ring-2 ring-primary bg-primary/20 scale-[1.02] shadow-sm"
                    : "ring-transparent hover:ring-border"
                }`}
              >
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="absolute top-1 right-1 opacity-80 transition-opacity group-hover/folder:opacity-100"
                  onClick={() => onNavigate(p.prefix)}
                  title={`Open ${folderName}`}
                  aria-label={`Open folder ${folderName}`}
                >
                  <IconArrowUpRightFromSquare />
                </Button>

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
              </Card>
            </div>
          );
        })}

        {objects.map((obj) => {
          const isSelected = selectedKeys.has(obj.key);
          return (
            <button
              type="button"
              key={obj.key}
              className={`cursor-pointer rounded-lg p-2 text-left transition-all duration-150 ring-1 ${
                isSelected
                  ? "ring-2 ring-primary bg-primary/20 scale-[1.02] shadow-sm"
                  : "bg-card ring-transparent hover:ring-border"
              }`}
              onClick={() => onToggleSelect(obj.key)}
              onContextMenu={(e) => handleContextMenu(e, obj.key, false)}
            >
              <div className="flex flex-col items-center gap-1 text-center">
                <FileIcon name={obj.key} className="text-2xl" />
                <span className="w-full truncate text-xs">
                  {getFileName(obj.key)}
                </span>
                <span className="text-[11px] text-foreground/40">
                  {formatBytes(obj.size)}
                </span>
              </div>
            </button>
          );
        })}
      </div>

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
            <Button variant="outline" onClick={closeRename}>
              Cancel
            </Button>
            <Button
              onClick={() => void commitRename()}
              disabled={!renameValue.trim() || renaming}
            >
              {renaming ? (
                <div className="size-3.5 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
              ) : (
                "Rename"
              )}
            </Button>
          </>
        }
      >
        <input
          type="text"
          className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
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

import type { S3Object, S3Prefix } from "@shared/s3.types";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatBytes, getFileName } from "@/lib/formatters";
import { IconArrowUpRightFromSquare } from "@/lib/icons";
import { rpcCall } from "@/lib/rpc-client";
import { useBucketStore, useObjectStore, useProfileStore } from "@/stores";
import { FileIcon } from "../common/FileIcon";
import { toast } from "../common/Toast";
import { ObjectContextMenu } from "./ObjectContextMenu";

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
  const [renamingKey, setRenamingKey] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);

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

  // Focus and select the input when the dialog opens
  useEffect(() => {
    if (renamingKey && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingKey]);

  return (
    <>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] content-start gap-2 p-3">
        {prefixes.map((p) => {
          const folderName =
            p.prefix.split("/").filter(Boolean).pop() ?? p.prefix;
          const isSelected = selectedKeys.has(p.prefix);
          return (
            <ObjectContextMenu
              key={p.prefix}
              objectKey={p.prefix}
              isFolder
              onRename={startRename}
            >
              <div className="group/folder relative">
                <div
                  className={`relative flex h-24 w-full flex-col items-center justify-center gap-1 overflow-hidden rounded-lg p-2 text-center ring-1 transition-all duration-150 ${
                    isSelected
                      ? "bg-primary/20 shadow-sm ring-2 ring-primary"
                      : "bg-card ring-transparent hover:ring-border"
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
                    className="flex w-full min-w-0 cursor-pointer flex-col items-center gap-1 text-center"
                    onDoubleClick={() => onNavigate(p.prefix)}
                    onClick={() => onToggleSelect(p.prefix)}
                  >
                    <FileIcon name="" isFolder className="text-2xl" />
                    <span className="block w-full truncate px-1 text-xs">
                      {folderName}/
                    </span>
                  </button>
                </div>
              </div>
            </ObjectContextMenu>
          );
        })}

        {objects.map((obj) => {
          const isSelected = selectedKeys.has(obj.key);
          return (
            <ObjectContextMenu
              key={obj.key}
              objectKey={obj.key}
              isFolder={false}
              onRename={startRename}
            >
              <button
                type="button"
                className={`flex h-24 w-full min-w-0 cursor-pointer flex-col items-center justify-center gap-1 overflow-hidden rounded-lg p-2 text-center ring-1 transition-all duration-150 ${
                  isSelected
                    ? "bg-primary/20 shadow-sm ring-2 ring-primary"
                    : "bg-card ring-transparent hover:ring-border"
                }`}
                onClick={() => onToggleSelect(obj.key)}
              >
                <FileIcon name={obj.key} className="text-2xl" />
                <span className="block w-full truncate px-1 text-xs">
                  {getFileName(obj.key)}
                </span>
                <span className="block w-full truncate text-[11px] text-foreground/40">
                  {formatBytes(obj.size)}
                </span>
              </button>
            </ObjectContextMenu>
          );
        })}
      </div>

      {/* Rename Dialog */}
      <Dialog open={!!renamingKey} onOpenChange={(o) => !o && closeRename()}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Rename Object</DialogTitle>
          </DialogHeader>

          <Input
            ref={renameInputRef}
            type="text"
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
            autoFocus
          />

          <DialogFooter>
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
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

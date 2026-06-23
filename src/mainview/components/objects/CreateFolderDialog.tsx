import type React from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { rpcCall } from "@/lib/rpc-client";
import { useBucketStore, useObjectStore, useProfileStore } from "@/stores";
import { toast } from "../common/Toast";

interface CreateFolderDialogProps {
  open: boolean;
  onClose: () => void;
}

export function CreateFolderDialog({ open, onClose }: CreateFolderDialogProps) {
  const profileId = useProfileStore((s) => s.activeProfileId);
  const bucket = useBucketStore((s) => s.selectedBucket);
  const currentPrefix = useObjectStore((s) => s.currentPrefix);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  const handleCreate = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!name.trim() || !profileId || !bucket) return;

    const cleanName = name.trim().replace(/\/+$/, "");
    const key = currentPrefix
      ? `${currentPrefix}${cleanName}/`
      : `${cleanName}/`;

    setCreating(true);
    try {
      // Create a zero-byte object with a trailing slash to represent a folder
      await rpcCall("transfer:upload", {
        profileId,
        bucket,
        key,
        localPath: "", // empty path signals a zero-byte folder marker
      });
      toast.success(`Folder "${cleanName}" created`);
      // Refresh the object list
      useObjectStore.getState().loadObjects(profileId, bucket, currentPrefix);
      setName("");
      onClose();
    } catch (err: unknown) {
      toast.error(
        `Failed to create folder: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    }
    setCreating(false);
  };

  const handleClose = () => {
    setName("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Create Folder</DialogTitle>
        </DialogHeader>

        <form onSubmit={(e) => void handleCreate(e)} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="folder-name" className="text-xs">
              Folder Name
            </Label>
            <Input
              id="folder-name"
              type="text"
              placeholder="my-folder"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleCreate();
                }
              }}
              autoFocus
            />
            <p className="text-[11px] text-foreground/50">
              {currentPrefix
                ? `Will create: ${currentPrefix}${name.trim()}/`
                : `Will create: ${name.trim()}/`}
            </p>
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => void handleCreate()}
            disabled={creating || !name.trim()}
          >
            {creating ? (
              <div className="size-3.5 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
            ) : (
              "Create"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

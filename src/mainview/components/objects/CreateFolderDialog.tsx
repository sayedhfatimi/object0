import type React from "react";
import { useState } from "react";
import { rpcCall } from "../../lib/rpc-client";
import { useBucketStore } from "../../stores/useBucketStore";
import { useObjectStore } from "../../stores/useObjectStore";
import { useProfileStore } from "../../stores/useProfileStore";
import { Modal } from "../common/Modal";
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

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
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
    <Modal
      open={open}
      onClose={handleClose}
      title="Create Folder"
      actions={
        <div className="flex gap-2">
          <button type="button" className="btn btn-sm" onClick={handleClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleCreate}
            disabled={creating || !name.trim()}
          >
            {creating ? (
              <span className="loading loading-spinner loading-xs" />
            ) : (
              "Create"
            )}
          </button>
        </div>
      }
    >
      <form onSubmit={handleCreate}>
        <fieldset className="fieldset">
          <legend className="fieldset-legend text-xs">Folder Name</legend>
          <input
            type="text"
            className="input input-sm w-full"
            placeholder="my-folder"
            value={name}
            onChange={(e) => setName(e.target.value)}
            // biome-ignore lint/a11y/noAutofocus: focus on open is intentional UX
            autoFocus
          />
          <p className="fieldset-label text-xs opacity-50">
            {currentPrefix
              ? `Will create: ${currentPrefix}${name.trim()}/`
              : `Will create: ${name.trim()}/`}
          </p>
        </fieldset>
      </form>
    </Modal>
  );
}

import { useCallback, useState } from "react";
import type { SyncDiff, SyncMode } from "../../../shared/s3.types";
import { rpcCall } from "../../lib/rpc-client";
import { useBucketStore } from "../../stores/useBucketStore";
import { useObjectStore } from "../../stores/useObjectStore";
import { useProfileStore } from "../../stores/useProfileStore";
import { useUIStore } from "../../stores/useUIStore";
import { useVaultStore } from "../../stores/useVaultStore";
import { Modal } from "../common/Modal";
import { toast } from "../common/Toast";

export function SyncDialog() {
  const open = useUIStore((s) => s.syncDialogOpen);
  const setOpen = useUIStore((s) => s.setSyncDialogOpen);
  const setFolderSyncPanelOpen = useUIStore((s) => s.setFolderSyncPanelOpen);
  const profiles = useVaultStore((s) => s.profiles);
  const currentProfileId = useProfileStore((s) => s.activeProfileId);
  const currentBucket = useBucketStore((s) => s.selectedBucket);
  const currentPrefix = useObjectStore((s) => s.currentPrefix);

  const [destProfileId, setDestProfileId] = useState("");
  const [destBucket, setDestBucket] = useState("");
  const [destPrefix, setDestPrefix] = useState("");
  const [mode, setMode] = useState<SyncMode>("additive");
  const [destBuckets, setDestBuckets] = useState<string[]>([]);
  const [loadingBuckets, setLoadingBuckets] = useState(false);
  const [diff, setDiff] = useState<SyncDiff | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const handleOpenLiveFolderSync = () => {
    setOpen(false);
    setFolderSyncPanelOpen(true);
  };

  const loadDestBuckets = useCallback(async (profileId: string) => {
    setLoadingBuckets(true);
    try {
      const buckets = await rpcCall("buckets:list", { profileId });
      setDestBuckets(buckets.map((b) => b.name));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Unknown error");
    }
    setLoadingBuckets(false);
  }, []);

  const handleDestProfileChange = (id: string) => {
    setDestProfileId(id);
    setDestBucket("");
    setDiff(null);
    if (id) {
      loadDestBuckets(id);
    }
  };

  const handlePreview = async () => {
    if (!currentProfileId || !currentBucket || !destProfileId || !destBucket)
      return;

    setPreviewing(true);
    setDiff(null);
    try {
      const result = await rpcCall("sync:preview", {
        sourceProfileId: currentProfileId,
        sourceBucket: currentBucket,
        sourcePrefix: currentPrefix,
        destProfileId,
        destBucket,
        destPrefix,
        mode,
      });
      setDiff(result);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Unknown error");
    }
    setPreviewing(false);
  };

  const handleSync = async () => {
    if (!currentProfileId || !currentBucket || !destProfileId || !destBucket)
      return;

    setSyncing(true);
    try {
      await rpcCall("sync:execute", {
        sourceProfileId: currentProfileId,
        sourceBucket: currentBucket,
        sourcePrefix: currentPrefix,
        destProfileId,
        destBucket,
        destPrefix,
        mode,
      });
      toast.success("Sync jobs queued");
      setOpen(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Unknown error");
    }
    setSyncing(false);
  };

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title="Object Sync (One-time)"
      actions={
        <div className="flex gap-2">
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setOpen(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={handlePreview}
            disabled={previewing || !destProfileId || !destBucket}
          >
            {previewing ? (
              <span className="loading loading-spinner loading-xs" />
            ) : (
              "Preview Changes"
            )}
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleSync}
            disabled={syncing || !diff}
          >
            {syncing ? (
              <span className="loading loading-spinner loading-xs" />
            ) : (
              "Run Sync"
            )}
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="rounded border border-info/30 bg-info/10 p-2.5 text-xs">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-0.5">
              <p className="font-semibold text-info">Runs once, then stops</p>
              <p className="text-base-content/70">
                Use this to copy one bucket/prefix to another profile or bucket.
              </p>
              <p className="text-base-content/50">
                Need continuous local folder sync? Use Live Folder Sync.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-xs whitespace-nowrap"
              onClick={handleOpenLiveFolderSync}
            >
              Open Live Sync
            </button>
          </div>
        </div>

        {/* Source info */}
        <div className="rounded bg-base-300 p-2 text-xs">
          <span className="font-semibold">Source Bucket/Prefix:</span>{" "}
          {currentBucket}
          {currentPrefix ? `/${currentPrefix}` : ""}
        </div>

        {/* Destination profile */}
        <fieldset className="fieldset">
          <legend className="fieldset-legend text-xs">
            Destination Profile
          </legend>
          <select
            id="sd-dest-profile"
            className="select select-sm w-full"
            value={destProfileId}
            onChange={(e) => handleDestProfileChange(e.target.value)}
          >
            <option value="">Select profile...</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </fieldset>

        {/* Destination bucket */}
        <fieldset className="fieldset">
          <legend className="fieldset-legend text-xs">
            Destination Bucket
          </legend>
          <select
            id="sd-dest-bucket"
            className="select select-sm w-full"
            value={destBucket}
            onChange={(e) => {
              setDestBucket(e.target.value);
              setDiff(null);
            }}
            disabled={!destProfileId || loadingBuckets}
          >
            <option value="">Select bucket...</option>
            {destBuckets.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </fieldset>

        {/* Destination prefix */}
        <fieldset className="fieldset">
          <legend className="fieldset-legend text-xs">
            Destination Prefix (optional)
          </legend>
          <input
            id="sd-dest-prefix"
            className="input input-sm w-full"
            placeholder="e.g. backups/"
            value={destPrefix}
            onChange={(e) => setDestPrefix(e.target.value)}
          />
        </fieldset>

        {/* Mode */}
        <fieldset className="fieldset">
          <legend className="fieldset-legend text-xs">Sync Behavior</legend>
          <select
            id="sd-sync-mode"
            className="select select-sm w-full"
            value={mode}
            onChange={(e) => {
              setMode(e.target.value as SyncMode);
              setDiff(null);
            }}
          >
            <option value="additive">Additive — only add missing files</option>
            <option value="overwrite">
              Overwrite — add missing + update changed
            </option>
            <option value="mirror">
              Mirror — exact copy (deletes extra files in dest)
            </option>
          </select>
          <p className="mt-1 text-[10px] text-base-content/50">
            Preview first, then run once. It will not keep syncing in the
            background.
          </p>
        </fieldset>

        {mode === "mirror" && (
          <div className="rounded border border-warning/30 bg-warning/10 p-2 text-warning text-xs">
            <i className="fa-solid fa-triangle-exclamation mr-1" />
            Mirror mode deletes destination files that are not in the source.
          </div>
        )}

        {/* Diff preview */}
        {diff && (
          <div className="space-y-1 rounded bg-base-300 p-3 text-xs">
            <div className="mb-1 font-semibold">Preview:</div>
            <div className="text-success">
              + {diff.toAdd.length} file(s) to add
            </div>
            <div className="text-warning">
              ~ {diff.toUpdate.length} file(s) to update
            </div>
            <div className="text-error">
              - {diff.toDelete.length} file(s) to delete
            </div>
            {diff.toAdd.length === 0 &&
              diff.toUpdate.length === 0 &&
              diff.toDelete.length === 0 && (
                <div className="text-base-content/50">
                  Already in sync — nothing to do
                </div>
              )}
          </div>
        )}
      </div>
    </Modal>
  );
}

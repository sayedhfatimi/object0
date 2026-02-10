import { useCallback, useState } from "react";
import type { TransferMode } from "../../../shared/s3.types";
import { rpcCall } from "../../lib/rpc-client";
import { useBucketStore } from "../../stores/useBucketStore";
import { useObjectStore } from "../../stores/useObjectStore";
import { useProfileStore } from "../../stores/useProfileStore";
import { useUIStore } from "../../stores/useUIStore";
import { useVaultStore } from "../../stores/useVaultStore";
import { Modal } from "../common/Modal";
import { toast } from "../common/Toast";

export function TransferDialog() {
  const open = useUIStore((s) => s.transferDialogOpen);
  const target = useUIStore((s) => s.transferTarget);
  const closeDialog = useUIStore((s) => s.closeTransferDialog);
  const profiles = useVaultStore((s) => s.profiles);
  const currentProfileId = useProfileStore((s) => s.activeProfileId);
  const currentBucket = useBucketStore((s) => s.selectedBucket);
  const currentPrefix = useObjectStore((s) => s.currentPrefix);

  const [destProfileId, setDestProfileId] = useState("");
  const [destBucket, setDestBucket] = useState("");
  const [destPrefix, setDestPrefix] = useState("");
  const [mode, setMode] = useState<TransferMode>(target?.defaultMode ?? "copy");
  const [destBuckets, setDestBuckets] = useState<string[]>([]);
  const [loadingBuckets, setLoadingBuckets] = useState(false);
  const [transferring, setTransferring] = useState(false);

  // Reset mode when target changes
  const effectiveMode = target?.defaultMode ?? mode;

  const keys = target?.keys ?? [];
  const fileCount = keys.filter((k) => !k.endsWith("/")).length;
  const folderCount = keys.filter((k) => k.endsWith("/")).length;

  const loadDestBuckets = useCallback(async (profileId: string) => {
    setLoadingBuckets(true);
    try {
      const buckets = await rpcCall("buckets:list", { profileId });
      setDestBuckets(buckets.map((b) => b.name));
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Failed to load buckets",
      );
    }
    setLoadingBuckets(false);
  }, []);

  const handleDestProfileChange = (id: string) => {
    setDestProfileId(id);
    setDestBucket("");
    if (id) {
      loadDestBuckets(id);
    }
  };

  const handleTransfer = async () => {
    if (!currentProfileId || !currentBucket || !destProfileId || !destBucket)
      return;
    if (keys.length === 0) return;

    setTransferring(true);
    try {
      const result = await rpcCall("transfer:cross-bucket", {
        sourceProfileId: currentProfileId,
        sourceBucket: currentBucket,
        keys,
        sourcePrefix: currentPrefix,
        destProfileId,
        destBucket,
        destPrefix,
        mode: effectiveMode,
      });

      if (result.jobIds.length > 0) {
        useUIStore.getState().setJobPanelOpen(true);
        toast.success(
          `${effectiveMode === "move" ? "Moving" : "Copying"} ${result.jobIds.length} object(s)`,
        );
      }

      closeDialog();

      // If moving, refresh the source listing
      if (effectiveMode === "move") {
        useObjectStore
          .getState()
          .loadObjects(currentProfileId, currentBucket, currentPrefix);
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Transfer failed");
    }
    setTransferring(false);
  };

  const handleClose = () => {
    closeDialog();
    setDestProfileId("");
    setDestBucket("");
    setDestPrefix("");
    setDestBuckets([]);
  };

  const summaryParts: string[] = [];
  if (fileCount > 0) summaryParts.push(`${fileCount} file(s)`);
  if (folderCount > 0) summaryParts.push(`${folderCount} folder(s)`);
  const summary = summaryParts.join(" and ") || "0 items";

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={`${effectiveMode === "move" ? "Move" : "Copy"} to Bucket`}
      actions={
        <div className="flex gap-2">
          <button type="button" className="btn btn-sm" onClick={handleClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleTransfer}
            disabled={
              transferring || !destProfileId || !destBucket || keys.length === 0
            }
          >
            {transferring ? (
              <span className="loading loading-spinner loading-xs" />
            ) : effectiveMode === "move" ? (
              <>
                <i className="fa-solid fa-arrow-right-arrow-left" /> Move
              </>
            ) : (
              <>
                <i className="fa-regular fa-copy" /> Copy
              </>
            )}
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        {/* Source summary */}
        <div className="rounded bg-base-300 p-2 text-xs">
          <span className="font-semibold">Source:</span> {currentBucket}
          {currentPrefix ? `/${currentPrefix}` : ""} — {summary}
          {keys.length <= 5 && (
            <ul className="mt-1 ml-2 list-inside list-disc text-base-content/60">
              {keys.map((k) => (
                <li key={k} className="truncate">
                  {k.endsWith("/") ? (
                    <i className="fa-regular fa-folder mr-1 text-[10px]" />
                  ) : (
                    <i className="fa-regular fa-file mr-1 text-[10px]" />
                  )}
                  {k}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Transfer mode */}
        <fieldset className="fieldset">
          <legend className="fieldset-legend text-xs">Mode</legend>
          <select
            className="select select-sm w-full"
            value={effectiveMode}
            onChange={(e) => setMode(e.target.value as TransferMode)}
          >
            <option value="copy">Copy — keep original files</option>
            <option value="move">Move — delete originals after transfer</option>
          </select>
        </fieldset>

        {/* Destination profile */}
        <fieldset className="fieldset">
          <legend className="fieldset-legend text-xs">
            Destination Profile
          </legend>
          <select
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
            className="select select-sm w-full"
            value={destBucket}
            onChange={(e) => setDestBucket(e.target.value)}
            disabled={!destProfileId || loadingBuckets}
          >
            <option value="">
              {loadingBuckets ? "Loading..." : "Select bucket..."}
            </option>
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
            Destination Path (optional)
          </legend>
          <input
            className="input input-sm w-full"
            placeholder="e.g. backups/2026/"
            value={destPrefix}
            onChange={(e) => setDestPrefix(e.target.value)}
          />
          <p className="mt-1 text-[10px] text-base-content/50">
            Files will be placed under this prefix in the destination bucket.
          </p>
        </fieldset>

        {/* Move warning */}
        {effectiveMode === "move" && (
          <div className="rounded border border-warning/30 bg-warning/10 p-2 text-warning text-xs">
            <i className="fa-solid fa-triangle-exclamation mr-1" />
            Move will delete the original files from{" "}
            <span className="font-semibold">{currentBucket}</span> after
            successful transfer.
          </div>
        )}
      </div>
    </Modal>
  );
}

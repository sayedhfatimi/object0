import { useCallback, useState } from "react";
import type { TransferMode } from "../../../shared/s3.types";
import { rpcCall } from "../../lib/rpc-client";
import { useBucketStore } from "../../stores/useBucketStore";
import { useObjectStore } from "../../stores/useObjectStore";
import { useProfileStore } from "../../stores/useProfileStore";
import { useUIStore } from "../../stores/useUIStore";
import { useVaultStore } from "../../stores/useVaultStore";
import { toast } from "../common/Toast";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  IconArrowRightArrowLeft,
  IconCopy,
  IconFile,
  IconFolder,
  IconSpinner,
  IconTriangleExclamation,
} from "@/lib/icons";

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
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent showCloseButton={false} className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{`${effectiveMode === "move" ? "Move" : "Copy"} to Bucket`}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Source summary */}
          <div className="rounded bg-muted p-2 text-xs">
            <span className="font-semibold">Source:</span> {currentBucket}
            {currentPrefix ? `/${currentPrefix}` : ""} — {summary}
            {keys.length <= 5 && (
              <ul className="mt-1 ml-2 list-inside list-disc text-foreground/60">
                {keys.map((k) => (
                  <li key={k} className="truncate">
                    {k.endsWith("/") ? (
                      <IconFolder className="mr-1 inline size-[10px]" />
                    ) : (
                      <IconFile className="mr-1 inline size-[10px]" />
                    )}
                    {k}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Transfer mode */}
          <div className="space-y-1.5">
            <Label className="text-xs">Mode</Label>
            <Select
              value={effectiveMode}
              onValueChange={(v) => {
                if (v != null) setMode(v as TransferMode);
              }}
            >
              <SelectTrigger size="sm" className="w-full">
                <SelectValue>
                  {(value) => {
                    const labels: Record<string, string> = {
                      copy: "Copy — keep original files",
                      move: "Move — delete originals after transfer",
                    };
                    return labels[value as string] ?? (value as string);
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="copy">Copy — keep original files</SelectItem>
                <SelectItem value="move">
                  Move — delete originals after transfer
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Destination profile */}
          <div className="space-y-1.5">
            <Label className="text-xs">Destination Profile</Label>
            <Select
              value={destProfileId}
              onValueChange={(v) => {
                if (v != null) handleDestProfileChange(v);
              }}
            >
              <SelectTrigger size="sm" className="w-full">
                <SelectValue placeholder="Select profile...">
                  {(value) =>
                    profiles.find((p) => p.id === value)?.name ??
                    (value as string)
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {profiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Destination bucket */}
          <div className="space-y-1.5">
            <Label className="text-xs">Destination Bucket</Label>
            <Select
              value={destBucket}
              onValueChange={(v) => {
                if (v != null) setDestBucket(v);
              }}
              disabled={!destProfileId || loadingBuckets}
            >
              <SelectTrigger size="sm" className="w-full">
                <SelectValue
                  placeholder={
                    loadingBuckets ? "Loading..." : "Select bucket..."
                  }
                >
                  {(value) => value as string}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {destBuckets.map((b) => (
                  <SelectItem key={b} value={b}>
                    {b}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Destination prefix */}
          <div className="space-y-1.5">
            <Label className="text-xs">Destination Path (optional)</Label>
            <Input
              className="h-7 text-xs"
              placeholder="e.g. backups/2026/"
              value={destPrefix}
              onChange={(e) => setDestPrefix(e.target.value)}
            />
            <p className="mt-1 text-[10px] text-foreground/50">
              Files will be placed under this prefix in the destination bucket.
            </p>
          </div>

          {/* Move warning */}
          {effectiveMode === "move" && (
            <div className="rounded border border-warning/30 bg-warning/10 p-2 text-warning text-xs">
              <IconTriangleExclamation className="mr-1 inline size-3.5" />
              Move will delete the original files from{" "}
              <span className="font-semibold">{currentBucket}</span> after
              successful transfer.
            </div>
          )}
        </div>

        <DialogFooter className="pt-0">
          <Button variant="outline" size="sm" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleTransfer}
            disabled={
              transferring || !destProfileId || !destBucket || keys.length === 0
            }
          >
            {transferring ? (
              <IconSpinner className="size-3.5 animate-spin" />
            ) : effectiveMode === "move" ? (
              <>
                <IconArrowRightArrowLeft className="size-3.5" /> Move
              </>
            ) : (
              <>
                <IconCopy className="size-3.5" /> Copy
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

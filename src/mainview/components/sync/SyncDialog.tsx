import type { SyncDiff, SyncMode } from "@shared/s3.types";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { IconSpinner, IconTriangleExclamation } from "@/lib/icons";
import { rpcCall } from "../../lib/rpc-client";
import { useBucketStore } from "../../stores/useBucketStore";
import { useObjectStore } from "../../stores/useObjectStore";
import { useProfileStore } from "../../stores/useProfileStore";
import { useUIStore } from "../../stores/useUIStore";
import { useVaultStore } from "../../stores/useVaultStore";
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
    <Dialog open={open} onOpenChange={(o) => !o && setOpen(false)}>
      <DialogContent showCloseButton={false} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Object Sync (One-time)</DialogTitle>
          <DialogDescription>
            Copy one bucket/prefix to another profile or bucket. Runs once, then
            stops.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2 rounded border border-info/30 bg-info/10 p-2.5 text-xs">
            <p className="text-foreground/70">
              Need a continuous local folder sync that keeps watching for
              changes instead?
            </p>
            <Button
              variant="outline"
              size="xs"
              className="w-full"
              onClick={handleOpenLiveFolderSync}
            >
              Open Live Folder Sync
            </Button>
          </div>

          {/* Source info */}
          <div className="rounded bg-muted p-2 text-xs">
            <span className="font-semibold">Source Bucket/Prefix:</span>{" "}
            {currentBucket}
            {currentPrefix ? `/${currentPrefix}` : ""}
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
                if (v == null) return;
                setDestBucket(v);
                setDiff(null);
              }}
              disabled={!destProfileId || loadingBuckets}
            >
              <SelectTrigger size="sm" className="w-full">
                <SelectValue placeholder="Select bucket...">
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
            <Label className="text-xs">Destination Prefix (optional)</Label>
            <Input
              className="h-7 text-xs w-full"
              placeholder="e.g. backups/"
              value={destPrefix}
              onChange={(e) => setDestPrefix(e.target.value)}
            />
          </div>

          {/* Mode */}
          <div className="space-y-1.5">
            <Label className="text-xs">Sync Behavior</Label>
            <Select
              value={mode}
              onValueChange={(v) => {
                if (v == null) return;
                setMode(v as SyncMode);
                setDiff(null);
              }}
            >
              <SelectTrigger size="sm" className="w-full">
                <SelectValue>
                  {(value) => {
                    const labels: Record<string, string> = {
                      additive: "Additive — only add missing files",
                      overwrite: "Overwrite — add missing + update changed",
                      mirror:
                        "Mirror — exact copy (deletes extra files in dest)",
                    };
                    return labels[value as string] ?? (value as string);
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="additive">
                  Additive — only add missing files
                </SelectItem>
                <SelectItem value="overwrite">
                  Overwrite — add missing + update changed
                </SelectItem>
                <SelectItem value="mirror">
                  Mirror — exact copy (deletes extra files in dest)
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="mt-1 text-[10px] text-foreground/50">
              Preview first, then run once. It will not keep syncing in the
              background.
            </p>
          </div>

          {mode === "mirror" && (
            <div className="rounded border border-warning/30 bg-warning/10 p-2 text-warning text-xs">
              <IconTriangleExclamation className="mr-1 inline size-3.5" />
              Mirror mode deletes destination files that are not in the source.
            </div>
          )}

          {/* Diff preview */}
          {diff && (
            <div className="space-y-1 rounded bg-muted p-3 text-xs">
              <div className="mb-1 font-semibold">Preview:</div>
              <div className="text-success">
                + {diff.toAdd.length} file(s) to add
              </div>
              <div className="text-warning">
                ~ {diff.toUpdate.length} file(s) to update
              </div>
              <div className="text-destructive">
                - {diff.toDelete.length} file(s) to delete
              </div>
              {diff.toAdd.length === 0 &&
                diff.toUpdate.length === 0 &&
                diff.toDelete.length === 0 && (
                  <div className="text-foreground/50">
                    Already in sync — nothing to do
                  </div>
                )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handlePreview}
            disabled={previewing || !destProfileId || !destBucket}
          >
            {previewing ? (
              <IconSpinner className="size-3.5 animate-spin" />
            ) : (
              "Preview Changes"
            )}
          </Button>
          <Button size="sm" onClick={handleSync} disabled={syncing || !diff}>
            {syncing ? (
              <IconSpinner className="size-3.5 animate-spin" />
            ) : (
              "Run Sync"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

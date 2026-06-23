import { useCallback, useEffect, useState } from "react";
import { useOnlineStatus } from "../../hooks/useOnlineStatus";
import { formatBytes, formatSpeed } from "../../lib/formatters";
import {
  IconArrowUpRightFromSquare,
  IconBucket,
  IconCheckDouble,
  IconCircleUser,
  IconFile,
  IconFolder,
  IconFolderOpen,
  IconGrid2,
  IconTableList,
  IconWifi,
} from "../../lib/icons";
import { onEvent, rpcCall } from "../../lib/rpc-client";
import { useBucketStore } from "../../stores/useBucketStore";
import { useFolderSyncStore } from "../../stores/useFolderSyncStore";
import { useJobStore } from "../../stores/useJobStore";
import { useObjectStore } from "../../stores/useObjectStore";
import { useProfileStore } from "../../stores/useProfileStore";
import { useUIStore } from "../../stores/useUIStore";
import { Progress } from "../ui/progress";

export function StatusBar() {
  const profile = useProfileStore((s) => s.activeProfile);
  const bucket = useBucketStore((s) => s.selectedBucket);
  const objects = useObjectStore((s) => s.objects);
  const prefixes = useObjectStore((s) => s.prefixes);
  const currentPrefix = useObjectStore((s) => s.currentPrefix);
  const selectedKeys = useObjectStore((s) => s.selectedKeys);
  const viewMode = useUIStore((s) => s.viewMode);
  const jobs = useJobStore((s) => s.jobs);
  const setJobPanelOpen = useUIStore((s) => s.setJobPanelOpen);
  const online = useOnlineStatus();
  const folderSyncRules = useFolderSyncStore((s) => s.rules);
  const folderSyncStatuses = useFolderSyncStore((s) => s.statuses);
  const setFolderSyncPanelOpen = useUIStore((s) => s.setFolderSyncPanelOpen);

  const folderSyncActive = [...folderSyncStatuses.values()].filter(
    (s) => s.status === "watching" || s.status === "syncing",
  ).length;
  const folderSyncSyncing = [...folderSyncStatuses.values()].filter(
    (s) => s.status === "syncing",
  ).length;

  // ── Update status ──
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);
  const [updateReady, setUpdateReady] = useState(false);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    return onEvent("update:available", (data) => {
      setUpdateVersion(data.version);
      setUpdateReady(data.updateReady);
    });
  }, []);

  const handleApplyUpdate = useCallback(async () => {
    setApplying(true);
    try {
      await rpcCall("updater:apply", undefined);
    } catch {
      setApplying(false);
    }
  }, []);

  const runningJobs = jobs.filter((j) => j.status === "running");
  const queuedJobs = jobs.filter((j) => j.status === "queued");
  const activeCount = runningJobs.length + queuedJobs.length;

  // Aggregate progress across all running jobs
  const totalBytes = runningJobs.reduce((s, j) => s + (j.bytesTotal || 0), 0);
  const transferredBytes = runningJobs.reduce(
    (s, j) => s + (j.bytesTransferred || 0),
    0,
  );
  const aggregatePercent =
    totalBytes > 0 ? Math.round((transferredBytes / totalBytes) * 100) : 0;
  const aggregateSpeed = runningJobs.reduce((s, j) => s + (j.speed || 0), 0);

  const selectedSize = objects
    .filter((o) => selectedKeys.has(o.key))
    .reduce((sum, o) => sum + o.size, 0);

  // Depth indicator for prefix
  const prefixDepth = currentPrefix
    ? currentPrefix.split("/").filter(Boolean).length
    : 0;

  return (
    <div className="flex h-8 shrink-0 items-center justify-between border-border border-t bg-card px-3 text-[11px] text-foreground/55">
      <div className="flex items-center gap-3">
        {!online && (
          <span className="flex items-center gap-1 text-warning" role="status">
            <IconWifi className="size-3" />
            Offline
          </span>
        )}
        {profile && (
          <span>
            <IconCircleUser className="mr-0.5 inline size-3" />
            {profile.name}
          </span>
        )}
        {bucket && (
          <span>
            <IconBucket className="mr-0.5 inline size-3" />
            {bucket}
            {prefixDepth > 0 && (
              <span className="ml-1 text-foreground/30">
                (depth {prefixDepth})
              </span>
            )}
          </span>
        )}
        {bucket && (
          <span className="text-foreground/30">
            {viewMode === "table" ? (
              <IconTableList className="inline size-3" />
            ) : (
              <IconGrid2 className="inline size-3" />
            )}
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        {selectedKeys.size > 0 && (
          <span className="text-primary/70" role="status" aria-live="polite">
            <IconCheckDouble className="mr-0.5 inline size-3" />
            {selectedKeys.size} selected ({formatBytes(selectedSize)})
          </span>
        )}
        {(objects.length > 0 || prefixes.length > 0) && (
          <span>
            {prefixes.length > 0 && (
              <>
                <IconFolder className="mr-0.5 inline size-3" />
                {prefixes.length}
              </>
            )}
            {prefixes.length > 0 && objects.length > 0 && (
              <span className="mx-1 text-foreground/20">|</span>
            )}
            {objects.length > 0 && (
              <>
                <IconFile className="mr-0.5 inline size-3" />
                {objects.length}
              </>
            )}
          </span>
        )}
        {activeCount > 0 && (
          <button
            type="button"
            className="flex items-center gap-2 text-info transition-colors hover:text-info/80"
            onClick={() => setJobPanelOpen(true)}
          >
            <span>
              {activeCount} job{activeCount > 1 ? "s" : ""}{" "}
              {runningJobs.length > 0 ? "running" : "queued"}
            </span>
            {runningJobs.length > 0 && totalBytes > 0 && (
              <>
                <Progress value={aggregatePercent} className="h-1.5 w-20" />
                <span className="tabular-nums">{aggregatePercent}%</span>
                {aggregateSpeed > 0 && (
                  <span>{formatSpeed(aggregateSpeed)}</span>
                )}
              </>
            )}
          </button>
        )}
        {folderSyncRules.length > 0 && (
          <button
            type="button"
            className={`flex items-center gap-1 transition-colors ${
              folderSyncSyncing > 0
                ? "text-info"
                : folderSyncActive > 0
                  ? "text-success/70"
                  : "text-foreground/40"
            } hover:text-primary`}
            onClick={() => setFolderSyncPanelOpen(true)}
            title="Live Folder Sync"
          >
            <IconFolderOpen
              className={`size-3 ${folderSyncSyncing > 0 ? "animate-pulse" : ""}`}
            />
            {folderSyncSyncing > 0
              ? `Live syncing ${folderSyncSyncing} folder(s)`
              : `${folderSyncActive} live sync active`}
          </button>
        )}
        {updateReady && updateVersion && (
          <button
            type="button"
            className="flex items-center gap-1 text-success transition-colors hover:text-success/80"
            onClick={handleApplyUpdate}
            disabled={applying}
          >
            <IconArrowUpRightFromSquare className="size-3" />
            {applying ? "Updating…" : `Update to v${updateVersion}`}
          </button>
        )}
      </div>
    </div>
  );
}

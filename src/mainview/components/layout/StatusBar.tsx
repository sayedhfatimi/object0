import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import { useOnlineStatus } from "../../hooks/useOnlineStatus";
import { transitions } from "../../lib/animations";
import { formatBytes, formatSpeed } from "../../lib/formatters";
import { onEvent, rpcCall } from "../../lib/rpc-client";
import { useBucketStore } from "../../stores/useBucketStore";
import { useFolderSyncStore } from "../../stores/useFolderSyncStore";
import { useJobStore } from "../../stores/useJobStore";
import { useObjectStore } from "../../stores/useObjectStore";
import { useProfileStore } from "../../stores/useProfileStore";
import { useUIStore } from "../../stores/useUIStore";

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
    <div className="flex h-7 shrink-0 items-center justify-between border-base-300 border-t bg-base-200 px-3 text-[11px] text-base-content/55">
      <div className="flex items-center gap-3">
        <AnimatePresence>
          {!online && (
            <motion.span
              key="offline"
              className="flex items-center gap-1 text-warning"
              role="status"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={transitions.fast}
            >
              <i className="fa-solid fa-wifi fa-xs" />
              Offline
            </motion.span>
          )}
        </AnimatePresence>
        {profile && (
          <span>
            <i className="fa-solid fa-circle-user fa-xs mr-0.5" />
            {profile.name}
          </span>
        )}
        {bucket && (
          <span>
            <i className="fa-solid fa-bucket fa-xs mr-0.5" />
            {bucket}
            {prefixDepth > 0 && (
              <span className="ml-1 text-base-content/30">
                (depth {prefixDepth})
              </span>
            )}
          </span>
        )}
        {bucket && (
          <span className="text-base-content/30">
            <i
              className={`fa-solid ${viewMode === "table" ? "fa-table-list" : "fa-grid-2"} fa-xs`}
            />
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        <AnimatePresence>
          {selectedKeys.size > 0 && (
            <motion.span
              key="selection"
              className="text-primary/70"
              role="status"
              aria-live="polite"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={transitions.fast}
            >
              <i className="fa-solid fa-check-double fa-xs mr-0.5" />
              {selectedKeys.size} selected ({formatBytes(selectedSize)})
            </motion.span>
          )}
        </AnimatePresence>
        {(objects.length > 0 || prefixes.length > 0) && (
          <span>
            {prefixes.length > 0 && (
              <>
                <i className="fa-solid fa-folder fa-xs mr-0.5" />
                {prefixes.length}
              </>
            )}
            {prefixes.length > 0 && objects.length > 0 && (
              <span className="mx-1 text-base-content/20">|</span>
            )}
            {objects.length > 0 && (
              <>
                <i className="fa-regular fa-file fa-xs mr-0.5" />
                {objects.length}
              </>
            )}
          </span>
        )}
        <AnimatePresence>
          {activeCount > 0 && (
            <motion.button
              key="jobs"
              type="button"
              className="flex items-center gap-2 text-info transition-colors hover:text-info-content"
              onClick={() => setJobPanelOpen(true)}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={transitions.fast}
            >
              <span>
                {activeCount} job{activeCount > 1 ? "s" : ""}{" "}
                {runningJobs.length > 0 ? "running" : "queued"}
              </span>
              {runningJobs.length > 0 && totalBytes > 0 && (
                <>
                  <progress
                    className="progress progress-info h-1.5 w-20"
                    value={aggregatePercent}
                    max={100}
                  />
                  <span className="tabular-nums">{aggregatePercent}%</span>
                  {aggregateSpeed > 0 && (
                    <span>{formatSpeed(aggregateSpeed)}</span>
                  )}
                </>
              )}
            </motion.button>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {folderSyncRules.length > 0 && (
            <motion.button
              key="folder-sync"
              type="button"
              className={`flex items-center gap-1 transition-colors ${
                folderSyncSyncing > 0
                  ? "text-info"
                  : folderSyncActive > 0
                    ? "text-success/70"
                    : "text-base-content/40"
              } hover:text-primary`}
              onClick={() => setFolderSyncPanelOpen(true)}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={transitions.fast}
              title="Live Folder Sync"
            >
              <i
                className={`fa-solid fa-folder-open fa-xs ${
                  folderSyncSyncing > 0 ? "fa-beat-fade" : ""
                }`}
              />
              {folderSyncSyncing > 0
                ? `Live syncing ${folderSyncSyncing} folder(s)`
                : `${folderSyncActive} live sync active`}
            </motion.button>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {updateReady && updateVersion && (
            <motion.button
              key="update"
              type="button"
              className="flex items-center gap-1 text-success transition-colors hover:text-success-content"
              onClick={handleApplyUpdate}
              disabled={applying}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={transitions.fast}
            >
              <i className="fa-solid fa-arrow-up-right-from-square fa-xs" />
              {applying ? "Updating…" : `Update to v${updateVersion}`}
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

import { useVirtualizer } from "@tanstack/react-virtual";
import { motion } from "framer-motion";
import { useEffect, useMemo, useRef } from "react";
import type { JobInfo } from "../../../shared/job.types";
import { transitions } from "../../lib/animations";
import { formatBytes, formatSpeed } from "../../lib/formatters";
import { useJobStore } from "../../stores/useJobStore";
import { useUIStore } from "../../stores/useUIStore";
import { JobItem } from "./JobItem";

const VIRTUALIZE_AFTER_COUNT = 80;

type VirtualJobRow =
  | {
      kind: "section";
      id: "section-active" | "section-completed";
      label: "active" | "completed";
      queuedCount?: number;
    }
  | {
      kind: "job";
      id: string;
      group: "active" | "completed";
      job: JobInfo;
    };

export function JobPanel() {
  const { jobs, refreshJobs, clearCompleted } = useJobStore();
  const setJobPanelOpen = useUIStore((s) => s.setJobPanelOpen);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      refreshJobs();
    });
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [refreshJobs]);

  const { activeJobs, runningJobs, queuedJobs, completedJobs } = useMemo(() => {
    const active: typeof jobs = [];
    const running: typeof jobs = [];
    const queued: typeof jobs = [];
    const completed: typeof jobs = [];

    for (const job of jobs) {
      if (job.status === "running") {
        active.push(job);
        running.push(job);
        continue;
      }
      if (job.status === "queued") {
        active.push(job);
        queued.push(job);
        continue;
      }
      if (
        job.status === "completed" ||
        job.status === "failed" ||
        job.status === "cancelled"
      ) {
        completed.push(job);
      }
    }

    return {
      activeJobs: active,
      runningJobs: running,
      queuedJobs: queued,
      completedJobs: completed,
    };
  }, [jobs]);

  // Bulk progress aggregation
  const { totalBytes, transferredBytes, bulkSpeed } = useMemo(() => {
    let total = 0;
    let transferred = 0;
    let speed = 0;

    for (const job of runningJobs) {
      total += job.bytesTotal || 0;
      transferred += job.bytesTransferred || 0;
      speed += job.speed || 0;
    }

    return {
      totalBytes: total,
      transferredBytes: transferred,
      bulkSpeed: speed,
    };
  }, [runningJobs]);

  const bulkPercent =
    totalBytes > 0 ? Math.round((transferredBytes / totalBytes) * 100) : 0;
  const succeededCount = useMemo(
    () => jobs.filter((j) => j.status === "completed").length,
    [jobs],
  );
  const failedCount = useMemo(
    () => jobs.filter((j) => j.status === "failed").length,
    [jobs],
  );
  const virtualRows = useMemo(() => {
    const rows: VirtualJobRow[] = [];

    if (activeJobs.length > 0) {
      if (completedJobs.length > 0) {
        rows.push({
          kind: "section",
          id: "section-active",
          label: "active",
          queuedCount: queuedJobs.length,
        });
      }
      for (const job of activeJobs) {
        rows.push({
          kind: "job",
          id: `active-${job.id}`,
          group: "active",
          job,
        });
      }
    }

    if (completedJobs.length > 0) {
      if (activeJobs.length > 0) {
        rows.push({
          kind: "section",
          id: "section-completed",
          label: "completed",
        });
      }
      for (const job of completedJobs) {
        rows.push({
          kind: "job",
          id: `completed-${job.id}`,
          group: "completed",
          job,
        });
      }
    }

    return rows;
  }, [activeJobs, completedJobs, queuedJobs.length]);
  const shouldVirtualize = virtualRows.length >= VIRTUALIZE_AFTER_COUNT;

  const rowVirtualizer = useVirtualizer({
    count: shouldVirtualize ? virtualRows.length : 0,
    getScrollElement: () => listRef.current,
    estimateSize: (index) => (virtualRows[index]?.kind === "section" ? 26 : 56),
    getItemKey: (index) => virtualRows[index]?.id ?? index,
    overscan: 8,
  });
  const virtualItems = shouldVirtualize ? rowVirtualizer.getVirtualItems() : [];

  useEffect(() => {
    if (!shouldVirtualize) return;
    rowVirtualizer.measure();
  }, [rowVirtualizer, shouldVirtualize]);

  return (
    <motion.div
      initial={{ height: 0, opacity: 0, y: 8 }}
      animate={{ height: 224, opacity: 1, y: 0 }}
      exit={{ height: 0, opacity: 0, y: 8 }}
      transition={transitions.normal}
      className="flex shrink-0 flex-col overflow-hidden border-base-300 border-t bg-base-200/50"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-base-300 border-b px-3 py-1.5">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-base-content/50 text-xs uppercase tracking-wider">
            Jobs
          </span>
          {activeJobs.length > 0 && (
            <span className="badge badge-info badge-xs tabular-nums">
              {activeJobs.length} active
            </span>
          )}
          {succeededCount > 0 && (
            <span className="badge badge-success badge-xs tabular-nums">
              {succeededCount}
              <i className="fa-solid fa-check ml-0.5 text-[7px]" />
            </span>
          )}
          {failedCount > 0 && (
            <span className="badge badge-error badge-xs tabular-nums">
              {failedCount}
              <i className="fa-solid fa-xmark ml-0.5 text-[7px]" />
            </span>
          )}
        </div>
        <div className="flex gap-0.5">
          {completedJobs.length > 0 && (
            <button
              type="button"
              className="btn btn-ghost btn-xs text-base-content/40 hover:text-base-content/70"
              onClick={clearCompleted}
              title="Clear completed"
            >
              <i className="fa-solid fa-broom text-[10px]" />
            </button>
          )}
          <button
            type="button"
            className="btn btn-ghost btn-xs text-base-content/40 hover:text-base-content/70"
            onClick={refreshJobs}
            title="Refresh"
          >
            <i className="fa-solid fa-arrows-rotate text-[10px]" />
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-xs text-base-content/40 hover:text-base-content/70"
            onClick={() => setJobPanelOpen(false)}
            title="Close"
          >
            <i className="fa-solid fa-xmark text-[10px]" />
          </button>
        </div>
      </div>

      {/* Bulk progress summary — only when multiple jobs are running */}
      {runningJobs.length > 1 && totalBytes > 0 && (
        <div className="border-base-300/60 border-b bg-base-100/40 px-3 py-1.5">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-base-300/80">
                <motion.div
                  className="absolute inset-y-0 left-0 rounded-full bg-linear-to-r from-primary to-info"
                  initial={{ width: 0 }}
                  animate={{ width: `${bulkPercent}%` }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                />
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2 text-[10px] text-base-content/50 tabular-nums">
              <span className="font-semibold text-base-content/60">
                {bulkPercent}%
              </span>
              <span>
                {formatBytes(transferredBytes)}
                <span className="text-base-content/30"> / </span>
                {formatBytes(totalBytes)}
              </span>
              {bulkSpeed > 0 && (
                <span>
                  <i className="fa-solid fa-gauge-high mr-0.5 text-[8px] text-info/60" />
                  {formatSpeed(bulkSpeed)}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Jobs list */}
      <div ref={listRef} className="flex-1 overflow-y-auto">
        {jobs.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1.5 text-base-content/30">
            <i className="fa-regular fa-folder-open text-2xl" />
            <span className="text-xs">No jobs</span>
          </div>
        ) : shouldVirtualize ? (
          <div
            className="relative w-full"
            style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
          >
            {virtualItems.map((virtualRow) => {
              const row = virtualRows[virtualRow.index];
              if (!row) return null;

              if (row.kind === "section") {
                const isActive = row.label === "active";
                return (
                  <div
                    key={virtualRow.key}
                    data-index={virtualRow.index}
                    ref={rowVirtualizer.measureElement}
                    className="absolute top-0 left-0 w-full border-base-300/40 border-b bg-base-200/95 px-3 py-1"
                    style={{ transform: `translateY(${virtualRow.start}px)` }}
                  >
                    <span className="font-semibold text-[10px] text-base-content/30 uppercase tracking-wider">
                      <i
                        className={`fa-solid ${
                          isActive
                            ? "fa-play text-info/50"
                            : "fa-check text-success/50"
                        } mr-1 text-[8px]`}
                      />
                      {isActive ? "Active" : "Completed"}
                      {isActive && row.queuedCount && row.queuedCount > 0 && (
                        <span className="ml-1 font-normal text-base-content/20">
                          ({row.queuedCount} queued)
                        </span>
                      )}
                    </span>
                  </div>
                );
              }

              return (
                <div
                  key={virtualRow.key}
                  data-index={virtualRow.index}
                  ref={rowVirtualizer.measureElement}
                  className={`absolute top-0 left-0 w-full border-b ${
                    row.group === "active"
                      ? "border-base-300/50"
                      : "border-base-300/30"
                  }`}
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                >
                  <JobItem job={row.job} />
                </div>
              );
            })}
          </div>
        ) : (
          <div>
            {/* Active jobs section */}
            {activeJobs.length > 0 && (
              <div>
                {completedJobs.length > 0 && (
                  <div className="sticky top-0 z-10 border-base-300/40 border-b bg-base-200/95 px-3 py-1">
                    <span className="font-semibold text-[10px] text-base-content/30 uppercase tracking-wider">
                      <i className="fa-solid fa-play mr-1 text-[8px] text-info/50" />
                      Active
                      {queuedJobs.length > 0 && (
                        <span className="ml-1 font-normal text-base-content/20">
                          ({queuedJobs.length} queued)
                        </span>
                      )}
                    </span>
                  </div>
                )}
                <div className="divide-y divide-base-300/50">
                  {activeJobs.map((j) => (
                    <JobItem key={j.id} job={j} />
                  ))}
                </div>
              </div>
            )}

            {/* Completed jobs section */}
            {completedJobs.length > 0 && (
              <div>
                {activeJobs.length > 0 && (
                  <div className="sticky top-0 z-10 border-base-300/40 border-b bg-base-200/95 px-3 py-1">
                    <span className="font-semibold text-[10px] text-base-content/30 uppercase tracking-wider">
                      <i className="fa-solid fa-check mr-1 text-[8px] text-success/50" />
                      Completed
                    </span>
                  </div>
                )}
                <div className="divide-y divide-base-300/30">
                  {completedJobs.map((j) => (
                    <JobItem key={j.id} job={j} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

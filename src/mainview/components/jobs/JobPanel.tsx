import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { formatBytes, formatSpeed } from "@/lib/formatters";
import {
  IconArrowsRotate,
  IconBroom,
  IconCheck,
  IconFolderOpen,
  IconGaugeHigh,
  IconListCheck,
  IconPlay,
  IconXmark,
} from "@/lib/icons";
import { useJobStore, useUIStore } from "@/stores";
import { JobItem } from "./JobItem";
import { useJobPanelModel } from "./useJobPanelModel";

const VIRTUAL_SECTION_HEIGHT = 26;
const VIRTUAL_JOB_HEIGHT = 56;

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

  const {
    activeJobs,
    runningJobs,
    queuedJobs,
    completedJobs,
    totalBytes,
    transferredBytes,
    bulkSpeed,
    bulkPercent,
    succeededCount,
    failedCount,
    virtualRows,
    shouldVirtualize,
  } = useJobPanelModel(jobs);

  const rowVirtualizer = useVirtualizer({
    count: shouldVirtualize ? virtualRows.length : 0,
    getScrollElement: () => listRef.current,
    estimateSize: (index) =>
      virtualRows[index]?.kind === "section"
        ? VIRTUAL_SECTION_HEIGHT
        : VIRTUAL_JOB_HEIGHT,
    getItemKey: (index) => virtualRows[index]?.id ?? index,
    overscan: 8,
  });
  const virtualItems = shouldVirtualize ? rowVirtualizer.getVirtualItems() : [];

  useEffect(() => {
    if (!shouldVirtualize) return;
    rowVirtualizer.measure();
  }, [rowVirtualizer, shouldVirtualize]);

  return (
    <div className="flex max-h-[70vh] flex-col">
      {/* Header */}
      <div className="flex flex-row items-center justify-between gap-2 border-border border-b px-4 py-3">
        <div className="flex min-w-0 items-center gap-2 font-semibold text-sm">
          <IconListCheck className="size-4 shrink-0 text-foreground/60" />
          <span className="truncate">Jobs</span>
          {activeJobs.length > 0 && (
            <span className="rounded-full bg-info/15 px-1.5 py-px text-[9px] text-info tabular-nums">
              {activeJobs.length} active
            </span>
          )}
          {succeededCount > 0 && (
            <span className="rounded-full bg-success/15 px-1.5 py-px text-[9px] text-success tabular-nums">
              {succeededCount}
              <IconCheck className="ml-0.5 inline size-[7px]" />
            </span>
          )}
          {failedCount > 0 && (
            <span className="rounded-full bg-destructive/15 px-1.5 py-px text-[9px] text-destructive tabular-nums">
              {failedCount}
              <IconXmark className="ml-0.5 inline size-[7px]" />
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {completedJobs.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="text-foreground/40 hover:text-foreground/70"
              onClick={clearCompleted}
              title="Clear completed"
            >
              <IconBroom className="size-[10px]" />
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="text-foreground/40 hover:text-foreground/70"
            onClick={refreshJobs}
            title="Refresh"
          >
            <IconArrowsRotate className="size-[10px]" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-foreground/50 hover:text-foreground"
            onClick={() => setJobPanelOpen(false)}
            title="Close"
          >
            <IconXmark className="size-4" />
          </Button>
        </div>
      </div>

      {/* Bulk progress summary — only when multiple jobs are running */}
      {runningJobs.length > 1 && totalBytes > 0 && (
        <div className="border-border/60 border-b bg-background/40 px-3 py-1.5">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted/80">
                <div
                  style={{ width: `${bulkPercent}%` }}
                  className="absolute inset-y-0 left-0 rounded-full bg-linear-to-r from-primary to-info transition-[width] duration-300 ease-out"
                />
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2 text-[10px] text-foreground/50 tabular-nums">
              <span className="font-semibold text-foreground/60">
                {bulkPercent}%
              </span>
              <span>
                {formatBytes(transferredBytes)}
                <span className="text-foreground/30"> / </span>
                {formatBytes(totalBytes)}
              </span>
              {bulkSpeed > 0 && (
                <span>
                  <IconGaugeHigh className="mr-0.5 inline size-[8px] text-info/60" />
                  {formatSpeed(bulkSpeed)}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Jobs list */}
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto">
        {jobs.length === 0 ? (
          <div className="flex min-h-[200px] flex-col items-center justify-center gap-1.5 text-foreground/30">
            <IconFolderOpen className="size-8" />
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
                    className="absolute top-0 left-0 w-full border-border/40 border-b bg-card/95 px-3 py-1"
                    style={{ transform: `translateY(${virtualRow.start}px)` }}
                  >
                    <span className="font-semibold text-[10px] text-foreground/30 uppercase tracking-wider">
                      {isActive ? (
                        <IconPlay className="mr-1 inline size-[8px] text-info/50" />
                      ) : (
                        <IconCheck className="mr-1 inline size-[8px] text-success/50" />
                      )}
                      {isActive ? "Active" : "Completed"}
                      {isActive && row.queuedCount && row.queuedCount > 0 && (
                        <span className="ml-1 font-normal text-foreground/20">
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
                      ? "border-border/50"
                      : "border-border/30"
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
                  <div className="sticky top-0 z-10 border-border/40 border-b bg-card/95 px-3 py-1">
                    <span className="font-semibold text-[10px] text-foreground/30 uppercase tracking-wider">
                      <IconPlay className="mr-1 inline size-[8px] text-info/50" />
                      Active
                      {queuedJobs.length > 0 && (
                        <span className="ml-1 font-normal text-foreground/20">
                          ({queuedJobs.length} queued)
                        </span>
                      )}
                    </span>
                  </div>
                )}
                <div className="divide-y divide-border/50">
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
                  <div className="sticky top-0 z-10 border-border/40 border-b bg-card/95 px-3 py-1">
                    <span className="font-semibold text-[10px] text-foreground/30 uppercase tracking-wider">
                      <IconCheck className="mr-1 inline size-[8px] text-success/50" />
                      Completed
                    </span>
                  </div>
                )}
                <div className="divide-y divide-border/30">
                  {completedJobs.map((j) => (
                    <JobItem key={j.id} job={j} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

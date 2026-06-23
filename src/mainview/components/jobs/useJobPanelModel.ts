import type { JobInfo } from "@shared/job.types";
import { useMemo } from "react";

const VIRTUALIZE_AFTER_COUNT = 80;

export type VirtualJobRow =
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

// Derives the JobPanel's categorized job lists, bulk-progress totals, header
// counts, and the flattened virtual-row list from the raw jobs array.
export function useJobPanelModel(jobs: JobInfo[]) {
  const { activeJobs, runningJobs, queuedJobs, completedJobs } = useMemo(() => {
    const active: JobInfo[] = [];
    const running: JobInfo[] = [];
    const queued: JobInfo[] = [];
    const completed: JobInfo[] = [];

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

  return {
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
    shouldVirtualize: virtualRows.length >= VIRTUALIZE_AFTER_COUNT,
  };
}

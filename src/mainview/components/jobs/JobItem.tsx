import { AnimatePresence, motion } from "framer-motion";
import { memo, useState } from "react";
import type { JobInfo } from "../../../shared/job.types";
import { transitions } from "../../lib/animations";
import {
  formatBytes,
  formatDate,
  formatDuration,
  formatETA,
  formatRelativeDate,
  formatSpeed,
} from "../../lib/formatters";
import { useJobStore } from "../../stores/useJobStore";

interface JobItemProps {
  job: JobInfo;
}

const typeIcon: Record<string, string> = {
  upload: "fa-solid fa-cloud-arrow-up text-success",
  download: "fa-solid fa-cloud-arrow-down text-info",
  copy: "fa-regular fa-copy text-accent",
  move: "fa-solid fa-scissors text-warning",
  delete: "fa-regular fa-trash-can text-error",
  sync: "fa-solid fa-rotate text-primary",
  archive: "fa-solid fa-file-zipper text-secondary",
};

const statusIcon: Record<string, string> = {
  queued: "fa-solid fa-clock text-base-content/40",
  running: "fa-solid fa-spinner fa-spin text-info",
  completed: "fa-solid fa-circle-check text-success",
  failed: "fa-solid fa-circle-xmark text-error",
  cancelled: "fa-solid fa-ban text-warning",
};

const JobItemInner = function JobItemInner({ job }: JobItemProps) {
  const cancelJob = useJobStore((s) => s.cancelJob);
  const [open, setOpen] = useState(false);

  const isActive = job.status === "running" || job.status === "queued";
  const isRunning = job.status === "running";
  const isDone =
    job.status === "completed" ||
    job.status === "failed" ||
    job.status === "cancelled";

  const hasProgress = isActive && !!job.bytesTotal && job.bytesTotal > 0;
  const pct = job.percentage ?? 0;

  /* ── inline metadata (under filename, next to status) ── */
  const inlineChips: { label: string; icon?: string }[] = [];

  if (isDone && job.bytesTotal && job.bytesTotal > 0) {
    inlineChips.push({
      label: formatBytes(job.bytesTotal),
      icon: "fa-solid fa-database",
    });
  }

  /* ── right-side stacked metadata ── */
  const rightChips: { label: string; icon?: string }[] = [];

  if (isDone && job.startedAt && job.completedAt) {
    rightChips.push({
      label: formatDuration(job.startedAt, job.completedAt),
      icon: "fa-regular fa-clock",
    });
  } else if (isActive && job.startedAt) {
    rightChips.push({
      label: formatDuration(job.startedAt),
      icon: "fa-regular fa-clock",
    });
  }

  if (isDone && job.completedAt) {
    rightChips.push({ label: formatRelativeDate(job.completedAt) });
  } else if (job.createdAt) {
    rightChips.push({ label: formatRelativeDate(job.createdAt) });
  }

  /* ── detail rows ── */
  const details: [string, string][] = [];
  details.push(["Job ID", job.id]);
  details.push(["Type", job.type.charAt(0).toUpperCase() + job.type.slice(1)]);
  details.push([
    "Status",
    job.status.charAt(0).toUpperCase() + job.status.slice(1),
  ]);
  if (job.description) details.push(["Description", job.description]);
  if (job.createdAt) details.push(["Queued", formatDate(job.createdAt)]);
  if (job.startedAt) details.push(["Started", formatDate(job.startedAt)]);
  if (job.completedAt) details.push(["Completed", formatDate(job.completedAt)]);
  if (job.startedAt) {
    details.push([
      isDone ? "Duration" : "Elapsed",
      formatDuration(job.startedAt, job.completedAt),
    ]);
  }
  if (job.bytesTotal && job.bytesTotal > 0) {
    details.push(["Total Size", formatBytes(job.bytesTotal)]);
    details.push(["Transferred", formatBytes(job.bytesTransferred ?? 0)]);
  }
  if (job.speed && job.speed > 0) {
    details.push(["Speed", formatSpeed(job.speed)]);
  }
  if (isDone && job.startedAt && job.completedAt && job.bytesTotal) {
    const elapsed =
      (new Date(job.completedAt).getTime() -
        new Date(job.startedAt).getTime()) /
      1000;
    if (elapsed > 0) {
      details.push(["Avg Speed", formatSpeed(job.bytesTotal / elapsed)]);
    }
  }
  if (job.error) details.push(["Error", job.error]);

  return (
    <div className="group">
      {/* ── Collapsed header row ── */}
      <button
        type="button"
        className={`flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors hover:bg-base-300/40 ${
          isDone ? "opacity-70 hover:opacity-100" : ""
        }`}
        onClick={() => setOpen((v) => !v)}
      >
        {/* Chevron + type icon stacked */}
        <div className="flex shrink-0 items-center gap-2 pt-0.5">
          <motion.i
            className="fa-solid fa-chevron-right text-[9px] text-base-content/30"
            animate={{ rotate: open ? 90 : 0 }}
            transition={transitions.fast}
          />
          <span className="text-sm">
            <i className={typeIcon[job.type] ?? typeIcon.sync} />
          </span>
        </div>

        {/* Centre: name + progress block */}
        <div className="min-w-0 flex-1">
          {/* Row 1: filename */}
          <span className="block truncate font-medium text-xs leading-tight">
            {job.fileName || job.description}
          </span>

          {/* Row 2: status + inline metadata */}
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[10px] text-base-content/40">
            <span className="flex items-center gap-1">
              <i className={statusIcon[job.status] ?? ""} />
              {job.status}
            </span>
            {inlineChips.map((chip) => (
              <span
                key={chip.label}
                className="whitespace-nowrap font-mono tabular-nums"
              >
                {chip.icon && (
                  <i className={`${chip.icon} mr-0.5 text-[8px]`} />
                )}
                {chip.label}
              </span>
            ))}
          </div>

          {/* Progress bar */}
          {hasProgress && (
            <div className="mt-1.5">
              <div className="relative h-2 w-full overflow-hidden rounded-full bg-base-300/80">
                <motion.div
                  className={`absolute inset-y-0 left-0 rounded-full ${
                    job.status === "running"
                      ? "bg-linear-to-r from-primary to-info"
                      : "bg-primary/60"
                  }`}
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                />
              </div>
            </div>
          )}

          {/* Transfer stats — separate line below progress bar */}
          {isRunning && job.bytesTotal && job.bytesTotal > 0 && (
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-base-content/50 tabular-nums">
              <span>
                {formatBytes(job.bytesTransferred ?? 0)}
                <span className="text-base-content/30"> / </span>
                {formatBytes(job.bytesTotal)}
              </span>
              <span className="font-semibold text-base-content/60">{pct}%</span>
              {job.speed ? (
                <span>
                  <i className="fa-solid fa-gauge-high mr-0.5 text-[8px] text-info/60" />
                  {formatSpeed(job.speed)}
                </span>
              ) : null}
              {job.eta ? (
                <span>
                  <i className="fa-regular fa-clock mr-0.5 text-[8px] text-base-content/30" />
                  {formatETA(job.eta)} remaining
                </span>
              ) : null}
            </div>
          )}

          {/* Queued indicator */}
          {job.status === "queued" && (
            <div className="mt-1 text-[10px] text-base-content/40">
              <i className="fa-solid fa-hourglass-start mr-1 text-[8px]" />
              Waiting in queue...
            </div>
          )}

          {/* Inline error for collapsed view */}
          {!open && job.error && (
            <div className="mt-1 truncate text-[10px] text-error/80">
              <i className="fa-solid fa-triangle-exclamation mr-1 text-[8px]" />
              {job.error}
            </div>
          )}
        </div>

        {/* Right-side stacked: duration + time ago */}
        {rightChips.length > 0 && (
          <div className="hidden shrink-0 flex-col items-end gap-0.5 pt-0.5 sm:flex">
            {rightChips.map((chip) => (
              <span
                key={chip.label}
                className="whitespace-nowrap font-mono text-[10px] text-base-content/40 tabular-nums"
              >
                {chip.icon && <i className={`${chip.icon} mr-1 text-[8px]`} />}
                {chip.label}
              </span>
            ))}
          </div>
        )}

        {/* Cancel button */}
        {isActive && (
          <button
            type="button"
            className="btn btn-ghost btn-xs shrink-0 text-base-content/40 hover:text-error"
            onClick={(e) => {
              e.stopPropagation();
              cancelJob(job.id);
            }}
            title="Cancel"
          >
            <i className="fa-solid fa-xmark" />
          </button>
        )}
      </button>

      {/* ── Expanded detail panel ── */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={transitions.fast}
            className="overflow-hidden"
          >
            <div className="border-base-300/60 border-t bg-base-200/60 px-8 py-2">
              <table className="w-full text-[11px]">
                <tbody>
                  {details.map(([label, value]) => (
                    <tr key={label}>
                      <td className="whitespace-nowrap py-0.5 pr-4 align-top font-semibold text-base-content/40">
                        {label}
                      </td>
                      <td
                        className={`break-all py-0.5 font-mono text-base-content/70 ${
                          label === "Error" ? "text-error/80" : ""
                        }`}
                      >
                        {value}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export const JobItem = memo(JobItemInner);

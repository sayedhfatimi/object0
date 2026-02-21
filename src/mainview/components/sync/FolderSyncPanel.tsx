import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  FolderSyncRule,
  FolderSyncRuleStatus,
} from "../../../shared/folder-sync.types";
import { transitions } from "../../lib/animations";
import { formatBytes } from "../../lib/formatters";
import { useFolderSyncStore } from "../../stores/useFolderSyncStore";
import { useUIStore } from "../../stores/useUIStore";
import { ConfirmDialog } from "../common/ConfirmDialog";
import { Modal } from "../common/Modal";
import { toast } from "../common/Toast";
import { FolderSyncRuleEditor } from "./FolderSyncRuleEditor";

function statusIcon(status: FolderSyncRuleStatus): {
  icon: string;
  color: string;
  chip: string;
  label: string;
} {
  switch (status) {
    case "syncing":
      return {
        icon: "fa-solid fa-arrows-rotate fa-spin",
        color: "text-info",
        chip: "bg-info/15 text-info",
        label: "Syncing",
      };
    case "watching":
      return {
        icon: "fa-solid fa-eye",
        color: "text-success",
        chip: "bg-success/15 text-success",
        label: "Watching",
      };
    case "error":
      return {
        icon: "fa-solid fa-exclamation-triangle",
        color: "text-error",
        chip: "bg-error/15 text-error",
        label: "Error",
      };
    case "paused":
      return {
        icon: "fa-solid fa-pause",
        color: "text-warning",
        chip: "bg-warning/15 text-warning",
        label: "Paused",
      };
    default:
      return {
        icon: "fa-solid fa-circle",
        color: "text-base-content/30",
        chip: "bg-base-300 text-base-content/55",
        label: "Idle",
      };
  }
}

function directionLabel(direction: FolderSyncRule["direction"]): {
  icon: string;
  label: string;
} {
  switch (direction) {
    case "bidirectional":
      return { icon: "fa-solid fa-arrows-left-right", label: "Bidirectional" };
    case "local-to-remote":
      return { icon: "fa-solid fa-arrow-up", label: "Upload only" };
    case "remote-to-local":
      return { icon: "fa-solid fa-arrow-down", label: "Download only" };
  }
}

export function FolderSyncPanel({ onClose }: { onClose: () => void }) {
  const rules = useFolderSyncStore((s) => s.rules);
  const statuses = useFolderSyncStore((s) => s.statuses);
  const errors = useFolderSyncStore((s) => s.errors);
  const conflicts = useFolderSyncStore((s) => s.conflicts);
  const loading = useFolderSyncStore((s) => s.loading);
  const loadRules = useFolderSyncStore((s) => s.loadRules);
  const removeRule = useFolderSyncStore((s) => s.removeRule);
  const toggleRule = useFolderSyncStore((s) => s.toggleRule);
  const syncNow = useFolderSyncStore((s) => s.syncNow);
  const clearConflicts = useFolderSyncStore((s) => s.clearConflicts);
  const pauseAll = useFolderSyncStore((s) => s.pauseAll);
  const resumeAll = useFolderSyncStore((s) => s.resumeAll);
  const getActiveCount = useFolderSyncStore((s) => s.getActiveCount);
  const setSyncDialogOpen = useUIStore((s) => s.setSyncDialogOpen);
  const folderSyncListDensity = useUIStore((s) => s.folderSyncListDensity);
  const setFolderSyncListDensity = useUIStore(
    (s) => s.setFolderSyncListDensity,
  );

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<FolderSyncRule | null>(null);
  const [deletingRule, setDeletingRule] = useState<FolderSyncRule | null>(null);

  useEffect(() => {
    loadRules();
  }, [loadRules]);

  const handleDelete = useCallback(async () => {
    if (!deletingRule) return;
    try {
      await removeRule(deletingRule.id);
      toast.success("Sync rule removed");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Unknown error");
    }
    setDeletingRule(null);
  }, [deletingRule, removeRule]);

  const handleSyncNow = useCallback(
    async (id: string) => {
      try {
        await syncNow(id);
        toast.success("Sync triggered");
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : "Unknown error");
      }
    },
    [syncNow],
  );

  const handleToggle = useCallback(
    async (id: string, enabled: boolean) => {
      try {
        await toggleRule(id, enabled);
        toast.success(enabled ? "Sync rule enabled" : "Sync rule paused");
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : "Unknown error");
      }
    },
    [toggleRule],
  );

  const activeCount = getActiveCount();
  const isCompact = folderSyncListDensity === "compact";
  const recentConflicts = useMemo(() => conflicts.slice(0, 20), [conflicts]);
  const conflictCountByRule = useMemo(() => {
    const counts = new Map<string, number>();
    for (const conflict of conflicts) {
      counts.set(conflict.ruleId, (counts.get(conflict.ruleId) ?? 0) + 1);
    }
    return counts;
  }, [conflicts]);
  const rulesById = useMemo(
    () => new Map(rules.map((rule) => [rule.id, rule])),
    [rules],
  );

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-base-300 border-b">
        <div className="space-y-2 px-3 py-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <i className="fa-solid fa-folder-open text-primary text-xs" />
                <span className="font-semibold text-sm leading-tight">
                  Live Folder Sync
                </span>
              </div>
              <p className="mt-0.5 pl-5 text-[10px] text-base-content/50">
                Continuous local folder &lt;-&gt; bucket sync in the background
              </p>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-xs btn-square h-6 min-h-6 w-6 text-base-content/40 hover:text-base-content"
              onClick={onClose}
              title="Close"
            >
              <i className="fa-solid fa-xmark text-xs" />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 pl-5">
            {activeCount > 0 && (
              <span className="rounded-full bg-success/20 px-1.5 py-px text-[9px] text-success tabular-nums">
                {activeCount} active
              </span>
            )}
            {conflicts.length > 0 && (
              <span className="rounded-full bg-warning/20 px-1.5 py-px text-[9px] text-warning tabular-nums">
                {conflicts.length} conflict
                {conflicts.length === 1 ? "" : "s"}
              </span>
            )}
            <button
              type="button"
              className="btn btn-ghost btn-xs h-5 min-h-5 gap-1 px-1.5 text-[10px] text-base-content/55 hover:text-primary"
              onClick={() => setAddDialogOpen(true)}
              title="Add Live Sync Rule"
            >
              <i className="fa-solid fa-plus text-[9px]" />
              Add rule
            </button>
            <div className="join ml-auto">
              <button
                type="button"
                className={`btn join-item btn-xs h-5 min-h-5 px-1.5 text-[10px] ${
                  isCompact ? "btn-ghost text-base-content/40" : "btn-active"
                }`}
                onClick={() => setFolderSyncListDensity("comfortable")}
                title="Comfortable density"
              >
                Cozy
              </button>
              <button
                type="button"
                className={`btn join-item btn-xs h-5 min-h-5 px-1.5 text-[10px] ${
                  isCompact ? "btn-active" : "btn-ghost text-base-content/40"
                }`}
                onClick={() => setFolderSyncListDensity("compact")}
                title="Compact density"
              >
                Dense
              </button>
            </div>
            {rules.length > 0 && (
              <>
                {conflicts.length > 0 && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs h-5 min-h-5 gap-1 px-1.5 text-[10px] text-warning/70 hover:text-warning"
                    onClick={() => clearConflicts()}
                    title="Clear conflict notifications"
                  >
                    <i className="fa-solid fa-broom text-[9px]" />
                    Clear conflicts
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-ghost btn-xs btn-square h-5 min-h-5 w-5 text-base-content/40 hover:text-success"
                  onClick={resumeAll}
                  title="Resume All"
                >
                  <i className="fa-solid fa-play text-[9px]" />
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs btn-square h-5 min-h-5 w-5 text-base-content/40 hover:text-warning"
                  onClick={pauseAll}
                  title="Pause All"
                >
                  <i className="fa-solid fa-pause text-[9px]" />
                </button>
              </>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-1.5 border-base-300 border-t bg-base-200/50 px-3 py-1.5 text-[10px] text-base-content/55">
          <span className="min-w-0 flex-1">
            For one-time bucket copies, use Object Sync.
          </span>
          <button
            type="button"
            className="btn btn-ghost btn-xs h-5 min-h-5 px-1.5 text-[10px] text-info hover:text-info"
            onClick={() => setSyncDialogOpen(true)}
          >
            Open Object Sync
          </button>
        </div>
      </div>

      {/* Rule list */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center p-8">
            <span className="loading loading-spinner loading-sm" />
          </div>
        )}

        {!loading && rules.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 p-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
              <i className="fa-solid fa-folder-open text-lg text-primary" />
            </div>
            <div className="text-center">
              <p className="font-medium text-sm">No live sync rules</p>
              <p className="mt-0.5 text-base-content/50 text-xs">
                Add a live folder sync rule to continuously mirror a local
                folder and an S3 bucket path
              </p>
            </div>
            <button
              type="button"
              className="btn btn-primary btn-sm btn-outline mt-1"
              onClick={() => setAddDialogOpen(true)}
            >
              <i className="fa-solid fa-plus" /> Add Live Sync Rule
            </button>
          </div>
        )}

        {!loading && recentConflicts.length > 0 && (
          <div className="border-base-300 border-b bg-warning/5 px-2.5 py-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1 text-[10px] text-warning/80">
                <i className="fa-solid fa-triangle-exclamation text-[9px]" />
                Recent conflicts
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-xs h-5 min-h-5 px-1.5 text-[10px] text-warning/70 hover:text-warning"
                onClick={() => clearConflicts()}
              >
                Clear
              </button>
            </div>
            <ul className="mt-1 space-y-1">
              {recentConflicts.map((conflict) => {
                const rule = rulesById.get(conflict.ruleId);
                const key = `${conflict.ruleId}:${conflict.relativePath}`;
                const ruleName =
                  rule?.localPath.split("/").pop() ?? conflict.ruleId;
                return (
                  <li
                    key={key}
                    className="truncate text-[10px] text-base-content/65"
                    title={`${ruleName}: ${conflict.relativePath}`}
                  >
                    <i className="fa-solid fa-folder-open mr-1 text-[8px] text-warning/70" />
                    {ruleName}
                    <span className="mx-1 text-base-content/30">·</span>
                    {conflict.relativePath}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <AnimatePresence>
          {rules.map((rule) => {
            const state = statuses.get(rule.id);
            const status = state?.status ?? "idle";
            const si = statusIcon(status);
            const dir = directionLabel(rule.direction);
            const error = errors.get(rule.id);
            const progress = state?.progress;
            const ruleName = rule.localPath.split("/").pop() || rule.localPath;
            const ruleConflictCount = conflictCountByRule.get(rule.id) ?? 0;

            return (
              <motion.div
                key={rule.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={transitions.fast}
                className={`border-base-300 border-b ${
                  isCompact ? "px-2 py-1.5" : "px-2.5 py-2"
                }`}
              >
                <div
                  className={`border border-base-300/70 bg-base-200/35 ${
                    isCompact
                      ? "space-y-1.5 rounded-md px-2 py-1.5"
                      : "space-y-2 rounded-lg px-2.5 py-2"
                  }`}
                >
                  {/* Header */}
                  <div className="flex items-start gap-2">
                    <div className="mt-0.5 shrink-0">
                      <i className={`${si.icon} text-xs ${si.color}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div
                        className={`truncate font-medium leading-tight ${
                          isCompact ? "text-[11px]" : "text-[12px]"
                        }`}
                      >
                        {ruleName}
                      </div>
                      <span
                        className={`inline-flex rounded-full px-1.5 py-px text-[9px] ${
                          isCompact ? "mt-0.5" : "mt-1"
                        } ${si.chip}`}
                      >
                        {si.label}
                      </span>
                      {ruleConflictCount > 0 && (
                        <span
                          className={`ml-1 inline-flex rounded-full bg-warning/20 px-1.5 py-px text-[9px] text-warning ${
                            isCompact ? "mt-0.5" : "mt-1"
                          }`}
                        >
                          {ruleConflictCount} conflict
                          {ruleConflictCount === 1 ? "" : "s"}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Metadata chips */}
                  <div
                    className={`flex flex-wrap items-center gap-1 text-base-content/55 ${
                      isCompact ? "text-[9px]" : "text-[10px]"
                    }`}
                  >
                    <span className="inline-flex items-center gap-1 rounded bg-base-300/70 px-1.5 py-px">
                      <i className={`${dir.icon} text-[8px]`} />
                      {dir.label}
                    </span>
                    <span className="inline-flex min-w-0 max-w-full items-center gap-1 rounded bg-base-300/70 px-1.5 py-px">
                      <i className="fa-solid fa-bucket text-[8px]" />
                      <span className="truncate">
                        {rule.bucket}
                        {rule.bucketPrefix ? `/${rule.bucketPrefix}` : ""}
                      </span>
                    </span>
                  </div>

                  <div
                    className={`truncate rounded bg-base-300/45 px-1.5 text-base-content/45 ${
                      isCompact ? "py-0.5 text-[9px]" : "py-1 text-[10px]"
                    }`}
                  >
                    <i className="fa-solid fa-folder mr-1 text-[8px]" />
                    {rule.localPath}
                  </div>

                  {/* Progress bar when syncing */}
                  {status === "syncing" && progress && progress.total > 0 && (
                    <div className="space-y-0.5">
                      <div
                        className={`flex items-center justify-between text-base-content/50 ${
                          isCompact ? "text-[9px]" : "text-[10px]"
                        }`}
                      >
                        <span>
                          {progress.completed}/{progress.total} files
                        </span>
                        <span>
                          {formatBytes(progress.bytesTransferred)} /{" "}
                          {formatBytes(progress.bytesTotal)}
                        </span>
                      </div>
                      <progress
                        className="progress progress-info h-1 w-full"
                        value={progress.completed}
                        max={progress.total}
                      />
                      {state?.currentFile && (
                        <div
                          className={`truncate text-base-content/30 ${
                            isCompact ? "text-[8px]" : "text-[9px]"
                          }`}
                        >
                          {state.currentFile}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Error message */}
                  {error && (
                    <div
                      className={`rounded bg-error/10 px-2 text-error ${
                        isCompact ? "py-0.5 text-[9px]" : "py-1 text-[10px]"
                      }`}
                    >
                      <i className="fa-solid fa-exclamation-circle mr-1" />
                      {error}
                    </div>
                  )}

                  {/* Last sync info */}
                  {rule.lastSyncAt && (
                    <div
                      className={`truncate text-base-content/35 ${
                        isCompact ? "text-[8px]" : "text-[9px]"
                      }`}
                    >
                      Last sync {new Date(rule.lastSyncAt).toLocaleString()}
                      {rule.lastSyncStatus === "success" && (
                        <i className="fa-solid fa-check ml-1 text-success/80" />
                      )}
                      {rule.lastSyncStatus === "error" && (
                        <i className="fa-solid fa-xmark ml-1 text-error/80" />
                      )}
                      {rule.lastSyncStatus === "partial" && (
                        <i className="fa-solid fa-exclamation ml-1 text-warning/80" />
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  <div
                    className={`flex flex-wrap items-center gap-1 border-base-300/70 border-t ${
                      isCompact ? "pt-1" : "pt-1.5"
                    }`}
                  >
                    <button
                      type="button"
                      className={`btn btn-ghost btn-xs gap-1 px-2 ${
                        isCompact
                          ? "h-5 min-h-5 text-[9px]"
                          : "h-6 min-h-6 text-[10px]"
                      }`}
                      onClick={() => handleSyncNow(rule.id)}
                      title="Sync now"
                      disabled={status === "syncing"}
                    >
                      <i className="fa-solid fa-arrows-rotate text-[9px]" />
                      Sync
                    </button>
                    <button
                      type="button"
                      className={`btn btn-ghost btn-xs gap-1 px-2 ${
                        isCompact
                          ? "h-5 min-h-5 text-[9px]"
                          : "h-6 min-h-6 text-[10px]"
                      }`}
                      onClick={() => handleToggle(rule.id, !rule.enabled)}
                      title={rule.enabled ? "Pause rule" : "Enable rule"}
                    >
                      <i
                        className={`fa-solid ${rule.enabled ? "fa-pause text-warning" : "fa-play text-success"} text-[9px]`}
                      />
                      {rule.enabled ? "Pause" : "Enable"}
                    </button>
                    {ruleConflictCount > 0 && (
                      <button
                        type="button"
                        className={`btn btn-ghost btn-xs gap-1 px-2 text-warning/80 hover:text-warning ${
                          isCompact
                            ? "h-5 min-h-5 text-[9px]"
                            : "h-6 min-h-6 text-[10px]"
                        }`}
                        onClick={() => clearConflicts(rule.id)}
                        title="Clear conflicts for this rule"
                      >
                        <i className="fa-solid fa-broom text-[9px]" />
                        Clear conflicts
                      </button>
                    )}
                    <div className="ml-auto flex items-center gap-0.5">
                      <button
                        type="button"
                        className={`btn btn-ghost btn-xs btn-square ${
                          isCompact ? "h-5 min-h-5 w-5" : "h-6 min-h-6 w-6"
                        }`}
                        onClick={() => setEditingRule(rule)}
                        title="Edit"
                      >
                        <i className="fa-solid fa-pen text-[10px]" />
                      </button>
                      <button
                        type="button"
                        className={`btn btn-ghost btn-xs btn-square text-error/55 hover:text-error ${
                          isCompact ? "h-5 min-h-5 w-5" : "h-6 min-h-6 w-6"
                        }`}
                        onClick={() => setDeletingRule(rule)}
                        title="Remove"
                      >
                        <i className="fa-solid fa-trash text-[10px]" />
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Add Rule Modal */}
      <Modal
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        title="Add Live Folder Sync Rule"
      >
        <FolderSyncRuleEditor
          onDone={() => {
            setAddDialogOpen(false);
            loadRules();
          }}
        />
      </Modal>

      {/* Edit Rule Modal */}
      <Modal
        open={!!editingRule}
        onClose={() => setEditingRule(null)}
        title="Edit Live Folder Sync Rule"
      >
        {editingRule && (
          <FolderSyncRuleEditor
            editRule={editingRule}
            onDone={() => {
              setEditingRule(null);
              loadRules();
            }}
          />
        )}
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deletingRule}
        title="Remove Live Sync Rule"
        message={`Remove live sync rule for "${deletingRule?.localPath.split("/").pop()}"? This will stop syncing but won't delete any files.`}
        confirmLabel="Remove"
        confirmClass="btn-error"
        onConfirm={handleDelete}
        onClose={() => setDeletingRule(null)}
      />
    </div>
  );
}

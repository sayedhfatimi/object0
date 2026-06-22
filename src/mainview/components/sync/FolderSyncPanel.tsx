import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  FolderSyncRule,
  FolderSyncRuleStatus,
} from "../../../shared/folder-sync.types";
import { formatBytes } from "../../lib/formatters";
import { useFolderSyncStore } from "../../stores/useFolderSyncStore";
import { useUIStore } from "../../stores/useUIStore";
import { ConfirmDialog } from "../common/ConfirmDialog";
import { toast } from "../common/Toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  IconArrowDown,
  IconArrowsLeftRight,
  IconArrowsRotate,
  IconArrowUp,
  IconBroom,
  IconBucket,
  IconExclamationCircle,
  IconEye,
  IconFolder,
  IconFolderOpen,
  IconPause,
  IconPen,
  IconPlay,
  IconPlus,
  IconSpinner,
  IconTrash,
  IconTriangleExclamation,
  IconXmark,
  IconCheck,
  IconExclamationTriangle,
} from "@/lib/icons";
import { FolderSyncRuleEditor } from "./FolderSyncRuleEditor";

function StatusIconDisplay({ status }: { status: FolderSyncRuleStatus }) {
  const cls = "text-xs";
  switch (status) {
    case "syncing":
      return <IconArrowsRotate className={`${cls} text-info animate-spin`} />;
    case "watching":
      return <IconEye className={`${cls} text-success`} />;
    case "error":
      return <IconExclamationTriangle className={`${cls} text-destructive`} />;
    case "paused":
      return <IconPause className={`${cls} text-warning`} />;
    default:
      return (
        <span className="inline-block size-3 rounded-full bg-foreground/30" />
      );
  }
}

function statusChipClass(status: FolderSyncRuleStatus): string {
  switch (status) {
    case "syncing":
      return "bg-info/15 text-info";
    case "watching":
      return "bg-success/15 text-success";
    case "error":
      return "bg-destructive/15 text-destructive";
    case "paused":
      return "bg-warning/15 text-warning";
    default:
      return "bg-muted text-foreground/55";
  }
}

function statusLabel(status: FolderSyncRuleStatus): string {
  switch (status) {
    case "syncing":
      return "Syncing";
    case "watching":
      return "Watching";
    case "error":
      return "Error";
    case "paused":
      return "Paused";
    default:
      return "Idle";
  }
}

function DirectionIcon({
  direction,
}: {
  direction: FolderSyncRule["direction"];
}) {
  switch (direction) {
    case "bidirectional":
      return <IconArrowsLeftRight className="size-[8px]" />;
    case "local-to-remote":
      return <IconArrowUp className="size-[8px]" />;
    case "remote-to-local":
      return <IconArrowDown className="size-[8px]" />;
  }
}

function directionLabel(direction: FolderSyncRule["direction"]): string {
  switch (direction) {
    case "bidirectional":
      return "Bidirectional";
    case "local-to-remote":
      return "Upload only";
    case "remote-to-local":
      return "Download only";
  }
}

export function FolderSyncPanel() {
  const folderSyncPanelOpen = useUIStore((s) => s.folderSyncPanelOpen);
  const setFolderSyncPanelOpen = useUIStore((s) => s.setFolderSyncPanelOpen);
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
    <>
      <Sheet
        open={folderSyncPanelOpen}
        onOpenChange={(o) => {
          if (!o) setFolderSyncPanelOpen(false);
        }}
      >
        <SheetContent
          side="right"
          showCloseButton={false}
          className="flex w-[360px] flex-col gap-0 p-0 sm:max-w-none"
        >
          {/* Header */}
          <SheetHeader className="border-border border-b">
            <div className="space-y-2 px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <SheetTitle className="flex items-center gap-2 font-semibold text-sm leading-tight">
                    <IconFolderOpen className="size-3.5 text-primary" />
                    Live Folder Sync
                  </SheetTitle>
                  <p className="mt-0.5 pl-5 text-[10px] text-foreground/50">
                    Continuous local folder &lt;-&gt; bucket sync in the
                    background
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="text-foreground/40 hover:text-foreground"
                  onClick={() => setFolderSyncPanelOpen(false)}
                  title="Close"
                >
                  <IconXmark className="size-3.5" />
                </Button>
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
                <Button
                  variant="ghost"
                  size="xs"
                  className="h-5 min-h-5 gap-1 px-1.5 text-[10px] text-foreground/55 hover:text-primary"
                  onClick={() => setAddDialogOpen(true)}
                  title="Add Live Sync Rule"
                >
                  <IconPlus className="size-[9px]" />
                  Add rule
                </Button>
                <div className="ml-auto flex">
                  <Button
                    variant={!isCompact ? "default" : "ghost"}
                    size="xs"
                    className="h-5 min-h-5 rounded-r-none px-1.5 text-[10px]"
                    onClick={() => setFolderSyncListDensity("comfortable")}
                  >
                    Cozy
                  </Button>
                  <Button
                    variant={isCompact ? "default" : "ghost"}
                    size="xs"
                    className="h-5 min-h-5 rounded-l-none px-1.5 text-[10px]"
                    onClick={() => setFolderSyncListDensity("compact")}
                  >
                    Dense
                  </Button>
                </div>
                {rules.length > 0 && (
                  <>
                    {conflicts.length > 0 && (
                      <Button
                        variant="ghost"
                        size="xs"
                        className="h-5 min-h-5 gap-1 px-1.5 text-[10px] text-warning/70 hover:text-warning"
                        onClick={() => clearConflicts()}
                        title="Clear conflict notifications"
                      >
                        <IconBroom className="size-[9px]" />
                        Clear conflicts
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="size-5 min-h-5 text-foreground/40 hover:text-success"
                      onClick={resumeAll}
                      title="Resume All"
                    >
                      <IconPlay className="size-[9px]" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="size-5 min-h-5 text-foreground/40 hover:text-warning"
                      onClick={pauseAll}
                      title="Pause All"
                    >
                      <IconPause className="size-[9px]" />
                    </Button>
                  </>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-1.5 border-border border-t bg-card/50 px-3 py-1.5 text-[10px] text-foreground/55">
              <span className="min-w-0 flex-1">
                For one-time bucket copies, use Object Sync.
              </span>
              <Button
                variant="ghost"
                size="xs"
                className="h-5 min-h-5 px-1.5 text-[10px] text-info hover:text-info"
                onClick={() => setSyncDialogOpen(true)}
              >
                Open Object Sync
              </Button>
            </div>
          </SheetHeader>

          {/* Rule list */}
          <div className="flex-1 overflow-y-auto">
            {loading && (
              <div className="flex items-center justify-center p-8">
                <IconSpinner className="size-4 animate-spin text-muted-foreground" />
              </div>
            )}

            {!loading && rules.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-3 p-8">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
                  <IconFolderOpen className="size-6 text-primary" />
                </div>
                <div className="text-center">
                  <p className="font-medium text-sm">No live sync rules</p>
                  <p className="mt-0.5 text-foreground/50 text-xs">
                    Add a live folder sync rule to continuously mirror a local
                    folder and an S3 bucket path
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-1"
                  onClick={() => setAddDialogOpen(true)}
                >
                  <IconPlus className="size-3.5" /> Add Live Sync Rule
                </Button>
              </div>
            )}

            {!loading && recentConflicts.length > 0 && (
              <div className="border-border border-b bg-warning/5 px-2.5 py-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1 text-[10px] text-warning/80">
                    <IconTriangleExclamation className="size-[9px]" />
                    Recent conflicts
                  </div>
                  <Button
                    variant="ghost"
                    size="xs"
                    className="h-5 min-h-5 px-1.5 text-[10px] text-warning/70 hover:text-warning"
                    onClick={() => clearConflicts()}
                  >
                    Clear
                  </Button>
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
                        className="truncate text-[10px] text-foreground/65"
                        title={`${ruleName}: ${conflict.relativePath}`}
                      >
                        <IconFolderOpen className="mr-1 inline size-[8px] text-warning/70" />
                        {ruleName}
                        <span className="mx-1 text-foreground/30">·</span>
                        {conflict.relativePath}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {rules.map((rule) => {
              const state = statuses.get(rule.id);
              const status = state?.status ?? "idle";
              const error = errors.get(rule.id);
              const progress = state?.progress;
              const ruleName =
                rule.localPath.split("/").pop() || rule.localPath;
              const ruleConflictCount = conflictCountByRule.get(rule.id) ?? 0;

              return (
                <div
                  key={rule.id}
                  className={`border-border border-b ${
                    isCompact ? "px-2 py-1.5" : "px-2.5 py-2"
                  }`}
                >
                  <div
                    className={`border border-border/70 bg-card/35 ${
                      isCompact
                        ? "space-y-1.5 rounded-md px-2 py-1.5"
                        : "space-y-2 rounded-lg px-2.5 py-2"
                    }`}
                  >
                    {/* Header */}
                    <div className="flex items-start gap-2">
                      <div className="mt-0.5 shrink-0">
                        <StatusIconDisplay status={status} />
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
                          } ${statusChipClass(status)}`}
                        >
                          {statusLabel(status)}
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
                      className={`flex flex-wrap items-center gap-1 text-foreground/55 ${
                        isCompact ? "text-[9px]" : "text-[10px]"
                      }`}
                    >
                      <span className="inline-flex items-center gap-1 rounded bg-muted/70 px-1.5 py-px">
                        <DirectionIcon direction={rule.direction} />
                        {directionLabel(rule.direction)}
                      </span>
                      <span className="inline-flex min-w-0 max-w-full items-center gap-1 rounded bg-muted/70 px-1.5 py-px">
                        <IconBucket className="size-[8px]" />
                        <span className="truncate">
                          {rule.bucket}
                          {rule.bucketPrefix ? `/${rule.bucketPrefix}` : ""}
                        </span>
                      </span>
                    </div>

                    <div
                      className={`truncate rounded bg-muted/45 px-1.5 text-foreground/45 ${
                        isCompact ? "py-0.5 text-[9px]" : "py-1 text-[10px]"
                      }`}
                    >
                      <IconFolder className="mr-1 inline size-[8px]" />
                      {rule.localPath}
                    </div>

                    {/* Progress bar when syncing */}
                    {status === "syncing" &&
                      progress &&
                      progress.total > 0 && (
                        <div className="space-y-0.5">
                          <div
                            className={`flex items-center justify-between text-foreground/50 ${
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
                          <Progress
                            value={
                              progress.total > 0
                                ? (progress.completed / progress.total) * 100
                                : 0
                            }
                            className="h-1"
                          />
                          {state?.currentFile && (
                            <div
                              className={`truncate text-foreground/30 ${
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
                        className={`rounded bg-destructive/10 px-2 text-destructive ${
                          isCompact ? "py-0.5 text-[9px]" : "py-1 text-[10px]"
                        }`}
                      >
                        <IconExclamationCircle className="mr-1 inline size-[9px]" />
                        {error}
                      </div>
                    )}

                    {/* Last sync info */}
                    {rule.lastSyncAt && (
                      <div
                        className={`truncate text-foreground/35 ${
                          isCompact ? "text-[8px]" : "text-[9px]"
                        }`}
                      >
                        Last sync {new Date(rule.lastSyncAt).toLocaleString()}
                        {rule.lastSyncStatus === "success" && (
                          <IconCheck className="ml-1 inline size-[9px] text-success/80" />
                        )}
                        {rule.lastSyncStatus === "error" && (
                          <IconXmark className="ml-1 inline size-[9px] text-destructive/80" />
                        )}
                        {rule.lastSyncStatus === "partial" && (
                          <IconTriangleExclamation className="ml-1 inline size-[9px] text-warning/80" />
                        )}
                      </div>
                    )}

                    {/* Actions */}
                    <div
                      className={`flex flex-wrap items-center gap-1 border-border/70 border-t ${
                        isCompact ? "pt-1" : "pt-1.5"
                      }`}
                    >
                      <Button
                        variant="ghost"
                        size="xs"
                        className={`gap-1 px-2 ${
                          isCompact
                            ? "h-5 min-h-5 text-[9px]"
                            : "h-6 min-h-6 text-[10px]"
                        }`}
                        onClick={() => handleSyncNow(rule.id)}
                        title="Sync now"
                        disabled={status === "syncing"}
                      >
                        <IconArrowsRotate className="size-[9px]" />
                        Sync
                      </Button>
                      <Button
                        variant="ghost"
                        size="xs"
                        className={`gap-1 px-2 ${
                          isCompact
                            ? "h-5 min-h-5 text-[9px]"
                            : "h-6 min-h-6 text-[10px]"
                        }`}
                        onClick={() => handleToggle(rule.id, !rule.enabled)}
                        title={rule.enabled ? "Pause rule" : "Enable rule"}
                      >
                        {rule.enabled ? (
                          <IconPause className="size-[9px] text-warning" />
                        ) : (
                          <IconPlay className="size-[9px] text-success" />
                        )}
                        {rule.enabled ? "Pause" : "Enable"}
                      </Button>
                      {ruleConflictCount > 0 && (
                        <Button
                          variant="ghost"
                          size="xs"
                          className={`gap-1 px-2 text-warning/80 hover:text-warning ${
                            isCompact
                              ? "h-5 min-h-5 text-[9px]"
                              : "h-6 min-h-6 text-[10px]"
                          }`}
                          onClick={() => clearConflicts(rule.id)}
                          title="Clear conflicts for this rule"
                        >
                          <IconBroom className="size-[9px]" />
                          Clear conflicts
                        </Button>
                      )}
                      <div className="ml-auto flex items-center gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          className={
                            isCompact ? "size-5 min-h-5" : "size-6 min-h-6"
                          }
                          onClick={() => setEditingRule(rule)}
                          title="Edit"
                        >
                          <IconPen className="size-[10px]" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          className={`text-destructive/55 hover:text-destructive ${isCompact ? "size-5 min-h-5" : "size-6 min-h-6"}`}
                          onClick={() => setDeletingRule(rule)}
                          title="Remove"
                        >
                          <IconTrash className="size-[10px]" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>

      {/* Add Rule Dialog */}
      <Dialog
        open={addDialogOpen}
        onOpenChange={(o) => !o && setAddDialogOpen(false)}
      >
        <DialogContent className="max-w-lg" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Add Live Folder Sync Rule</DialogTitle>
          </DialogHeader>
          <FolderSyncRuleEditor
            onDone={() => {
              setAddDialogOpen(false);
              loadRules();
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Rule Dialog */}
      <Dialog
        open={!!editingRule}
        onOpenChange={(o) => !o && setEditingRule(null)}
      >
        <DialogContent className="max-w-lg" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Edit Live Folder Sync Rule</DialogTitle>
          </DialogHeader>
          {editingRule && (
            <FolderSyncRuleEditor
              editRule={editingRule}
              onDone={() => {
                setEditingRule(null);
                loadRules();
              }}
            />
          )}
        </DialogContent>
      </Dialog>

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
    </>
  );
}

import type { FolderSyncRule } from "@shared/folder-sync.types";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  IconBroom,
  IconFolderOpen,
  IconPause,
  IconPlay,
  IconPlus,
  IconSpinner,
  IconTriangleExclamation,
  IconXmark,
} from "@/lib/icons";
import { useFolderSyncStore } from "../../stores/useFolderSyncStore";
import { useUIStore } from "../../stores/useUIStore";
import { ConfirmDialog } from "../common/ConfirmDialog";
import { toast } from "../common/Toast";
import { FolderSyncRuleEditor } from "./FolderSyncRuleEditor";
import { SyncRuleCard } from "./SyncRuleCard";

const RECENT_CONFLICTS_LIMIT = 20;

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

  const syncRuleNow = useCallback(
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
  const recentConflicts = useMemo(
    () => conflicts.slice(0, RECENT_CONFLICTS_LIMIT),
    [conflicts],
  );
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
          <SheetHeader className="flex-row items-center justify-between gap-2 space-y-0 border-border border-b px-4 py-3">
            <SheetTitle className="flex min-w-0 items-center gap-2 font-semibold text-sm">
              <IconFolderOpen className="size-4 shrink-0 text-foreground/60" />
              <span className="truncate">Live Folder Sync</span>
            </SheetTitle>
            <div className="flex shrink-0 items-center gap-0.5">
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-foreground/50 hover:text-foreground"
                onClick={() => setFolderSyncPanelOpen(false)}
                title="Close"
              >
                <IconXmark className="size-4" />
              </Button>
            </div>
          </SheetHeader>

          {/* subtitle — moved out of header */}
          <p className="border-border border-b px-4 py-2 text-[11px] text-foreground/50">
            Continuous local folder ↔ bucket sync in the background
          </p>

          {/* secondary toolbar */}
          <div className="flex flex-wrap items-center gap-1.5 border-border border-b px-3 py-1.5">
            {activeCount > 0 && (
              <span className="rounded-full bg-success/20 px-1.5 py-px text-[9px] text-success tabular-nums">
                {activeCount} active
              </span>
            )}
            {conflicts.length > 0 && (
              <span className="rounded-full bg-warning/20 px-1.5 py-px text-[9px] text-warning tabular-nums">
                {conflicts.length} conflict{conflicts.length === 1 ? "" : "s"}
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

          {/* the "For one-time..." info row stays AS-IS */}
          <div className="flex flex-wrap items-center justify-between gap-1.5 border-border border-b bg-card/50 px-3 py-1.5 text-[10px] text-foreground/55">
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

            {rules.map((rule) => (
              <SyncRuleCard
                key={rule.id}
                rule={rule}
                state={statuses.get(rule.id)}
                error={errors.get(rule.id)}
                conflictCount={conflictCountByRule.get(rule.id) ?? 0}
                isCompact={isCompact}
                onSyncNow={syncRuleNow}
                onToggle={handleToggle}
                onClearConflicts={clearConflicts}
                onEdit={setEditingRule}
                onDelete={setDeletingRule}
              />
            ))}
          </div>
        </SheetContent>
      </Sheet>

      {/* Add Rule Dialog */}
      <Dialog
        open={addDialogOpen}
        onOpenChange={(o) => !o && setAddDialogOpen(false)}
      >
        <DialogContent className="sm:max-w-lg" showCloseButton={false}>
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
        <DialogContent className="sm:max-w-lg" showCloseButton={false}>
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
        destructive
        onConfirm={handleDelete}
        onClose={() => setDeletingRule(null)}
      />
    </>
  );
}

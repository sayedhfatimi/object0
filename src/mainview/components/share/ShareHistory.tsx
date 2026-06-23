import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import {
  IconBroom,
  IconClockRotateLeft,
  IconCopy,
  IconLink,
  IconLinkSlash,
  IconTrash,
  IconXmark,
} from "@/lib/icons";
import { formatRelativeDate, getFileName } from "../../lib/formatters";
import { useShareHistoryStore } from "../../stores/useShareHistoryStore";
import { useUIStore } from "../../stores/useUIStore";
import { toast } from "../common/Toast";

type FilterMode = "all" | "active" | "expired";

export function ShareHistory() {
  const shareHistoryOpen = useUIStore((s) => s.shareHistoryOpen);
  const setShareHistoryOpen = useUIStore((s) => s.setShareHistoryOpen);
  const entries = useShareHistoryStore((s) => s.entries);
  const removeEntry = useShareHistoryStore((s) => s.removeEntry);
  const clearExpired = useShareHistoryStore((s) => s.clearExpired);
  const clearAll = useShareHistoryStore((s) => s.clearAll);
  const [filter, setFilter] = useState<FilterMode>("all");

  // Auto-clean expired on mount
  useEffect(() => {
    clearExpired();
  }, [clearExpired]);

  const now = new Date();
  // biome-ignore lint/correctness/useExhaustiveDependencies: now changes every render, we only re-filter on entries/filter
  const filtered = useMemo(() => {
    switch (filter) {
      case "active":
        return entries.filter((e) => new Date(e.expiresAt) > now);
      case "expired":
        return entries.filter((e) => new Date(e.expiresAt) <= now);
      default:
        return entries;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, filter]);

  const activeCount = entries.filter((e) => new Date(e.expiresAt) > now).length;
  const expiredCount = entries.length - activeCount;

  const handleCopy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied!");
    } catch {
      toast.error("Failed to copy");
    }
  };

  const formatExpiry = (expiresAt: string): string => {
    const date = new Date(expiresAt);
    if (date <= now) return "Expired";
    const diff = date.getTime() - now.getTime();
    if (diff < 3600000) {
      const mins = Math.round(diff / 60000);
      return `${mins}m left`;
    }
    if (diff < 86400000) {
      const hours = Math.round(diff / 3600000);
      return `${hours}h left`;
    }
    const days = Math.round(diff / 86400000);
    return `${days}d left`;
  };

  return (
    <Sheet
      open={shareHistoryOpen}
      onOpenChange={(o) => {
        if (!o) setShareHistoryOpen(false);
      }}
    >
      <SheetContent
        side="right"
        showCloseButton={false}
        className="flex w-[360px] flex-col gap-0 p-0 sm:max-w-none"
      >
        <SheetHeader className="flex-row items-center justify-between gap-2 space-y-0 border-border border-b px-4 py-3">
          <SheetTitle className="flex min-w-0 items-center gap-2 font-semibold text-sm">
            <IconClockRotateLeft className="size-4 shrink-0 text-foreground/60" />
            <span className="truncate">Share History</span>
            {entries.length > 0 && (
              <span className="rounded-full bg-muted px-1.5 py-px text-[9px] text-foreground/55">
                {entries.length}
              </span>
            )}
          </SheetTitle>
          <div className="flex shrink-0 items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-foreground/50 hover:text-foreground"
              onClick={() => setShareHistoryOpen(false)}
              title="Close"
            >
              <IconXmark className="size-4" />
            </Button>
          </div>
        </SheetHeader>

        {/* Filter tabs */}
        {entries.length > 0 && (
          <div className="flex gap-1 border-border border-b px-4 py-2">
            <Button
              variant={filter === "all" ? "default" : "ghost"}
              size="xs"
              onClick={() => setFilter("all")}
            >
              All ({entries.length})
            </Button>
            <Button
              variant={filter === "active" ? "default" : "ghost"}
              size="xs"
              onClick={() => setFilter("active")}
            >
              Active ({activeCount})
            </Button>
            <Button
              variant={filter === "expired" ? "default" : "ghost"}
              size="xs"
              onClick={() => setFilter("expired")}
            >
              Expired ({expiredCount})
            </Button>
          </div>
        )}

        {/* Entries */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-foreground/40">
              <IconLinkSlash className="size-8" />
              <span className="text-sm">
                {entries.length === 0
                  ? "No share history yet"
                  : "No matching entries"}
              </span>
            </div>
          ) : (
            <Table>
              <TableBody>
                {filtered.map((entry) => {
                  const isExpired = new Date(entry.expiresAt) <= now;
                  return (
                    <TableRow
                      key={entry.id}
                      className={`group align-top ${isExpired ? "opacity-50" : ""}`}
                    >
                      <TableCell className="w-5 pt-3 pr-0 pl-4">
                        {isExpired ? (
                          <IconLinkSlash className="size-3.5 text-warning" />
                        ) : (
                          <IconLink className="size-3.5 text-success" />
                        )}
                      </TableCell>

                      <TableCell className="min-w-0 px-3 py-3">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium text-xs">
                            {getFileName(entry.key)}
                          </span>
                          <span
                            className={`shrink-0 rounded-full px-1.5 py-px text-[9px] ${
                              isExpired
                                ? "bg-warning/15 text-warning"
                                : "bg-success/15 text-success"
                            }`}
                          >
                            {formatExpiry(entry.expiresAt)}
                          </span>
                        </div>
                        <div className="mt-0.5 truncate text-[10px] text-foreground/40">
                          {entry.bucket}/{entry.key}
                        </div>
                        <div className="mt-0.5 text-[10px] text-foreground/40">
                          Shared {formatRelativeDate(entry.createdAt)}
                        </div>
                      </TableCell>

                      <TableCell className="w-14 pt-2 pr-3 pl-0">
                        <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                          {!isExpired && (
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              onClick={() => handleCopy(entry.url)}
                              title="Copy link"
                            >
                              <IconCopy className="size-3" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            className="text-destructive"
                            onClick={() => removeEntry(entry.id)}
                            title="Remove"
                          >
                            <IconTrash className="size-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Footer actions */}
        {entries.length > 0 && (
          <div className="flex items-center justify-between border-border border-t px-4 py-2">
            {expiredCount > 0 && (
              <Button
                variant="ghost"
                size="xs"
                className="text-warning"
                onClick={clearExpired}
              >
                <IconBroom className="size-3" />
                Clear Expired ({expiredCount})
              </Button>
            )}
            <Button
              variant="ghost"
              size="xs"
              className="text-destructive"
              onClick={clearAll}
            >
              <IconTrash className="size-3" />
              Clear All
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

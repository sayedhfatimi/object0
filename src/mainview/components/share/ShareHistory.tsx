import { useEffect, useMemo, useState } from "react";
import { formatRelativeDate, getFileName } from "../../lib/formatters";
import { useShareHistoryStore } from "../../stores/useShareHistoryStore";
import { toast } from "../common/Toast";
import { Button } from "@/components/ui/button";
import {
  IconBroom,
  IconClockRotateLeft,
  IconCopy,
  IconLink,
  IconLinkSlash,
  IconTrash,
  IconXmark,
} from "@/lib/icons";

type FilterMode = "all" | "active" | "expired";

export function ShareHistory({ onClose }: { onClose: () => void }) {
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
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-border border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <IconClockRotateLeft className="size-4 text-foreground/60" />
          <h3 className="font-semibold text-sm">Share History</h3>
          {entries.length > 0 && (
            <span className="rounded-full bg-muted px-1.5 py-px text-[9px] text-foreground/55">
              {entries.length}
            </span>
          )}
        </div>
        <Button variant="ghost" size="icon-xs" onClick={onClose}>
          <IconXmark className="size-3.5" />
        </Button>
      </div>

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
          <ul className="divide-y divide-border">
            {filtered.map((entry) => {
              const isExpired = new Date(entry.expiresAt) <= now;
              return (
                <li
                  key={entry.id}
                  className={`group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-card/50 ${
                    isExpired ? "opacity-50" : ""
                  }`}
                >
                  <div className="mt-0.5">
                    {isExpired ? (
                      <IconLinkSlash className="size-3.5 text-warning" />
                    ) : (
                      <IconLink className="size-3.5 text-success" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium text-xs">
                        {getFileName(entry.key)}
                      </span>
                      <span
                        className={`rounded-full px-1.5 py-px text-[9px] ${
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
                  </div>

                  <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
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
                </li>
              );
            })}
          </ul>
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
    </div>
  );
}

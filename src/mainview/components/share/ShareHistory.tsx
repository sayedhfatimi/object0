import { useEffect, useMemo, useState } from "react";
import { formatRelativeDate, getFileName } from "../../lib/formatters";
import { useShareHistoryStore } from "../../stores/useShareHistoryStore";
import { toast } from "../common/Toast";

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
      <div className="flex items-center justify-between border-base-300 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <i className="fa-solid fa-clock-rotate-left text-base-content/60" />
          <h3 className="font-semibold text-sm">Share History</h3>
          {entries.length > 0 && (
            <span className="badge badge-ghost badge-xs">{entries.length}</span>
          )}
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-xs"
          onClick={onClose}
        >
          <i className="fa-solid fa-xmark" />
        </button>
      </div>

      {/* Filter tabs */}
      {entries.length > 0 && (
        <div className="flex gap-1 border-base-300 border-b px-4 py-2">
          <button
            type="button"
            className={`btn btn-xs ${filter === "all" ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setFilter("all")}
          >
            All ({entries.length})
          </button>
          <button
            type="button"
            className={`btn btn-xs ${filter === "active" ? "btn-success" : "btn-ghost"}`}
            onClick={() => setFilter("active")}
          >
            Active ({activeCount})
          </button>
          <button
            type="button"
            className={`btn btn-xs ${filter === "expired" ? "btn-warning" : "btn-ghost"}`}
            onClick={() => setFilter("expired")}
          >
            Expired ({expiredCount})
          </button>
        </div>
      )}

      {/* Entries */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-base-content/40">
            <i className="fa-solid fa-link-slash text-3xl" />
            <span className="text-sm">
              {entries.length === 0
                ? "No share history yet"
                : "No matching entries"}
            </span>
          </div>
        ) : (
          <ul className="divide-y divide-base-300">
            {filtered.map((entry) => {
              const isExpired = new Date(entry.expiresAt) <= now;
              return (
                <li
                  key={entry.id}
                  className={`group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-base-200/50 ${
                    isExpired ? "opacity-50" : ""
                  }`}
                >
                  <div className="mt-0.5">
                    <i
                      className={`fa-solid ${isExpired ? "fa-link-slash text-warning" : "fa-link text-success"} text-xs`}
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium text-xs">
                        {getFileName(entry.key)}
                      </span>
                      <span
                        className={`badge badge-xs ${isExpired ? "badge-warning" : "badge-success"}`}
                      >
                        {formatExpiry(entry.expiresAt)}
                      </span>
                    </div>
                    <div className="mt-0.5 truncate text-[10px] text-base-content/40">
                      {entry.bucket}/{entry.key}
                    </div>
                    <div className="mt-0.5 text-[10px] text-base-content/40">
                      Shared {formatRelativeDate(entry.createdAt)}
                    </div>
                  </div>

                  <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    {!isExpired && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs"
                        onClick={() => handleCopy(entry.url)}
                        title="Copy link"
                      >
                        <i className="fa-solid fa-copy fa-xs" />
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs text-error"
                      onClick={() => removeEntry(entry.id)}
                      title="Remove"
                    >
                      <i className="fa-solid fa-trash fa-xs" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Footer actions */}
      {entries.length > 0 && (
        <div className="flex items-center justify-between border-base-300 border-t px-4 py-2">
          {expiredCount > 0 && (
            <button
              type="button"
              className="btn btn-ghost btn-xs text-warning"
              onClick={clearExpired}
            >
              <i className="fa-solid fa-broom fa-xs" />
              Clear Expired ({expiredCount})
            </button>
          )}
          <button
            type="button"
            className="btn btn-ghost btn-xs text-error"
            onClick={clearAll}
          >
            <i className="fa-solid fa-trash fa-xs" />
            Clear All
          </button>
        </div>
      )}
    </div>
  );
}

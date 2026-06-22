import { useEffect, useMemo } from "react";
import { useS3Objects } from "../../hooks/useS3Objects";
import { getFileName } from "../../lib/formatters";
import { useBucketStore } from "../../stores/useBucketStore";
import { useProfileStore } from "../../stores/useProfileStore";
import { useTabStore } from "../../stores/useTabStore";
import { useUIStore } from "../../stores/useUIStore";
import { Button } from "@/components/ui/button";
import {
  IconTriangleExclamation,
  IconFolderOpen,
  IconArrowLeft,
  IconMagnifyingGlass,
} from "@/lib/icons";
import { EmptyState } from "../common/EmptyState";
import { ObjectGrid } from "./ObjectGrid";
import { ObjectTable } from "./ObjectTable";

export function ObjectBrowser() {
  const profileId = useProfileStore((s) => s.activeProfileId);
  const bucket = useBucketStore((s) => s.selectedBucket);
  const viewMode = useUIStore((s) => s.viewMode);
  const activeTabId = useTabStore((s) => s.activeTabId);
  const updateTabPrefix = useTabStore((s) => s.updateTabPrefix);
  const {
    objects,
    prefixes,
    loading,
    error,
    currentPrefix,
    isTruncated,
    selectedKeys,
    sortField,
    sortDir,
    filters,
    refresh,
    navigate,
    goBack,
    nextPage,
    setSort,
    toggleSelect,
    selectAll,
    clearSelection,
  } = useS3Objects();

  // Load objects when profile/bucket change
  useEffect(() => {
    if (profileId && bucket) {
      refresh();
    }
  }, [profileId, bucket, refresh]);

  // Sync current prefix to active tab
  useEffect(() => {
    if (activeTabId) {
      updateTabPrefix(activeTabId, currentPrefix);
    }
  }, [activeTabId, currentPrefix, updateTabPrefix]);

  // Apply client-side search filter
  const searchTerm = filters.search.toLowerCase();
  const filteredObjects = useMemo(
    () =>
      searchTerm
        ? objects.filter((o) =>
            getFileName(o.key).toLowerCase().includes(searchTerm),
          )
        : objects,
    [objects, searchTerm],
  );
  const filteredPrefixes = useMemo(
    () =>
      searchTerm
        ? prefixes.filter((p) => {
            const name = p.prefix.split("/").filter(Boolean).pop() ?? "";
            return name.toLowerCase().includes(searchTerm);
          })
        : prefixes,
    [prefixes, searchTerm],
  );

  if (error) {
    return (
      <EmptyState
        icon={<IconTriangleExclamation className="size-12 opacity-40" />}
        title="Error loading objects"
        description={error}
        action={
          <Button size="sm" onClick={refresh}>
            Retry
          </Button>
        }
      />
    );
  }

  if (loading && objects.length === 0) {
    return (
      <div className="flex-1 overflow-auto">
        <table className="w-full caption-bottom text-sm">
          <thead className="[&_tr]:border-b sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
            <tr>
              <th className="h-10 px-2 text-left align-middle font-medium w-8">
                <div className="size-3 animate-pulse rounded bg-muted-foreground/20" />
              </th>
              <th className="h-10 px-2 text-left align-middle font-medium">
                <div className="h-3 w-16 animate-pulse rounded bg-muted-foreground/20" />
              </th>
              <th className="h-10 px-2 text-left align-middle font-medium w-24">
                <div className="h-3 w-10 animate-pulse rounded bg-muted-foreground/20" />
              </th>
              <th className="h-10 px-2 text-left align-middle font-medium w-36">
                <div className="h-3 w-14 animate-pulse rounded bg-muted-foreground/20" />
              </th>
            </tr>
          </thead>
          <tbody className="[&_tr:last-child]:border-0">
            {Array.from({ length: 12 }).map((_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton rows
              <tr key={`skel-${i}`} className="border-b">
                <td className="p-2 align-middle">
                  <div className="size-3 animate-pulse rounded bg-muted-foreground/20" />
                </td>
                <td className="p-2 align-middle">
                  <div className="flex items-center gap-2">
                    <div className="size-3.5 animate-pulse rounded bg-muted-foreground/20" />
                    <div
                      className="h-3 animate-pulse rounded bg-muted-foreground/20"
                      style={{ width: `${100 + (i * 17) % 160}px` }}
                    />
                  </div>
                </td>
                <td className="p-2 align-middle">
                  <div className="ml-auto h-3 w-12 animate-pulse rounded bg-muted-foreground/20" />
                </td>
                <td className="p-2 align-middle">
                  <div className="ml-auto h-3 w-16 animate-pulse rounded bg-muted-foreground/20" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (objects.length === 0 && prefixes.length === 0) {
    return (
      <EmptyState
        icon={<IconFolderOpen className="size-12 opacity-40" />}
        title={currentPrefix ? "Empty folder" : "Empty bucket"}
        description="No objects found at this location."
        action={
          currentPrefix ? (
            <Button variant="ghost" size="sm" onClick={goBack}>
              <IconArrowLeft /> Go Back
            </Button>
          ) : undefined
        }
        hint="Drag & drop files here or use the Upload button in the toolbar."
      />
    );
  }

  // Show empty filter state
  if (
    searchTerm &&
    filteredObjects.length === 0 &&
    filteredPrefixes.length === 0
  ) {
    return (
      <EmptyState
        icon={<IconMagnifyingGlass className="size-12 opacity-40" />}
        title="No matches"
        description={`No objects matching "${filters.search}"`}
        hint="Try a shorter or broader search term."
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      {viewMode === "table" ? (
        <ObjectTable
          objects={filteredObjects}
          prefixes={filteredPrefixes}
          selectedKeys={selectedKeys}
          sortField={sortField}
          sortDir={sortDir}
          loading={loading}
          onNavigate={navigate}
          onSort={setSort}
          onToggleSelect={toggleSelect}
          onSelectAll={selectAll}
          onClearSelection={clearSelection}
        />
      ) : (
        <ObjectGrid
          objects={filteredObjects}
          prefixes={filteredPrefixes}
          selectedKeys={selectedKeys}
          onNavigate={navigate}
          onToggleSelect={toggleSelect}
        />
      )}

      {/* Load more */}
      {isTruncated && (
        <div className="flex justify-center border-t border-border py-2">
          <Button variant="ghost" size="sm" onClick={nextPage} disabled={loading}>
            {loading ? (
              <div className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              "Load More"
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

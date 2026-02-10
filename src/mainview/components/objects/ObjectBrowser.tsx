import { useEffect, useMemo } from "react";
import { useS3Objects } from "../../hooks/useS3Objects";
import { getFileName } from "../../lib/formatters";
import { useBucketStore } from "../../stores/useBucketStore";
import { useProfileStore } from "../../stores/useProfileStore";
import { useTabStore } from "../../stores/useTabStore";
import { useUIStore } from "../../stores/useUIStore";
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
        icon={<i className="fa-solid fa-triangle-exclamation text-5xl" />}
        title="Error loading objects"
        description={error}
        action={
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={refresh}
          >
            Retry
          </button>
        }
      />
    );
  }

  if (loading && objects.length === 0) {
    return (
      <div className="flex-1 overflow-auto">
        <table className="table-pin-rows table-sm table">
          <thead>
            <tr className="bg-base-200">
              <th className="w-8">
                <div className="skeleton h-3 w-3 rounded" />
              </th>
              <th>
                <div className="skeleton h-3 w-16 rounded" />
              </th>
              <th className="w-24">
                <div className="skeleton h-3 w-10 rounded" />
              </th>
              <th className="w-36">
                <div className="skeleton h-3 w-14 rounded" />
              </th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 12 }).map((_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton rows
              <tr key={`skel-${i}`}>
                <td>
                  <div className="skeleton h-3 w-3 rounded" />
                </td>
                <td>
                  <div className="flex items-center gap-2">
                    <div className="skeleton h-3.5 w-3.5 rounded" />
                    <div
                      className="skeleton h-3 rounded"
                      style={{ width: `${100 + Math.random() * 160}px` }}
                    />
                  </div>
                </td>
                <td>
                  <div className="skeleton ml-auto h-3 w-12 rounded" />
                </td>
                <td>
                  <div className="skeleton ml-auto h-3 w-16 rounded" />
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
        icon={<i className="fa-regular fa-folder-open text-5xl" />}
        title={currentPrefix ? "Empty folder" : "Empty bucket"}
        description="No objects found at this location."
        action={
          currentPrefix ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={goBack}
            >
              <i className="fa-solid fa-arrow-left" /> Go Back
            </button>
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
        icon={<i className="fa-solid fa-magnifying-glass text-5xl" />}
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
        <div className="flex justify-center border-base-300 border-t py-2">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={nextPage}
            disabled={loading}
          >
            {loading ? (
              <span className="loading loading-spinner loading-xs" />
            ) : (
              "Load More"
            )}
          </button>
        </div>
      )}
    </div>
  );
}

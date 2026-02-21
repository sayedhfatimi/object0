import { useCallback } from "react";
import { useBucketStore } from "../stores/useBucketStore";
import { useObjectStore } from "../stores/useObjectStore";
import { useProfileStore } from "../stores/useProfileStore";
import { useUIStore } from "../stores/useUIStore";

/**
 * Convenience hook to manage S3 object listing with currently-selected
 * profile and bucket.
 */
export function useS3Objects() {
  const profileId = useProfileStore((s) => s.activeProfileId);
  const bucket = useBucketStore((s) => s.selectedBucket);
  const pageSize = useUIStore((s) => s.pageSize);
  const {
    objects,
    prefixes,
    loading,
    error,
    currentPrefix,
    isTruncated,
    nextCursor,
    selectedKeys,
    sortField,
    sortDir,
    filters,
    loadObjects,
    navigateToPrefix,
    navigateBack,
    setSort,
    setFilters,
    toggleSelect,
    selectAll,
    clearSelection,
    reset,
  } = useObjectStore();

  const refresh = useCallback(() => {
    if (!profileId || !bucket) return;
    loadObjects(profileId, bucket, currentPrefix, pageSize);
  }, [profileId, bucket, currentPrefix, pageSize, loadObjects]);

  const navigate = useCallback(
    (prefix: string) => {
      navigateToPrefix(prefix);
      if (!profileId || !bucket) return;
      loadObjects(profileId, bucket, prefix, pageSize);
    },
    [profileId, bucket, pageSize, navigateToPrefix, loadObjects],
  );

  const goBack = useCallback(() => {
    const history = useObjectStore.getState().prefixHistory;
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    navigateBack();
    if (!profileId || !bucket) return;
    loadObjects(profileId, bucket, prev, pageSize);
  }, [profileId, bucket, pageSize, navigateBack, loadObjects]);

  const nextPage = useCallback(() => {
    if (!profileId || !bucket || !nextCursor) return;
    loadObjects(profileId, bucket, currentPrefix, pageSize, nextCursor);
  }, [profileId, bucket, currentPrefix, pageSize, nextCursor, loadObjects]);

  return {
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
    setFilters,
    toggleSelect,
    selectAll,
    clearSelection,
    reset,
  };
}

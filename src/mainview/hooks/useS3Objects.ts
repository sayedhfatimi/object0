import { useCallback } from "react";
import { useBucketStore } from "../stores/useBucketStore";
import { useObjectStore } from "../stores/useObjectStore";
import { useProfileStore } from "../stores/useProfileStore";

/**
 * Convenience hook to manage S3 object listing with currently-selected
 * profile and bucket.
 */
export function useS3Objects() {
  const profileId = useProfileStore((s) => s.activeProfileId);
  const bucket = useBucketStore((s) => s.selectedBucket);
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
    loadObjects(profileId, bucket, currentPrefix);
  }, [profileId, bucket, currentPrefix, loadObjects]);

  const navigate = useCallback(
    (prefix: string) => {
      navigateToPrefix(prefix);
      if (!profileId || !bucket) return;
      loadObjects(profileId, bucket, prefix);
    },
    [profileId, bucket, navigateToPrefix, loadObjects],
  );

  const goBack = useCallback(() => {
    const history = useObjectStore.getState().prefixHistory;
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    navigateBack();
    if (!profileId || !bucket) return;
    loadObjects(profileId, bucket, prev);
  }, [profileId, bucket, navigateBack, loadObjects]);

  const nextPage = useCallback(() => {
    if (!profileId || !bucket || !nextCursor) return;
    loadObjects(profileId, bucket, currentPrefix, undefined, nextCursor);
  }, [profileId, bucket, currentPrefix, nextCursor, loadObjects]);

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

import { useCallback } from "react";
import type { ProfileInfo } from "../../shared/profile.types";
import { useBucketStore } from "../stores/useBucketStore";
import { useObjectStore } from "../stores/useObjectStore";
import { useProfileStore } from "../stores/useProfileStore";
import { useTabStore } from "../stores/useTabStore";
import { useVaultStore } from "../stores/useVaultStore";

/**
 * Manages bucket selection lifecycle.
 * When a bucket is selected, loads its objects and opens a tab.
 * When profile changes, resets bucket/object state.
 */
export function useS3Buckets() {
  const {
    activeProfile,
    activeProfileId,
    buckets,
    bucketsLoading,
    error,
    setActiveProfile,
    loadBuckets,
  } = useProfileStore();
  const { selectedBucket, setSelectedBucket } = useBucketStore();
  const { loadObjects, reset: resetObjects } = useObjectStore();
  const openBucket = useTabStore((s) => s.openBucket);

  const selectBucket = useCallback(
    (bucket: string) => {
      setSelectedBucket(bucket);
      if (activeProfileId && activeProfile) {
        resetObjects();
        loadObjects(activeProfileId, bucket, "");
        openBucket(activeProfileId, activeProfile.name, bucket);
      }
    },
    [
      activeProfileId,
      activeProfile,
      setSelectedBucket,
      loadObjects,
      resetObjects,
      openBucket,
    ],
  );

  const switchProfile = useCallback(
    (profile: ProfileInfo | null) => {
      resetObjects();
      setSelectedBucket(null);
      setActiveProfile(profile);
    },
    [setActiveProfile, setSelectedBucket, resetObjects],
  );

  const refreshBuckets = useCallback(() => {
    if (activeProfileId) {
      loadBuckets(activeProfileId);
    }
  }, [activeProfileId, loadBuckets]);

  /**
   * Open a favorited bucket, auto-switching to its profile if needed.
   */
  const selectFavoriteBucket = useCallback(
    (profileId: string, bucket: string) => {
      // Switch profile if it differs from the current one
      if (profileId !== activeProfileId) {
        const profiles = useVaultStore.getState().profiles;
        const profile = profiles.find((p) => p.id === profileId);
        if (profile) {
          setActiveProfile(profile);
        }
      }

      setSelectedBucket(bucket);
      resetObjects();

      // Look up the profile name for the tab label
      const profiles = useVaultStore.getState().profiles;
      const profileName =
        profiles.find((p) => p.id === profileId)?.name ?? "Unknown";

      loadObjects(profileId, bucket, "");
      openBucket(profileId, profileName, bucket);
    },
    [
      activeProfileId,
      setActiveProfile,
      setSelectedBucket,
      resetObjects,
      loadObjects,
      openBucket,
    ],
  );

  return {
    activeProfile,
    buckets,
    bucketsLoading,
    error,
    selectedBucket,
    selectBucket,
    selectFavoriteBucket,
    switchProfile,
    refreshBuckets,
  };
}

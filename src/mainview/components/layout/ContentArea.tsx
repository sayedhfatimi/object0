import { useEffect } from "react";
import { IconBoxOpen, IconCloud } from "@/lib/icons";
import {
  useBucketStore,
  useObjectStore,
  useProfileStore,
  useTabStore,
  useVaultStore,
} from "@/stores";
import { EmptyState } from "../common/EmptyState";
import { DropZone } from "../objects/DropZone";
import { ObjectBrowser } from "../objects/ObjectBrowser";

export function ContentArea() {
  const activeProfile = useProfileStore((s) => s.activeProfile);
  const setActiveProfile = useProfileStore((s) => s.setActiveProfile);
  const bucket = useBucketStore((s) => s.selectedBucket);
  const activeTabId = useTabStore((s) => s.activeTabId);
  const tabs = useTabStore((s) => s.tabs);
  const setSelectedBucket = useBucketStore((s) => s.setSelectedBucket);
  const loadObjects = useObjectStore((s) => s.loadObjects);
  const navigateToPrefix = useObjectStore((s) => s.navigateToPrefix);
  const profiles = useVaultStore((s) => s.profiles);

  // Sync stores when active tab changes — switch profile + bucket + prefix
  // biome-ignore lint/correctness/useExhaustiveDependencies: only run on tab switch
  useEffect(() => {
    if (!activeTabId) return;
    const tab = tabs.find((t) => t.id === activeTabId);
    if (!tab) return;

    const currentProfileId = useProfileStore.getState().activeProfileId;
    const currentBucket = useBucketStore.getState().selectedBucket;
    const currentPrefix = useObjectStore.getState().currentPrefix;

    // Switch profile if it differs from the tab's profile
    const profileChanged = tab.profileId !== currentProfileId;
    if (profileChanged) {
      const profile = profiles.find((p) => p.id === tab.profileId);
      if (profile) {
        setActiveProfile(profile);
      }
    }

    if (
      profileChanged ||
      tab.bucket !== currentBucket ||
      tab.prefix !== currentPrefix
    ) {
      setSelectedBucket(tab.bucket);
      navigateToPrefix(tab.prefix);
      loadObjects(tab.profileId, tab.bucket, tab.prefix);
    }
  }, [activeTabId]);

  if (!activeProfile) {
    return (
      <div className="flex-1 overflow-auto">
        <EmptyState
          icon={<IconCloud className="size-12" />}
          title="Welcome to object0"
          description="Select or add a profile from the sidebar to get started."
          hint="Profiles store your S3 credentials securely in your system keychain."
        />
      </div>
    );
  }

  if (!bucket) {
    return (
      <div className="flex-1 overflow-auto">
        <EmptyState
          icon={<IconBoxOpen className="size-12" />}
          title="No bucket selected"
          description="Choose a bucket from the sidebar to browse its contents."
          hint="Tip: Star your favorite buckets for quick access."
        />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-hidden">
      <DropZone>
        <ObjectBrowser />
      </DropZone>
    </div>
  );
}

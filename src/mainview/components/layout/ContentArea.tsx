import { AnimatePresence, motion } from "framer-motion";
import { useEffect } from "react";
import { contentFadeVariants, transitions } from "../../lib/animations";
import { useBucketStore } from "../../stores/useBucketStore";
import { useObjectStore } from "../../stores/useObjectStore";
import { useProfileStore } from "../../stores/useProfileStore";
import { useTabStore } from "../../stores/useTabStore";
import { useVaultStore } from "../../stores/useVaultStore";
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

  const contentKey = !activeProfile
    ? "no-profile"
    : !bucket
      ? "no-bucket"
      : `browser-${bucket}`;

  return (
    <AnimatePresence mode="wait">
      {!activeProfile ? (
        <motion.div
          key="no-profile"
          className="flex-1 overflow-auto"
          variants={contentFadeVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={transitions.fast}
        >
          <EmptyState
            icon={<i className="fa-solid fa-cloud text-5xl" />}
            title="Welcome to object0"
            description="Select or add a profile from the sidebar to get started."
            hint="Profiles store your S3 credentials securely in your system keychain."
          />
        </motion.div>
      ) : !bucket ? (
        <motion.div
          key="no-bucket"
          className="flex-1 overflow-auto"
          variants={contentFadeVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={transitions.fast}
        >
          <EmptyState
            icon={<i className="fa-solid fa-box-open text-5xl" />}
            title="No bucket selected"
            description="Choose a bucket from the sidebar to browse its contents."
            hint="Tip: Star your favorite buckets for quick access."
          />
        </motion.div>
      ) : (
        <motion.div
          key={contentKey}
          className="flex-1 overflow-hidden"
          variants={contentFadeVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={transitions.fast}
        >
          <DropZone>
            <ObjectBrowser />
          </DropZone>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

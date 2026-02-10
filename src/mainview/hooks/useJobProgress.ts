import { useEffect } from "react";
import { onEvent } from "../lib/rpc-client";
import { useBucketStore } from "../stores/useBucketStore";
import { useJobStore } from "../stores/useJobStore";
import { useObjectStore } from "../stores/useObjectStore";
import { useProfileStore } from "../stores/useProfileStore";
import { useUIStore } from "../stores/useUIStore";

/**
 * Subscribes to job:progress and job:complete events from the Bun process
 * and updates the job store accordingly. Auto-refreshes object listing
 * when a job that modifies the bucket completes. Sends desktop notifications
 * on completion when enabled.
 */
export function useJobProgress() {
  const updateFromProgress = useJobStore((s) => s.updateFromProgress);
  const updateFromComplete = useJobStore((s) => s.updateFromComplete);

  useEffect(() => {
    const unsubProgress = onEvent("job:progress", (data) => {
      updateFromProgress(data);
    });

    const unsubComplete = onEvent("job:complete", (data) => {
      updateFromComplete(data);

      // Desktop notification
      const notificationsEnabled = useUIStore.getState().desktopNotifications;
      if (notificationsEnabled && Notification.permission === "granted") {
        const title = data.success ? "Transfer Complete" : "Transfer Failed";
        const body = data.fileName
          ? `${data.fileName} — ${data.success ? "finished" : data.error || "failed"}`
          : data.success
            ? "Job completed successfully"
            : data.error || "Job failed";
        new Notification(title, { body, silent: true });
      }

      // Auto-refresh object listing when a mutating job completes
      if (data.success) {
        const profileId = useProfileStore.getState().activeProfileId;
        const bucket = useBucketStore.getState().selectedBucket;
        const prefix = useObjectStore.getState().currentPrefix;
        if (profileId && bucket) {
          useObjectStore.getState().loadObjects(profileId, bucket, prefix);
        }
      }
    });

    // Request notification permission once
    if (
      useUIStore.getState().desktopNotifications &&
      Notification.permission === "default"
    ) {
      Notification.requestPermission();
    }

    return () => {
      unsubProgress();
      unsubComplete();
    };
  }, [updateFromProgress, updateFromComplete]);
}

import { useCallback, useEffect, useRef } from "react";
import { rpcCall } from "@/lib/rpc-client";
import { toast } from "../common/Toast";

const UNDO_WINDOW_MS = 5000;

// Pending delete that can be undone within the undo window.
interface PendingDelete {
  keys: string[];
  timerId: ReturnType<typeof setTimeout>;
}

interface UsePendingDeleteParams {
  profileId: string | null;
  bucket: string | null;
  selectedKeys: Set<string>;
  clearSelection: () => void;
  refresh: () => void;
}

// Deletes the current selection after a brief undo window, surfacing an "Undo"
// toast. Starting a new delete flushes any still-pending one immediately.
export function usePendingDelete({
  profileId,
  bucket,
  selectedKeys,
  clearSelection,
  refresh,
}: UsePendingDeleteParams) {
  const pendingDeleteRef = useRef<PendingDelete | null>(null);

  // Cancel any in-flight undo timer on unmount.
  useEffect(() => {
    return () => {
      if (pendingDeleteRef.current) {
        clearTimeout(pendingDeleteRef.current.timerId);
      }
    };
  }, []);

  const commitPendingDelete = useCallback(
    async (keys: string[]) => {
      if (!profileId || !bucket) return;
      try {
        await rpcCall("objects:delete", { profileId, bucket, keys });
        toast.success(`Deleted ${keys.length} object(s)`);
        refresh();
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : "Unknown error");
      }
    },
    [profileId, bucket, refresh],
  );

  return useCallback(async () => {
    if (!profileId || !bucket || selectedKeys.size === 0) return;

    const keysToDelete = Array.from(selectedKeys);
    const count = keysToDelete.length;
    clearSelection();

    // Cancel any previous pending delete
    if (pendingDeleteRef.current) {
      clearTimeout(pendingDeleteRef.current.timerId);
      // Execute the previous pending delete immediately
      const prev = pendingDeleteRef.current;
      pendingDeleteRef.current = null;
      void commitPendingDelete(prev.keys);
    }

    // Show undo toast; actual delete happens after timeout
    const timerId = setTimeout(() => {
      pendingDeleteRef.current = null;
      void commitPendingDelete(keysToDelete);
    }, UNDO_WINDOW_MS);

    pendingDeleteRef.current = { keys: keysToDelete, timerId };

    toast.warning(`Deleting ${count} object(s)...`, {
      duration: UNDO_WINDOW_MS,
      action: {
        label: "Undo",
        onClick: () => {
          if (pendingDeleteRef.current?.timerId === timerId) {
            clearTimeout(timerId);
            pendingDeleteRef.current = null;
            toast.info("Delete cancelled");
            refresh();
          }
        },
      },
    });
  }, [
    profileId,
    bucket,
    selectedKeys,
    clearSelection,
    commitPendingDelete,
    refresh,
  ]);
}

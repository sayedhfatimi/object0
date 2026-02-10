import { AnimatePresence, motion } from "framer-motion";
import type React from "react";
import { useCallback, useRef, useState } from "react";
import { transitions } from "../../lib/animations";
import { rpcCall } from "../../lib/rpc-client";
import { useBucketStore } from "../../stores/useBucketStore";
import { useObjectStore } from "../../stores/useObjectStore";
import { useProfileStore } from "../../stores/useProfileStore";
import { useUIStore } from "../../stores/useUIStore";
import { toast } from "../common/Toast";

interface DropZoneProps {
  children: React.ReactNode;
}

export function DropZone({ children }: DropZoneProps) {
  const profileId = useProfileStore((s) => s.activeProfileId);
  const bucket = useBucketStore((s) => s.selectedBucket);
  const [dragging, setDragging] = useState(false);
  const dragCountRef = useRef(0);

  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!profileId || !bucket) return;
      dragCountRef.current += 1;
      if (dragCountRef.current === 1) setDragging(true);
    },
    [profileId, bucket],
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCountRef.current -= 1;
    if (dragCountRef.current <= 0) {
      dragCountRef.current = 0;
      setDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragging(false);
      dragCountRef.current = 0;

      if (!profileId || !bucket) return;

      const prefix = useObjectStore.getState().currentPrefix;
      const files = Array.from(e.dataTransfer.files);

      if (files.length === 0) {
        toast.warning("No files detected in drop");
        return;
      }

      try {
        // Use the standard file picker upload flow — the files are from the
        // OS file manager, so we send paths via the pick-and-upload RPC.
        // Electrobun's drag-and-drop gives us File objects with paths.
        const paths = files
          .map((f) => (f as File & { path?: string }).path)
          .filter(Boolean) as string[];

        if (paths.length === 0) {
          toast.warning("Could not read file paths from drop");
          return;
        }

        let totalJobs = 0;
        for (const filePath of paths) {
          const fileName = filePath.split("/").pop() ?? "file";
          const key = prefix ? `${prefix}${fileName}` : fileName;
          try {
            await rpcCall("transfer:upload", {
              profileId,
              bucket,
              key,
              localPath: filePath,
            });
            totalJobs++;
          } catch (err: unknown) {
            toast.error(
              `Failed to upload ${fileName}: ${err instanceof Error ? err.message : "Unknown error"}`,
            );
          }
        }

        if (totalJobs > 0) {
          useUIStore.getState().setJobPanelOpen(true);
          toast.success(`Uploading ${totalJobs} file(s)`);
        }
      } catch (err: unknown) {
        toast.error(
          `Drop failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        );
      }
    },
    [profileId, bucket],
  );

  const active = profileId && bucket;

  return (
    // biome-ignore lint/a11y/useSemanticElements: drop zone requires div with drag handlers
    <div
      role="region"
      aria-label="File drop zone"
      className="relative flex-1 overflow-auto"
      onDragEnter={active ? handleDragEnter : undefined}
      onDragLeave={active ? handleDragLeave : undefined}
      onDragOver={active ? handleDragOver : undefined}
      onDrop={active ? handleDrop : undefined}
    >
      {children}

      {/* Drop overlay */}
      <AnimatePresence>
        {dragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={transitions.fast}
            className="absolute inset-0 z-40 flex items-center justify-center bg-primary/10 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.85, opacity: 0 }}
              transition={transitions.spring}
              className="flex flex-col items-center gap-3 rounded-2xl border-2 border-primary border-dashed bg-base-100/80 px-12 py-10"
            >
              <i className="fa-solid fa-cloud-arrow-up text-4xl text-primary" />
              <span className="font-semibold text-base-content text-sm">
                Drop files to upload
              </span>
              <span className="text-base-content/50 text-xs">
                Files will be uploaded to the current folder
              </span>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

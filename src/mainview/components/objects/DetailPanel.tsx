import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import type { S3StatResult } from "../../../shared/s3.types";
import { slideRightVariants, transitions } from "../../lib/animations";
import {
  formatBytes,
  formatDate,
  getExtension,
  getFileName,
} from "../../lib/formatters";
import { rpcCall } from "../../lib/rpc-client";
import { useBucketStore } from "../../stores/useBucketStore";
import { useProfileStore } from "../../stores/useProfileStore";
import { useUIStore } from "../../stores/useUIStore";
import { FileIcon } from "../common/FileIcon";

const PREVIEWABLE_IMAGES = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
  "ico",
  "bmp",
  "avif",
]);

export function DetailPanel() {
  const detailKey = useUIStore((s) => s.detailKey);
  const setDetailKey = useUIStore((s) => s.setDetailKey);
  const profileId = useProfileStore((s) => s.activeProfileId);
  const bucket = useBucketStore((s) => s.selectedBucket);

  const [stat, setStat] = useState<S3StatResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!detailKey || !profileId || !bucket) {
      setStat(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    rpcCall("objects:stat", { profileId, bucket, key: detailKey })
      .then((result) => {
        if (!cancelled) {
          setStat(result);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unknown error");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [detailKey, profileId, bucket]);

  if (!detailKey) return null;

  const fileName = getFileName(detailKey);
  const ext = getExtension(detailKey).toLowerCase();
  const isImage = PREVIEWABLE_IMAGES.has(ext);

  return (
    <motion.div
      variants={slideRightVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={transitions.spring}
      className="flex h-full flex-col border-base-300 border-l bg-base-200/50"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-base-300 border-b px-3 py-2">
        <span className="font-semibold text-base-content/50 text-xs uppercase tracking-wider">
          Details
        </span>
        <button
          type="button"
          className="btn btn-ghost btn-xs"
          onClick={() => setDetailKey(null)}
          title="Close details"
        >
          <i className="fa-solid fa-xmark" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {loading ? (
          <div className="space-y-3">
            <div className="flex flex-col items-center gap-2 py-4">
              <div className="skeleton h-10 w-10 rounded" />
              <div className="skeleton h-3 w-32 rounded" />
            </div>
            {Array.from({ length: 4 }).map((_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton
              <div key={`ds-${i}`} className="space-y-1">
                <div className="skeleton h-2 w-12 rounded" />
                <div className="skeleton h-3 w-full rounded" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="py-4 text-center text-error text-xs">{error}</div>
        ) : stat ? (
          <div className="space-y-4">
            {/* File icon + name */}
            <div className="flex flex-col items-center gap-2 py-2">
              <FileIcon name={detailKey} className="text-3xl" />
              <span className="max-w-full break-all text-center font-medium text-sm">
                {fileName}
              </span>
            </div>

            {/* Image preview */}
            {isImage && profileId && bucket && (
              <div className="overflow-hidden rounded-lg bg-base-300">
                <div className="flex items-center justify-center p-2 text-base-content/30 text-xs">
                  <i className="fa-regular fa-image mr-1" />
                  Image preview not available in S3 directly
                </div>
              </div>
            )}

            {/* Metadata table */}
            <table className="w-full text-xs">
              <tbody>
                <DetailRow label="Full Key" value={detailKey} mono />
                <DetailRow label="Size" value={formatBytes(stat.size)} />
                <DetailRow
                  label="Last Modified"
                  value={formatDate(stat.lastModified)}
                />
                <DetailRow label="ETag" value={stat.etag} mono />
                <DetailRow label="Content Type" value={stat.type || "—"} />
                <DetailRow label="Extension" value={ext || "—"} />
              </tbody>
            </table>

            {/* Quick actions */}
            <div className="space-y-1 pt-2">
              <button
                type="button"
                className="btn btn-ghost btn-xs btn-block justify-start"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(detailKey);
                  } catch {
                    // ignore
                  }
                }}
              >
                <i className="fa-regular fa-clipboard w-4" /> Copy Key
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <tr>
      <td className="whitespace-nowrap py-1.5 pr-3 align-top font-semibold text-base-content/50">
        {label}
      </td>
      <td
        className={`break-all py-1.5 text-base-content/80 ${mono ? "font-mono text-[10px]" : ""}`}
      >
        {value}
      </td>
    </tr>
  );
}

import type { S3StatResult } from "@shared/s3.types";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  IconCircleInfo,
  IconClipboard,
  IconImage,
  IconXmark,
} from "@/lib/icons";
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

  const fileName = detailKey ? getFileName(detailKey) : "";
  const ext = detailKey ? getExtension(detailKey).toLowerCase() : "";
  const isImage = PREVIEWABLE_IMAGES.has(ext);

  return (
    <Sheet
      open={!!detailKey}
      onOpenChange={(open) => !open && setDetailKey(null)}
    >
      <SheetContent
        side="right"
        showCloseButton={false}
        className="flex flex-col gap-0 p-0 w-72 sm:max-w-xs"
      >
        <SheetHeader className="flex-row items-center justify-between gap-2 space-y-0 border-border border-b px-4 py-3">
          <SheetTitle className="flex min-w-0 items-center gap-2 font-semibold text-sm">
            <IconCircleInfo className="size-4 shrink-0 text-foreground/60" />
            <span className="truncate">Details</span>
          </SheetTitle>
          <div className="flex shrink-0 items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-foreground/50 hover:text-foreground"
              onClick={() => setDetailKey(null)}
              title="Close"
            >
              <IconXmark className="size-4" />
            </Button>
          </div>
        </SheetHeader>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="space-y-3">
              <div className="flex flex-col items-center gap-2 py-4">
                <Skeleton className="h-10 w-10 rounded" />
                <Skeleton className="h-3 w-32 rounded" />
              </div>
              {Array.from({ length: 4 }).map((_, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton
                <div key={`ds-${i}`} className="space-y-1">
                  <Skeleton className="h-2 w-12 rounded" />
                  <Skeleton className="h-3 w-full rounded" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="py-4 text-center text-destructive text-xs">
              {error}
            </div>
          ) : stat && detailKey ? (
            <div className="space-y-4">
              {/* File icon + name */}
              <div className="flex flex-col items-center gap-2 py-2">
                <FileIcon name={detailKey} className="text-3xl" />
                <span className="max-w-full break-all text-center font-medium text-sm">
                  {fileName}
                </span>
              </div>

              {/* Image preview notice */}
              {isImage && profileId && bucket && (
                <div className="overflow-hidden rounded-lg bg-muted">
                  <div className="flex items-center justify-center p-2 text-foreground/30 text-xs">
                    <IconImage className="mr-1 size-3" />
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
                <Button
                  variant="ghost"
                  size="xs"
                  className="w-full justify-start"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(detailKey);
                    } catch {
                      // ignore
                    }
                  }}
                >
                  <IconClipboard /> Copy Key
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
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
      <td className="whitespace-nowrap py-1.5 pr-3 align-top font-semibold text-foreground/50">
        {label}
      </td>
      <td
        className={`break-all py-1.5 text-foreground/80 ${mono ? "font-mono text-[10px]" : ""}`}
      >
        {value}
      </td>
    </tr>
  );
}

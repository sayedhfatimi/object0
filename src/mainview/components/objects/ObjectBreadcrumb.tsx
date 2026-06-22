import { useState } from "react";
import { useObjectStore } from "../../stores/useObjectStore";
import { useProfileStore } from "../../stores/useProfileStore";
import { Button } from "@/components/ui/button";
import {
  IconCloud,
  IconBucket,
  IconCheck,
  IconCopy,
} from "@/lib/icons";

interface ObjectBreadcrumbProps {
  profileName: string;
  bucket: string;
}

export function ObjectBreadcrumb({
  profileName,
  bucket,
}: ObjectBreadcrumbProps) {
  const currentPrefix = useObjectStore((s) => s.currentPrefix);
  const navigateToPrefix = useObjectStore((s) => s.navigateToPrefix);
  const loadObjects = useObjectStore((s) => s.loadObjects);
  const activeProfileId = useProfileStore((s) => s.activeProfileId);
  const [copied, setCopied] = useState(false);

  const parts = currentPrefix.split("/").filter(Boolean);

  const handleNavigate = (index: number) => {
    const prefix = index < 0 ? "" : `${parts.slice(0, index + 1).join("/")}/`;

    navigateToPrefix(prefix);
    if (activeProfileId) {
      loadObjects(activeProfileId, bucket, prefix);
    }
  };

  const fullPath = currentPrefix ? `${bucket}/${currentPrefix}` : bucket;

  const handleCopyPath = async () => {
    try {
      await navigator.clipboard.writeText(fullPath);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard may not be available
    }
  };

  // For very deep paths, collapse middle segments — build a flat render list
  // Each element is either a separator "/" or a real part/ellipsis.
  const MAX_VISIBLE = 4;
  const shouldCollapse = parts.length > MAX_VISIBLE;

  // Build the visible parts with their real indices
  type PartItem = { label: string; realIndex: number; isLast: boolean };
  const visibleParts: (PartItem | null)[] = shouldCollapse
    ? [
        { label: parts[0], realIndex: 0, isLast: false },
        null, // ellipsis placeholder
        ...parts
          .slice(parts.length - (MAX_VISIBLE - 2))
          .map((label, j) => {
            const realIndex = parts.length - (MAX_VISIBLE - 2) + j;
            return { label, realIndex, isLast: realIndex === parts.length - 1 };
          }),
      ]
    : parts.map((label, i) => ({
        label,
        realIndex: i,
        isLast: i === parts.length - 1,
      }));

  return (
    <div className="flex items-center gap-1">
      <nav aria-label="Breadcrumb" className="text-xs">
        <ol className="flex flex-wrap items-center gap-1">
          <li>
            <span className="flex items-center gap-1 text-foreground/50">
              <IconCloud className="size-3 shrink-0" />
              {profileName}
            </span>
          </li>
          <li aria-hidden className="text-foreground/30">/</li>
          <li>
            <button
              type="button"
              className="flex items-center gap-1 font-medium hover:underline focus-visible:outline-none focus-visible:underline"
              onClick={() => handleNavigate(-1)}
            >
              <IconBucket className="size-3 shrink-0" />
              {bucket}
            </button>
          </li>
          {visibleParts.flatMap((item) => {
            if (item === null) {
              return [
                <li key="sep-ellipsis" aria-hidden className="text-foreground/30">/</li>,
                <li key="ellipsis">
                  <span className="text-foreground/40">…</span>
                </li>,
              ];
            }
            return [
              <li key={`sep-${item.realIndex}`} aria-hidden className="text-foreground/30">/</li>,
              <li key={`part-${item.realIndex}`}>
                {item.isLast ? (
                  <span className="font-medium">{item.label}</span>
                ) : (
                  <button
                    type="button"
                    className="hover:underline focus-visible:outline-none focus-visible:underline"
                    onClick={() => handleNavigate(item.realIndex)}
                  >
                    {item.label}
                  </button>
                )}
              </li>,
            ];
          })}
        </ol>
      </nav>

      {/* Copy path button */}
      {currentPrefix && (
        <Button
          variant="ghost"
          size="icon-xs"
          className="opacity-70 hover:opacity-100"
          onClick={() => void handleCopyPath()}
          title={`Copy path: ${fullPath}`}
          aria-label="Copy current path"
        >
          {copied ? (
            <IconCheck className="size-3 text-success" />
          ) : (
            <IconCopy className="size-3" />
          )}
        </Button>
      )}
    </div>
  );
}

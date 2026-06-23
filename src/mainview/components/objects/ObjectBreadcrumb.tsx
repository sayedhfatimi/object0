import { useState } from "react";
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { IconBucket, IconCheck, IconCloud, IconCopy } from "@/lib/icons";
import { useObjectStore } from "../../stores/useObjectStore";
import { useProfileStore } from "../../stores/useProfileStore";

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
  // Each element is either a real part or null (ellipsis placeholder).
  const MAX_VISIBLE = 4;
  const shouldCollapse = parts.length > MAX_VISIBLE;

  // Build the visible parts with their real indices
  type PartItem = { label: string; realIndex: number; isLast: boolean };
  const visibleParts: (PartItem | null)[] = shouldCollapse
    ? [
        { label: parts[0], realIndex: 0, isLast: false },
        null, // ellipsis placeholder
        ...parts.slice(parts.length - (MAX_VISIBLE - 2)).map((label, j) => {
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
      <Breadcrumb className="text-xs">
        <BreadcrumbList className="gap-1 text-xs">
          {/* Profile root */}
          <BreadcrumbItem>
            <span className="flex items-center gap-1 text-foreground/50">
              <IconCloud className="size-3 shrink-0" />
              {profileName}
            </span>
          </BreadcrumbItem>

          <BreadcrumbSeparator />

          {/* Bucket */}
          <BreadcrumbItem>
            <BreadcrumbLink
              render={<button type="button" />}
              className="flex items-center gap-1 font-medium"
              onClick={() => handleNavigate(-1)}
            >
              <IconBucket className="size-3 shrink-0" />
              {bucket}
            </BreadcrumbLink>
          </BreadcrumbItem>

          {/* Prefix segments */}
          {visibleParts.flatMap((item) => {
            if (item === null) {
              return [
                <BreadcrumbSeparator key="sep-ellipsis" />,
                <BreadcrumbItem key="ellipsis">
                  <BreadcrumbEllipsis />
                </BreadcrumbItem>,
              ];
            }
            return [
              <BreadcrumbSeparator key={`sep-${item.realIndex}`} />,
              <BreadcrumbItem key={`part-${item.realIndex}`}>
                {item.isLast ? (
                  <BreadcrumbPage className="font-medium">
                    {item.label}
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink
                    render={<button type="button" />}
                    onClick={() => handleNavigate(item.realIndex)}
                  >
                    {item.label}
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>,
            ];
          })}
        </BreadcrumbList>
      </Breadcrumb>

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

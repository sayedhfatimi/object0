import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { transitions } from "../../lib/animations";
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

  // For very deep paths, collapse middle segments
  const MAX_VISIBLE = 4;
  const shouldCollapse = parts.length > MAX_VISIBLE;
  const visibleParts = shouldCollapse
    ? [
        ...parts.slice(0, 1),
        null, // represents collapsed segment
        ...parts.slice(parts.length - (MAX_VISIBLE - 2)),
      ]
    : parts;

  return (
    <div className="flex items-center gap-1">
      <div className="breadcrumbs text-xs">
        <ul>
          <li>
            <span className="text-base-content/50">
              <i className="fa-solid fa-cloud fa-xs mr-1" />
              {profileName}
            </span>
          </li>
          <li>
            <button
              type="button"
              className="link link-hover font-medium"
              onClick={() => handleNavigate(-1)}
            >
              <i className="fa-solid fa-bucket fa-xs mr-1" />
              {bucket}
            </button>
          </li>
          <AnimatePresence mode="popLayout">
            {visibleParts.map((part, i) => {
              if (part === null) {
                return (
                  // biome-ignore lint/suspicious/noArrayIndexKey: collapsed indicator
                  <li key={`ellipsis-${i}`}>
                    <span className="text-base-content/40">…</span>
                  </li>
                );
              }

              // Map visual index back to real parts index
              const realIndex = shouldCollapse
                ? i === 0
                  ? 0
                  : parts.length - (MAX_VISIBLE - 2) + (i - 2)
                : i;
              const isLast = realIndex === parts.length - 1;

              return (
                <motion.li
                  key={parts.slice(0, realIndex + 1).join("/")}
                  layout
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  transition={transitions.fast}
                >
                  {isLast ? (
                    <span className="font-medium">{part}</span>
                  ) : (
                    <button
                      type="button"
                      className="link link-hover"
                      onClick={() => handleNavigate(realIndex)}
                    >
                      {part}
                    </button>
                  )}
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      </div>

      {/* Copy path button */}
      {currentPrefix && (
        <button
          type="button"
          className="btn btn-ghost btn-xs opacity-70 transition-opacity hover:opacity-100"
          onClick={handleCopyPath}
          title={`Copy path: ${fullPath}`}
          aria-label="Copy current path"
        >
          <i
            className={`fa-solid ${copied ? "fa-check text-success" : "fa-copy"} fa-xs`}
          />
        </button>
      )}
    </div>
  );
}

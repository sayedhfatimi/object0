import { useCallback, useEffect, useRef, useState } from "react";

interface ResizeHandleProps {
  /** Side the handle is on relative to the panel being resized */
  side: "left" | "right";
  /** Current width in px */
  width: number;
  /** Min width in px */
  minWidth: number;
  /** Max width in px */
  maxWidth: number;
  /** Called with new width during drag */
  onResize: (width: number) => void;
}

/**
 * A thin vertical drag handle for resizing panels.
 * Place between the panel and adjacent content.
 */
export function ResizeHandle({
  side,
  width,
  minWidth,
  maxWidth,
  onResize,
}: ResizeHandleProps) {
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      startX.current = e.clientX;
      startWidth.current = width;
      setDragging(true);
    },
    [width],
  );

  useEffect(() => {
    if (!dragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - startX.current;
      // For right-side handle, dragging right = wider; for left-side, dragging left = wider
      const newWidth =
        side === "right"
          ? startWidth.current + delta
          : startWidth.current - delta;
      const clamped = Math.min(Math.max(newWidth, minWidth), maxWidth);
      onResize(clamped);
    };

    const handleMouseUp = () => {
      setDragging(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    // Prevent text selection during drag
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [dragging, side, minWidth, maxWidth, onResize]);

  return (
    // biome-ignore lint/a11y/useSemanticElements: div with separator role used for interactive resize handle
    <div
      className={`group relative z-10 w-1 shrink-0 cursor-col-resize ${
        dragging ? "bg-primary/40" : "hover:bg-primary/20"
      } transition-colors`}
      onMouseDown={handleMouseDown}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize panel"
      aria-valuenow={width}
      aria-valuemin={minWidth}
      aria-valuemax={maxWidth}
      tabIndex={0}
      onKeyDown={(e) => {
        const step = 20;
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          onResize(Math.max(width - step, minWidth));
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          onResize(Math.min(width + step, maxWidth));
        }
      }}
    >
      {/* Visual indicator dot */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100">
        <div className="flex flex-col gap-0.5">
          <div className="h-1 w-1 rounded-full bg-base-content/30" />
          <div className="h-1 w-1 rounded-full bg-base-content/30" />
          <div className="h-1 w-1 rounded-full bg-base-content/30" />
        </div>
      </div>
    </div>
  );
}

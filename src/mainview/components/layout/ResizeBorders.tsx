import { getCurrentWindow } from "@tauri-apps/api/window";
import { useUIStore } from "../../stores/useUIStore";

// Undecorated windows on Linux/WebKitGTK lose native edge resizing, and behavior
// is WM-dependent. These invisible grips restore it everywhere by forwarding a
// pointer-down to Tauri's startResizeDragging. macOS stays decorated and Windows
// keeps a resizable frame, so the grips are Linux-only.

// Tauri's ResizeDirection type is not exported, so mirror its string literals
// here — they are structurally assignable to startResizeDragging's parameter.
type ResizeDirection =
  | "North"
  | "NorthEast"
  | "East"
  | "SouthEast"
  | "South"
  | "SouthWest"
  | "West"
  | "NorthWest";

type Grip = {
  direction: ResizeDirection;
  className: string;
};

const EDGE = "fixed z-50 no-drag";
const CORNER = "fixed z-[51] size-[10px] no-drag";

const GRIPS: Grip[] = [
  // Edges
  {
    direction: "North",
    className: `${EDGE} top-0 right-0 left-0 h-[5px] cursor-ns-resize`,
  },
  {
    direction: "South",
    className: `${EDGE} right-0 bottom-0 left-0 h-[5px] cursor-ns-resize`,
  },
  {
    direction: "West",
    className: `${EDGE} top-0 bottom-0 left-0 w-[5px] cursor-ew-resize`,
  },
  {
    direction: "East",
    className: `${EDGE} top-0 right-0 bottom-0 w-[5px] cursor-ew-resize`,
  },
  // Corners (sit above the edges)
  {
    direction: "NorthWest",
    className: `${CORNER} top-0 left-0 cursor-nwse-resize`,
  },
  {
    direction: "NorthEast",
    className: `${CORNER} top-0 right-0 cursor-nesw-resize`,
  },
  {
    direction: "SouthWest",
    className: `${CORNER} bottom-0 left-0 cursor-nesw-resize`,
  },
  {
    direction: "SouthEast",
    className: `${CORNER} right-0 bottom-0 cursor-nwse-resize`,
  },
];

export function ResizeBorders() {
  const platform = useUIStore((s) => s.platform);
  if (platform !== "linux") return null;

  return (
    <>
      {GRIPS.map((grip) => (
        // biome-ignore lint/a11y/noStaticElementInteractions: invisible window resize grip, not content
        <div
          key={grip.direction}
          className={grip.className}
          onMouseDown={(e) => {
            // Only the primary button should start a resize.
            if (e.button !== 0) return;
            getCurrentWindow().startResizeDragging(grip.direction);
          }}
        />
      ))}
    </>
  );
}

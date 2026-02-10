import { useState } from "react";
import type { ProfileInfo } from "../../../shared/profile.types";
import { PROVIDER_LABELS } from "../../../shared/profile.types";

interface ProfileListProps {
  profiles: ProfileInfo[];
  activeId: string | null;
  onSelect: (profile: ProfileInfo) => void;
  onEdit: (profile: ProfileInfo) => void;
  onDelete: (profile: ProfileInfo) => void;
}

const PROFILE_MENU_WIDTH = 160;
const PROFILE_MENU_HEIGHT = 98;
const MENU_MARGIN = 8;

function clampMenuPosition(x: number, y: number): { x: number; y: number } {
  const maxX = window.innerWidth - PROFILE_MENU_WIDTH - MENU_MARGIN;
  const maxY = window.innerHeight - PROFILE_MENU_HEIGHT - MENU_MARGIN;
  return {
    x: Math.min(Math.max(x, MENU_MARGIN), Math.max(MENU_MARGIN, maxX)),
    y: Math.min(Math.max(y, MENU_MARGIN), Math.max(MENU_MARGIN, maxY)),
  };
}

export function ProfileList({
  profiles,
  activeId,
  onSelect,
  onEdit,
  onDelete,
}: ProfileListProps) {
  const [contextMenu, setContextMenu] = useState<{
    profile: ProfileInfo;
    x: number;
    y: number;
  } | null>(null);

  if (profiles.length === 0) {
    return (
      <div className="px-3 py-4 text-center text-base-content/40 text-xs">
        No profiles yet. Click + to add one.
      </div>
    );
  }

  const handleContextMenu = (e: React.MouseEvent, profile: ProfileInfo) => {
    e.preventDefault();
    setContextMenu({ profile, x: e.clientX, y: e.clientY });
  };

  const closeContextMenu = () => setContextMenu(null);
  const clampedMenu = contextMenu
    ? clampMenuPosition(contextMenu.x, contextMenu.y)
    : null;

  return (
    <>
      {/* Dismiss overlay */}
      {contextMenu && (
        <button
          type="button"
          className="fixed inset-0 z-50 cursor-default bg-transparent"
          onClick={closeContextMenu}
          onContextMenu={(e) => {
            e.preventDefault();
            closeContextMenu();
          }}
        />
      )}

      <ul className="menu menu-sm w-full px-1">
        {profiles.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              className={`flex w-full items-center gap-2 transition-colors duration-150 ${
                p.id === activeId ? "active" : ""
              }`}
              onClick={() => onSelect(p)}
              onContextMenu={(e) => handleContextMenu(e, p)}
              onKeyDown={(e) => {
                if (
                  e.key === "ContextMenu" ||
                  (e.key === "F10" && e.shiftKey)
                ) {
                  e.preventDefault();
                  const rect = e.currentTarget.getBoundingClientRect();
                  setContextMenu({
                    profile: p,
                    x: rect.left + Math.min(rect.width - 12, 180),
                    y: rect.top + rect.height / 2,
                  });
                }
              }}
            >
              <span className="text-lg">
                <i className={providerIcon(p.provider)} />
              </span>
              <div className="flex flex-col items-start">
                <span className="font-medium text-sm">{p.name}</span>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[9px] leading-tight ${providerBadge(p.provider)}`}
                >
                  <span
                    className={`inline-block h-1.5 w-1.5 rounded-full ${providerDot(p.provider)}`}
                  />
                  {PROVIDER_LABELS[p.provider]}
                </span>
              </div>
            </button>
          </li>
        ))}
      </ul>

      {/* Context menu */}
      {contextMenu && (
        <ul
          className="menu menu-sm fixed z-60 w-40 rounded-box bg-base-300 p-1 shadow-lg"
          style={{ top: clampedMenu?.y, left: clampedMenu?.x }}
        >
          <li>
            <button
              type="button"
              onClick={() => {
                onEdit(contextMenu.profile);
                closeContextMenu();
              }}
            >
              <i className="fa-solid fa-pen-to-square" /> Edit
            </button>
          </li>
          <li>
            <button
              type="button"
              className="text-error"
              onClick={() => {
                onDelete(contextMenu.profile);
                closeContextMenu();
              }}
            >
              <i className="fa-solid fa-trash" /> Delete
            </button>
          </li>
        </ul>
      )}
    </>
  );
}

function providerIcon(provider: ProfileInfo["provider"]): string {
  const map: Record<string, string> = {
    aws: "fa-brands fa-aws text-warning",
    r2: "fa-solid fa-cloud text-accent",
    spaces: "fa-brands fa-digital-ocean text-info",
    minio: "fa-solid fa-server text-error",
    gcs: "fa-brands fa-google text-success",
    backblaze: "fa-solid fa-fire text-base-content",
    custom: "fa-solid fa-gear text-base-content/60",
  };
  return map[provider] ?? "fa-solid fa-cloud";
}

function providerBadge(provider: ProfileInfo["provider"]): string {
  const map: Record<string, string> = {
    aws: "bg-warning/10 text-warning",
    r2: "bg-accent/10 text-accent",
    spaces: "bg-info/10 text-info",
    minio: "bg-error/10 text-error",
    gcs: "bg-success/10 text-success",
    backblaze: "bg-base-content/10 text-base-content/60",
    custom: "bg-base-content/5 text-base-content/40",
  };
  return map[provider] ?? "bg-base-content/5 text-base-content/40";
}

function providerDot(provider: ProfileInfo["provider"]): string {
  const map: Record<string, string> = {
    aws: "bg-warning",
    r2: "bg-accent",
    spaces: "bg-info",
    minio: "bg-error",
    gcs: "bg-success",
    backblaze: "bg-base-content",
    custom: "bg-base-content/40",
  };
  return map[provider] ?? "bg-base-content/40";
}

import type React from "react";
import { useState } from "react";
import type { ProfileInfo } from "../../../shared/profile.types";
import { PROVIDER_LABELS } from "../../../shared/profile.types";
import { Button } from "@/components/ui/button";
import { IconPenToSquare, IconTrashCan, IconAws, IconCloud, IconDigitalOcean, IconServer, IconGoogle, IconFire, IconGear } from "@/lib/icons";

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
      <div className="px-3 py-4 text-center text-muted-foreground/60 text-xs">
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

      <ul className="w-full space-y-0.5 px-1">
        {profiles.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors duration-150 hover:bg-accent hover:text-accent-foreground ${
                p.id === activeId
                  ? "bg-accent text-accent-foreground"
                  : "text-foreground"
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
              <span className="text-base shrink-0">
                <ProviderIcon provider={p.provider} />
              </span>
              <div className="flex flex-col items-start min-w-0">
                <span className="font-medium text-sm truncate w-full">{p.name}</span>
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
        <div
          className="fixed z-60 w-40 rounded-lg border border-border bg-popover p-1 shadow-lg"
          style={{ top: clampedMenu?.y, left: clampedMenu?.x }}
        >
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 px-2 py-1.5 h-auto font-normal"
            onClick={() => {
              onEdit(contextMenu.profile);
              closeContextMenu();
            }}
          >
            <IconPenToSquare className="size-3.5" /> Edit
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 px-2 py-1.5 h-auto font-normal text-destructive hover:text-destructive"
            onClick={() => {
              onDelete(contextMenu.profile);
              closeContextMenu();
            }}
          >
            <IconTrashCan className="size-3.5" /> Delete
          </Button>
        </div>
      )}
    </>
  );
}

function ProviderIcon({ provider }: { provider: ProfileInfo["provider"] }) {
  switch (provider) {
    case "aws":
      return <IconAws className="size-4 text-warning" />;
    case "r2":
      return <IconCloud className="size-4 text-accent" />;
    case "spaces":
      return <IconDigitalOcean className="size-4 text-info" />;
    case "minio":
      return <IconServer className="size-4 text-destructive" />;
    case "gcs":
      return <IconGoogle className="size-4 text-success" />;
    case "backblaze":
      return <IconFire className="size-4 text-foreground" />;
    case "custom":
      return <IconGear className="size-4 text-muted-foreground" />;
    default:
      return <IconCloud className="size-4" />;
  }
}

function providerBadge(provider: ProfileInfo["provider"]): string {
  const map: Record<string, string> = {
    aws: "bg-warning/10 text-warning",
    r2: "bg-accent/10 text-accent",
    spaces: "bg-info/10 text-info",
    minio: "bg-destructive/10 text-destructive",
    gcs: "bg-success/10 text-success",
    backblaze: "bg-foreground/10 text-foreground/60",
    custom: "bg-foreground/5 text-foreground/40",
  };
  return map[provider] ?? "bg-foreground/5 text-foreground/40";
}

function providerDot(provider: ProfileInfo["provider"]): string {
  const map: Record<string, string> = {
    aws: "bg-warning",
    r2: "bg-accent",
    spaces: "bg-info",
    minio: "bg-destructive",
    gcs: "bg-success",
    backblaze: "bg-foreground",
    custom: "bg-foreground/40",
  };
  return map[provider] ?? "bg-foreground/40";
}

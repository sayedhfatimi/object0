import { useBucketStore } from "../../stores/useBucketStore";
import { useFolderSyncStore } from "../../stores/useFolderSyncStore";
import { useJobStore } from "../../stores/useJobStore";
import { useProfileStore } from "../../stores/useProfileStore";
import { useShareHistoryStore } from "../../stores/useShareHistoryStore";
import { useThemeStore } from "../../stores/useThemeStore";
import { useUIStore } from "../../stores/useUIStore";
import { ObjectBreadcrumb } from "../objects/ObjectBreadcrumb";
import { ObjectToolbar } from "../objects/ObjectToolbar";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  IconClockRotateLeft,
  IconFolderOpen,
  IconGear,
  IconListCheck,
  IconMoon,
  IconSun,
} from "../../lib/icons";

export function TopBar() {
  const activeProfile = useProfileStore((s) => s.activeProfile);
  const bucket = useBucketStore((s) => s.selectedBucket);
  const toggleTheme = useThemeStore((s) => s.toggle);
  const theme = useThemeStore((s) => s.theme);
  const jobPanelOpen = useUIStore((s) => s.jobPanelOpen);
  const setJobPanelOpen = useUIStore((s) => s.setJobPanelOpen);
  const jobs = useJobStore((s) => s.jobs);
  const activeJobCount = jobs.filter(
    (j) => j.status === "running" || j.status === "queued",
  ).length;

  const shareHistoryOpen = useUIStore((s) => s.shareHistoryOpen);
  const setShareHistoryOpen = useUIStore((s) => s.setShareHistoryOpen);
  const shareHistoryCount = useShareHistoryStore((s) => s.entries.length);
  const folderSyncPanelOpen = useUIStore((s) => s.folderSyncPanelOpen);
  const setFolderSyncPanelOpen = useUIStore((s) => s.setFolderSyncPanelOpen);
  const syncingCount = useFolderSyncStore((s) => s.getSyncingCount);
  const activeCount = useFolderSyncStore((s) => s.getActiveCount);
  const settingsOpen = useUIStore((s) => s.settingsOpen);
  const setSettingsOpen = useUIStore((s) => s.setSettingsOpen);

  return (
    <div className="drag-region flex flex-col border-border border-b bg-card/50">
      {/* Top row: breadcrumb + global actions */}
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="no-drag group/breadcrumb flex-1">
          {activeProfile && bucket ? (
            <ObjectBreadcrumb
              profileName={activeProfile.name}
              bucket={bucket}
            />
          ) : (
            <span className="text-foreground/40 text-sm">
              {activeProfile ? "Select a bucket" : "Select a profile to begin"}
            </span>
          )}
        </div>

        <Button
          variant="ghost"
          size="icon-sm"
          className="no-drag"
          onClick={toggleTheme}
          title="Toggle Theme (Ctrl+\\)"
          aria-label="Toggle theme"
        >
          {theme === "dark" ? (
            <IconSun className="size-4" />
          ) : (
            <IconMoon className="size-4" />
          )}
        </Button>

        <div className="no-drag relative">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setShareHistoryOpen(!shareHistoryOpen)}
            title="Share History"
            aria-label="Toggle share history"
          >
            <IconClockRotateLeft className="size-4" />
          </Button>
          {shareHistoryCount > 0 && (
            <Badge
              variant="outline"
              className="absolute -top-1 -right-1 min-w-4 px-1 text-[10px]"
            >
              {shareHistoryCount}
            </Badge>
          )}
        </div>

        <div className="no-drag relative">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setJobPanelOpen(!jobPanelOpen)}
            title="Toggle Jobs Panel (Ctrl+J)"
            aria-label="Toggle jobs panel"
          >
            <IconListCheck className="size-4" />
          </Button>
          {activeJobCount > 0 && (
            <Badge className="absolute -top-1 -right-1 min-w-4 px-1 text-[10px] bg-blue-500 text-white border-transparent">
              {activeJobCount}
            </Badge>
          )}
        </div>

        <div className="no-drag relative">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setFolderSyncPanelOpen(!folderSyncPanelOpen)}
            title="Live Folder Sync (continuous local <-> bucket)"
            aria-label="Toggle live folder sync panel"
          >
            <IconFolderOpen
              className={`size-4 ${syncingCount() > 0 ? "text-blue-500" : ""}`}
            />
          </Button>
          {activeCount() > 0 && (
            <Badge className="absolute -top-1 -right-1 min-w-4 px-1 text-[10px] bg-green-500 text-white border-transparent">
              {activeCount()}
            </Badge>
          )}
        </div>

        <Button
          variant="ghost"
          size="icon-sm"
          className="no-drag"
          onClick={() => setSettingsOpen(!settingsOpen)}
          title="Settings (Ctrl+,)"
          aria-label="Toggle settings panel"
        >
          <IconGear className="size-4" />
        </Button>
      </div>

      {/* Toolbar row (when viewing objects) */}
      {activeProfile && bucket && <ObjectToolbar />}
    </div>
  );
}

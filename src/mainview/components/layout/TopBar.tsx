import { useBucketStore } from "../../stores/useBucketStore";
import { useFolderSyncStore } from "../../stores/useFolderSyncStore";
import { useJobStore } from "../../stores/useJobStore";
import { useProfileStore } from "../../stores/useProfileStore";
import { useShareHistoryStore } from "../../stores/useShareHistoryStore";
import { useThemeStore } from "../../stores/useThemeStore";
import { useUIStore } from "../../stores/useUIStore";
import { ObjectBreadcrumb } from "../objects/ObjectBreadcrumb";
import { ObjectToolbar } from "../objects/ObjectToolbar";

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
    <div className="drag-region flex flex-col border-base-300 border-b bg-base-200/50">
      {/* Top row: breadcrumb + global actions */}
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="no-drag group/breadcrumb flex-1">
          {activeProfile && bucket ? (
            <ObjectBreadcrumb
              profileName={activeProfile.name}
              bucket={bucket}
            />
          ) : (
            <span className="text-base-content/40 text-sm">
              {activeProfile ? "Select a bucket" : "Select a profile to begin"}
            </span>
          )}
        </div>

        <button
          type="button"
          className="no-drag btn btn-ghost btn-sm btn-square"
          onClick={toggleTheme}
          title="Toggle Theme (Ctrl+\\)"
          aria-label="Toggle theme"
        >
          <i
            className={
              theme === "dark-dim" ? "fa-regular fa-sun" : "fa-regular fa-moon"
            }
          />
        </button>

        <button
          type="button"
          className="no-drag btn btn-ghost btn-sm btn-square relative"
          onClick={() => setShareHistoryOpen(!shareHistoryOpen)}
          title="Share History"
          aria-label="Toggle share history"
        >
          <i className="fa-solid fa-clock-rotate-left" />
          {shareHistoryCount > 0 && (
            <span className="badge badge-ghost badge-xs absolute -top-1 -right-1 min-w-4 text-[10px]">
              {shareHistoryCount}
            </span>
          )}
        </button>

        <button
          type="button"
          className="no-drag btn btn-ghost btn-sm btn-square relative"
          onClick={() => setJobPanelOpen(!jobPanelOpen)}
          title="Toggle Jobs Panel (Ctrl+J)"
          aria-label="Toggle jobs panel"
        >
          <i className="fa-solid fa-list-check" />
          {activeJobCount > 0 && (
            <span className="badge badge-info badge-xs absolute -top-1 -right-1 min-w-4 text-[10px]">
              {activeJobCount}
            </span>
          )}
        </button>

        <button
          type="button"
          className="no-drag btn btn-ghost btn-sm btn-square relative"
          onClick={() => setFolderSyncPanelOpen(!folderSyncPanelOpen)}
          title="Live Folder Sync (continuous local <-> bucket)"
          aria-label="Toggle live folder sync panel"
        >
          <i
            className={`fa-solid fa-folder-open ${
              syncingCount() > 0 ? "text-info" : ""
            }`}
          />
          {activeCount() > 0 && (
            <span className="badge badge-success badge-xs absolute -top-1 -right-1 min-w-4 text-[10px]">
              {activeCount()}
            </span>
          )}
        </button>

        <button
          type="button"
          className="no-drag btn btn-ghost btn-sm btn-square"
          onClick={() => setSettingsOpen(!settingsOpen)}
          title="Settings (Ctrl+,)"
          aria-label="Toggle settings panel"
        >
          <i className="fa-solid fa-gear" />
        </button>
      </div>

      {/* Toolbar row (when viewing objects) */}
      {activeProfile && bucket && <ObjectToolbar />}
    </div>
  );
}

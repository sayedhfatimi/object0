import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import {
  dispatchObjectToolbarEvent,
  OBJECT_TOOLBAR_EVENTS,
} from "../../lib/object-toolbar-events";
import {
  IconArrowRightArrowLeft,
  IconArrowsRotate,
  IconBarsProgress,
  IconClockRotateLeft,
  IconCloudArrowDown,
  IconCloudArrowUp,
  IconCodeCompare,
  IconFolder,
  IconFolderOpen,
  IconFolderPlus,
  IconGear,
  IconGrip,
  IconLock,
  IconMagnifyingGlass,
  IconMoon,
  IconRotate,
  IconShareNodes,
  IconSidebar,
  IconSun,
  IconTableList,
  IconTrashCan,
} from "@/lib/icons";
import type { LucideIcon } from "lucide-react";
import { useBucketStore } from "../../stores/useBucketStore";
import { useObjectStore } from "../../stores/useObjectStore";
import { useProfileStore } from "../../stores/useProfileStore";
import { useThemeStore } from "../../stores/useThemeStore";
import { useUIStore } from "../../stores/useUIStore";
import { useVaultStore } from "../../stores/useVaultStore";

interface PaletteCommand {
  id: string;
  label: string;
  Icon: LucideIcon;
  section: string;
  shortcut?: string;
  action: () => void;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);

  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const setJobPanelOpen = useUIStore((s) => s.setJobPanelOpen);
  const jobPanelOpen = useUIStore((s) => s.jobPanelOpen);
  const setShareHistoryOpen = useUIStore((s) => s.setShareHistoryOpen);
  const shareHistoryOpen = useUIStore((s) => s.shareHistoryOpen);
  const setSettingsOpen = useUIStore((s) => s.setSettingsOpen);
  const settingsOpen = useUIStore((s) => s.settingsOpen);
  const openSyncChooser = useUIStore((s) => s.openSyncChooser);
  const setFolderSyncPanelOpen = useUIStore((s) => s.setFolderSyncPanelOpen);
  const folderSyncPanelOpen = useUIStore((s) => s.folderSyncPanelOpen);
  const setViewMode = useUIStore((s) => s.setViewMode);
  const toggleTheme = useThemeStore((s) => s.toggle);
  const theme = useThemeStore((s) => s.theme);
  const lock = useVaultStore((s) => s.lock);
  const activeProfile = useProfileStore((s) => s.activeProfile);
  const activeProfileId = useProfileStore((s) => s.activeProfileId);
  const bucket = useBucketStore((s) => s.selectedBucket);
  const selectedKeys = useObjectStore((s) => s.selectedKeys);
  const selectedCount = selectedKeys.size;
  const shareableSelection =
    selectedCount === 1 && !Array.from(selectedKeys)[0]?.endsWith("/");

  const commands: PaletteCommand[] = useMemo(() => {
    const baseCommands: PaletteCommand[] = [
      {
        id: "toggle-sidebar",
        label: "Toggle Sidebar",
        Icon: IconSidebar,
        section: "View",
        shortcut: "Ctrl+B",
        action: toggleSidebar,
      },
      {
        id: "toggle-theme",
        label: `Switch to ${theme === "dark" ? "Light" : "Dark"} Theme`,
        Icon: theme === "dark" ? IconSun : IconMoon,
        section: "View",
        shortcut: "Ctrl+\\",
        action: toggleTheme,
      },
      {
        id: "toggle-jobs",
        label: jobPanelOpen ? "Hide Job Panel" : "Show Job Panel",
        Icon: IconBarsProgress,
        section: "View",
        shortcut: "Ctrl+J",
        action: () => setJobPanelOpen(!jobPanelOpen),
      },
      {
        id: "toggle-share-history",
        label: shareHistoryOpen ? "Hide Share History" : "Show Share History",
        Icon: IconClockRotateLeft,
        section: "View",
        action: () => setShareHistoryOpen(!shareHistoryOpen),
      },
      {
        id: "view-table",
        label: "Switch to Table View",
        Icon: IconTableList,
        section: "View",
        action: () => setViewMode("table"),
      },
      {
        id: "view-grid",
        label: "Switch to Grid View",
        Icon: IconGrip,
        section: "View",
        action: () => setViewMode("grid"),
      },
      {
        id: "open-settings",
        label: settingsOpen ? "Close Settings" : "Open Settings",
        Icon: IconGear,
        section: "App",
        action: () => setSettingsOpen(!settingsOpen),
      },
      {
        id: "lock-vault",
        label: "Lock Vault",
        Icon: IconLock,
        section: "App",
        action: lock,
      },
      {
        id: "toggle-live-folder-sync",
        label: folderSyncPanelOpen
          ? "Hide Live Folder Sync"
          : "Show Live Folder Sync",
        Icon: IconFolderOpen,
        section: "Sync",
        action: () => setFolderSyncPanelOpen(!folderSyncPanelOpen),
      },
      {
        id: "choose-sync-type",
        label: "Choose Sync Type",
        Icon: IconCodeCompare,
        section: "Sync",
        action: openSyncChooser,
      },
    ];

    if (!activeProfileId || !bucket) {
      return baseCommands;
    }

    const objectCommands: PaletteCommand[] = [
      {
        id: "obj-search",
        label: "Search Objects",
        Icon: IconMagnifyingGlass,
        section: "Objects",
        shortcut: "Ctrl+F",
        action: () =>
          dispatchObjectToolbarEvent(OBJECT_TOOLBAR_EVENTS.OPEN_SEARCH),
      },
      {
        id: "obj-refresh",
        label: "Refresh Objects",
        Icon: IconArrowsRotate,
        section: "Objects",
        action: () =>
          dispatchObjectToolbarEvent(OBJECT_TOOLBAR_EVENTS.REFRESH_OBJECTS),
      },
      {
        id: "obj-upload-files",
        label: "Upload Files",
        Icon: IconCloudArrowUp,
        section: "Objects",
        action: () =>
          dispatchObjectToolbarEvent(OBJECT_TOOLBAR_EVENTS.UPLOAD_FILES),
      },
      {
        id: "obj-upload-folder",
        label: "Upload Folder",
        Icon: IconFolderPlus,
        section: "Objects",
        action: () =>
          dispatchObjectToolbarEvent(OBJECT_TOOLBAR_EVENTS.UPLOAD_FOLDER),
      },
      {
        id: "obj-new-folder",
        label: "Create Folder",
        Icon: IconFolder,
        section: "Objects",
        action: () =>
          dispatchObjectToolbarEvent(OBJECT_TOOLBAR_EVENTS.NEW_FOLDER),
      },
      {
        id: "obj-sync",
        label: "Open Sync (Default)",
        Icon: IconRotate,
        section: "Objects",
        action: () =>
          dispatchObjectToolbarEvent(OBJECT_TOOLBAR_EVENTS.OPEN_SYNC),
      },
    ];

    if (selectedCount > 0) {
      objectCommands.push(
        {
          id: "obj-download-selection",
          label: `Download Selected (${selectedCount})`,
          Icon: IconCloudArrowDown,
          section: "Objects",
          action: () =>
            dispatchObjectToolbarEvent(
              OBJECT_TOOLBAR_EVENTS.DOWNLOAD_SELECTION,
            ),
        },
        {
          id: "obj-transfer-selection",
          label: `Transfer Selected (${selectedCount})`,
          Icon: IconArrowRightArrowLeft,
          section: "Objects",
          action: () =>
            dispatchObjectToolbarEvent(OBJECT_TOOLBAR_EVENTS.OPEN_TRANSFER),
        },
        {
          id: "obj-delete-selection",
          label: `Delete Selected (${selectedCount})`,
          Icon: IconTrashCan,
          section: "Objects",
          action: () =>
            dispatchObjectToolbarEvent(OBJECT_TOOLBAR_EVENTS.DELETE_SELECTION),
        },
      );
    }

    if (shareableSelection) {
      objectCommands.push({
        id: "obj-share-selection",
        label: "Share Selected File",
        Icon: IconShareNodes,
        section: "Objects",
        action: () =>
          dispatchObjectToolbarEvent(OBJECT_TOOLBAR_EVENTS.SHARE_SELECTION),
      });
    }

    return [...baseCommands, ...objectCommands];
  }, [
    toggleSidebar,
    toggleTheme,
    theme,
    jobPanelOpen,
    setJobPanelOpen,
    shareHistoryOpen,
    setShareHistoryOpen,
    setViewMode,
    lock,
    settingsOpen,
    setSettingsOpen,
    openSyncChooser,
    setFolderSyncPanelOpen,
    folderSyncPanelOpen,
    activeProfileId,
    bucket,
    selectedCount,
    shareableSelection,
  ]);

  const execute = useCallback(
    (cmd: PaletteCommand) => {
      setOpen(false);
      cmd.action();
    },
    [],
  );

  // Global shortcut to open
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Group commands by section for rendering
  const sections = useMemo(() => {
    const map = new Map<string, PaletteCommand[]>();
    for (const cmd of commands) {
      const list = map.get(cmd.section) ?? [];
      list.push(cmd);
      map.set(cmd.section, list);
    }
    return map;
  }, [commands]);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <Command>
        <CommandInput placeholder="Type a command…" />
        <CommandList>
          <CommandEmpty>No matching commands</CommandEmpty>
          {Array.from(sections.entries()).map(([section, cmds]) => (
            <CommandGroup key={section} heading={section}>
              {cmds.map((cmd) => (
                <CommandItem
                  key={cmd.id}
                  value={`${cmd.section} ${cmd.label}`}
                  onSelect={() => execute(cmd)}
                >
                  <cmd.Icon className="size-4" />
                  <span className="flex-1">{cmd.label}</span>
                  {cmd.shortcut && (
                    <CommandShortcut>{cmd.shortcut}</CommandShortcut>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
        {(activeProfile || bucket) && (
          <div className="border-t px-3 py-2 text-[11px] text-muted-foreground">
            {activeProfile && bucket
              ? `${activeProfile.name} / ${bucket}`
              : activeProfile?.name ?? bucket}
          </div>
        )}
      </Command>
    </CommandDialog>
  );
}

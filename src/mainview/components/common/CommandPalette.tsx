import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { scaleVariants, transitions } from "../../lib/animations";
import {
  dispatchObjectToolbarEvent,
  OBJECT_TOOLBAR_EVENTS,
} from "../../lib/object-toolbar-events";
import { useBucketStore } from "../../stores/useBucketStore";
import { useObjectStore } from "../../stores/useObjectStore";
import { useProfileStore } from "../../stores/useProfileStore";
import { useThemeStore } from "../../stores/useThemeStore";
import { useUIStore } from "../../stores/useUIStore";
import { useVaultStore } from "../../stores/useVaultStore";

interface CommandItem {
  id: string;
  label: string;
  icon: string;
  section: string;
  shortcut?: string;
  action: () => void;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

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

  const commands: CommandItem[] = useMemo(() => {
    const baseCommands: CommandItem[] = [
      {
        id: "toggle-sidebar",
        label: "Toggle Sidebar",
        icon: "fa-solid fa-sidebar",
        section: "View",
        shortcut: "Ctrl+B",
        action: toggleSidebar,
      },
      {
        id: "toggle-theme",
        label: `Switch to ${theme === "dark-dim" ? "Light" : "Dark"} Theme`,
        icon: theme === "dark-dim" ? "fa-solid fa-sun" : "fa-solid fa-moon",
        section: "View",
        shortcut: "Ctrl+\\",
        action: toggleTheme,
      },
      {
        id: "toggle-jobs",
        label: jobPanelOpen ? "Hide Job Panel" : "Show Job Panel",
        icon: "fa-solid fa-bars-progress",
        section: "View",
        shortcut: "Ctrl+J",
        action: () => setJobPanelOpen(!jobPanelOpen),
      },
      {
        id: "toggle-share-history",
        label: shareHistoryOpen ? "Hide Share History" : "Show Share History",
        icon: "fa-solid fa-clock-rotate-left",
        section: "View",
        action: () => setShareHistoryOpen(!shareHistoryOpen),
      },
      {
        id: "view-table",
        label: "Switch to Table View",
        icon: "fa-solid fa-table-list",
        section: "View",
        action: () => setViewMode("table"),
      },
      {
        id: "view-grid",
        label: "Switch to Grid View",
        icon: "fa-solid fa-grip",
        section: "View",
        action: () => setViewMode("grid"),
      },
      {
        id: "open-settings",
        label: settingsOpen ? "Close Settings" : "Open Settings",
        icon: "fa-solid fa-gear",
        section: "App",
        action: () => setSettingsOpen(!settingsOpen),
      },
      {
        id: "lock-vault",
        label: "Lock Vault",
        icon: "fa-solid fa-lock",
        section: "App",
        action: lock,
      },
      {
        id: "toggle-live-folder-sync",
        label: folderSyncPanelOpen
          ? "Hide Live Folder Sync"
          : "Show Live Folder Sync",
        icon: "fa-solid fa-folder-open",
        section: "Sync",
        action: () => setFolderSyncPanelOpen(!folderSyncPanelOpen),
      },
      {
        id: "choose-sync-type",
        label: "Choose Sync Type",
        icon: "fa-solid fa-code-compare",
        section: "Sync",
        action: openSyncChooser,
      },
    ];

    if (!activeProfileId || !bucket) {
      return baseCommands;
    }

    const objectCommands: CommandItem[] = [
      {
        id: "obj-search",
        label: "Search Objects",
        icon: "fa-solid fa-magnifying-glass",
        section: "Objects",
        shortcut: "Ctrl+F",
        action: () =>
          dispatchObjectToolbarEvent(OBJECT_TOOLBAR_EVENTS.OPEN_SEARCH),
      },
      {
        id: "obj-refresh",
        label: "Refresh Objects",
        icon: "fa-solid fa-arrows-rotate",
        section: "Objects",
        action: () =>
          dispatchObjectToolbarEvent(OBJECT_TOOLBAR_EVENTS.REFRESH_OBJECTS),
      },
      {
        id: "obj-upload-files",
        label: "Upload Files",
        icon: "fa-solid fa-cloud-arrow-up",
        section: "Objects",
        action: () =>
          dispatchObjectToolbarEvent(OBJECT_TOOLBAR_EVENTS.UPLOAD_FILES),
      },
      {
        id: "obj-upload-folder",
        label: "Upload Folder",
        icon: "fa-solid fa-folder-plus",
        section: "Objects",
        action: () =>
          dispatchObjectToolbarEvent(OBJECT_TOOLBAR_EVENTS.UPLOAD_FOLDER),
      },
      {
        id: "obj-new-folder",
        label: "Create Folder",
        icon: "fa-regular fa-folder",
        section: "Objects",
        action: () =>
          dispatchObjectToolbarEvent(OBJECT_TOOLBAR_EVENTS.NEW_FOLDER),
      },
      {
        id: "obj-sync",
        label: "Open Sync (Default)",
        icon: "fa-solid fa-rotate",
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
          icon: "fa-solid fa-cloud-arrow-down",
          section: "Objects",
          action: () =>
            dispatchObjectToolbarEvent(
              OBJECT_TOOLBAR_EVENTS.DOWNLOAD_SELECTION,
            ),
        },
        {
          id: "obj-transfer-selection",
          label: `Transfer Selected (${selectedCount})`,
          icon: "fa-solid fa-arrow-right-arrow-left",
          section: "Objects",
          action: () =>
            dispatchObjectToolbarEvent(OBJECT_TOOLBAR_EVENTS.OPEN_TRANSFER),
        },
        {
          id: "obj-delete-selection",
          label: `Delete Selected (${selectedCount})`,
          icon: "fa-regular fa-trash-can",
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
        icon: "fa-solid fa-share-nodes",
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

  const filtered = useMemo(() => {
    if (!query.trim()) return commands;
    const q = query.toLowerCase();
    return commands.filter(
      (cmd) =>
        cmd.label.toLowerCase().includes(q) ||
        cmd.section.toLowerCase().includes(q),
    );
  }, [commands, query]);

  // Reset selection when filter changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: only reset on length change
  useEffect(() => {
    setSelectedIndex(0);
  }, [filtered.length]);

  const execute = useCallback((cmd: CommandItem) => {
    setOpen(false);
    setQuery("");
    cmd.action();
  }, []);

  // Keyboard handler
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (filtered[selectedIndex]) execute(filtered[selectedIndex]);
          break;
        case "Escape":
          e.preventDefault();
          setOpen(false);
          setQuery("");
          break;
      }
    },
    [filtered, selectedIndex, execute],
  );

  // Scroll selected item into view
  // biome-ignore lint/correctness/useExhaustiveDependencies: only scroll when selection changes
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector("[data-selected='true']");
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  // Global shortcut to open
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
        setQuery("");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Group filtered commands by section
  const sections = new Map<string, CommandItem[]>();
  for (const cmd of filtered) {
    const list = sections.get(cmd.section) ?? [];
    list.push(cmd);
    sections.set(cmd.section, list);
  }

  let flatIndex = 0;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.button
            type="button"
            className="fixed inset-0 z-50 cursor-default bg-black/40"
            onClick={() => {
              setOpen(false);
              setQuery("");
            }}
            aria-label="Close command palette"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={transitions.fast}
          />

          {/* Palette */}
          <motion.div
            className="fixed top-[15%] left-1/2 z-50 w-full max-w-md -translate-x-1/2"
            variants={scaleVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={transitions.spring}
          >
            <div className="overflow-hidden rounded-xl border border-base-300 bg-base-100 shadow-2xl">
              {/* Search input */}
              <div className="flex items-center gap-2 border-base-300 border-b px-4 py-3">
                <i className="fa-solid fa-magnifying-glass text-base-content/40 text-sm" />
                <input
                  ref={inputRef}
                  type="text"
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-base-content/30"
                  placeholder="Type a command…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  // biome-ignore lint/a11y/noAutofocus: command palette must auto-focus
                  autoFocus
                />
                <kbd className="kbd kbd-xs text-base-content/30">Esc</kbd>
              </div>

              {/* Command list */}
              <div ref={listRef} className="max-h-72 overflow-y-auto py-2">
                {filtered.length === 0 ? (
                  <div className="px-4 py-6 text-center text-base-content/40 text-sm">
                    No matching commands
                  </div>
                ) : (
                  Array.from(sections.entries()).map(([section, cmds]) => (
                    <div key={section}>
                      <div className="px-4 py-1.5 font-semibold text-[11px] text-base-content/30 uppercase tracking-wider">
                        {section}
                      </div>
                      {cmds.map((cmd) => {
                        const idx = flatIndex++;
                        const isSelected = idx === selectedIndex;
                        return (
                          <button
                            key={cmd.id}
                            type="button"
                            data-selected={isSelected}
                            className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors ${
                              isSelected
                                ? "bg-primary/10 text-primary"
                                : "text-base-content hover:bg-base-200"
                            }`}
                            onClick={() => execute(cmd)}
                            onMouseEnter={() => setSelectedIndex(idx)}
                          >
                            <i className={`${cmd.icon} w-4 text-center`} />
                            <span className="flex-1">{cmd.label}</span>
                            {cmd.shortcut && (
                              <kbd className="kbd kbd-xs text-base-content/30">
                                {cmd.shortcut}
                              </kbd>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>

              {/* Footer hint */}
              <div className="flex items-center justify-between border-base-300 border-t px-4 py-2 text-[11px] text-base-content/30">
                <span>
                  <kbd className="kbd kbd-xs">↑↓</kbd> navigate
                  <span className="mx-2">·</span>
                  <kbd className="kbd kbd-xs">↵</kbd> select
                </span>
                {activeProfile && bucket && (
                  <span>
                    {activeProfile.name} / {bucket}
                  </span>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

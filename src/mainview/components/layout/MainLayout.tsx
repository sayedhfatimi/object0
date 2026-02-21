import { AnimatePresence, motion } from "framer-motion";
import { lazy, type ReactNode, Suspense } from "react";
import { transitions } from "../../lib/animations";
import { useTabStore } from "../../stores/useTabStore";
import { useUIStore } from "../../stores/useUIStore";
import { ResizeHandle } from "../common/ResizeHandle";
import { DetailPanel } from "../objects/DetailPanel";
import { ContentArea } from "./ContentArea";
import { Sidebar } from "./Sidebar";
import { StatusBar } from "./StatusBar";
import { TabBar } from "./TabBar";
import { TopBar } from "./TopBar";

const JobPanel = lazy(() =>
  import("../jobs/JobPanel").then((module) => ({ default: module.JobPanel })),
);
const SettingsPanel = lazy(() =>
  import("../settings/SettingsPanel").then((module) => ({
    default: module.SettingsPanel,
  })),
);
const ShareHistory = lazy(() =>
  import("../share/ShareHistory").then((module) => ({
    default: module.ShareHistory,
  })),
);
const FolderSyncPanel = lazy(() =>
  import("../sync/FolderSyncPanel").then((module) => ({
    default: module.FolderSyncPanel,
  })),
);
const SyncDialog = lazy(() =>
  import("../sync/SyncDialog").then((module) => ({
    default: module.SyncDialog,
  })),
);
const SyncTypeChooserDialog = lazy(() =>
  import("../sync/SyncTypeChooserDialog").then((module) => ({
    default: module.SyncTypeChooserDialog,
  })),
);
const TransferDialog = lazy(() =>
  import("../transfer/TransferDialog").then((module) => ({
    default: module.TransferDialog,
  })),
);
const ShareDialog = lazy(() =>
  import("../share/ShareDialog").then((module) => ({
    default: module.ShareDialog,
  })),
);
const CommandPalette = lazy(() =>
  import("../common/CommandPalette").then((module) => ({
    default: module.CommandPalette,
  })),
);

interface RightRailPanelProps {
  open: boolean;
  panelKey: string;
  ariaLabel: string;
  width: number;
  children: ReactNode;
}

function RightRailPanel({
  open,
  panelKey,
  ariaLabel,
  width,
  children,
}: RightRailPanelProps) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          key={panelKey}
          className="relative flex h-full shrink-0 overflow-hidden border-base-300 border-l bg-base-100"
          initial={{ width: 0 }}
          animate={{ width }}
          exit={{ width: 0 }}
          transition={transitions.normal}
          style={{ willChange: "width" }}
        >
          <motion.aside
            aria-label={ariaLabel}
            className="h-full shrink-0"
            style={{ width }}
            initial={{ x: 14, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 10, opacity: 0 }}
            transition={transitions.fast}
          >
            {children}
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function MainLayout() {
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);
  const jobPanelOpen = useUIStore((s) => s.jobPanelOpen);
  const detailKey = useUIStore((s) => s.detailKey);
  const shareHistoryOpen = useUIStore((s) => s.shareHistoryOpen);
  const setShareHistoryOpen = useUIStore((s) => s.setShareHistoryOpen);
  const settingsOpen = useUIStore((s) => s.settingsOpen);
  const setSettingsOpen = useUIStore((s) => s.setSettingsOpen);
  const folderSyncPanelOpen = useUIStore((s) => s.folderSyncPanelOpen);
  const setFolderSyncPanelOpen = useUIStore((s) => s.setFolderSyncPanelOpen);
  const hasTabs = useTabStore((s) => s.tabs.length > 0);
  const sidebarWidth = useUIStore((s) => s.sidebarWidth);
  const setSidebarWidth = useUIStore((s) => s.setSidebarWidth);
  const detailPanelWidth = useUIStore((s) => s.detailPanelWidth);
  const setDetailPanelWidth = useUIStore((s) => s.setDetailPanelWidth);

  return (
    <div className="flex h-screen flex-col bg-base-100 text-base-content">
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <nav aria-label="Sidebar" className="relative flex h-full shrink-0">
          <Sidebar collapsed={sidebarCollapsed} width={sidebarWidth} />
          {/* Toggle pinned to right edge */}
          <button
            type="button"
            className="absolute top-2 -right-4 z-20 flex h-8 w-8 items-center justify-center rounded-full border border-base-300 bg-base-100 text-base-content/60 shadow-sm transition-colors hover:bg-primary/10 hover:text-primary"
            onClick={() => useUIStore.getState().toggleSidebar()}
            title={
              sidebarCollapsed
                ? "Expand Sidebar (Ctrl+B)"
                : "Collapse Sidebar (Ctrl+B)"
            }
            aria-label={
              sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"
            }
          >
            <i
              className={`fa-solid ${sidebarCollapsed ? "fa-chevron-right" : "fa-chevron-left"} text-[11px]`}
            />
          </button>
        </nav>
        {!sidebarCollapsed && (
          <ResizeHandle
            side="right"
            width={sidebarWidth}
            minWidth={180}
            maxWidth={400}
            onResize={setSidebarWidth}
          />
        )}

        {/* Main content area */}
        <main className="flex flex-1 flex-col overflow-hidden">
          <TopBar />
          <AnimatePresence>
            {hasTabs && <TabBar key="tabbar" />}
          </AnimatePresence>
          <div className="flex flex-1 overflow-hidden">
            <ContentArea />
            <AnimatePresence>
              {detailKey && (
                <motion.div
                  key="detail-panel"
                  className="flex shrink-0"
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: detailPanelWidth, opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={transitions.spring}
                >
                  <ResizeHandle
                    side="left"
                    width={detailPanelWidth}
                    minWidth={240}
                    maxWidth={500}
                    onResize={setDetailPanelWidth}
                  />
                  <aside
                    aria-label="Object details"
                    style={{ width: detailPanelWidth }}
                    className="shrink-0"
                  >
                    <DetailPanel />
                  </aside>
                </motion.div>
              )}
            </AnimatePresence>
            <RightRailPanel
              open={shareHistoryOpen}
              panelKey="share-history"
              ariaLabel="Share history"
              width={288}
            >
              <Suspense fallback={null}>
                <ShareHistory onClose={() => setShareHistoryOpen(false)} />
              </Suspense>
            </RightRailPanel>
            <RightRailPanel
              open={settingsOpen}
              panelKey="settings"
              ariaLabel="Settings"
              width={288}
            >
              <Suspense fallback={null}>
                <SettingsPanel onClose={() => setSettingsOpen(false)} />
              </Suspense>
            </RightRailPanel>
            <RightRailPanel
              open={folderSyncPanelOpen}
              panelKey="folder-sync"
              ariaLabel="Live Folder Sync"
              width={320}
            >
              <Suspense fallback={null}>
                <FolderSyncPanel
                  onClose={() => setFolderSyncPanelOpen(false)}
                />
              </Suspense>
            </RightRailPanel>
          </div>
          <AnimatePresence>
            {jobPanelOpen && (
              <Suspense fallback={null}>
                <JobPanel key="job-panel" />
              </Suspense>
            )}
          </AnimatePresence>
        </main>
      </div>

      <footer>
        <StatusBar />
      </footer>
      <Suspense fallback={null}>
        <SyncDialog />
      </Suspense>
      <Suspense fallback={null}>
        <SyncTypeChooserDialog />
      </Suspense>
      <Suspense fallback={null}>
        <TransferDialog />
      </Suspense>
      <Suspense fallback={null}>
        <ShareDialog />
      </Suspense>
      <Suspense fallback={null}>
        <CommandPalette />
      </Suspense>
    </div>
  );
}

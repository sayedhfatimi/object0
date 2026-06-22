import { lazy, Suspense } from "react";
import { useTabStore } from "../../stores/useTabStore";
import { useUIStore } from "../../stores/useUIStore";
import { ResizeHandle } from "../common/ResizeHandle";
import { DetailPanel } from "../objects/DetailPanel";
import { SidebarInset, SidebarProvider } from "../ui/sidebar";
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

export function MainLayout() {
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const jobPanelOpen = useUIStore((s) => s.jobPanelOpen);
  const shareHistoryOpen = useUIStore((s) => s.shareHistoryOpen);
  const settingsOpen = useUIStore((s) => s.settingsOpen);
  const folderSyncPanelOpen = useUIStore((s) => s.folderSyncPanelOpen);
  const hasTabs = useTabStore((s) => s.tabs.length > 0);
  const sidebarWidth = useUIStore((s) => s.sidebarWidth);
  const setSidebarWidth = useUIStore((s) => s.setSidebarWidth);

  return (
    // SidebarProvider is the outermost wrapper; controlled open state wired
    // to useUIStore so Ctrl+B (toggleSidebar) and the trigger both work.
    // --sidebar-width is passed via style to preserve the resizable width.
    <SidebarProvider
      open={!sidebarCollapsed}
      onOpenChange={() => toggleSidebar()}
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`,
          "--sidebar-width-icon": "3rem",
        } as React.CSSProperties
      }
      className="h-screen flex-col"
    >
      <div className="flex flex-1 overflow-hidden">
        {/* Shadcn Sidebar primitive — collapse wired to useUIStore */}
        <Sidebar />

        {/* ResizeHandle for drag-to-resize sidebar (when expanded) */}
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
        <SidebarInset className="flex flex-col overflow-hidden">
          <TopBar />
          {hasTabs && <TabBar />}
          <div className="flex flex-1 overflow-hidden">
            <ContentArea />
          </div>
        </SidebarInset>
      </div>

      <footer>
        <StatusBar />
      </footer>

      {/* DetailPanel self-manages as a Sheet (open={!!detailKey}) */}
      <DetailPanel />

      {/* Right-side panel Sheets — each self-manages open state via useUIStore */}
      {jobPanelOpen && (
        <Suspense fallback={null}>
          <JobPanel />
        </Suspense>
      )}
      {settingsOpen && (
        <Suspense fallback={null}>
          <SettingsPanel />
        </Suspense>
      )}
      {shareHistoryOpen && (
        <Suspense fallback={null}>
          <ShareHistory />
        </Suspense>
      )}
      {folderSyncPanelOpen && (
        <Suspense fallback={null}>
          <FolderSyncPanel />
        </Suspense>
      )}

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
    </SidebarProvider>
  );
}

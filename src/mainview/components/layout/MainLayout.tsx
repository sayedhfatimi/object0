import { lazy, Suspense } from "react";
import { useTabStore } from "../../stores/useTabStore";
import { useUIStore } from "../../stores/useUIStore";
import { DetailPanel } from "../objects/DetailPanel";
import { SidebarInset, SidebarProvider } from "../ui/sidebar";
import { ContentArea } from "./ContentArea";
import { Sidebar } from "./Sidebar";
import { StatusBar } from "./StatusBar";
import { TabBar } from "./TabBar";
import { TopBar } from "./TopBar";

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
const ObjectSearchDialog = lazy(() =>
  import("../objects/ObjectSearchDialog").then((module) => ({
    default: module.ObjectSearchDialog,
  })),
);

export function MainLayout() {
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const shareHistoryOpen = useUIStore((s) => s.shareHistoryOpen);
  const settingsOpen = useUIStore((s) => s.settingsOpen);
  const folderSyncPanelOpen = useUIStore((s) => s.folderSyncPanelOpen);
  const hasTabs = useTabStore((s) => s.tabs.length > 0);

  return (
    // SidebarProvider is the outermost wrapper; controlled open state wired
    // to useUIStore so Ctrl+B (toggleSidebar) and the trigger both work.
    <SidebarProvider
      open={!sidebarCollapsed}
      onOpenChange={() => toggleSidebar()}
      style={
        {
          "--sidebar-width": "16rem",
          "--sidebar-width-icon": "3rem",
        } as React.CSSProperties
      }
      className="h-screen flex-col"
    >
      <div className="flex flex-1 overflow-hidden">
        {/* Shadcn Sidebar primitive — collapse wired to useUIStore */}
        <Sidebar />

        {/* Main content area */}
        <SidebarInset className="flex flex-col overflow-hidden">
          <TopBar />
          {hasTabs && <TabBar />}
          <div className="flex flex-1 overflow-hidden">
            <ContentArea />
          </div>
          {/* Status bar lives inside the content column so it doesn't render
              under the fixed sidebar and aligns with the sidebar footer. */}
          <StatusBar />
        </SidebarInset>
      </div>

      {/* DetailPanel self-manages as a Sheet (open={!!detailKey}) */}
      <DetailPanel />

      {/* Right-side panel Sheets — each self-manages open state via useUIStore */}
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
      <Suspense fallback={null}>
        <ObjectSearchDialog />
      </Suspense>
    </SidebarProvider>
  );
}

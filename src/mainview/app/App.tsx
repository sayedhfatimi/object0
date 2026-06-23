import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ErrorBoundary } from "../components/common/ErrorBoundary";
import { ParticleBackground } from "../components/common/ParticleBackground";
import { Toast } from "../components/common/Toast";
import { MainLayout } from "../components/layout/MainLayout";
import { ResizeBorders } from "../components/layout/ResizeBorders";
import { WindowChrome } from "../components/layout/WindowChrome";
import { ChangePassphraseDialog } from "../components/vault/ChangePassphraseDialog";
import { RecoveryFlow } from "../components/vault/RecoveryFlow";
import { RecoveryKeyDisplay } from "../components/vault/RecoveryKeyDisplay";
import { SetupScreen } from "../components/vault/SetupScreen";
import { UnlockScreen } from "../components/vault/UnlockScreen";
import { useJobProgress } from "../hooks/useJobProgress";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import {
  dispatchObjectToolbarEvent,
  OBJECT_TOOLBAR_EVENTS,
} from "../lib/object-toolbar-events";
import { rpcCall } from "../lib/rpc-client";
import { useFavoritesStore } from "../stores/useFavoritesStore";
import { useFolderSyncStore } from "../stores/useFolderSyncStore";
import { useShareHistoryStore } from "../stores/useShareHistoryStore";
import { useThemeStore } from "../stores/useThemeStore";
import { useUIStore } from "../stores/useUIStore";
import { useVaultStore } from "../stores/useVaultStore";
import { ThemeProvider } from "./ThemeProvider";

export default function App() {
  const {
    exists,
    unlocked,
    loading,
    checkStatus,
    needsPassphraseChange,
    pendingRecoveryKey,
    clearPendingRecoveryKey,
  } = useVaultStore();

  const [showRecovery, setShowRecovery] = useState(false);

  useJobProgress();

  useEffect(() => {
    checkStatus();
    useFavoritesStore.getState().init();
    useFolderSyncStore.getState().init();
    if (!useUIStore.getState().persistShareHistory) {
      useShareHistoryStore.getState().clearAll();
    }
    const concurrency = useUIStore.getState().jobConcurrency;
    if (concurrency) {
      rpcCall("jobs:set-concurrency", { concurrency });
    }
    // Resolve the host OS once, app-wide, so the window decorations (custom
    // controls on Windows/Linux, native on macOS) work on every screen —
    // including the lock/loading screens that have no TopBar.
    rpcCall("system:platform", undefined).then(({ os }) =>
      useUIStore.getState().setPlatform(os),
    );
  }, [checkStatus]);

  useEffect(() => {
    if (unlocked) {
      useFolderSyncStore.getState().loadRules();
      rpcCall("folder-sync:start-all", undefined).catch(() => {});
    }
  }, [unlocked]);

  useEffect(() => {
    if (unlocked || !exists) {
      setShowRecovery(false);
    }
  }, [unlocked, exists]);

  // Suppress the webview's native context menu (reload / back / forward /
  // inspect element) so right-clicking feels like a native app. Editable
  // fields keep their menu so cut/copy/paste still works, and the app's own
  // right-click menus (file rows, profiles) open via their own handlers.
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, [contenteditable="true"]')) return;
      e.preventDefault();
    };
    document.addEventListener("contextmenu", handleContextMenu);
    return () => document.removeEventListener("contextmenu", handleContextMenu);
  }, []);

  const toggleTheme = useThemeStore((s) => s.toggle);
  const setJobPanelOpen = useUIStore((s) => s.setJobPanelOpen);
  const jobPanelOpen = useUIStore((s) => s.jobPanelOpen);
  const setSettingsOpen = useUIStore((s) => s.setSettingsOpen);
  const settingsOpen = useUIStore((s) => s.settingsOpen);

  // NOTE: "ctrl+b" is intentionally absent — SidebarProvider (sidebar.tsx)
  // already registers its own Ctrl/Cmd+B listener. Adding a second handler
  // here would fire toggleSidebar twice, resulting in a net no-change.
  const shortcuts = useMemo(
    () => ({
      "ctrl+j": () => setJobPanelOpen(!jobPanelOpen),
      "ctrl+\\": () => toggleTheme(),
      "ctrl+,": () => setSettingsOpen(!settingsOpen),
      "ctrl+f": () =>
        dispatchObjectToolbarEvent(OBJECT_TOOLBAR_EVENTS.OPEN_SEARCH),
    }),
    [toggleTheme, setJobPanelOpen, jobPanelOpen, setSettingsOpen, settingsOpen],
  );
  useKeyboardShortcuts(shortcuts);

  const screenKey = loading
    ? "loading"
    : !exists
      ? "setup"
      : !unlocked && showRecovery
        ? "recovery"
        : !unlocked
          ? "unlock"
          : needsPassphraseChange
            ? "change-passphrase"
            : "main";

  const handleRecoveryKeyDismissed = useCallback(() => {
    clearPendingRecoveryKey();
  }, [clearPendingRecoveryKey]);

  return (
    <ThemeProvider>
      <ParticleBackground />
      <Toast />
      <ErrorBoundary>
        <div className="relative z-10 h-screen">
          {screenKey === "loading" && (
            <div className="flex h-screen items-center justify-center">
              <Loader2 className="size-8 animate-spin text-primary" />
            </div>
          )}
          {screenKey === "setup" && <SetupScreen />}
          {screenKey === "unlock" && (
            <UnlockScreen onForgotPassphrase={() => setShowRecovery(true)} />
          )}
          {screenKey === "recovery" && (
            <RecoveryFlow onBack={() => setShowRecovery(false)} />
          )}
          {screenKey === "change-passphrase" && (
            <ChangePassphraseDialog onComplete={() => {}} />
          )}
          {screenKey === "main" && <MainLayout />}

          {/* Window decorations. The main screen's TopBar carries its own
              controls; every other screen gets this lightweight title bar so
              the window stays draggable/closable on Windows & Linux. */}
          {screenKey !== "main" && <WindowChrome />}
        </div>

        {/* Linux-only invisible resize grips — global so resizing works on the
            lock/loading screens too, not just the main view. */}
        <ResizeBorders />

        {pendingRecoveryKey && (
          <RecoveryKeyDisplay
            recoveryKey={pendingRecoveryKey}
            onDone={handleRecoveryKeyDismissed}
          />
        )}
      </ErrorBoundary>
    </ThemeProvider>
  );
}

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ErrorBoundary } from "../components/common/ErrorBoundary";
import { Toast } from "../components/common/Toast";
import { MainLayout } from "../components/layout/MainLayout";
import { ChangePassphraseDialog } from "../components/vault/ChangePassphraseDialog";
import { RecoveryFlow } from "../components/vault/RecoveryFlow";
import { RecoveryKeyDisplay } from "../components/vault/RecoveryKeyDisplay";
import { SetupScreen } from "../components/vault/SetupScreen";
import { UnlockScreen } from "../components/vault/UnlockScreen";
import { useJobProgress } from "../hooks/useJobProgress";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { transitions } from "../lib/animations";
import {
  dispatchObjectToolbarEvent,
  OBJECT_TOOLBAR_EVENTS,
} from "../lib/object-toolbar-events";
import { rpcCall } from "../lib/rpc-client";
import { useFavoritesStore } from "../stores/useFavoritesStore";
import { useFolderSyncStore } from "../stores/useFolderSyncStore";
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

  // Subscribe to job events
  useJobProgress();

  // Check vault status on mount
  useEffect(() => {
    checkStatus();
    useFavoritesStore.getState().init();
    useFolderSyncStore.getState().init();

    // Sync persisted concurrency setting to backend
    const concurrency = useUIStore.getState().jobConcurrency;
    if (concurrency) {
      rpcCall("jobs:set-concurrency", { concurrency });
    }
  }, [checkStatus]);

  // Start folder sync when vault is unlocked
  useEffect(() => {
    if (unlocked) {
      useFolderSyncStore.getState().loadRules();
      rpcCall("folder-sync:start-all", undefined).catch(() => {
        // Best-effort start
      });
    }
  }, [unlocked]);

  // Keep recovery flow explicit; don't persist it across successful unlocks
  useEffect(() => {
    if (unlocked || !exists) {
      setShowRecovery(false);
    }
  }, [unlocked, exists]);

  // Global keyboard shortcuts
  const toggleTheme = useThemeStore((s) => s.toggle);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const setJobPanelOpen = useUIStore((s) => s.setJobPanelOpen);
  const jobPanelOpen = useUIStore((s) => s.jobPanelOpen);
  const setSettingsOpen = useUIStore((s) => s.setSettingsOpen);
  const settingsOpen = useUIStore((s) => s.settingsOpen);

  const shortcuts = useMemo(
    () => ({
      "ctrl+b": () => toggleSidebar(),
      "ctrl+j": () => setJobPanelOpen(!jobPanelOpen),
      "ctrl+\\": () => toggleTheme(),
      "ctrl+,": () => setSettingsOpen(!settingsOpen),
      "ctrl+f": () =>
        dispatchObjectToolbarEvent(OBJECT_TOOLBAR_EVENTS.OPEN_SEARCH),
    }),
    [
      toggleSidebar,
      toggleTheme,
      setJobPanelOpen,
      jobPanelOpen,
      setSettingsOpen,
      settingsOpen,
    ],
  );
  useKeyboardShortcuts(shortcuts);

  // Determine which screen to show
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
      <Toast />
      <ErrorBoundary>
        <AnimatePresence mode="wait">
          {screenKey === "loading" && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={transitions.fast}
              className="flex h-screen items-center justify-center bg-base-100"
            >
              <span className="loading loading-spinner loading-lg text-primary" />
            </motion.div>
          )}
          {screenKey === "setup" && (
            <motion.div
              key="setup"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={transitions.fast}
            >
              <SetupScreen />
            </motion.div>
          )}
          {screenKey === "unlock" && (
            <motion.div
              key="unlock"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={transitions.fast}
            >
              <UnlockScreen onForgotPassphrase={() => setShowRecovery(true)} />
            </motion.div>
          )}
          {screenKey === "recovery" && (
            <motion.div
              key="recovery"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={transitions.fast}
            >
              <RecoveryFlow onBack={() => setShowRecovery(false)} />
            </motion.div>
          )}
          {screenKey === "change-passphrase" && (
            <motion.div
              key="change-passphrase"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={transitions.fast}
            >
              <ChangePassphraseDialog onComplete={() => {}} />
            </motion.div>
          )}
          {screenKey === "main" && (
            <motion.div
              key="main"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={transitions.normal}
              className="h-screen"
            >
              <MainLayout />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Recovery key overlay — shown after setup or passphrase change */}
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

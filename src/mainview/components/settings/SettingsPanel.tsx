import { useEffect, useState } from "react";
import { CONCURRENCY_OPTIONS, PAGE_SIZES } from "../../lib/constants";
import { rpcCall } from "../../lib/rpc-client";
import { useShareHistoryStore } from "../../stores/useShareHistoryStore";
import { useThemeStore } from "../../stores/useThemeStore";
import { useUIStore } from "../../stores/useUIStore";

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const viewMode = useUIStore((s) => s.viewMode);
  const setViewMode = useUIStore((s) => s.setViewMode);
  const pageSize = useUIStore((s) => s.pageSize);
  const setPageSize = useUIStore((s) => s.setPageSize);
  const desktopNotifications = useUIStore((s) => s.desktopNotifications);
  const setDesktopNotifications = useUIStore((s) => s.setDesktopNotifications);
  const persistShareHistory = useUIStore((s) => s.persistShareHistory);
  const setPersistShareHistory = useUIStore((s) => s.setPersistShareHistory);
  const jobConcurrency = useUIStore((s) => s.jobConcurrency);
  const setJobConcurrency = useUIStore((s) => s.setJobConcurrency);
  const clearShareHistory = useShareHistoryStore((s) => s.clearAll);
  const [hasStoredPassphrase, setHasStoredPassphrase] = useState<
    boolean | null
  >(null);
  const [keychainAvailable, setKeychainAvailable] = useState<boolean | null>(
    null,
  );
  const [keychainBusy, setKeychainBusy] = useState(false);
  const [keychainMessage, setKeychainMessage] = useState<string | null>(null);
  const [keychainError, setKeychainError] = useState<string | null>(null);
  const keychainStatusText =
    keychainAvailable === false
      ? "OS keychain unavailable"
      : hasStoredPassphrase === null
        ? "Checking OS keychain..."
        : hasStoredPassphrase
          ? "Saved in OS keychain"
          : "Not saved in OS keychain";
  const keychainBadge = keychainBusy
    ? { label: "Working", className: "badge-info" }
    : keychainAvailable === false
      ? { label: "Unavailable", className: "badge-error" }
      : hasStoredPassphrase === null
        ? { label: "Checking", className: "badge-ghost" }
        : hasStoredPassphrase
          ? { label: "Stored", className: "badge-success" }
          : { label: "Not Stored", className: "badge-ghost" };

  useEffect(() => {
    let mounted = true;
    const loadKeychainStatus = async () => {
      try {
        const result = await rpcCall("vault:keychain-status", undefined);
        if (mounted) {
          setHasStoredPassphrase(result.hasStoredPassphrase);
          setKeychainAvailable(result.available ?? true);
          setKeychainError(result.error || null);
        }
      } catch {
        if (mounted) {
          setHasStoredPassphrase(false);
          setKeychainAvailable(false);
          setKeychainError("Unable to read OS keychain status");
        }
      }
    };

    loadKeychainStatus();
    return () => {
      mounted = false;
    };
  }, []);

  const handleForgetStoredPassphrase = async () => {
    try {
      setKeychainBusy(true);
      setKeychainError(null);
      setKeychainMessage(null);
      const result = await rpcCall("vault:keychain-clear", undefined);
      const status = await rpcCall("vault:keychain-status", undefined);
      setHasStoredPassphrase(status.hasStoredPassphrase);
      setKeychainAvailable(status.available ?? true);
      setKeychainError(status.error || null);

      if (result.success) {
        setKeychainMessage(
          result.hadStoredPassphrase
            ? "Stored passphrase removed from OS keychain"
            : "No stored passphrase found in OS keychain",
        );
      } else {
        setKeychainError("Failed to clear OS keychain entry");
      }
    } catch {
      setKeychainError("Failed to clear OS keychain entry");
    } finally {
      setKeychainBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-base-300 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <i className="fa-solid fa-gear text-base-content/60" />
          <h3 className="font-semibold text-sm">Settings</h3>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-xs"
          onClick={onClose}
        >
          <i className="fa-solid fa-xmark" />
        </button>
      </div>

      {/* Settings body */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex flex-col gap-6">
          {/* Appearance */}
          <section>
            <h4 className="mb-3 font-semibold text-base-content/50 text-xs uppercase tracking-wider">
              Appearance
            </h4>
            <div className="flex flex-col gap-3">
              <label className="flex items-center justify-between">
                <span className="text-sm">Theme</span>
                <select
                  className="select select-bordered select-xs w-32"
                  value={theme}
                  onChange={(e) =>
                    setTheme(e.target.value as "dark-dim" | "light-nord")
                  }
                >
                  <option value="dark-dim">Dark</option>
                  <option value="light-nord">Light</option>
                </select>
              </label>
              <label className="flex items-center justify-between">
                <span className="text-sm">Default View</span>
                <select
                  className="select select-bordered select-xs w-32"
                  value={viewMode}
                  onChange={(e) =>
                    setViewMode(e.target.value as "table" | "grid")
                  }
                >
                  <option value="table">Table</option>
                  <option value="grid">Grid</option>
                </select>
              </label>
            </div>
          </section>

          {/* Browsing */}
          <section>
            <h4 className="mb-3 font-semibold text-base-content/50 text-xs uppercase tracking-wider">
              Browsing
            </h4>
            <div className="flex flex-col gap-3">
              <label className="flex items-center justify-between">
                <div>
                  <span className="text-sm">Page Size</span>
                  <p className="text-[10px] text-base-content/40">
                    Objects loaded per page
                  </p>
                </div>
                <select
                  className="select select-bordered select-xs w-32"
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                >
                  {PAGE_SIZES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          {/* Notifications */}
          <section>
            <h4 className="mb-3 font-semibold text-base-content/50 text-xs uppercase tracking-wider">
              Notifications
            </h4>
            <div className="flex flex-col gap-3">
              <label className="flex cursor-pointer items-center justify-between">
                <div>
                  <span className="text-sm">Desktop Notifications</span>
                  <p className="text-[10px] text-base-content/40">
                    Notify when jobs complete
                  </p>
                </div>
                <input
                  type="checkbox"
                  className="toggle toggle-primary toggle-sm"
                  checked={desktopNotifications}
                  onChange={(e) => setDesktopNotifications(e.target.checked)}
                />
              </label>
            </div>
          </section>

          {/* Privacy */}
          <section>
            <h4 className="mb-3 font-semibold text-base-content/50 text-xs uppercase tracking-wider">
              Privacy
            </h4>
            <div className="flex flex-col gap-3">
              <label className="flex cursor-pointer items-center justify-between">
                <div>
                  <span className="text-sm">Persist Share History</span>
                  <p className="text-[10px] text-base-content/40">
                    Save generated share URLs locally between app restarts
                  </p>
                </div>
                <input
                  type="checkbox"
                  className="toggle toggle-primary toggle-sm"
                  checked={persistShareHistory}
                  onChange={(e) => {
                    const enabled = e.target.checked;
                    setPersistShareHistory(enabled);
                    if (!enabled) {
                      clearShareHistory();
                    }
                  }}
                />
              </label>
            </div>
          </section>

          {/* Transfers */}
          <section>
            <h4 className="mb-3 font-semibold text-base-content/50 text-xs uppercase tracking-wider">
              Transfers
            </h4>
            <div className="flex flex-col gap-3">
              <label className="flex items-center justify-between">
                <div>
                  <span className="text-sm">Concurrent Jobs</span>
                  <p className="text-[10px] text-base-content/40">
                    Max parallel transfers (default 3)
                  </p>
                </div>
                <select
                  className="select select-bordered select-xs w-32"
                  value={jobConcurrency}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    setJobConcurrency(n);
                    rpcCall("jobs:set-concurrency", { concurrency: n });
                  }}
                >
                  {CONCURRENCY_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          {/* Vault */}
          <section>
            <h4 className="mb-3 font-semibold text-base-content/50 text-xs uppercase tracking-wider">
              Vault
            </h4>
            <div className="flex flex-col gap-3">
              <div className="space-y-2 rounded-md border border-base-300/70 bg-base-200/35 p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-sm">Stored Passphrase</span>
                    <p className="text-[10px] text-base-content/40">
                      {keychainStatusText}
                    </p>
                  </div>
                  <span className={`badge badge-xs ${keychainBadge.className}`}>
                    {keychainBadge.label}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="btn btn-outline btn-xs w-full"
                    disabled={
                      keychainBusy ||
                      keychainAvailable === false ||
                      hasStoredPassphrase === null ||
                      !hasStoredPassphrase
                    }
                    onClick={handleForgetStoredPassphrase}
                  >
                    {keychainBusy ? (
                      <span className="loading loading-spinner loading-xs" />
                    ) : (
                      <>
                        <i className="fa-regular fa-trash-can" />
                        Forget Stored Passphrase
                      </>
                    )}
                  </button>
                </div>
                <p className="text-[10px] text-base-content/35">
                  Removes the saved passphrase from your OS keychain.
                </p>

                {keychainMessage && (
                  <p className="text-[10px] text-success">{keychainMessage}</p>
                )}
                {keychainError && (
                  <p className="text-[10px] text-error">{keychainError}</p>
                )}
              </div>
            </div>
          </section>

          {/* Keyboard Shortcuts */}
          <section>
            <h4 className="mb-3 font-semibold text-base-content/50 text-xs uppercase tracking-wider">
              Keyboard Shortcuts
            </h4>
            <div className="flex flex-col gap-1.5 text-sm">
              <ShortcutRow combo="Ctrl+K" label="Command Palette" />
              <ShortcutRow combo="Ctrl+B" label="Toggle Sidebar" />
              <ShortcutRow combo="Ctrl+J" label="Toggle Job Panel" />
              <ShortcutRow combo="Ctrl+\\" label="Toggle Theme" />
              <ShortcutRow combo="Ctrl+," label="Open Settings" />
              <ShortcutRow combo="↑ / ↓" label="Navigate rows" />
              <ShortcutRow combo="Space" label="Toggle selection" />
              <ShortcutRow combo="Enter" label="Open folder" />
              <ShortcutRow combo="F2" label="Rename file" />
              <ShortcutRow combo="Ctrl+A" label="Select all" />
              <ShortcutRow combo="Esc" label="Clear selection" />
              <ShortcutRow combo="Backspace" label="Go back" />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function ShortcutRow({ combo, label }: { combo: string; label: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-base-content/60">{label}</span>
      <kbd className="kbd kbd-xs">{combo}</kbd>
    </div>
  );
}

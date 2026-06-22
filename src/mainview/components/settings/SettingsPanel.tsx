import { useEffect, useState } from "react";
import { CONCURRENCY_OPTIONS, PAGE_SIZES } from "../../lib/constants";
import { rpcCall } from "../../lib/rpc-client";
import { useShareHistoryStore } from "../../stores/useShareHistoryStore";
import { useThemeStore } from "../../stores/useThemeStore";
import { useUIStore } from "../../stores/useUIStore";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { IconGear, IconSpinner, IconTrashCan } from "@/lib/icons";

export function SettingsPanel() {
  const settingsOpen = useUIStore((s) => s.settingsOpen);
  const setSettingsOpen = useUIStore((s) => s.setSettingsOpen);
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
    ? { label: "Working" }
    : keychainAvailable === false
      ? { label: "Unavailable" }
      : hasStoredPassphrase === null
        ? { label: "Checking" }
        : hasStoredPassphrase
          ? { label: "Stored" }
          : { label: "Not Stored" };

  const keychainBadgeClass = keychainBusy
    ? "bg-info/15 text-info"
    : keychainAvailable === false
      ? "bg-destructive/15 text-destructive"
      : hasStoredPassphrase === null
        ? "bg-muted text-foreground/55"
        : hasStoredPassphrase
          ? "bg-success/15 text-success"
          : "bg-muted text-foreground/55";

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
    <Sheet
      open={settingsOpen}
      onOpenChange={(o) => {
        if (!o) setSettingsOpen(false);
      }}
    >
      <SheetContent
        side="right"
        showCloseButton
        className="flex w-[360px] flex-col gap-0 p-0 sm:max-w-none"
      >
        <SheetHeader className="border-border border-b px-4 py-3">
          <SheetTitle className="flex items-center gap-2 font-semibold text-sm">
            <IconGear className="size-4 text-foreground/60" />
            Settings
          </SheetTitle>
        </SheetHeader>

        {/* Settings body */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="flex flex-col gap-6">
            {/* Appearance */}
            <section>
              <h4 className="mb-3 font-semibold text-foreground/50 text-xs uppercase tracking-wider">
                Appearance
              </h4>
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Theme</span>
                  <Select
                    value={theme}
                    onValueChange={(v) => {
                      if (v != null) setTheme(v as "dark" | "light");
                    }}
                  >
                    <SelectTrigger size="sm" className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dark">Dark</SelectItem>
                      <SelectItem value="light">Light</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Default View</span>
                  <Select
                    value={viewMode}
                    onValueChange={(v) => {
                      if (v != null) setViewMode(v as "table" | "grid");
                    }}
                  >
                    <SelectTrigger size="sm" className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="table">Table</SelectItem>
                      <SelectItem value="grid">Grid</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </section>

            {/* Browsing */}
            <section>
              <h4 className="mb-3 font-semibold text-foreground/50 text-xs uppercase tracking-wider">
                Browsing
              </h4>
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm">Page Size</span>
                    <p className="text-[10px] text-foreground/40">
                      Objects loaded per page
                    </p>
                  </div>
                  <Select
                    value={String(pageSize)}
                    onValueChange={(v) => {
                      if (v != null) setPageSize(Number(v));
                    }}
                  >
                    <SelectTrigger size="sm" className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAGE_SIZES.map((s) => (
                        <SelectItem key={s} value={String(s)}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </section>

            {/* Notifications */}
            <section>
              <h4 className="mb-3 font-semibold text-foreground/50 text-xs uppercase tracking-wider">
                Notifications
              </h4>
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm">Desktop Notifications</span>
                    <p className="text-[10px] text-foreground/40">
                      Notify when jobs complete
                    </p>
                  </div>
                  <Switch
                    checked={desktopNotifications}
                    onCheckedChange={setDesktopNotifications}
                  />
                </div>
              </div>
            </section>

            {/* Privacy */}
            <section>
              <h4 className="mb-3 font-semibold text-foreground/50 text-xs uppercase tracking-wider">
                Privacy
              </h4>
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm">Persist Share History</span>
                    <p className="text-[10px] text-foreground/40">
                      Save generated share URLs locally between app restarts
                    </p>
                  </div>
                  <Switch
                    checked={persistShareHistory}
                    onCheckedChange={(enabled) => {
                      setPersistShareHistory(enabled);
                      if (!enabled) clearShareHistory();
                    }}
                  />
                </div>
              </div>
            </section>

            {/* Transfers */}
            <section>
              <h4 className="mb-3 font-semibold text-foreground/50 text-xs uppercase tracking-wider">
                Transfers
              </h4>
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm">Concurrent Jobs</span>
                    <p className="text-[10px] text-foreground/40">
                      Max parallel transfers (default 3)
                    </p>
                  </div>
                  <Select
                    value={String(jobConcurrency)}
                    onValueChange={(v) => {
                      if (v == null) return;
                      const n = Number(v);
                      setJobConcurrency(n);
                      rpcCall("jobs:set-concurrency", { concurrency: n });
                    }}
                  >
                    <SelectTrigger size="sm" className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CONCURRENCY_OPTIONS.map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </section>

            {/* Vault */}
            <section>
              <h4 className="mb-3 font-semibold text-foreground/50 text-xs uppercase tracking-wider">
                Vault
              </h4>
              <div className="flex flex-col gap-3">
                <div className="space-y-2 rounded-md border border-border/70 bg-card/35 p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-sm">Stored Passphrase</span>
                      <p className="text-[10px] text-foreground/40">
                        {keychainStatusText}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-1.5 py-px text-[9px] ${keychainBadgeClass}`}
                    >
                      {keychainBadge.label}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="xs"
                      className="w-full"
                      disabled={
                        keychainBusy ||
                        keychainAvailable === false ||
                        hasStoredPassphrase === null ||
                        !hasStoredPassphrase
                      }
                      onClick={handleForgetStoredPassphrase}
                    >
                      {keychainBusy ? (
                        <IconSpinner className="size-3.5 animate-spin" />
                      ) : (
                        <>
                          <IconTrashCan className="size-3.5" />
                          Forget Stored Passphrase
                        </>
                      )}
                    </Button>
                  </div>
                  <p className="text-[10px] text-foreground/35">
                    Removes the saved passphrase from your OS keychain.
                  </p>

                  {keychainMessage && (
                    <p className="text-[10px] text-success">
                      {keychainMessage}
                    </p>
                  )}
                  {keychainError && (
                    <p className="text-[10px] text-destructive">
                      {keychainError}
                    </p>
                  )}
                </div>
              </div>
            </section>

            {/* Keyboard Shortcuts */}
            <section>
              <h4 className="mb-3 font-semibold text-foreground/50 text-xs uppercase tracking-wider">
                Keyboard Shortcuts
              </h4>
              <div className="flex flex-col gap-1.5 text-sm">
                <ShortcutRow combo="Ctrl+K" label="Command Palette" />
                <ShortcutRow combo="Ctrl+B" label="Toggle Sidebar" />
                <ShortcutRow combo="Ctrl+J" label="Toggle Job Panel" />
                <ShortcutRow combo="Ctrl+\" label="Toggle Theme" />
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
      </SheetContent>
    </Sheet>
  );
}

function ShortcutRow({ combo, label }: { combo: string; label: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-foreground/60">{label}</span>
      <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground/70">
        {combo}
      </kbd>
    </div>
  );
}

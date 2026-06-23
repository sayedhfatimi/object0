import { useEffect, useState } from "react";
import { rpcCall } from "@/lib/rpc-client";

// Tracks whether the vault passphrase is stored in the OS keychain, exposes
// display-ready status text/badge, and a handler to forget the stored entry.
export function useKeychainStatus() {
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

  const forgetStoredPassphrase = async () => {
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

  return {
    hasStoredPassphrase,
    keychainAvailable,
    keychainBusy,
    keychainMessage,
    keychainError,
    keychainStatusText,
    keychainBadge,
    keychainBadgeClass,
    forgetStoredPassphrase,
  };
}

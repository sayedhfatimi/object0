import { create } from "zustand";
import type { ProfileInfo } from "../../shared/profile.types";
import type { KeychainUnlockFailureReason } from "../../shared/rpc-schema";
import { rpcCall } from "../lib/rpc-client";

interface VaultState {
  exists: boolean;
  unlocked: boolean;
  profiles: ProfileInfo[];
  loading: boolean;
  error: string | null;
  hasRecoveryKey: boolean;
  /** Set after setup or change-passphrase — shown once, then cleared */
  pendingRecoveryKey: string | null;
  /** True when vault was unlocked via recovery (needs new passphrase) */
  needsPassphraseChange: boolean;

  checkStatus: () => Promise<void>;
  setup: (passphrase: string, remember?: boolean) => Promise<boolean>;
  unlock: (passphrase: string, remember?: boolean) => Promise<boolean>;
  unlockWithKeychain: () => Promise<boolean>;
  lock: () => Promise<void>;
  refreshProfiles: () => Promise<void>;
  recoverViaKey: (recoveryKey: string) => Promise<boolean>;
  changePassphrase: (
    newPassphrase: string,
    remember?: boolean,
  ) => Promise<boolean>;
  resetVault: () => Promise<boolean>;
  clearPendingRecoveryKey: () => void;
  clearError: () => void;
}

function formatKeychainUnlockError(
  reason?: KeychainUnlockFailureReason,
  detail?: string,
): string {
  const suffix = detail ? `: ${detail}` : "";
  switch (reason) {
    case "vault_missing":
      return "Vault not found";
    case "no_stored_passphrase":
      return "No passphrase found in OS keychain";
    case "stale_stored_passphrase":
      return "Stored passphrase is outdated. Unlock manually and save again.";
    case "keychain_unavailable":
      return `OS keychain is unavailable on this device${suffix}`;
    default:
      return "Failed to unlock with OS keychain";
  }
}

export const useVaultStore = create<VaultState>()((set, _get) => ({
  exists: false,
  unlocked: false,
  profiles: [],
  loading: true,
  error: null,
  hasRecoveryKey: false,
  pendingRecoveryKey: null,
  needsPassphraseChange: false,

  checkStatus: async () => {
    try {
      set({ loading: true, error: null });
      const status = await rpcCall("vault:status", undefined);

      if (status.exists && !status.unlocked) {
        // Attempt auto-unlock from OS keychain
        const result = await rpcCall("vault:auto-unlock", undefined);
        if (result.success) {
          set({
            exists: true,
            unlocked: true,
            profiles: result.profiles,
            hasRecoveryKey: result.hasRecoveryKey,
            loading: false,
          });
          return;
        }
      }

      if (status.exists && status.unlocked) {
        // Vault already unlocked (e.g. reopened from tray) — load profiles
        const profiles = await rpcCall("profile:list", undefined);
        set({
          exists: true,
          unlocked: true,
          profiles,
          hasRecoveryKey: status.hasRecoveryKey,
          loading: false,
        });
        return;
      }

      set({
        exists: status.exists,
        unlocked: status.unlocked,
        hasRecoveryKey: status.hasRecoveryKey,
        loading: false,
      });
    } catch (err: unknown) {
      set({
        error: err instanceof Error ? err.message : "Unknown error",
        loading: false,
      });
    }
  },

  setup: async (passphrase, remember) => {
    try {
      set({ loading: true, error: null });
      const result = await rpcCall("vault:setup", { passphrase, remember });
      if (result.success) {
        set({
          exists: true,
          unlocked: true,
          profiles: [],
          hasRecoveryKey: true,
          pendingRecoveryKey: result.recoveryKey ?? null,
          loading: false,
        });
      }
      return result.success;
    } catch (err: unknown) {
      set({
        error: err instanceof Error ? err.message : "Unknown error",
        loading: false,
      });
      return false;
    }
  },

  unlock: async (passphrase, remember) => {
    try {
      set({ loading: true, error: null });
      const result = await rpcCall("vault:unlock", { passphrase, remember });
      if (result.success) {
        set({
          unlocked: true,
          profiles: result.profiles,
          hasRecoveryKey: result.hasRecoveryKey,
          loading: false,
        });
      } else {
        set({ error: "Incorrect passphrase", loading: false });
      }
      return result.success;
    } catch (err: unknown) {
      set({
        error: err instanceof Error ? err.message : "Unknown error",
        loading: false,
      });
      return false;
    }
  },

  unlockWithKeychain: async () => {
    try {
      set({ loading: true, error: null });
      const result = await rpcCall("vault:unlock-keychain", undefined);
      if (result.success) {
        set({
          unlocked: true,
          profiles: result.profiles,
          hasRecoveryKey: result.hasRecoveryKey,
          loading: false,
        });
      } else {
        set({
          error: formatKeychainUnlockError(result.reason, result.detail),
          loading: false,
        });
      }
      return result.success;
    } catch (err: unknown) {
      set({
        error: err instanceof Error ? err.message : "Unknown error",
        loading: false,
      });
      return false;
    }
  },

  lock: async () => {
    try {
      await rpcCall("vault:lock", undefined);
      set({
        unlocked: false,
        profiles: [],
        needsPassphraseChange: false,
        pendingRecoveryKey: null,
      });
    } catch (err: unknown) {
      set({ error: err instanceof Error ? err.message : "Unknown error" });
    }
  },

  refreshProfiles: async () => {
    try {
      const profiles = await rpcCall("profile:list", undefined);
      set({ profiles });
    } catch (err: unknown) {
      set({ error: err instanceof Error ? err.message : "Unknown error" });
    }
  },

  recoverViaKey: async (recoveryKey) => {
    try {
      set({ loading: true, error: null });
      const result = await rpcCall("vault:recover-key", { recoveryKey });
      if (result.success) {
        set({
          unlocked: true,
          profiles: result.profiles,
          needsPassphraseChange: true,
          loading: false,
        });
      } else {
        set({ error: "Invalid recovery key", loading: false });
      }
      return result.success;
    } catch (err: unknown) {
      set({
        error: err instanceof Error ? err.message : "Unknown error",
        loading: false,
      });
      return false;
    }
  },

  changePassphrase: async (newPassphrase, remember) => {
    try {
      set({ loading: true, error: null });
      const result = await rpcCall("vault:change-passphrase", {
        newPassphrase,
        remember,
      });
      if (result.success) {
        set({
          needsPassphraseChange: false,
          pendingRecoveryKey: result.recoveryKey,
          hasRecoveryKey: true,
          loading: false,
        });
      }
      return result.success;
    } catch (err: unknown) {
      set({
        error: err instanceof Error ? err.message : "Unknown error",
        loading: false,
      });
      return false;
    }
  },

  resetVault: async () => {
    try {
      set({ loading: true, error: null });
      const result = await rpcCall("vault:reset", undefined);
      if (result.success) {
        set({
          exists: false,
          unlocked: false,
          profiles: [],
          hasRecoveryKey: false,
          needsPassphraseChange: false,
          pendingRecoveryKey: null,
          loading: false,
        });
      }
      return result.success;
    } catch (err: unknown) {
      set({
        error: err instanceof Error ? err.message : "Unknown error",
        loading: false,
      });
      return false;
    }
  },

  clearPendingRecoveryKey: () => set({ pendingRecoveryKey: null }),
  clearError: () => set({ error: null }),
}));

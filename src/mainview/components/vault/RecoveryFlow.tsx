import type React from "react";
import { useState } from "react";
import { useVaultStore } from "../../stores/useVaultStore";

type RecoveryTab = "recovery-key" | "reset";

interface RecoveryFlowProps {
  onBack: () => void;
}

export function RecoveryFlow({ onBack }: RecoveryFlowProps) {
  const [tab, setTab] = useState<RecoveryTab>("recovery-key");
  const [recoveryKey, setRecoveryKey] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const {
    recoverViaKey,
    resetVault,
    hasRecoveryKey,
    loading,
    error,
    clearError,
  } = useVaultStore();

  const handleRecoveryKeySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recoveryKey.trim()) return;
    await recoverViaKey(recoveryKey.trim().toUpperCase());
  };

  const handleReset = async () => {
    if (confirmText !== "DELETE") return;
    await resetVault();
  };

  const switchTab = (newTab: RecoveryTab) => {
    setTab(newTab);
    clearError();
  };

  return (
    <div className="flex h-screen items-center justify-center bg-base-100">
      <div className="card w-full max-w-lg bg-base-200 shadow-xl">
        <div className="card-body">
          <div className="mb-4 text-center">
            <img
              src="/logo.png"
              alt="object0"
              className="mx-auto mb-3 h-16 w-16"
            />
            <h1 className="font-bold text-3xl text-primary">object0</h1>
            <p className="mt-2 text-base-content/60 text-sm">Vault Recovery</p>
          </div>

          {/* Tab selector */}
          <div role="tablist" className="tabs tabs-border mb-4">
            <button
              type="button"
              role="tab"
              className={`tab ${tab === "recovery-key" ? "tab-active" : ""}`}
              onClick={() => switchTab("recovery-key")}
            >
              <i className="fa-solid fa-key mr-1.5" />
              Recovery Key
            </button>
            <button
              type="button"
              role="tab"
              className={`tab ${tab === "reset" ? "tab-active" : ""}`}
              onClick={() => switchTab("reset")}
            >
              <i className="fa-solid fa-trash mr-1.5" />
              Reset
            </button>
          </div>

          {/* Tab content */}
          {tab === "recovery-key" && (
            <div className="space-y-4">
              <div className="rounded-lg bg-base-100 p-4">
                <h3 className="mb-2 font-semibold text-sm">
                  <i className="fa-solid fa-key mr-2 text-warning" />
                  Enter Recovery Key
                </h3>
                <p className="text-base-content/60 text-sm">
                  Enter the recovery key you saved when you created your vault.
                  After unlocking, you'll set a new passphrase and can choose to
                  save it in OS keychain.
                </p>
              </div>

              {!hasRecoveryKey && (
                <div className="alert alert-warning text-sm">
                  <i className="fa-solid fa-triangle-exclamation" />
                  <span>
                    This vault does not have a recovery key configured. You may
                    need to reset the vault.
                  </span>
                </div>
              )}

              <form onSubmit={handleRecoveryKeySubmit} className="space-y-4">
                <fieldset className="fieldset">
                  <legend className="fieldset-legend">Recovery Key</legend>
                  <input
                    type="text"
                    className="input w-full font-mono uppercase tracking-wider"
                    placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
                    value={recoveryKey}
                    onChange={(e) => setRecoveryKey(e.target.value)}
                  />
                </fieldset>

                {error && (
                  <div className="alert alert-error text-sm">
                    <span>{error}</span>
                  </div>
                )}

                <button
                  type="submit"
                  className="btn btn-warning w-full"
                  disabled={loading || !recoveryKey.trim()}
                >
                  {loading ? (
                    <span className="loading loading-spinner loading-sm" />
                  ) : (
                    "Recover with Key"
                  )}
                </button>
              </form>
            </div>
          )}

          {tab === "reset" && (
            <div className="space-y-4">
              <div className="rounded-lg border border-error/30 bg-error/10 p-4">
                <h3 className="mb-2 font-semibold text-error text-sm">
                  <i className="fa-solid fa-triangle-exclamation mr-2" />
                  Destructive Action
                </h3>
                <p className="text-sm">
                  This will permanently delete your vault and all stored
                  profiles. Your S3 data is not affected — only the locally
                  stored API keys and connection profiles will be lost.
                </p>
              </div>

              <fieldset className="fieldset">
                <legend className="fieldset-legend">
                  Type DELETE to confirm
                </legend>
                <input
                  type="text"
                  className="input input-error w-full"
                  placeholder="DELETE"
                  value={confirmText}
                  onChange={(e) => {
                    setConfirmText(e.target.value);
                    setConfirmReset(e.target.value === "DELETE");
                  }}
                />
              </fieldset>

              {error && (
                <div className="alert alert-error text-sm">
                  <span>{error}</span>
                </div>
              )}

              <button
                type="button"
                className="btn btn-error w-full"
                disabled={loading || !confirmReset}
                onClick={handleReset}
              >
                {loading ? (
                  <span className="loading loading-spinner loading-sm" />
                ) : (
                  <>
                    <i className="fa-solid fa-trash mr-2" />
                    Delete Vault & Start Over
                  </>
                )}
              </button>
            </div>
          )}

          {/* Back button */}
          <div className="mt-2">
            <button
              type="button"
              className="btn btn-ghost btn-sm w-full"
              onClick={onBack}
            >
              <i className="fa-solid fa-arrow-left mr-2" />
              Back to Unlock
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

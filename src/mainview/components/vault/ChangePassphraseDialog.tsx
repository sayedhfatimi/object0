import type React from "react";
import { useState } from "react";
import { useVaultStore } from "../../stores/useVaultStore";

interface ChangePassphraseDialogProps {
  onComplete: () => void;
}

export function ChangePassphraseDialog({
  onComplete,
}: ChangePassphraseDialogProps) {
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const { changePassphrase, loading } = useVaultStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (passphrase.length < 8) {
      setError("Passphrase must be at least 8 characters");
      return;
    }
    if (passphrase !== confirm) {
      setError("Passphrases do not match");
      return;
    }

    const ok = await changePassphrase(passphrase, remember);
    if (ok) {
      onComplete();
    } else {
      setError("Failed to change passphrase");
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-base-100">
      <div className="card w-full max-w-md bg-base-200 shadow-xl">
        <div className="card-body">
          <div className="mb-4 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-success/20">
              <i className="fa-solid fa-lock-open text-2xl text-success" />
            </div>
            <h2 className="font-bold text-lg">Vault Recovered</h2>
            <p className="mt-1 text-base-content/60 text-sm">
              Set a new passphrase to secure your vault. A new recovery key will
              also be generated.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <fieldset className="fieldset">
              <legend className="fieldset-legend">New Passphrase</legend>
              <input
                type="password"
                className="input w-full"
                placeholder="Enter new passphrase (min 8 characters)"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
              />
            </fieldset>

            <fieldset className="fieldset">
              <legend className="fieldset-legend">Confirm Passphrase</legend>
              <input
                type="password"
                className="input w-full"
                placeholder="Re-enter new passphrase"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </fieldset>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                className="checkbox checkbox-sm checkbox-primary"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              <span className="label text-sm">Remember in OS keychain</span>
            </div>

            {error && (
              <div className="alert alert-error text-sm">
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary w-full"
              disabled={loading || !passphrase || !confirm}
            >
              {loading ? (
                <span className="loading loading-spinner loading-sm" />
              ) : (
                "Set New Passphrase"
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

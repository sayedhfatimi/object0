import type React from "react";
import { useState } from "react";
import { useVaultStore } from "../../stores/useVaultStore";

interface UnlockScreenProps {
  onForgotPassphrase: () => void;
}

export function UnlockScreen({ onForgotPassphrase }: UnlockScreenProps) {
  const [passphrase, setPassphrase] = useState("");
  const [remember, setRemember] = useState(false);
  const { unlock, unlockWithKeychain, loading, error, clearError } =
    useVaultStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passphrase) return;
    await unlock(passphrase, remember);
  };

  const handleKeychainUnlock = async () => {
    await unlockWithKeychain();
  };

  return (
    <div className="flex h-screen items-center justify-center bg-base-100">
      <div className="card w-full max-w-md bg-base-200 shadow-xl">
        <div className="card-body">
          <div className="mb-6 text-center">
            <img
              src="/logo.png"
              alt="object0"
              className="mx-auto mb-3 h-16 w-16"
            />
            <h1 className="font-bold text-3xl text-primary">object0</h1>
            <p className="mt-2 text-base-content/60 text-sm">
              S3 Bucket Manager
            </p>
          </div>

          <h2 className="card-title text-lg">
            <i className="fa-solid fa-lock" /> Vault Locked
          </h2>
          <p className="text-base-content/60 text-sm">
            Unlock with OS keychain or enter your passphrase to access profiles.
          </p>

          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <button
              type="button"
              className="btn btn-outline w-full"
              disabled={loading}
              onClick={handleKeychainUnlock}
            >
              <i className="fa-solid fa-fingerprint mr-2" />
              Unlock with OS Keychain
            </button>

            <div className="divider my-0 text-xs opacity-50">OR</div>

            <fieldset className="fieldset">
              <legend className="fieldset-legend">Passphrase</legend>
              <input
                id="unlock-passphrase"
                type="password"
                className="input w-full"
                placeholder="Enter vault passphrase"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
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
              disabled={loading || !passphrase}
            >
              {loading ? (
                <span className="loading loading-spinner loading-sm" />
              ) : (
                "Unlock"
              )}
            </button>

            <div className="text-center">
              <button
                type="button"
                className="btn btn-ghost btn-sm text-base-content/50 hover:text-base-content"
                onClick={() => {
                  clearError();
                  onForgotPassphrase();
                }}
              >
                <i className="fa-solid fa-circle-question mr-1.5" />
                Forgot passphrase?
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

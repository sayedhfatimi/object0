import type React from "react";
import { useState } from "react";
import { useVaultStore } from "../../stores/useVaultStore";

export function SetupScreen() {
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const setup = useVaultStore((s) => s.setup);
  const loading = useVaultStore((s) => s.loading);

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

    const ok = await setup(passphrase, remember);
    if (!ok) {
      setError("Failed to create vault");
    }
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
            <i className="fa-solid fa-vault" /> Create Vault
          </h2>
          <p className="text-base-content/60 text-sm">
            Set a passphrase to encrypt your API keys. A recovery key will be
            generated after setup.
          </p>

          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <fieldset className="fieldset">
              <legend className="fieldset-legend">Passphrase</legend>
              <input
                id="setup-passphrase"
                type="password"
                className="input w-full"
                placeholder="Enter passphrase (min 8 characters)"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
              />
            </fieldset>

            <fieldset className="fieldset">
              <legend className="fieldset-legend">Confirm Passphrase</legend>
              <input
                id="setup-confirm"
                type="password"
                className="input w-full"
                placeholder="Re-enter passphrase"
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
                "Create Vault"
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

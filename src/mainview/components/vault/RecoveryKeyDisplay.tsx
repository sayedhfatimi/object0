import { useState } from "react";
import { Modal } from "../common/Modal";

interface RecoveryKeyDisplayProps {
  recoveryKey: string;
  onDone: () => void;
}

export function RecoveryKeyDisplay({
  recoveryKey,
  onDone,
}: RecoveryKeyDisplayProps) {
  const [copied, setCopied] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(recoveryKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob(
      [
        `object0 Vault Recovery Key\n${"=".repeat(30)}\n\n${recoveryKey}\n\nStore this key somewhere safe. You will need it to recover your vault if you forget your passphrase.\nThis key cannot be retrieved later.\n`,
      ],
      { type: "text/plain" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "object0-recovery-key.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Modal
      open={true}
      onClose={() => {}}
      title=""
      actions={
        <button
          type="button"
          className="btn btn-primary w-full"
          disabled={!confirmed}
          onClick={onDone}
        >
          I've saved my recovery key
        </button>
      }
    >
      <div className="space-y-4">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-warning/20">
            <i className="fa-solid fa-key text-2xl text-warning" />
          </div>
          <h3 className="font-bold text-lg">Save Your Recovery Key</h3>
          <p className="mt-1 text-base-content/60 text-sm">
            This key is the only way to recover your vault if you forget your
            passphrase. Store it somewhere safe — it won't be shown again.
          </p>
        </div>

        <div className="rounded-lg border border-base-300 bg-base-100 p-4">
          <code className="block select-all text-center font-mono text-lg tracking-wider">
            {recoveryKey}
          </code>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            className="btn btn-outline btn-sm flex-1"
            onClick={handleCopy}
          >
            <i className={`fa-solid ${copied ? "fa-check" : "fa-copy"} mr-1`} />
            {copied ? "Copied!" : "Copy"}
          </button>
          <button
            type="button"
            className="btn btn-outline btn-sm flex-1"
            onClick={handleDownload}
          >
            <i className="fa-solid fa-download mr-1" />
            Download
          </button>
        </div>

        <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-base-300 p-3">
          <input
            type="checkbox"
            className="checkbox checkbox-sm checkbox-warning"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          <span className="text-sm">
            I've saved this recovery key in a safe place
          </span>
        </label>
      </div>
    </Modal>
  );
}

import { QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useState } from "react";
import type { ShareRes } from "../../../shared/s3.types";
import { rpcCall } from "../../lib/rpc-client";
import { useShareHistoryStore } from "../../stores/useShareHistoryStore";
import { useUIStore } from "../../stores/useUIStore";
import { Modal } from "../common/Modal";
import { toast } from "../common/Toast";

type ExpirationUnit = "minutes" | "hours" | "days";

interface ExpirationPreset {
  label: string;
  seconds: number;
}

const EXPIRATION_PRESETS: ExpirationPreset[] = [
  { label: "1 hour", seconds: 3600 },
  { label: "6 hours", seconds: 21600 },
  { label: "24 hours", seconds: 86400 },
  { label: "7 days", seconds: 604800 },
];

export function ShareDialog() {
  const open = useUIStore((s) => s.shareDialogOpen);
  const target = useUIStore((s) => s.shareTarget);
  const closeDialog = useUIStore((s) => s.closeShareDialog);
  const addHistoryEntry = useShareHistoryStore((s) => s.addEntry);

  const [expirationMode, setExpirationMode] = useState<"preset" | "custom">(
    "preset",
  );
  const [selectedPreset, setSelectedPreset] = useState(0);
  const [customValue, setCustomValue] = useState(1);
  const [customUnit, setCustomUnit] = useState<ExpirationUnit>("hours");
  const [generating, setGenerating] = useState(false);
  const [shareResult, setShareResult] = useState<ShareRes | null>(null);
  const [showQR, setShowQR] = useState(false);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setExpirationMode("preset");
      setSelectedPreset(0);
      setCustomValue(1);
      setCustomUnit("hours");
      setShareResult(null);
      setShowQR(false);
    }
  }, [open]);

  const getExpirationSeconds = useCallback((): number => {
    if (expirationMode === "preset") {
      return EXPIRATION_PRESETS[selectedPreset].seconds;
    }
    const multipliers: Record<ExpirationUnit, number> = {
      minutes: 60,
      hours: 3600,
      days: 86400,
    };
    return customValue * multipliers[customUnit];
  }, [expirationMode, selectedPreset, customValue, customUnit]);

  const handleGenerate = async () => {
    if (!target) return;

    setGenerating(true);
    try {
      const expiresIn = getExpirationSeconds();
      const result = await rpcCall("share:generate", {
        profileId: target.profileId,
        bucket: target.bucket,
        key: target.key,
        expiresIn,
      });

      setShareResult(result);

      // Add to history
      addHistoryEntry({
        profileId: target.profileId,
        bucket: target.bucket,
        key: target.key,
        url: result.url,
        expiresAt: result.expiresAt,
      });

      // Auto-copy to clipboard
      await navigator.clipboard.writeText(result.url);
      toast.success("Link copied to clipboard!");
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Failed to generate share link",
      );
    }
    setGenerating(false);
  };

  const handleCopy = async () => {
    if (!shareResult) return;
    try {
      await navigator.clipboard.writeText(shareResult.url);
      toast.success("Link copied to clipboard!");
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  };

  const formatExpiration = (isoDate: string): string => {
    const date = new Date(isoDate);
    const now = new Date();
    const diff = date.getTime() - now.getTime();

    if (diff < 3600000) {
      const mins = Math.round(diff / 60000);
      return `${mins} minute${mins !== 1 ? "s" : ""}`;
    }
    if (diff < 86400000) {
      const hours = Math.round(diff / 3600000);
      return `${hours} hour${hours !== 1 ? "s" : ""}`;
    }
    const days = Math.round(diff / 86400000);
    return `${days} day${days !== 1 ? "s" : ""}`;
  };

  const fileName = target?.key.split("/").pop() || target?.key || "";

  return (
    <Modal
      open={open}
      onClose={closeDialog}
      title="Share File"
      className="max-w-lg"
      actions={
        <div className="flex gap-2">
          <button type="button" className="btn btn-sm" onClick={closeDialog}>
            Close
          </button>
          {!shareResult && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleGenerate}
              disabled={generating}
            >
              {generating ? (
                <span className="loading loading-spinner loading-xs" />
              ) : (
                <>
                  <i className="fa-solid fa-link mr-1" />
                  Generate Link
                </>
              )}
            </button>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        {/* File info */}
        <div className="rounded bg-base-300 p-3">
          <div className="flex items-center gap-2">
            <i className="fa-solid fa-file text-base-content/60" />
            <span className="truncate font-medium">{fileName}</span>
          </div>
          <div className="mt-1 truncate text-base-content/60 text-xs">
            {target?.bucket}/{target?.key}
          </div>
        </div>

        {!shareResult ? (
          <>
            {/* Expiration mode selector */}
            <div className="flex gap-2">
              <button
                type="button"
                className={`btn btn-sm flex-1 ${expirationMode === "preset" ? "btn-primary" : "btn-outline"}`}
                onClick={() => setExpirationMode("preset")}
              >
                Presets
              </button>
              <button
                type="button"
                className={`btn btn-sm flex-1 ${expirationMode === "custom" ? "btn-primary" : "btn-outline"}`}
                onClick={() => setExpirationMode("custom")}
              >
                Custom
              </button>
            </div>

            {/* Preset options */}
            {expirationMode === "preset" && (
              <div className="grid grid-cols-2 gap-2">
                {EXPIRATION_PRESETS.map((preset, idx) => (
                  <button
                    key={preset.label}
                    type="button"
                    className={`btn btn-sm ${selectedPreset === idx ? "btn-secondary" : "btn-outline"}`}
                    onClick={() => setSelectedPreset(idx)}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            )}

            {/* Custom expiration */}
            {expirationMode === "custom" && (
              <div className="flex gap-2">
                <input
                  type="number"
                  min={1}
                  max={
                    customUnit === "days"
                      ? 7
                      : customUnit === "hours"
                        ? 168
                        : 10080
                  }
                  value={customValue}
                  onChange={(e) =>
                    setCustomValue(
                      Math.max(1, Number.parseInt(e.target.value, 10) || 1),
                    )
                  }
                  className="input input-sm w-24"
                />
                <select
                  value={customUnit}
                  onChange={(e) =>
                    setCustomUnit(e.target.value as ExpirationUnit)
                  }
                  className="select select-sm flex-1"
                >
                  <option value="minutes">Minutes</option>
                  <option value="hours">Hours</option>
                  <option value="days">Days</option>
                </select>
              </div>
            )}

            {/* Max expiration note */}
            <p className="text-base-content/50 text-xs">
              <i className="fa-solid fa-circle-info mr-1" />
              Maximum expiration: 7 days
            </p>
          </>
        ) : (
          <>
            {/* Generated URL */}
            <div className="space-y-2">
              <span className="font-semibold text-base-content/70 text-xs">
                Shareable Link
              </span>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={shareResult.url}
                  className="input input-sm flex-1 font-mono text-xs"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <button
                  type="button"
                  className="btn btn-sm btn-outline"
                  onClick={handleCopy}
                  title="Copy to clipboard"
                >
                  <i className="fa-solid fa-copy" />
                </button>
              </div>
            </div>

            {/* Expiration info */}
            <div className="flex items-center gap-2 text-base-content/70 text-sm">
              <i className="fa-solid fa-clock" />
              <span>Expires in {formatExpiration(shareResult.expiresAt)}</span>
            </div>

            {/* QR Code toggle */}
            <div className="space-y-2">
              <button
                type="button"
                className="btn btn-sm btn-outline w-full"
                onClick={() => setShowQR(!showQR)}
              >
                <i
                  className={`fa-solid ${showQR ? "fa-chevron-up" : "fa-qrcode"} mr-1`}
                />
                {showQR ? "Hide QR Code" : "Show QR Code"}
              </button>

              {showQR && (
                <div className="flex justify-center rounded bg-white p-4">
                  <QRCodeSVG
                    value={shareResult.url}
                    size={200}
                    level="M"
                    includeMargin
                  />
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

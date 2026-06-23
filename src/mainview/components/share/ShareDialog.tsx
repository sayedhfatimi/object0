import { QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  IconChevronDown,
  IconCircleInfo,
  IconClock,
  IconCopy,
  IconFile,
  IconLink,
  IconQrcode,
  IconSpinner,
} from "@/lib/icons";
import type { ShareRes } from "../../../shared/s3.types";
import { rpcCall } from "../../lib/rpc-client";
import { useShareHistoryStore } from "../../stores/useShareHistoryStore";
import { useUIStore } from "../../stores/useUIStore";
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
    <Dialog open={open} onOpenChange={(o) => !o && closeDialog()}>
      <DialogContent showCloseButton={false} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Share File</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* File info */}
          <div className="rounded bg-muted p-3">
            <div className="flex items-center gap-2">
              <IconFile className="size-4 text-foreground/60" />
              <span className="truncate font-medium">{fileName}</span>
            </div>
            <div className="mt-1 truncate text-foreground/60 text-xs">
              {target?.bucket}/{target?.key}
            </div>
          </div>

          {!shareResult ? (
            <>
              {/* Expiration mode selector */}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={expirationMode === "preset" ? "default" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => setExpirationMode("preset")}
                >
                  Presets
                </Button>
                <Button
                  type="button"
                  variant={expirationMode === "custom" ? "default" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => setExpirationMode("custom")}
                >
                  Custom
                </Button>
              </div>

              {/* Preset options */}
              {expirationMode === "preset" && (
                <div className="grid grid-cols-2 gap-2">
                  {EXPIRATION_PRESETS.map((preset, idx) => (
                    <Button
                      key={preset.label}
                      type="button"
                      variant={selectedPreset === idx ? "secondary" : "outline"}
                      size="sm"
                      onClick={() => setSelectedPreset(idx)}
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>
              )}

              {/* Custom expiration */}
              {expirationMode === "custom" && (
                <div className="flex gap-2">
                  <Input
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
                    className="h-7 w-24 text-xs"
                  />
                  <Select
                    value={customUnit}
                    onValueChange={(v) => {
                      if (v != null) setCustomUnit(v as ExpirationUnit);
                    }}
                  >
                    <SelectTrigger size="sm" className="flex-1">
                      <SelectValue>
                        {(value) => {
                          const labels: Record<string, string> = {
                            minutes: "Minutes",
                            hours: "Hours",
                            days: "Days",
                          };
                          return labels[value as string] ?? (value as string);
                        }}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="minutes">Minutes</SelectItem>
                      <SelectItem value="hours">Hours</SelectItem>
                      <SelectItem value="days">Days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Max expiration note */}
              <p className="text-foreground/50 text-xs">
                <IconCircleInfo className="mr-1 inline size-3" />
                Maximum expiration: 7 days
              </p>
            </>
          ) : (
            <>
              {/* Generated URL */}
              <div className="space-y-2">
                <span className="font-semibold text-foreground/70 text-xs">
                  Shareable Link
                </span>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    readOnly
                    value={shareResult.url}
                    className="h-7 flex-1 font-mono text-xs"
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    onClick={handleCopy}
                    title="Copy to clipboard"
                  >
                    <IconCopy className="size-3.5" />
                  </Button>
                </div>
              </div>

              {/* Expiration info */}
              <div className="flex items-center gap-2 text-foreground/70 text-sm">
                <IconClock className="size-4" />
                <span>
                  Expires in {formatExpiration(shareResult.expiresAt)}
                </span>
              </div>

              {/* QR Code toggle */}
              <div className="space-y-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => setShowQR(!showQR)}
                >
                  {showQR ? (
                    <>
                      <IconChevronDown className="size-3.5 mr-1" />
                      Hide QR Code
                    </>
                  ) : (
                    <>
                      <IconQrcode className="size-3.5 mr-1" />
                      Show QR Code
                    </>
                  )}
                </Button>

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

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={closeDialog}>
            Close
          </Button>
          {!shareResult && (
            <Button size="sm" onClick={handleGenerate} disabled={generating}>
              {generating ? (
                <IconSpinner className="size-3.5 animate-spin" />
              ) : (
                <>
                  <IconLink className="size-3.5 mr-1" />
                  Generate Link
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

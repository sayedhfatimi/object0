import type { ShareRes } from "@shared/s3.types";
import type { ExpirationUnit } from "@shared/share.types";
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
import { IconCircleInfo, IconFile, IconLink, IconSpinner } from "@/lib/icons";
import { rpcCall } from "@/lib/rpc-client";
import { useShareHistoryStore, useUIStore } from "@/stores";
import { toast } from "../common/Toast";
import { ShareResult } from "./ShareResult";

interface ExpirationPreset {
  label: string;
  seconds: number;
}

const MINUTE_SECONDS = 60;
const HOUR_SECONDS = 60 * MINUTE_SECONDS;
const DAY_SECONDS = 24 * HOUR_SECONDS;
const MS_PER_MINUTE = MINUTE_SECONDS * 1000;
const MS_PER_HOUR = HOUR_SECONDS * 1000;
const MS_PER_DAY = DAY_SECONDS * 1000;

const EXPIRATION_PRESETS: ExpirationPreset[] = [
  { label: "1 hour", seconds: HOUR_SECONDS },
  { label: "6 hours", seconds: 6 * HOUR_SECONDS },
  { label: "24 hours", seconds: DAY_SECONDS },
  { label: "7 days", seconds: 7 * DAY_SECONDS },
];

const EXPIRATION_UNIT_SECONDS: Record<ExpirationUnit, number> = {
  minutes: MINUTE_SECONDS,
  hours: HOUR_SECONDS,
  days: DAY_SECONDS,
};

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
    return customValue * EXPIRATION_UNIT_SECONDS[customUnit];
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

    if (diff < MS_PER_HOUR) {
      const mins = Math.round(diff / MS_PER_MINUTE);
      return `${mins} minute${mins !== 1 ? "s" : ""}`;
    }
    if (diff < MS_PER_DAY) {
      const hours = Math.round(diff / MS_PER_HOUR);
      return `${hours} hour${hours !== 1 ? "s" : ""}`;
    }
    const days = Math.round(diff / MS_PER_DAY);
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
            <ShareResult
              url={shareResult.url}
              expiresLabel={formatExpiration(shareResult.expiresAt)}
              showQR={showQR}
              onCopy={handleCopy}
              onToggleQR={() => setShowQR(!showQR)}
            />
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

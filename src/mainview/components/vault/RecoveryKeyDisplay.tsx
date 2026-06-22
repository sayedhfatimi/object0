import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { IconKey, IconCheck, IconCopy, IconDownload } from "@/lib/icons";

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
    <Dialog open={true} onOpenChange={() => {}}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="sr-only">Save Your Recovery Key</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-warning/20">
              <IconKey className="size-6 text-warning" />
            </div>
            <h3 className="font-bold text-lg">Save Your Recovery Key</h3>
            <p className="mt-1 text-muted-foreground text-sm">
              This key is the only way to recover your vault if you forget your
              passphrase. Store it somewhere safe — it won't be shown again.
            </p>
          </div>

          <div className="rounded-lg border border-border bg-background p-4">
            <code className="block select-all text-center font-mono text-lg tracking-wider">
              {recoveryKey}
            </code>
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={handleCopy}
            >
              {copied ? (
                <IconCheck className="size-4 mr-1" />
              ) : (
                <IconCopy className="size-4 mr-1" />
              )}
              {copied ? "Copied!" : "Copy"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={handleDownload}
            >
              <IconDownload className="size-4 mr-1" />
              Download
            </Button>
          </div>

          <div className="flex cursor-pointer items-center gap-3 rounded-lg border border-border p-3">
            <Checkbox
              id="recovery-confirmed"
              checked={confirmed}
              onCheckedChange={(v) => setConfirmed(!!v)}
            />
            <Label htmlFor="recovery-confirmed" className="text-sm font-normal cursor-pointer">
              I've saved this recovery key in a safe place
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            className="w-full"
            disabled={!confirmed}
            onClick={onDone}
          >
            I've saved my recovery key
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

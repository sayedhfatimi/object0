import type React from "react";
import { useState } from "react";
import { useVaultStore } from "../../stores/useVaultStore";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { IconLockOpen, IconSpinner } from "@/lib/icons";

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
    <div className="flex h-screen items-center justify-center bg-background/50">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader>
          <div className="mb-4 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-success/20">
              <IconLockOpen className="size-6 text-success" />
            </div>
            <CardTitle>Vault Recovered</CardTitle>
            <CardDescription className="mt-1">
              Set a new passphrase to secure your vault. A new recovery key will
              also be generated.
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cp-passphrase">New Passphrase</Label>
              <Input
                id="cp-passphrase"
                type="password"
                placeholder="Enter new passphrase (min 8 characters)"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cp-confirm">Confirm Passphrase</Label>
              <Input
                id="cp-confirm"
                type="password"
                placeholder="Re-enter new passphrase"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-3">
              <Checkbox
                id="cp-remember"
                checked={remember}
                onCheckedChange={(v) => setRemember(!!v)}
              />
              <Label
                htmlFor="cp-remember"
                className="text-sm font-normal cursor-pointer"
              >
                Remember in OS keychain
              </Label>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button
              type="submit"
              className="w-full"
              disabled={loading || !passphrase || !confirm}
            >
              {loading ? (
                <IconSpinner className="size-4 animate-spin" />
              ) : (
                "Set New Passphrase"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

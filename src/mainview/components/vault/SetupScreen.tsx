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
import { IconVault, IconSpinner } from "@/lib/icons";

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
    <div className="flex h-screen items-center justify-center bg-background/50">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader>
          <div className="mb-4 text-center">
            <img
              src="/logo.png"
              alt="object0"
              className="mx-auto mb-3 h-16 w-16"
            />
            <h1 className="font-bold text-3xl text-primary">object0</h1>
            <p className="mt-2 text-muted-foreground text-sm">
              S3 Bucket Manager
            </p>
          </div>
          <CardTitle className="flex items-center gap-2">
            <IconVault className="size-4" />
            Create Vault
          </CardTitle>
          <CardDescription>
            Set a passphrase to encrypt your API keys. A recovery key will be
            generated after setup.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="setup-passphrase">Passphrase</Label>
              <Input
                id="setup-passphrase"
                type="password"
                placeholder="Enter passphrase (min 8 characters)"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="setup-confirm">Confirm Passphrase</Label>
              <Input
                id="setup-confirm"
                type="password"
                placeholder="Re-enter passphrase"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-3">
              <Checkbox
                id="setup-remember"
                checked={remember}
                onCheckedChange={(v) => setRemember(!!v)}
              />
              <Label
                htmlFor="setup-remember"
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
                "Create Vault"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

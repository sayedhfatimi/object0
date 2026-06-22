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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  IconKey,
  IconTrashCan,
  IconTriangleExclamation,
  IconArrowLeft,
  IconSpinner,
} from "@/lib/icons";

type RecoveryTab = "recovery-key" | "reset";

interface RecoveryFlowProps {
  onBack: () => void;
}

export function RecoveryFlow({ onBack }: RecoveryFlowProps) {
  const [tab, setTab] = useState<RecoveryTab>("recovery-key");
  const [recoveryKey, setRecoveryKey] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const {
    recoverViaKey,
    resetVault,
    hasRecoveryKey,
    loading,
    error,
    clearError,
  } = useVaultStore();

  const handleRecoveryKeySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recoveryKey.trim()) return;
    await recoverViaKey(recoveryKey.trim().toUpperCase());
  };

  const handleReset = async () => {
    if (confirmText !== "DELETE") return;
    await resetVault();
  };

  const switchTab = (newTab: RecoveryTab) => {
    setTab(newTab);
    clearError();
  };

  return (
    <div className="flex h-screen items-center justify-center bg-background/50">
      <Card className="w-full max-w-lg shadow-xl">
        <CardHeader>
          <div className="mb-4 text-center">
            <img
              src="/logo.png"
              alt="object0"
              className="mx-auto mb-3 h-16 w-16"
            />
            <h1 className="font-bold text-3xl text-primary">object0</h1>
            <p className="mt-2 text-muted-foreground text-sm">Vault Recovery</p>
          </div>
          <CardTitle>Recovery</CardTitle>
          <CardDescription>
            Recover your vault using a recovery key or reset it entirely.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Tab selector */}
          <Tabs
            value={tab}
            onValueChange={(v) => switchTab(v as RecoveryTab)}
          >
            <TabsList className="w-full">
              <TabsTrigger value="recovery-key" className="flex-1">
                <IconKey className="size-4 mr-1.5" />
                Recovery Key
              </TabsTrigger>
              <TabsTrigger value="reset" className="flex-1">
                <IconTrashCan className="size-4 mr-1.5" />
                Reset
              </TabsTrigger>
            </TabsList>

            {/* Recovery key tab */}
            <TabsContent value="recovery-key" className="space-y-4 mt-4">
              <div className="rounded-lg bg-muted p-4">
                <h3 className="mb-2 font-semibold text-sm flex items-center gap-2">
                  <IconKey className="size-4 text-warning" />
                  Enter Recovery Key
                </h3>
                <p className="text-muted-foreground text-sm">
                  Enter the recovery key you saved when you created your vault.
                  After unlocking, you'll set a new passphrase and can choose to
                  save it in OS keychain.
                </p>
              </div>

              {!hasRecoveryKey && (
                <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 flex items-start gap-2 text-sm">
                  <IconTriangleExclamation className="size-4 text-warning shrink-0 mt-0.5" />
                  <span>
                    This vault does not have a recovery key configured. You may
                    need to reset the vault.
                  </span>
                </div>
              )}

              <form onSubmit={handleRecoveryKeySubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="recovery-key-input">Recovery Key</Label>
                  <Input
                    id="recovery-key-input"
                    type="text"
                    className="font-mono uppercase tracking-wider"
                    placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
                    value={recoveryKey}
                    onChange={(e) => setRecoveryKey(e.target.value)}
                  />
                </div>

                {error && (
                  <p className="text-sm text-destructive">{error}</p>
                )}

                <Button
                  type="submit"
                  variant="default"
                  className="w-full"
                  disabled={loading || !recoveryKey.trim()}
                >
                  {loading ? (
                    <IconSpinner className="size-4 animate-spin" />
                  ) : (
                    "Recover with Key"
                  )}
                </Button>
              </form>
            </TabsContent>

            {/* Reset tab */}
            <TabsContent value="reset" className="space-y-4 mt-4">
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4">
                <h3 className="mb-2 font-semibold text-destructive text-sm flex items-center gap-2">
                  <IconTriangleExclamation className="size-4" />
                  Destructive Action
                </h3>
                <p className="text-sm">
                  This will permanently delete your vault and all stored
                  profiles. Your S3 data is not affected — only the locally
                  stored API keys and connection profiles will be lost.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-delete">Type DELETE to confirm</Label>
                <Input
                  id="confirm-delete"
                  type="text"
                  className="border-destructive/50 focus-visible:ring-destructive/50"
                  placeholder="DELETE"
                  value={confirmText}
                  onChange={(e) => {
                    setConfirmText(e.target.value);
                    setConfirmReset(e.target.value === "DELETE");
                  }}
                />
              </div>

              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}

              <Button
                type="button"
                variant="destructive"
                className="w-full"
                disabled={loading || !confirmReset}
                onClick={handleReset}
              >
                {loading ? (
                  <IconSpinner className="size-4 animate-spin" />
                ) : (
                  <>
                    <IconTrashCan className="size-4 mr-2" />
                    Delete Vault & Start Over
                  </>
                )}
              </Button>
            </TabsContent>
          </Tabs>

          {/* Back button */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={onBack}
          >
            <IconArrowLeft className="size-4 mr-2" />
            Back to Unlock
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

import { useState } from "react";
import type { ProfileInfo, ProfileInput } from "../../../shared/profile.types";
import {
  PROVIDER_ENDPOINTS,
  PROVIDER_REGIONS,
} from "../../../shared/profile.types";
import { PROVIDERS } from "../../lib/constants";
import { rpcCall } from "../../lib/rpc-client";
import { useVaultStore } from "../../stores/useVaultStore";
import { toast } from "../common/Toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { IconSpinner } from "@/lib/icons";

interface ProfileFormProps {
  onDone: () => void;
  editProfile?: ProfileInfo;
}

type Provider = ProfileInput["provider"];

export function ProfileForm({ onDone, editProfile }: ProfileFormProps) {
  const refreshProfiles = useVaultStore((s) => s.refreshProfiles);
  const isEditing = !!editProfile;

  const [provider, setProvider] = useState<Provider>(
    editProfile?.provider ?? "aws",
  );
  const [name, setName] = useState(editProfile?.name ?? "");
  const [accessKeyId, setAccessKeyId] = useState("");
  const [secretAccessKey, setSecretAccessKey] = useState("");
  const [endpoint, setEndpoint] = useState(editProfile?.endpoint ?? "");
  const [region, setRegion] = useState(
    editProfile?.region ?? PROVIDER_REGIONS[editProfile?.provider ?? "aws"],
  );
  const [defaultBucket, setDefaultBucket] = useState(
    editProfile?.defaultBucket ?? "",
  );
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    msg: string;
  } | null>(null);

  const PROVIDER_HINTS: Record<
    Provider,
    {
      endpoint?: string;
      region?: string;
      accessKey?: string;
      secretKey?: string;
    }
  > = {
    aws: {
      region: "e.g. us-east-1, eu-west-2",
      accessKey: "Starts with AKIA...",
      secretKey: "40-character secret from IAM console",
    },
    r2: {
      endpoint: "Replace <account-id> with your Cloudflare account ID",
      region: "Usually auto — leave as-is or use auto",
      accessKey: "From R2 API Tokens in Cloudflare dashboard",
      secretKey: "From R2 API Tokens in Cloudflare dashboard",
    },
    spaces: {
      endpoint: "Replace <region> with your Space region, e.g. nyc3",
      region: "e.g. nyc3, sfo3, ams3",
      accessKey: "From DigitalOcean API → Spaces Keys",
      secretKey: "From DigitalOcean API → Spaces Keys",
    },
    minio: {
      endpoint: "Default: http://localhost:9000",
      region: "Usually us-east-1 for MinIO",
      accessKey: "MinIO root user or access key",
      secretKey: "MinIO root password or secret key",
    },
    gcs: {
      region: "e.g. us-central1, europe-west1",
      accessKey: "HMAC key from GCS interoperability settings",
      secretKey: "HMAC secret from GCS interoperability settings",
    },
    backblaze: {
      endpoint: "Replace <region> with your bucket region, e.g. us-west-004",
      region: "Must match your bucket region, e.g. us-west-004",
      accessKey: "applicationKeyId from B2 App Keys",
      secretKey: "applicationKey from B2 App Keys",
    },
    custom: {
      endpoint: "Full URL of your S3-compatible endpoint",
      region: "Region required by your provider",
      accessKey: "Access key for your S3-compatible service",
      secretKey: "Secret key for your S3-compatible service",
    },
  };

  const hints = PROVIDER_HINTS[provider];

  const needsEndpoint =
    provider === "r2" ||
    provider === "spaces" ||
    provider === "minio" ||
    provider === "backblaze" ||
    provider === "custom";

  const handleProviderChange = (p: Provider) => {
    setProvider(p);
    setEndpoint(PROVIDER_ENDPOINTS[p] ?? "");
    setRegion(PROVIDER_REGIONS[p]);
    setTestResult(null);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await rpcCall("profile:test", {
        provider,
        endpoint: needsEndpoint ? endpoint : undefined,
        region,
        accessKeyId,
        secretAccessKey,
        defaultBucket: defaultBucket || undefined,
      });
      setTestResult({
        ok: result.success,
        msg: result.success
          ? `Connected! Found ${result.bucketCount} bucket(s)`
          : (result.error ?? "Connection failed"),
      });
    } catch (err: unknown) {
      setTestResult({
        ok: false,
        msg: err instanceof Error ? err.message : "Unknown error",
      });
    }
    setTesting(false);
  };

  const handleSave = async () => {
    const trimmedName = name.trim();
    const trimmedAccessKeyId = accessKeyId.trim();
    const trimmedSecretAccessKey = secretAccessKey.trim();
    const trimmedEndpoint = endpoint.trim();
    const trimmedRegion = region.trim();
    const trimmedDefaultBucket = defaultBucket.trim();

    if (!trimmedName) {
      toast.error("Profile name is required");
      return;
    }

    if (!isEditing && (!trimmedAccessKeyId || !trimmedSecretAccessKey)) {
      toast.error("Access key and secret key are required");
      return;
    }

    if (
      isEditing &&
      Boolean(trimmedAccessKeyId) !== Boolean(trimmedSecretAccessKey)
    ) {
      toast.error(
        "Provide both access key and secret key to rotate credentials",
      );
      return;
    }

    setSaving(true);
    try {
      if (isEditing) {
        await rpcCall("profile:update", {
          id: editProfile.id,
          provider,
          name: trimmedName,
          ...(trimmedAccessKeyId ? { accessKeyId: trimmedAccessKeyId } : {}),
          ...(trimmedSecretAccessKey
            ? { secretAccessKey: trimmedSecretAccessKey }
            : {}),
          endpoint:
            needsEndpoint && trimmedEndpoint ? trimmedEndpoint : undefined,
          region: trimmedRegion,
          defaultBucket: trimmedDefaultBucket || undefined,
        });
        await refreshProfiles();
        toast.success(`Profile "${trimmedName}" updated`);
      } else {
        await rpcCall("profile:add", {
          provider,
          name: trimmedName,
          accessKeyId: trimmedAccessKeyId,
          secretAccessKey: trimmedSecretAccessKey,
          endpoint:
            needsEndpoint && trimmedEndpoint ? trimmedEndpoint : undefined,
          region: trimmedRegion,
          defaultBucket: trimmedDefaultBucket || undefined,
        });
        await refreshProfiles();
        toast.success(`Profile "${trimmedName}" added`);
      }
      onDone();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Unknown error");
    }
    setSaving(false);
  };

  return (
    <div className="space-y-3">
      {/* Provider */}
      <div className="space-y-1.5">
        <Label htmlFor="pf-provider" className="text-xs">Provider</Label>
        <Select
          value={provider}
          onValueChange={(v) => handleProviderChange(v as Provider)}
        >
          <SelectTrigger id="pf-provider" className="h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROVIDERS.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Name */}
      <div className="space-y-1.5">
        <Label htmlFor="pf-name" className="text-xs">Profile Name</Label>
        <Input
          id="pf-name"
          className="h-8 text-sm"
          placeholder="My AWS Account"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <p className="text-xs text-muted-foreground/50">
          A friendly name to identify this connection
        </p>
      </div>

      {/* Access Key */}
      <div className="space-y-1.5">
        <Label htmlFor="pf-access-key" className="text-xs">Access Key ID</Label>
        <Input
          id="pf-access-key"
          className="h-8 text-sm font-mono"
          placeholder={isEditing ? "Enter new key to change" : "AKIA..."}
          value={accessKeyId}
          onChange={(e) => setAccessKeyId(e.target.value)}
        />
        {hints?.accessKey && (
          <p className="text-xs text-muted-foreground/50">{hints.accessKey}</p>
        )}
        {isEditing && (
          <p className="text-xs text-muted-foreground/50">
            Leave blank to keep the current value
          </p>
        )}
      </div>

      {/* Secret Key */}
      <div className="space-y-1.5">
        <Label htmlFor="pf-secret-key" className="text-xs">Secret Access Key</Label>
        <Input
          id="pf-secret-key"
          type="password"
          className="h-8 text-sm font-mono"
          placeholder={isEditing ? "Enter new secret to change" : "••••••••"}
          value={secretAccessKey}
          onChange={(e) => setSecretAccessKey(e.target.value)}
        />
        {hints?.secretKey && (
          <p className="text-xs text-muted-foreground/50">{hints.secretKey}</p>
        )}
        {isEditing && (
          <p className="text-xs text-muted-foreground/50">
            Leave blank to keep the current value
          </p>
        )}
      </div>

      {/* Endpoint (conditional) */}
      {needsEndpoint && (
        <div className="space-y-1.5">
          <Label htmlFor="pf-endpoint" className="text-xs">Endpoint URL</Label>
          <Input
            id="pf-endpoint"
            className="h-8 text-sm font-mono"
            placeholder="https://..."
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
          />
          {hints?.endpoint && (
            <p className="text-xs text-muted-foreground/50">
              {hints.endpoint}
            </p>
          )}
        </div>
      )}

      {/* Region */}
      <div className="space-y-1.5">
        <Label htmlFor="pf-region" className="text-xs">Region</Label>
        <Input
          id="pf-region"
          className="h-8 text-sm"
          placeholder="us-east-1"
          value={region}
          onChange={(e) => setRegion(e.target.value)}
        />
        {hints?.region && (
          <p className="text-xs text-muted-foreground/50">{hints.region}</p>
        )}
      </div>

      {/* Default Bucket (optional — required for bucket-scoped tokens) */}
      <div className="space-y-1.5">
        <Label htmlFor="pf-default-bucket" className="text-xs">
          Default Bucket{" "}
          <span className="font-normal opacity-40">optional</span>
        </Label>
        <Input
          id="pf-default-bucket"
          className="h-8 text-sm"
          placeholder="my-bucket"
          value={defaultBucket}
          onChange={(e) => setDefaultBucket(e.target.value)}
        />
        <p className="text-xs text-muted-foreground/50">
          {provider === "r2"
            ? "Required for R2 tokens scoped to a specific bucket"
            : "Bucket to select by default when using this profile"}
        </p>
      </div>

      {/* Test result */}
      {testResult && (
        <div
          className={`rounded-lg border p-2 text-xs ${
            testResult.ok
              ? "border-success/30 bg-success/10 text-success"
              : "border-destructive/30 bg-destructive/10 text-destructive"
          }`}
        >
          {testResult.msg}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={handleTest}
          disabled={testing || !accessKeyId || !secretAccessKey}
        >
          {testing ? (
            <IconSpinner className="size-3.5 animate-spin" />
          ) : (
            "Test Connection"
          )}
        </Button>
        <Button
          type="button"
          size="sm"
          className="flex-1"
          onClick={handleSave}
          disabled={
            saving ||
            !name.trim() ||
            (!isEditing && (!accessKeyId || !secretAccessKey))
          }
        >
          {saving ? (
            <IconSpinner className="size-3.5 animate-spin" />
          ) : isEditing ? (
            "Update"
          ) : (
            "Save"
          )}
        </Button>
      </div>
    </div>
  );
}

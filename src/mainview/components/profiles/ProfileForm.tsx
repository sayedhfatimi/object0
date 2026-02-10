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
    setSaving(true);
    try {
      if (isEditing) {
        await rpcCall("profile:update", {
          id: editProfile.id,
          provider,
          name,
          accessKeyId,
          secretAccessKey,
          endpoint: needsEndpoint ? endpoint : undefined,
          region,
          defaultBucket: defaultBucket || undefined,
        });
        await refreshProfiles();
        toast.success(`Profile "${name}" updated`);
      } else {
        await rpcCall("profile:add", {
          provider,
          name,
          accessKeyId,
          secretAccessKey,
          endpoint: needsEndpoint ? endpoint : undefined,
          region,
          defaultBucket: defaultBucket || undefined,
        });
        await refreshProfiles();
        toast.success(`Profile "${name}" added`);
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
      <fieldset className="fieldset">
        <legend className="fieldset-legend text-xs">Provider</legend>
        <select
          id="pf-provider"
          className="select select-sm w-full"
          value={provider}
          onChange={(e) => handleProviderChange(e.target.value as Provider)}
        >
          {PROVIDERS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </fieldset>

      {/* Name */}
      <fieldset className="fieldset">
        <legend className="fieldset-legend text-xs">Profile Name</legend>
        <input
          id="pf-name"
          className="input input-sm w-full"
          placeholder="My AWS Account"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <p className="fieldset-label text-xs opacity-50">
          A friendly name to identify this connection
        </p>
      </fieldset>

      {/* Access Key */}
      <fieldset className="fieldset">
        <legend className="fieldset-legend text-xs">Access Key ID</legend>
        <input
          id="pf-access-key"
          className="input input-sm w-full font-mono"
          placeholder={isEditing ? "Enter new key to change" : "AKIA..."}
          value={accessKeyId}
          onChange={(e) => setAccessKeyId(e.target.value)}
        />
        {hints?.accessKey && (
          <p className="fieldset-label text-xs opacity-50">{hints.accessKey}</p>
        )}
      </fieldset>

      {/* Secret Key */}
      <fieldset className="fieldset">
        <legend className="fieldset-legend text-xs">Secret Access Key</legend>
        <input
          id="pf-secret-key"
          type="password"
          className="input input-sm w-full font-mono"
          placeholder={isEditing ? "Enter new secret to change" : "••••••••"}
          value={secretAccessKey}
          onChange={(e) => setSecretAccessKey(e.target.value)}
        />
        {hints?.secretKey && (
          <p className="fieldset-label text-xs opacity-50">{hints.secretKey}</p>
        )}
      </fieldset>

      {/* Endpoint (conditional) */}
      {needsEndpoint && (
        <fieldset className="fieldset">
          <legend className="fieldset-legend text-xs">Endpoint URL</legend>
          <input
            id="pf-endpoint"
            className="input input-sm w-full font-mono"
            placeholder="https://..."
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
          />
          {hints?.endpoint && (
            <p className="fieldset-label text-xs opacity-50">
              {hints.endpoint}
            </p>
          )}
        </fieldset>
      )}

      {/* Region */}
      <fieldset className="fieldset">
        <legend className="fieldset-legend text-xs">Region</legend>
        <input
          id="pf-region"
          className="input input-sm w-full"
          placeholder="us-east-1"
          value={region}
          onChange={(e) => setRegion(e.target.value)}
        />
        {hints?.region && (
          <p className="fieldset-label text-xs opacity-50">{hints.region}</p>
        )}
      </fieldset>

      {/* Default Bucket (optional — required for bucket-scoped tokens) */}
      <fieldset className="fieldset">
        <legend className="fieldset-legend text-xs">
          Default Bucket{" "}
          <span className="font-normal opacity-40">optional</span>
        </legend>
        <input
          id="pf-default-bucket"
          className="input input-sm w-full"
          placeholder="my-bucket"
          value={defaultBucket}
          onChange={(e) => setDefaultBucket(e.target.value)}
        />
        <p className="fieldset-label text-xs opacity-50">
          {provider === "r2"
            ? "Required for R2 tokens scoped to a specific bucket"
            : "Bucket to select by default when using this profile"}
        </p>
      </fieldset>

      {/* Test result */}
      {testResult && (
        <div
          className={`alert text-xs ${
            testResult.ok ? "alert-success" : "alert-error"
          }`}
        >
          <span>{testResult.msg}</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        <button
          type="button"
          className="btn btn-outline btn-sm flex-1"
          onClick={handleTest}
          disabled={testing || !accessKeyId || !secretAccessKey}
        >
          {testing ? (
            <span className="loading loading-spinner loading-xs" />
          ) : (
            "Test Connection"
          )}
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm flex-1"
          onClick={handleSave}
          disabled={
            saving ||
            !name ||
            (!isEditing && (!accessKeyId || !secretAccessKey))
          }
        >
          {saving ? (
            <span className="loading loading-spinner loading-xs" />
          ) : isEditing ? (
            "Update"
          ) : (
            "Save"
          )}
        </button>
      </div>
    </div>
  );
}

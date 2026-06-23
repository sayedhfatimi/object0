import type { ProfileInput } from "@shared/profile.types";

export type Provider = ProfileInput["provider"];

interface ProviderHint {
  endpoint?: string;
  region?: string;
  accessKey?: string;
  secretKey?: string;
}

// Per-provider placeholder/help text shown next to the credential fields.
export const PROVIDER_HINTS: Record<Provider, ProviderHint> = {
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

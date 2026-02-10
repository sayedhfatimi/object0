// ── S3 Provider types ──
export type Provider =
  | "aws"
  | "r2"
  | "spaces"
  | "minio"
  | "gcs"
  | "backblaze"
  | "custom";

export const PROVIDER_LABELS: Record<Provider, string> = {
  aws: "Amazon S3",
  r2: "Cloudflare R2",
  spaces: "DigitalOcean Spaces",
  minio: "MinIO",
  gcs: "Google Cloud Storage",
  backblaze: "Backblaze B2",
  custom: "Custom S3-Compatible",
};

export const PROVIDER_ENDPOINTS: Partial<Record<Provider, string>> = {
  r2: "https://<account-id>.r2.cloudflarestorage.com",
  spaces: "https://<region>.digitaloceanspaces.com",
  minio: "http://localhost:9000",
  gcs: "https://storage.googleapis.com",
  backblaze: "https://s3.<region>.backblazeb2.com",
};

export const PROVIDER_REGIONS: Record<Provider, string> = {
  aws: "us-east-1",
  r2: "auto",
  spaces: "nyc3",
  minio: "us-east-1",
  gcs: "us-central1",
  backblaze: "us-west-004",
  custom: "us-east-1",
};

// ── Full profile (stored encrypted in vault) ──
export interface Profile {
  id: string;
  name: string;
  provider: Provider;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  endpoint?: string;
  region?: string;
  defaultBucket?: string;
  createdAt: string;
  updatedAt: string;
}

// ── Profile info sent to UI (no secrets) ──
export interface ProfileInfo {
  id: string;
  name: string;
  provider: Provider;
  endpoint?: string;
  region?: string;
  defaultBucket?: string;
  createdAt: string;
  updatedAt: string;
}

// ── Profile input for creating/updating ──
export interface ProfileInput {
  name: string;
  provider: Provider;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  endpoint?: string;
  region?: string;
  defaultBucket?: string;
}

// ── Strip secrets from profile for UI ──
export function toProfileInfo(profile: Profile): ProfileInfo {
  return {
    id: profile.id,
    name: profile.name,
    provider: profile.provider,
    endpoint: profile.endpoint,
    region: profile.region,
    defaultBucket: profile.defaultBucket,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}

import type {
  FolderSyncConflictEvent,
  FolderSyncDiff,
  FolderSyncErrorEvent,
  FolderSyncRule,
  FolderSyncRuleInput,
  FolderSyncState,
  FolderSyncStatusEvent,
} from "./folder-sync.types";
import type { JobCompleteEvent, JobInfo, ProgressEvent } from "./job.types";
import type { ProfileInfo, ProfileInput } from "./profile.types";
import type {
  BucketInfo,
  CopyReq,
  CrossTransferReq,
  DownloadArchiveReq,
  DownloadFolderReq,
  DownloadReq,
  MoveReq,
  ObjectListReq,
  ObjectListRes,
  S3StatResult,
  ShareReq,
  ShareRes,
  SyncDiff,
  SyncReq,
  UploadReq,
} from "./s3.types";

type ProfileUpdateReq = Omit<
  ProfileInput,
  "accessKeyId" | "secretAccessKey" | "sessionToken"
> & {
  id: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string | null;
};

export type KeychainUnlockFailureReason =
  | "vault_missing"
  | "no_stored_passphrase"
  | "stale_stored_passphrase"
  | "keychain_unavailable";

// ── RPC Schema: maps method names → request/response types ──
export interface RPCSchema {
  // ── Vault ──
  "vault:status": {
    req: undefined;
    res: { exists: boolean; unlocked: boolean; hasRecoveryKey: boolean };
  };
  "vault:setup": {
    req: { passphrase: string; remember?: boolean };
    res: { success: boolean; recoveryKey?: string };
  };
  "vault:unlock": {
    req: { passphrase: string; remember?: boolean };
    res: { success: boolean; profiles: ProfileInfo[]; hasRecoveryKey: boolean };
  };
  "vault:auto-unlock": {
    req: undefined;
    res: {
      success: boolean;
      profiles: ProfileInfo[];
      hasRecoveryKey: boolean;
      reason?: KeychainUnlockFailureReason;
      detail?: string;
    };
  };
  "vault:unlock-keychain": {
    req: undefined;
    res: {
      success: boolean;
      profiles: ProfileInfo[];
      hasRecoveryKey: boolean;
      reason?: KeychainUnlockFailureReason;
      detail?: string;
    };
  };
  "vault:lock": { req: undefined; res: undefined };
  "vault:keychain-status": {
    req: undefined;
    res: {
      hasStoredPassphrase: boolean;
      available?: boolean;
      error?: string;
    };
  };
  "vault:keychain-clear": {
    req: undefined;
    res: { success: boolean; hadStoredPassphrase: boolean };
  };
  "vault:recover-key": {
    req: { recoveryKey: string };
    res: { success: boolean; profiles: ProfileInfo[] };
  };
  "vault:change-passphrase": {
    req: { newPassphrase: string; remember?: boolean };
    res: { success: boolean; recoveryKey: string };
  };
  "vault:add-recovery-key": {
    req: undefined;
    res: { recoveryKey: string };
  };
  "vault:has-recovery-key": {
    req: undefined;
    res: { hasRecoveryKey: boolean };
  };
  "vault:reset": {
    req: undefined;
    res: { success: boolean };
  };

  // ── Profiles ──
  "profile:list": { req: undefined; res: ProfileInfo[] };
  "profile:add": { req: ProfileInput; res: ProfileInfo };
  "profile:update": {
    req: ProfileUpdateReq;
    res: ProfileInfo;
  };
  "profile:remove": { req: { id: string }; res: undefined };
  "profile:test": {
    req: {
      provider: string;
      endpoint?: string;
      region: string;
      accessKeyId: string;
      secretAccessKey: string;
      defaultBucket?: string;
    };
    res: { success: boolean; bucketCount: number; error?: string };
  };

  // ── Buckets ──
  "buckets:list": { req: { profileId: string }; res: BucketInfo[] };

  // ── Objects ──
  "objects:list": { req: ObjectListReq; res: ObjectListRes };
  "objects:delete": {
    req: { profileId: string; bucket: string; keys: string[] };
    res: undefined;
  };
  "objects:rename": {
    req: {
      profileId: string;
      bucket: string;
      oldKey: string;
      newKey: string;
    };
    res: undefined;
  };
  "objects:stat": {
    req: { profileId: string; bucket: string; key: string };
    res: S3StatResult;
  };

  // ── Transfers ──
  "transfer:upload": { req: UploadReq; res: { jobId: string } };
  "transfer:pick-and-upload": {
    req: { profileId: string; bucket: string; prefix: string };
    res: { jobIds: string[] };
  };
  "transfer:pick-and-upload-folder": {
    req: { profileId: string; bucket: string; prefix: string };
    res: { jobIds: string[] };
  };
  "transfer:download": { req: DownloadReq; res: { jobId: string } };
  "transfer:download-folder": {
    req: DownloadFolderReq;
    res: { jobIds: string[] };
  };
  "transfer:copy": { req: CopyReq; res: { jobId: string } };
  "transfer:move": { req: MoveReq; res: { jobId: string } };
  "transfer:cross-bucket": {
    req: CrossTransferReq;
    res: { jobIds: string[] };
  };
  "transfer:download-archive": {
    req: DownloadArchiveReq;
    res: { jobId: string };
  };

  // ── Sync ──
  "sync:preview": { req: SyncReq; res: SyncDiff };
  "sync:execute": {
    req: SyncReq;
    res: { jobId: string };
  };

  // ── Jobs ──
  "jobs:list": { req: undefined; res: JobInfo[] };
  "jobs:cancel": { req: { jobId: string }; res: undefined };
  "jobs:clear": { req: undefined; res: undefined };
  "jobs:get-concurrency": { req: undefined; res: { concurrency: number } };
  "jobs:set-concurrency": {
    req: { concurrency: number };
    res: { concurrency: number };
  };

  // ── Favorites ──
  "favorites:load": { req: undefined; res: string[] };
  "favorites:save": { req: { favorites: string[] }; res: undefined };

  // ── Share ──
  "share:generate": { req: ShareReq; res: ShareRes };

  // ── Folder Sync ──
  "folder-sync:list-rules": { req: undefined; res: FolderSyncRule[] };
  "folder-sync:add-rule": { req: FolderSyncRuleInput; res: FolderSyncRule };
  "folder-sync:update-rule": {
    req: FolderSyncRuleInput & { id: string };
    res: FolderSyncRule;
  };
  "folder-sync:remove-rule": { req: { id: string }; res: undefined };
  "folder-sync:toggle-rule": {
    req: { id: string; enabled: boolean };
    res: FolderSyncRule;
  };
  "folder-sync:sync-now": { req: { id: string }; res: undefined };
  "folder-sync:get-status": {
    req: undefined;
    res: FolderSyncState[];
  };
  "folder-sync:preview": {
    req: { id: string };
    res: FolderSyncDiff;
  };
  "folder-sync:pick-folder": { req: undefined; res: { path: string | null } };
  "folder-sync:start-all": { req: undefined; res: undefined };
  "folder-sync:stop-all": { req: undefined; res: undefined };
  "folder-sync:pause-all": { req: undefined; res: undefined };
  "folder-sync:resume-all": { req: undefined; res: undefined };

  // ── Updater ──
  "updater:check": {
    req: undefined;
    res: {
      version: string;
      hash: string;
      updateAvailable: boolean;
      updateReady: boolean;
      error: string;
    };
  };
  "updater:download": { req: undefined; res: { success: boolean } };
  "updater:apply": { req: undefined; res: undefined };
  "updater:local-info": {
    req: undefined;
    res: {
      version: string;
      hash: string;
      baseUrl: string;
      channel: string;
      name: string;
      identifier: string;
    };
  };
}

// ── Event types (Bun → Webview push) ──
export interface RPCEvents {
  "job:progress": ProgressEvent;
  "job:complete": JobCompleteEvent;
  "update:available": {
    version: string;
    updateAvailable: boolean;
    updateReady: boolean;
  };
  "folder-sync:status": FolderSyncStatusEvent;
  "folder-sync:conflict": FolderSyncConflictEvent;
  "folder-sync:error": FolderSyncErrorEvent;
}

// ── RPC message envelope ──
export interface RPCRequest<M extends keyof RPCSchema = keyof RPCSchema> {
  id: string;
  method: M;
  payload: RPCSchema[M]["req"];
}

export interface RPCResponse<M extends keyof RPCSchema = keyof RPCSchema> {
  id: string;
  method: M;
  result?: RPCSchema[M]["res"];
  error?: string;
}

export interface RPCEventMessage<E extends keyof RPCEvents = keyof RPCEvents> {
  event: E;
  data: RPCEvents[E];
}

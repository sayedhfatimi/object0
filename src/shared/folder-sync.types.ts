// ── Folder Sync Types ──
// Bidirectional local ↔ S3 sync (like Google Drive / rclone bisync)

export type SyncDirection =
  | "bidirectional"
  | "local-to-remote"
  | "remote-to-local";

export type ConflictResolution =
  | "newer-wins"
  | "local-wins"
  | "remote-wins"
  | "keep-both";

export type FolderSyncRuleStatus =
  | "idle"
  | "syncing"
  | "watching"
  | "error"
  | "paused";

// ── Persisted sync rule ──
export interface FolderSyncRule {
  id: string;
  profileId: string;
  bucket: string;
  bucketPrefix: string; // e.g. "" or "photos/"
  localPath: string; // e.g. "/home/user/MyBucket"
  direction: SyncDirection;
  enabled: boolean;
  conflictResolution: ConflictResolution;
  pollIntervalMs: number; // default 30000 (30s)
  excludePatterns: string[]; // e.g. [".DS_Store", "thumbs.db", ".git/**"]
  lastSyncAt?: string; // ISO timestamp
  lastSyncStatus?: "success" | "error" | "partial";
  lastSyncError?: string;
  createdAt: string;
}

// ── Per-rule runtime state (not persisted) ──
export interface FolderSyncState {
  ruleId: string;
  status: FolderSyncRuleStatus;
  filesWatching: number;
  lastChange?: string;
  currentFile?: string;
  progress?: {
    completed: number;
    total: number;
    bytesTransferred: number;
    bytesTotal: number;
  };
}

// ── Per-file tracking record (persisted per rule) ──
export interface FolderSyncFileRecord {
  relativePath: string;
  localMtime: number; // ms epoch
  localSize: number;
  remoteEtag: string;
  remoteLastModified: string; // ISO
  remoteSize: number;
  syncedAt: string; // ISO — when this file was last synced
}

// ── Diff actions produced by the three-way differ ──
export type FolderSyncAction =
  | "upload"
  | "download"
  | "delete-local"
  | "delete-remote"
  | "conflict";

export interface FolderSyncDiffEntry {
  relativePath: string;
  action: FolderSyncAction;
  reason: string;
  localSize?: number;
  localMtime?: number;
  remoteSize?: number;
  remoteLastModified?: string;
  remoteEtag?: string;
}

export interface FolderSyncDiff {
  uploads: FolderSyncDiffEntry[];
  downloads: FolderSyncDiffEntry[];
  deleteLocal: FolderSyncDiffEntry[];
  deleteRemote: FolderSyncDiffEntry[];
  conflicts: FolderSyncDiffEntry[];
  unchanged: number;
}

// ── RPC request/response types ──
export interface FolderSyncRuleInput {
  profileId: string;
  bucket: string;
  bucketPrefix: string;
  localPath: string;
  direction: SyncDirection;
  conflictResolution: ConflictResolution;
  pollIntervalMs?: number;
  excludePatterns?: string[];
}

export interface FolderSyncConflict {
  ruleId: string;
  relativePath: string;
  localSize: number;
  localMtime: number;
  remoteSize: number;
  remoteLastModified: string;
  remoteEtag: string;
}

// ── Events (Bun → UI push) ──
export interface FolderSyncStatusEvent {
  ruleId: string;
  status: FolderSyncRuleStatus;
  lastChange?: string;
  filesWatching: number;
  currentFile?: string;
  progress?: {
    completed: number;
    total: number;
    bytesTransferred: number;
    bytesTotal: number;
  };
}

export interface FolderSyncConflictEvent {
  ruleId: string;
  relativePath: string;
  localSize: number;
  localMtime: number;
  remoteSize: number;
  remoteLastModified: string;
}

export interface FolderSyncErrorEvent {
  ruleId: string;
  error: string;
}

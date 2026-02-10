// ── S3 Object ──
export interface S3Object {
  key: string;
  size: number;
  lastModified: string;
  etag: string;
  storageClass?: string;
}

// ── Common prefix (folder) ──
export interface S3Prefix {
  prefix: string;
}

// ── Bucket info ──
export interface BucketInfo {
  name: string;
  creationDate?: string;
}

// ── Object list request ──
export interface ObjectListReq {
  profileId: string;
  bucket: string;
  prefix?: string;
  maxKeys?: number;
  startAfter?: string;
  sortField?: "key" | "size" | "lastModified";
  sortDir?: "asc" | "desc";
}

// ── Object list response ──
export interface ObjectListRes {
  objects: S3Object[];
  prefixes: S3Prefix[];
  isTruncated: boolean;
  nextCursor?: string;
  totalCount?: number;
}

// ── S3 stat result ──
export interface S3StatResult {
  size: number;
  etag: string;
  lastModified: string;
  type: string;
}

// ── Upload request ──
export interface UploadReq {
  profileId: string;
  bucket: string;
  key: string;
  localPath: string;
}

// ── Download request ──
export interface DownloadReq {
  profileId: string;
  bucket: string;
  key: string;
  localPath: string;
}

// ── Download folder request ──
export interface DownloadFolderReq {
  profileId: string;
  bucket: string;
  prefix: string;
}

// ── Download as archive request ──
export interface DownloadArchiveReq {
  profileId: string;
  bucket: string;
  keys: string[];
  prefix?: string;
  archiveName?: string;
}

// ── Copy request ──
export interface CopyReq {
  sourceProfileId: string;
  sourceBucket: string;
  sourceKey: string;
  destProfileId: string;
  destBucket: string;
  destKey: string;
}

// ── Move request ──
export interface MoveReq extends CopyReq {}

// ── Cross-bucket transfer request (batch: files + folders) ──
export type TransferMode = "copy" | "move";

export interface CrossTransferReq {
  sourceProfileId: string;
  sourceBucket: string;
  keys: string[]; // object keys and/or folder prefixes (ending in /)
  sourcePrefix: string; // current prefix context for building relative paths
  destProfileId: string;
  destBucket: string;
  destPrefix: string;
  mode: TransferMode;
}

// ── Sync request ──
export interface SyncReq {
  sourceProfileId: string;
  sourceBucket: string;
  sourcePrefix: string;
  destProfileId: string;
  destBucket: string;
  destPrefix: string;
  mode: SyncMode;
}

export type SyncMode = "mirror" | "additive" | "overwrite";

// ── Sync diff ──
export interface SyncDiff {
  toAdd: SyncDiffEntry[];
  toUpdate: SyncDiffEntry[];
  toDelete: SyncDiffEntry[];
  unchanged: number;
}

export interface SyncDiffEntry {
  key: string;
  sourceSize?: number;
  destSize?: number;
  sourceEtag?: string;
  destEtag?: string;
  sourceLastModified?: string;
  destLastModified?: string;
  selected: boolean;
}

// ── Filters ──
export type FileTypeFilter =
  | "all"
  | "folders"
  | "images"
  | "documents"
  | "archives"
  | "other";

export type SizeFilter = "any" | "lt1mb" | "1to10mb" | "10to100mb" | "gt100mb";

export interface DateFilter {
  type: "any" | "today" | "week" | "month" | "custom";
  from?: string;
  to?: string;
}

export interface ObjectFilters {
  fileType: FileTypeFilter;
  size: SizeFilter;
  date: DateFilter;
  search: string;
}

// ── Share request ──
export interface ShareReq {
  profileId: string;
  bucket: string;
  key: string;
  expiresIn: number; // seconds
}

// ── Share response ──
export interface ShareRes {
  url: string;
  expiresAt: string; // ISO timestamp
  key: string;
}

// ── Share history entry ──
export interface ShareHistoryEntry {
  id: string;
  profileId: string;
  bucket: string;
  key: string;
  url: string;
  expiresAt: string;
  createdAt: string;
}

// ── Job types ──
export type JobType =
  | "upload"
  | "download"
  | "copy"
  | "move"
  | "sync"
  | "delete"
  | "archive"
  | "folder-sync";

export type JobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

// ── Job info ──
export interface JobInfo {
  id: string;
  type: JobType;
  status: JobStatus;
  fileName: string;
  description: string;
  bytesTransferred: number;
  bytesTotal: number;
  percentage: number;
  speed: number;
  eta: number;
  error?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

// ── Progress event (pushed from Bun → UI) ──
export interface ProgressEvent {
  jobId: string;
  type: JobType;
  status: JobStatus;
  fileName: string;
  bytesTransferred: number;
  bytesTotal: number;
  percentage: number;
  speed: number;
  eta: number;
  error?: string;
}

// ── Job complete event ──
export interface JobCompleteEvent {
  jobId: string;
  fileName?: string;
  success: boolean;
  error?: string;
}

// ── Human-readable byte sizes ──
export function formatBytes(bytes: number, decimals: number = 1): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / k ** i).toFixed(decimals))} ${sizes[i]}`;
}

// ── Human-readable speed ──
export function formatSpeed(bytesPerSec: number): string {
  return `${formatBytes(bytesPerSec)}/s`;
}

// ── Human-readable ETA ──
export function formatETA(seconds: number): string {
  if (seconds <= 0) return "—";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

// ── Human-readable duration between two ISO dates (or from start to now) ──
export function formatDuration(startIso: string, endIso?: string): string {
  if (!startIso) return "—";
  const start = new Date(startIso).getTime();
  const end = endIso ? new Date(endIso).getTime() : Date.now();
  const diffMs = Math.max(0, end - start);

  if (diffMs < 1000) return "<1s";
  const totalSec = Math.floor(diffMs / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  if (totalSec < 3600) {
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  }
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// ── Format time only (HH:MM:SS) ──
export function formatTime(isoDate: string): string {
  if (!isoDate) return "—";
  const d = new Date(isoDate);
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

// ── Relative date display ──
export function formatRelativeDate(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHrs = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHrs / 24);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHrs < 24) return `${diffHrs}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ── Format date for table display ──
export function formatDate(isoDate: string): string {
  if (!isoDate) return "—";
  const date = new Date(isoDate);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Get file extension from key ──
export function getExtension(key: string): string {
  const parts = key.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
}

// ── Get filename from key ──
export function getFileName(key: string): string {
  const parts = key.split("/");
  return parts[parts.length - 1] || key;
}

// ── Get folder name from prefix ──
export function getFolderName(prefix: string): string {
  const clean = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
  const parts = clean.split("/");
  return parts[parts.length - 1] || prefix;
}

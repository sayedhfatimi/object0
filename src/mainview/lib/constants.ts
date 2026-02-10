import type { Provider } from "../../shared/profile.types";

export const PAGE_SIZES = [25, 50, 100, 250] as const;
export const DEFAULT_PAGE_SIZE = 100;

export const CONCURRENCY_OPTIONS = [1, 2, 3, 5, 8, 10] as const;
export const DEFAULT_CONCURRENCY = 3;

export const PROVIDERS: { value: Provider; label: string }[] = [
  { value: "aws", label: "Amazon S3" },
  { value: "r2", label: "Cloudflare R2" },
  { value: "spaces", label: "DigitalOcean Spaces" },
  { value: "minio", label: "MinIO" },
  { value: "gcs", label: "Google Cloud Storage" },
  { value: "backblaze", label: "Backblaze B2" },
  { value: "custom", label: "Custom S3-Compatible" },
];

export const FILE_TYPE_EXTENSIONS: Record<string, string[]> = {
  images: [
    "jpg",
    "jpeg",
    "png",
    "gif",
    "webp",
    "svg",
    "bmp",
    "ico",
    "tiff",
    "avif",
  ],
  documents: [
    "pdf",
    "doc",
    "docx",
    "xls",
    "xlsx",
    "ppt",
    "pptx",
    "txt",
    "md",
    "csv",
    "rtf",
  ],
  archives: ["zip", "tar", "gz", "bz2", "7z", "rar", "zst", "xz"],
  code: [
    "js",
    "ts",
    "tsx",
    "jsx",
    "py",
    "rb",
    "go",
    "rs",
    "java",
    "c",
    "cpp",
    "h",
    "css",
    "html",
  ],
  media: ["mp4", "mp3", "avi", "mov", "wav", "flac", "ogg", "webm", "mkv"],
};

export const VIEW_MODES = ["table", "grid"] as const;
export type ViewMode = (typeof VIEW_MODES)[number];

import { getExtension } from "../../lib/formatters";

const ICON_MAP: Record<string, string> = {
  // Images
  png: "fa-regular fa-image",
  jpg: "fa-regular fa-image",
  jpeg: "fa-regular fa-image",
  gif: "fa-regular fa-image",
  svg: "fa-regular fa-image",
  webp: "fa-regular fa-image",
  ico: "fa-regular fa-image",
  // Documents
  pdf: "fa-regular fa-file-pdf",
  doc: "fa-regular fa-file-word",
  docx: "fa-regular fa-file-word",
  txt: "fa-regular fa-file-lines",
  md: "fa-regular fa-file-lines",
  rtf: "fa-regular fa-file-lines",
  // Spreadsheets
  csv: "fa-regular fa-file-excel",
  xls: "fa-regular fa-file-excel",
  xlsx: "fa-regular fa-file-excel",
  // Code
  js: "fa-brands fa-js",
  ts: "fa-solid fa-code",
  jsx: "fa-brands fa-react",
  tsx: "fa-brands fa-react",
  py: "fa-brands fa-python",
  rb: "fa-solid fa-gem",
  go: "fa-brands fa-golang",
  rs: "fa-solid fa-gear",
  html: "fa-brands fa-html5",
  css: "fa-brands fa-css3-alt",
  json: "fa-regular fa-file-code",
  xml: "fa-regular fa-file-code",
  yaml: "fa-regular fa-file-code",
  yml: "fa-regular fa-file-code",
  toml: "fa-regular fa-file-code",
  // Archives
  zip: "fa-regular fa-file-zipper",
  tar: "fa-regular fa-file-zipper",
  gz: "fa-regular fa-file-zipper",
  rar: "fa-regular fa-file-zipper",
  "7z": "fa-regular fa-file-zipper",
  // Audio
  mp3: "fa-regular fa-file-audio",
  wav: "fa-regular fa-file-audio",
  flac: "fa-regular fa-file-audio",
  ogg: "fa-regular fa-file-audio",
  aac: "fa-regular fa-file-audio",
  // Video
  mp4: "fa-regular fa-file-video",
  mkv: "fa-regular fa-file-video",
  avi: "fa-regular fa-file-video",
  mov: "fa-regular fa-file-video",
  webm: "fa-regular fa-file-video",
  // Fonts
  ttf: "fa-solid fa-font",
  otf: "fa-solid fa-font",
  woff: "fa-solid fa-font",
  woff2: "fa-solid fa-font",
  // Database
  db: "fa-solid fa-database",
  sql: "fa-solid fa-database",
  sqlite: "fa-solid fa-database",
  // Executable
  exe: "fa-solid fa-microchip",
  bin: "fa-solid fa-microchip",
  sh: "fa-solid fa-terminal",
};

interface FileIconProps {
  name: string;
  isFolder?: boolean;
  className?: string;
}

export function FileIcon({ name, isFolder, className = "" }: FileIconProps) {
  if (isFolder) {
    return <i className={`fa-solid fa-folder text-warning ${className}`} />;
  }

  const ext = getExtension(name).toLowerCase();
  const iconClass = ICON_MAP[ext] ?? "fa-regular fa-file";

  return <i className={`${iconClass} ${className}`} />;
}

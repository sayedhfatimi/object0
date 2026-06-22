import type { LucideIcon } from "lucide-react";
import {
  IconCode,
  IconCss3Alt,
  IconDatabase,
  IconFile,
  IconFileAudio,
  IconFileCode,
  IconFileExcel,
  IconFileLines,
  IconFilePdf,
  IconFileVideo,
  IconFileWord,
  IconFileZipper,
  IconFolder,
  IconFont,
  IconGem,
  IconGolang,
  IconHtml5,
  IconImage,
  IconJs,
  IconMicrochip,
  IconPython,
  IconReact,
  IconTerminal,
} from "@/lib/icons";
import { getExtension } from "../../lib/formatters";

const ICON_MAP: Record<string, LucideIcon> = {
  // Images
  png: IconImage,
  jpg: IconImage,
  jpeg: IconImage,
  gif: IconImage,
  svg: IconImage,
  webp: IconImage,
  ico: IconImage,
  // Documents
  pdf: IconFilePdf,
  doc: IconFileWord,
  docx: IconFileWord,
  txt: IconFileLines,
  md: IconFileLines,
  rtf: IconFileLines,
  // Spreadsheets
  csv: IconFileExcel,
  xls: IconFileExcel,
  xlsx: IconFileExcel,
  // Code
  js: IconJs,
  ts: IconCode,
  jsx: IconReact,
  tsx: IconReact,
  py: IconPython,
  rb: IconGem,
  go: IconGolang,
  rs: IconCode,
  html: IconHtml5,
  css: IconCss3Alt,
  json: IconFileCode,
  xml: IconFileCode,
  yaml: IconFileCode,
  yml: IconFileCode,
  toml: IconFileCode,
  // Archives
  zip: IconFileZipper,
  tar: IconFileZipper,
  gz: IconFileZipper,
  rar: IconFileZipper,
  "7z": IconFileZipper,
  // Audio
  mp3: IconFileAudio,
  wav: IconFileAudio,
  flac: IconFileAudio,
  ogg: IconFileAudio,
  aac: IconFileAudio,
  // Video
  mp4: IconFileVideo,
  mkv: IconFileVideo,
  avi: IconFileVideo,
  mov: IconFileVideo,
  webm: IconFileVideo,
  // Fonts
  ttf: IconFont,
  otf: IconFont,
  woff: IconFont,
  woff2: IconFont,
  // Database
  db: IconDatabase,
  sql: IconDatabase,
  sqlite: IconDatabase,
  // Executable
  exe: IconMicrochip,
  bin: IconMicrochip,
  sh: IconTerminal,
};

interface FileIconProps {
  name: string;
  isFolder?: boolean;
  className?: string;
}

export function FileIcon({ name, isFolder, className = "" }: FileIconProps) {
  if (isFolder) {
    const Icon = IconFolder;
    return <Icon className={`text-warning ${className}`} />;
  }

  const ext = getExtension(name).toLowerCase();
  const Icon = ICON_MAP[ext] ?? IconFile;

  return <Icon className={className} />;
}

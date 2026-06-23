// Central lucide icon registry — one import surface for the app.
// Maps the FontAwesome icons object0 uses to their lucide equivalents.
// Each entry carries a `// fa-xxx` comment so the mapping is auditable.

export {
  Activity as IconBarsProgress, // fa-bars-progress  → activity / progress bars
  // ── Alerts / Warnings ──────────────────────────────────────────────────
  AlertCircle as IconExclamationCircle, // fa-exclamation-circle
  AlertTriangle as IconExclamationTriangle, // fa-exclamation-triangle
  // ── Navigation / Arrows ────────────────────────────────────────────────
  ArrowDown as IconArrowDown, // fa-arrow-down
  ArrowLeft as IconArrowLeft, // fa-arrow-left
  ArrowLeftRight as IconArrowsLeftRight, // fa-arrows-left-right (resize horizontal)
  ArrowRightLeft as IconArrowRightArrowLeft, // fa-arrow-right-arrow-left (swap / transfer)
  ArrowUp as IconArrowUp, // fa-arrow-up
  // ── State / Status ─────────────────────────────────────────────────────
  Ban as IconBan, // fa-ban            (blocked / forbidden)
  Bug as IconBug, // fa-bug            (debug)
  // ── Checks / Confirmations ─────────────────────────────────────────────
  Check as IconCheck, // fa-check
  CheckCheck as IconCheckDouble, // fa-check-double   (double-check / read)
  // ── Chevrons ───────────────────────────────────────────────────────────
  ChevronDown as IconChevronDown, // fa-chevron-down
  ChevronLeft as IconChevronLeft, // fa-chevron-left
  ChevronRight as IconChevronRight, // fa-chevron-right
  ChevronUp as IconChevronUp, // fa-chevron-up
  // ── Circles ────────────────────────────────────────────────────────────
  Circle as IconCircle, // fa-circle
  CircleCheck as IconCircleCheck, // fa-circle-check
  CircleHelp as IconCircleQuestion, // fa-circle-question → help / question
  CircleUser as IconCircleUser, // fa-circle-user
  CircleX as IconCircleXmark, // fa-circle-xmark
  // ── Clipboard / Copy ───────────────────────────────────────────────────
  Clipboard as IconClipboard, // fa-clipboard
  // ── Time ───────────────────────────────────────────────────────────────
  Clock as IconClock, // fa-clock
  // ── Brand / Technology ─────────────────────────────────────────────────
  // lucide-react has no brand icons; use generic stand-ins that are semantically close.
  Cloud as IconAws, // fa-aws            → cloud provider
  Cloud as IconCloud, // fa-cloud         → cloud / bucket root
  Cloud as IconDigitalOcean, // fa-digital-ocean  → cloud provider (same as aws alias)
  // ── Cloud ──────────────────────────────────────────────────────────────
  // (Cloud already used above for aws/digitalocean alias; these are additional named aliases)
  CloudDownload as IconCloudArrowDown, // fa-cloud-arrow-down
  CloudUpload as IconCloudArrowUp, // fa-cloud-arrow-up
  Code as IconPython, // fa-python         → code / scripting
  Code as IconCode, // fa-code           → code / TypeScript
  Code2 as IconGolang, // fa-golang         → code / compiled lang
  // ── Code ───────────────────────────────────────────────────────────────
  // Code already exported above for fa-python; these are additional aliases
  CodeXml as IconCodeCompare, // fa-code-compare   → diff / XML code
  Container as IconBucket, // fa-bucket         → S3 storage bucket
  Copy as IconCopy, // fa-copy
  // ── Window controls (custom title bar) ─────────────────────────────────
  Copy as IconWindowRestore, // overlapping squares → restore (un-maximize)
  // ── Data / Database ────────────────────────────────────────────────────
  Database as IconDatabase, // fa-database
  // ── Size modifier (fa-xs is a CSS size util, not a real icon; map to a small dot) ──
  Dot as IconXs, // fa-xs             → not a real icon; mapped to Dot as placeholder
  // ── Download / Upload ──────────────────────────────────────────────────
  Download as IconDownload, // fa-download
  Eraser as IconBroom, // fa-broom          → clear / erase
  ExternalLink as IconArrowUpRightFromSquare, // fa-arrow-up-right-from-square (open external)
  // ── Vision ─────────────────────────────────────────────────────────────
  Eye as IconEye, // fa-eye
  // ── Files ──────────────────────────────────────────────────────────────
  File as IconFile, // fa-file
  FileArchive as IconFileZipper, // fa-file-zipper    → archive / zip
  FileAudio as IconFileAudio, // fa-file-audio
  FileCode as IconHtml5, // fa-html5          → markup file
  FileCode as IconFileCode, // fa-file-code      (alias reuses FileCode)
  FileJson as IconJs, // fa-js             → JavaScript file
  FileSpreadsheet as IconFileExcel, // fa-file-excel
  FileText as IconFileLines, // fa-file-lines     → text / lines file
  FileText as IconFilePdf, // fa-file-pdf       → document (no native PDF icon in lucide)
  FileText as IconFileWord, // fa-file-word      → text document
  FileVideo as IconFileVideo, // fa-file-video
  // ── Security / Auth ────────────────────────────────────────────────────
  Fingerprint as IconFingerprint, // fa-fingerprint
  // ── Misc Objects ───────────────────────────────────────────────────────
  Flame as IconFire, // fa-fire           → fire / hot
  Folder as IconFolder, // fa-folder
  FolderOpen as IconFolderOpen, // fa-folder-open
  FolderPlus as IconFolderPlus, // fa-folder-plus
  // ── Performance / Metrics ──────────────────────────────────────────────
  Gauge as IconGaugeHigh, // fa-gauge-high      → speed / gauge
  // ── Gem / Value ────────────────────────────────────────────────────────
  Gem as IconGem, // fa-gem
  Globe as IconGoogle, // fa-google         → web / search
  // ── Grid / Layout ──────────────────────────────────────────────────────
  Grid2x2 as IconGrid2, // fa-grid-2
  Grip as IconGrip, // fa-grip           → drag handle
  // ── Time (hourglass) ───────────────────────────────────────────────────
  Hourglass as IconHourglassStart, // fa-hourglass-start
  // ── Media / Image ──────────────────────────────────────────────────────
  Image as IconImage, // fa-image
  Info as IconCircleInfo, // fa-circle-info    → info (filled circle with i)
  // ── Info ───────────────────────────────────────────────────────────────
  Info as IconInfo, // generic info alias
  Key as IconKey, // fa-key
  // ── Settings ───────────────────────────────────────────────────────────
  Keyboard as IconKeyboard, // → keyboard shortcuts
  Layers as IconReact, // fa-react          → component layers (closest neutral)
  // ── Idea / Lightbulb ───────────────────────────────────────────────────
  Lightbulb as IconLightbulb, // fa-lightbulb
  // ── Link ───────────────────────────────────────────────────────────────
  Link as IconLink, // fa-link
  Link2Off as IconLinkSlash, // fa-link-slash     → broken link
  // ── Lists ──────────────────────────────────────────────────────────────
  ListChecks as IconListCheck, // fa-list-check
  Loader2 as IconBeatFade, // fa-beat-fade      → animated loader (closest motion icon)
  // ── Spinner / Loader ───────────────────────────────────────────────────
  Loader2 as IconSpinner, // generic spinner alias (used by multiple components)
  Lock as IconLock, // fa-lock
  LockOpen as IconLockOpen, // fa-lock-open
  // ── Hardware ───────────────────────────────────────────────────────────
  Microchip as IconMicrochip, // fa-microchip      → chip / hardware
  Minus as IconWindowMinimize, // minimize
  // ── Theme ──────────────────────────────────────────────────────────────
  Moon as IconMoon, // fa-moon
  // ── Objects / Files ────────────────────────────────────────────────────
  Package as IconBoxOpen, // fa-box-open       → open package / box
  Palette as IconCss3Alt, // fa-css3-alt       → styling
  // ── Sidebar ────────────────────────────────────────────────────────────
  PanelLeft as IconSidebar, // fa-sidebar        → sidebar / panel toggle
  // ── Playback ───────────────────────────────────────────────────────────
  Pause as IconPause, // fa-pause
  // ── Editing ────────────────────────────────────────────────────────────
  Pen as IconPen, // fa-pen
  PenLine as IconPenToSquare, // fa-pen-to-square  → edit-in-place
  Play as IconPlay, // fa-play
  // ── Actions ────────────────────────────────────────────────────────────
  Plus as IconPlus, // fa-plus
  // ── QR ─────────────────────────────────────────────────────────────────
  QrCode as IconQrcode, // fa-qrcode
  // ── Refresh ────────────────────────────────────────────────────────────
  RefreshCcw as IconRotate, // fa-rotate         → rotate / refresh
  RefreshCw as IconArrowsRotate, // fa-arrows-rotate (refresh / sync)
  RotateCcw as IconClockRotateLeft, // fa-clock-rotate-left → undo / history
  // ── Scissors ───────────────────────────────────────────────────────────
  Scissors as IconScissors, // fa-scissors
  // ── Search ─────────────────────────────────────────────────────────────
  Search as IconMagnifyingGlass, // fa-magnifying-glass
  // ── Infrastructure ─────────────────────────────────────────────────────
  Server as IconServer, // fa-server
  Settings as IconGear, // fa-gear / fa-cog  → settings
  // ── Share ──────────────────────────────────────────────────────────────
  Share2 as IconShareNodes, // fa-share-nodes
  Shield as IconVault, // fa-vault          → vault / secure store
  Square as IconWindowMaximize, // maximize
  // ── Favourites ─────────────────────────────────────────────────────────
  Star as IconStar, // fa-star
  Sun as IconSun, // fa-sun
  // ── Table / List ───────────────────────────────────────────────────────
  TableProperties as IconTableList, // fa-table-list     → table with rows
  // ── Terminal ───────────────────────────────────────────────────────────
  Terminal as IconTerminal, // fa-terminal
  // ── Trash / Delete ─────────────────────────────────────────────────────
  Trash as IconTrash, // fa-trash
  Trash2 as IconTrashCan, // fa-trash-can       → trash with lid
  // ── Warnings ───────────────────────────────────────────────────────────
  TriangleAlert as IconTriangleExclamation, // fa-triangle-exclamation
  // ── Typography / Font ──────────────────────────────────────────────────
  // lucide-react has no dedicated Font icon; Type is the closest
  Type as IconFont, // fa-font           → text / type
  Upload as IconUpload, // fa-arrow-up-from-bracket / upload
  // ── Users ──────────────────────────────────────────────────────────────
  User as IconUser, // fa-user
  Users as IconUserGroup, // fa-user-group
  // ── Network ────────────────────────────────────────────────────────────
  Wifi as IconWifi, // fa-wifi
  // ── Close / Dismiss ────────────────────────────────────────────────────
  X as IconXmark, // fa-xmark
  Zap as IconExclamation, // fa-exclamation    → attention / zap
} from "lucide-react";

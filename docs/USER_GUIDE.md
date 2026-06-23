# object0 — User Guide

object0 is a free, open-source desktop app for managing object storage across
Amazon S3, Cloudflare R2, DigitalOcean Spaces, MinIO, Backblaze B2, Google Cloud
Storage, and any other S3-compatible provider — all from one window.

This guide walks through everything you can do in the app. If you're a developer
or contributor, see the [README](../README.md) instead.

## Contents

- [Installing](#installing)
- [First launch: the vault](#first-launch-the-vault)
- [Connecting a storage provider](#connecting-a-storage-provider)
- [The interface](#the-interface)
- [Browsing your storage](#browsing-your-storage)
- [Searching](#searching)
- [Uploading](#uploading)
- [Downloading](#downloading)
- [Managing files & folders](#managing-files--folders)
- [Copying & moving between buckets](#copying--moving-between-buckets)
- [Syncing](#syncing)
- [Sharing files](#sharing-files)
- [The jobs panel](#the-jobs-panel)
- [Settings](#settings)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Command palette](#command-palette)
- [System tray](#system-tray)
- [Security & privacy](#security--privacy)
- [Updating](#updating)
- [Troubleshooting](#troubleshooting)

---

## Installing

Download the build for your platform from the
[Releases page](https://github.com/sayedhfatimi/object0/releases):

| Platform | Format |
|----------|--------|
| macOS (Apple Silicon / Intel) | `.dmg` |
| Linux | `.AppImage`, `.deb`, or `.rpm` |
| Windows | `.msi` or `.exe` installer |

On **Arch Linux** it's also on the AUR as `object0-bin` (`yay -S object0-bin`).

> **Linux note:** to use the "remember my passphrase" feature, you need a Secret
> Service provider such as GNOME Keyring or KWallet installed and unlocked.

---

## First launch: the vault

object0 keeps your storage credentials in an encrypted **vault** on your computer.
The vault is protected with a passphrase and encrypted with AES-256-GCM; your
access keys never leave your machine.

**First run — create your vault:**

1. Choose a strong passphrase. This encrypts everything, so pick something you
   won't forget.
2. You'll be shown a one-time **recovery key**. Save it somewhere safe (a password
   manager is ideal). It's the only way back in if you forget your passphrase.

**Every launch — unlock:**

- Enter your passphrase to unlock the vault.
- Optionally let the app **remember** it in your operating system's keychain so you
  don't have to type it each time. You can revoke this later in Settings.
- Forgot your passphrase? Use **Forgot passphrase** on the unlock screen and enter
  your recovery key to regain access and set a new one.

**Locking:** click **Lock** at the bottom of the sidebar at any time to re-secure
the vault (for example before stepping away). You'll need your passphrase to
unlock again.

---

## Connecting a storage provider

Each set of credentials is a **profile**. Add one from the **+** button next to
**PROFILES** in the sidebar (or the **Add Profile** button when you have none yet).

In the **Add Profile** dialog:

1. **Provider** — pick your storage type. The remaining fields adapt to it.
2. **Profile Name** — a friendly label (e.g. "Work R2", "Backups").
3. **Credentials** — your Access Key ID and Secret Access Key.
4. **Connection** — Region, an Endpoint URL (for providers that need one), and an
   optional Default Bucket.

Provider quick reference:

| Provider | Needs endpoint? | Notes |
|----------|-----------------|-------|
| **Amazon S3** | No | Access key starts with `AKIA…`; set your region (e.g. `us-east-1`). |
| **Cloudflare R2** | Yes | Endpoint like `https://<account-id>.r2.cloudflarestorage.com`. Keys come from R2 → API Tokens. If your token is scoped to one bucket, set it as the Default Bucket. |
| **DigitalOcean Spaces** | Yes | Endpoint like `https://<region>.digitaloceanspaces.com`; region e.g. `nyc3`. |
| **MinIO** | Yes | Endpoint like `http://localhost:9000`; region usually `us-east-1`. |
| **Backblaze B2** | Yes | Endpoint like `https://s3.<region>.backblazeb2.com`; region must match the bucket. Use the `applicationKeyId` / `applicationKey`. |
| **Google Cloud Storage** | No | Use HMAC keys from GCS interoperability settings. |
| **Custom S3-compatible** | Yes | Enter the full endpoint URL your provider gives you. |

Click **Test Connection** to verify the credentials before saving — it reports how
many buckets it can see. Then **Save**.

To **edit** or **delete** a profile later, right-click it in the sidebar.

---

## The interface

- **Sidebar (left)** — three sections:
  - **Favorites** — buckets you've pinned for one-click access.
  - **Profiles** — your saved connections; click one to make it active.
  - **Buckets** — the buckets in the active profile; pin one with its star.
  Collapse the sidebar to a slim icon strip with the toggle in the header or
  `Ctrl+B`.
- **Top bar** — breadcrumb path plus global buttons: theme, share history, jobs,
  live folder sync, keyboard shortcuts, and settings.
- **Toolbar** — actions for the current view: Upload, New Folder, Download, Sync,
  Delete, a **More** menu, search, refresh, and a table/grid view switch.
- **Content area** — your files and folders, in table or grid layout. Open tabs
  appear above it so you can keep several locations open at once.
- **Status bar (bottom)** — the active profile and bucket, item counts, current
  selection size, running jobs, live-sync status, and update notices.

---

## Browsing your storage

1. Select a **profile** in the sidebar, then a **bucket**.
2. Double-click a folder to open it; use the **breadcrumb** at the top to jump back
   up the path.
3. Switch between **table** and **grid** views with the toggle on the right of the
   toolbar. Table view shows name, size, and modified date and lets you sort by
   clicking a column header.
4. **Tabs**: each bucket/location you open gets a tab so you can switch between
   places quickly; your open tabs are restored next time.
5. **Selecting**: click checkboxes (or use the keyboard — see
   [shortcuts](#keyboard-shortcuts)) to select one or many items for bulk actions.
6. **Favorites**: click the star on a bucket to pin it under **Favorites** for
   quick access; click again to unpin.

---

## Searching

Press `Ctrl+F` (or click the search icon in the toolbar) to open the **search
palette** for the current view. Start typing to filter folders and files:

- Press **Enter** on a folder to open it, or on a file to open its details.
- Choose **"Filter current view by…"** to apply the term as a live filter on the
  list; a removable chip in the toolbar shows the active filter — click it to clear.

---

## Uploading

There are three ways to upload into the current folder:

- **Upload** — pick one or more files.
- **Upload Folder** — pick a whole folder; its structure is preserved.
- **Drag & drop** — drag files from your file manager onto the content area.

Uploads run in the background — watch progress in the [jobs panel](#the-jobs-panel).
Cancelling the file picker simply does nothing (no error).

---

## Downloading

- Select one or more items and click **Download** to save them to your Downloads
  folder.
- Folders download with their full contents.
- You can also download a selection as a single **archive (zip)** from the **More**
  menu.

Downloads are queued and tracked in the jobs panel like uploads.

---

## Managing files & folders

- **New Folder** — create an empty folder (prefix) in the current location.
- **Rename** — rename a file (press `F2` in table view, or use the right-click
  menu).
- **Delete** — remove selected items. Deletion shows an **Undo** toast for a few
  seconds before it actually happens, so an accidental delete is easy to reverse.
- **Details** — right-click a file → **Details** to open an inspector panel with its
  full metadata.
- **Copy key** — right-click → **Copy Key** to copy an object's full path.

Right-clicking any file or folder opens a context menu with these actions plus
download, share, and copy/move.

---

## Copying & moving between buckets

Right-click an item (or use the **More** menu) and choose **Copy to Bucket** or
**Move to Bucket**. In the dialog:

1. Pick the **destination profile** and **bucket** — these can be a *different*
   profile entirely, so you can move data between providers.
2. Optionally set a **destination path** (prefix) to place the items under.
3. **Copy** keeps the originals; **Move** deletes them after a successful transfer
   (you'll see a warning confirming which bucket they'll be removed from).

---

## Syncing

Click **Sync** in the toolbar and choose the type that fits your need.

### Object Sync (one-time)

A single, on-demand copy from the current bucket/prefix to another
bucket/profile. Choose a **behavior**:

- **Additive** — only add files that are missing in the destination.
- **Overwrite** — add missing files *and* update changed ones.
- **Mirror** — make the destination an exact copy, **deleting** files in the
  destination that aren't in the source.

Click **Preview Changes** first to see exactly what will be added, updated, or
deleted, then **Run Sync**. It runs once and stops.

### Live Folder Sync (continuous)

Keeps a **local folder** and a bucket/prefix in sync continuously, Google
Drive-style. Open the **Live Folder Sync** panel (folder icon in the top bar) to
create and manage **rules**. Each rule watches for changes and syncs them, surfaces
**conflicts** when both sides change, and reports status and errors. Live sync keeps
running in the background — see [System tray](#system-tray) to pause or resume it.

The status bar shows how many live syncs are active or currently syncing.

---

## Sharing files

Generate a temporary, public **presigned link** to any object without exposing your
credentials:

1. Right-click a file → **Share** (or use the share action).
2. Choose an **expiration** — a preset (1 hour, 6 hours, 24 hours, 7 days) or a
   custom duration.
3. Copy the link, or show a **QR code** to open it on a phone.

Past links are kept in **Share History** (the clock icon in the top bar) so you can
revisit them. Whether history is persisted between sessions is configurable in
[Settings](#settings).

---

## The jobs panel

Every upload, download, and transfer becomes a **job**. Open the panel from the
jobs button in the top bar (or `Ctrl+J`) — it's a flyout that drops down without
blocking the rest of the app, so you can keep working while it runs.

It shows:

- **Active** jobs with live progress, speed, and a combined progress bar when
  several run at once.
- **Completed** jobs (succeeded, failed, or cancelled).
- Buttons to **refresh**, **clear completed**, and a per-job **cancel**.

The number badge on the jobs button and a summary in the status bar tell you how
many are running at a glance.

---

## Settings

Open Settings with the gear icon (or `Ctrl+,`):

- **Theme** — Dark or Light.
- **Default view** — Table or Grid for new locations.
- **Page size** — how many objects load per page.
- **Desktop notifications** — on/off for job completion, etc.
- **Persist share history** — keep generated links between sessions, or clear them
  on exit.
- **Job concurrency** — how many transfers run at once.
- **OS keychain** — see whether your passphrase is remembered, and **forget** it to
  require manual unlock again.
- **Change passphrase** — set a new vault passphrase.

---

## Keyboard shortcuts

Open the full list any time from the **keyboard icon** in the top bar.

| Shortcut | Action |
|----------|--------|
| `Ctrl+K` | Command palette |
| `Ctrl+B` | Toggle sidebar |
| `Ctrl+J` | Toggle jobs panel |
| `Ctrl+\` | Toggle theme |
| `Ctrl+,` | Open settings |
| `Ctrl+F` | Search current view |
| `↑` / `↓` | Move between rows |
| `Space` | Toggle selection |
| `Enter` | Open folder |
| `F2` | Rename file |
| `Ctrl+A` | Select all |
| `Esc` | Clear selection |
| `Backspace` | Go back |

---

## Command palette

Press `Ctrl+K` to open the command palette — a fast, keyboard-driven way to run
common actions (switch views, open sync, search objects, toggle panels, and more)
without hunting through the UI. Start typing to filter, then press Enter.

---

## System tray

object0 lives in your system tray so long-running work continues in the
background. Right-click the tray icon to:

- See current sync status.
- **Pause** or **Resume** all folder sync.
- Show or hide the main window.

This is handy for letting Live Folder Sync run while the window is closed.

---

## Security & privacy

- Your storage credentials are stored in an **encrypted vault** (AES-256-GCM) on
  your own machine, unlocked by your passphrase.
- API keys are held by the app's native backend and used only to talk to your
  storage provider — they are never sent anywhere else.
- "Remember passphrase" stores it in your operating system's secure keychain; you
  can revoke this in Settings.
- Your **recovery key** is the fallback if you forget your passphrase — keep it
  safe and private.
- Presigned share links grant temporary, read access to a single object until they
  expire; share them only with people you intend to.

---

## Updating

When a new version is available, the **status bar** shows an **"Update to vX.Y.Z"**
button — click it to apply the update. You can always grab the latest build
manually from the [Releases page](https://github.com/sayedhfatimi/object0/releases).

---

## Troubleshooting

**"Remember passphrase" doesn't work on Linux.**
You need a Secret Service provider (GNOME Keyring, KWallet, etc.) installed and
unlocked. Without one, you'll unlock with your passphrase each launch. Settings
shows whether the OS keychain is available.

**Test Connection fails.**
Double-check the Access Key / Secret, the **Region**, and — for R2, Spaces, MinIO,
Backblaze, and custom providers — the **Endpoint URL**. For bucket-scoped tokens
(common with R2), set the **Default Bucket**.

**I can't see my buckets.**
Make sure the right **profile** is selected in the sidebar, and that the
credentials have permission to list buckets. Use the refresh button by the
**BUCKETS** header to reload.

**I forgot my passphrase.**
Use **Forgot passphrase** on the unlock screen and enter your **recovery key** to
get back in and set a new passphrase. Without either, the vault cannot be decrypted.

**An upload/download seems stuck.**
Open the [jobs panel](#the-jobs-panel) to check progress, errors, or to cancel and
retry. The status bar also surfaces active job counts.

---

Found a bug or have a feature request? Open an issue at
[github.com/sayedhfatimi/object0](https://github.com/sayedhfatimi/object0).

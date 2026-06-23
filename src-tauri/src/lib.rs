use aws_sdk_s3::{
    config::{Credentials, Region},
    presigning::PresigningConfig,
    primitives::ByteStream,
    types::{CompletedMultipartUpload, CompletedPart, Delete, ObjectIdentifier},
    Client as S3Client,
};
use chrono::{Duration, Utc};
use flate2::{write::GzEncoder, Compression};
use keyring::Entry;
use notify::{recommended_watcher, RecursiveMode, Watcher};
use percent_encoding::{utf8_percent_encode, AsciiSet, NON_ALPHANUMERIC};
use rfd::FileDialog;
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::{
    collections::{HashMap, HashSet, VecDeque},
    fs, io,
    io::Write,
    path::Component,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::{Duration as StdDuration, Instant},
};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, State, WindowEvent,
};
use tauri_plugin_updater::UpdaterExt;
use tokio::{
    fs as tokio_fs,
    io::{AsyncReadExt, AsyncWriteExt, BufWriter},
    sync::oneshot,
};
use url::Url;
use uuid::Uuid;
use walkdir::WalkDir;

mod config_paths;
mod crypto;
mod folder_sync;
mod jobs;
mod keychain;
mod persistence;
mod rpc;
mod rpc_method;
mod s3;
mod sync;
mod tray;
mod updater;
mod util;
mod vault;

use folder_sync::*;
use jobs::*;
use keychain::*;
use persistence::*;
use s3::*;
use sync::*;
use tray::{build_tray_menu, handle_tray_menu_action, refresh_tray_menu, show_main_window};
use updater::*;
use util::*;
use vault::*;

use crypto::{
    decode_base64, decrypt_payload, derive_key, encode_base64, encrypt_payload,
    generate_recovery_key, random_bytes,
};

use config_paths::{
    favorites_path, folder_sync_records_path, folder_sync_rules_path, job_history_path, vault_path,
};
use rpc_method::RpcMethod;

const CURRENT_VAULT_VERSION: u8 = 3;
const PBKDF2_ITERATIONS: u32 = 600_000;
const KEY_BYTES: usize = 32;
const SALT_BYTES: usize = 32;
const IV_BYTES: usize = 12;
const RECOVERY_KEY_LENGTH: usize = 24;
const KEYCHAIN_SERVICE: &str = "com.object0.vault";
const KEYCHAIN_ACCOUNT: &str = "passphrase";
const COPY_SOURCE_ENCODE_SET: &AsciiSet = &NON_ALPHANUMERIC.remove(b'/');
const TRAY_MENU_OPEN: &str = "tray-open";
const TRAY_MENU_PAUSE_ALL: &str = "tray-pause-all";
const TRAY_MENU_RESUME_ALL: &str = "tray-resume-all";
const TRAY_MENU_QUIT: &str = "tray-quit";
const MULTIPART_THRESHOLD_BYTES: i64 = 5 * 1024 * 1024;
const MULTIPART_PART_SIZE_BYTES: usize = 8 * 1024 * 1024;
const JOB_HISTORY_MAX: usize = 100;
const JOB_ORDER_MAX: usize = 200;
const JOB_CANCELLED: &str = "Job cancelled";
const S3_LIST_MAX_KEYS: i32 = 1000;
const FOLDER_SYNC_MIN_POLL_MS: i64 = 250;
const FOLDER_SYNC_MAX_POLL_MS: i64 = 86_400_000;
const MIN_JOB_CONCURRENCY: u8 = 1;
const MAX_JOB_CONCURRENCY: u8 = 10;
const MIN_SHARE_TTL_SECS: i64 = 1;
const MAX_SHARE_TTL_SECS: i64 = 604_800;
const UPDATE_CHECK_INITIAL_DELAY_SECS: u64 = 5;
const UPDATE_CHECK_INTERVAL_SECS: u64 = 30 * 60;
const DEFAULT_UPDATER_ENDPOINT: &str =
    "https://github.com/sayedhfatimi/object0/releases/latest/download/latest.json";
const DEFAULT_UPDATER_CHANNEL: &str = "stable";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VaultFileV1 {
    version: u8,
    salt: String,
    iv: String,
    auth_tag: String,
    data: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VaultFileV2 {
    version: u8,
    salt: String,
    iv: String,
    data: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VaultRecoveryBlob {
    salt: String,
    iv: String,
    data: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VaultFileV3 {
    version: u8,
    salt: String,
    iv: String,
    data: String,
    recovery: Option<VaultRecoveryBlob>,
}

enum VaultFileDisk {
    V1(VaultFileV1),
    V2(VaultFileV2),
    V3(VaultFileV3),
}

// ── Closed-set domain enums (serde-renamed to preserve the existing wire format
// shared with the frontend; see src/shared/*.types.ts) ──
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
enum S3Provider {
    Aws,
    R2,
    Spaces,
    Minio,
    Gcs,
    Backblaze,
    Custom,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
enum SyncDirection {
    Bidirectional,
    LocalToRemote,
    RemoteToLocal,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
enum ConflictResolution {
    NewerWins,
    LocalWins,
    RemoteWins,
    KeepBoth,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
enum FolderSyncStatus {
    Idle,
    Syncing,
    Watching,
    Error,
    Paused,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
enum SyncMode {
    Mirror,
    Additive,
    Overwrite,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
enum TransferMode {
    Copy,
    Move,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Profile {
    id: String,
    name: String,
    provider: S3Provider,
    access_key_id: String,
    secret_access_key: String,
    session_token: Option<String>,
    endpoint: Option<String>,
    region: Option<String>,
    default_bucket: Option<String>,
    created_at: String,
    updated_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
struct VaultData {
    profiles: Vec<Profile>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProfileInfo {
    id: String,
    name: String,
    provider: S3Provider,
    endpoint: Option<String>,
    region: Option<String>,
    default_bucket: Option<String>,
    created_at: String,
    updated_at: String,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
#[allow(dead_code)]
enum JobType {
    Upload,
    Download,
    Copy,
    Move,
    Sync,
    Delete,
    Archive,
    FolderSync,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
enum JobStatus {
    Queued,
    Running,
    Completed,
    Failed,
    Cancelled,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct JobInfo {
    id: String,
    #[serde(rename = "type")]
    job_type: JobType,
    status: JobStatus,
    file_name: String,
    description: String,
    bytes_transferred: i64,
    bytes_total: i64,
    percentage: i64,
    speed: i64,
    eta: i64,
    error: Option<String>,
    created_at: String,
    started_at: Option<String>,
    completed_at: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct JobProgressEvent {
    job_id: String,
    #[serde(rename = "type")]
    job_type: JobType,
    status: JobStatus,
    file_name: String,
    bytes_transferred: i64,
    bytes_total: i64,
    percentage: i64,
    speed: i64,
    eta: i64,
    error: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct JobCompleteEvent {
    job_id: String,
    file_name: Option<String>,
    success: bool,
    error: Option<String>,
}

#[derive(Clone, Debug)]
enum JobTaskKind {
    Upload {
        profile_id: String,
        bucket: String,
        key: String,
        local_path: String,
    },
    Download {
        profile_id: String,
        bucket: String,
        key: String,
        local_path: String,
    },
    Copy {
        source_profile_id: String,
        source_bucket: String,
        source_key: String,
        dest_profile_id: String,
        dest_bucket: String,
        dest_key: String,
    },
    Move {
        source_profile_id: String,
        source_bucket: String,
        source_key: String,
        dest_profile_id: String,
        dest_bucket: String,
        dest_key: String,
    },
    Delete {
        profile_id: String,
        bucket: String,
        keys: Vec<String>,
    },
    Archive {
        profile_id: String,
        bucket: String,
        keys: Vec<String>,
        common_prefix: String,
        destination_path: String,
    },
}

#[derive(Clone, Debug)]
struct JobTask {
    id: String,
    kind: JobTaskKind,
}

struct JobRuntime {
    concurrency: u8,
    queue: VecDeque<JobTask>,
    running: HashSet<String>,
    jobs: HashMap<String, JobInfo>,
    order: Vec<String>,
    cancel_flags: HashMap<String, Arc<AtomicBool>>,
}

impl Default for JobRuntime {
    fn default() -> Self {
        Self {
            concurrency: 3,
            queue: VecDeque::new(),
            running: HashSet::new(),
            jobs: HashMap::new(),
            order: Vec::new(),
            cancel_flags: HashMap::new(),
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FolderSyncRuleRecord {
    id: String,
    profile_id: String,
    bucket: String,
    bucket_prefix: String,
    local_path: String,
    direction: SyncDirection,
    enabled: bool,
    conflict_resolution: ConflictResolution,
    poll_interval_ms: i64,
    exclude_patterns: Vec<String>,
    last_sync_at: Option<String>,
    last_sync_status: Option<String>,
    last_sync_error: Option<String>,
    created_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FolderSyncFileRecord {
    relative_path: String,
    local_mtime: i64,
    local_size: i64,
    remote_etag: String,
    remote_last_modified: String,
    remote_size: i64,
    synced_at: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct FolderSyncStateRecord {
    rule_id: String,
    status: FolderSyncStatus,
    files_watching: i64,
    last_change: Option<String>,
    current_file: Option<String>,
    progress: Option<FolderSyncProgress>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct FolderSyncProgress {
    completed: i64,
    total: i64,
    bytes_transferred: i64,
    bytes_total: i64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct FolderSyncConflictEventPayload {
    rule_id: String,
    relative_path: String,
    local_size: i64,
    local_mtime: i64,
    remote_size: i64,
    remote_last_modified: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct FolderSyncErrorEventPayload {
    rule_id: String,
    error: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateAvailableEventPayload {
    version: String,
    update_available: bool,
    update_ready: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct FolderSyncDiffEntryRecord {
    relative_path: String,
    action: String,
    reason: String,
    local_size: Option<i64>,
    local_mtime: Option<i64>,
    remote_size: Option<i64>,
    remote_last_modified: Option<String>,
    remote_etag: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct FolderSyncDiffRecord {
    uploads: Vec<FolderSyncDiffEntryRecord>,
    downloads: Vec<FolderSyncDiffEntryRecord>,
    delete_local: Vec<FolderSyncDiffEntryRecord>,
    delete_remote: Vec<FolderSyncDiffEntryRecord>,
    conflicts: Vec<FolderSyncDiffEntryRecord>,
    unchanged: i64,
}

#[derive(Clone, Debug)]
struct LocalFileInfo {
    relative_path: String,
    size: i64,
    mtime_ms: i64,
}

#[derive(Clone, Debug)]
struct RemoteFileInfo {
    size: i64,
    etag: String,
    last_modified: String,
}

// A single object returned by s3_list_all_objects — replaces a positional
// (key, size, etag, last_modified) tuple to make call sites self-documenting.
#[derive(Clone, Debug)]
struct RemoteObject {
    key: String,
    size: i64,
    etag: String,
    last_modified: String,
}

#[derive(Clone, Debug)]
struct SyncObjectInfo {
    size: i64,
    etag: String,
    last_modified: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SyncDiffEntryRecord {
    key: String,
    source_size: Option<i64>,
    dest_size: Option<i64>,
    source_etag: Option<String>,
    dest_etag: Option<String>,
    source_last_modified: Option<String>,
    dest_last_modified: Option<String>,
    selected: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SyncDiffRecord {
    to_add: Vec<SyncDiffEntryRecord>,
    to_update: Vec<SyncDiffEntryRecord>,
    to_delete: Vec<SyncDiffEntryRecord>,
    unchanged: i64,
}

#[derive(Clone)]
struct FolderSyncTaskControl {
    cancel_flag: Arc<AtomicBool>,
    pause_flag: Arc<AtomicBool>,
    wake_tx: Arc<Mutex<Option<oneshot::Sender<()>>>>,
    watcher: Arc<Mutex<Option<notify::RecommendedWatcher>>>,
}

struct FolderSyncRuntime {
    tasks: HashMap<String, FolderSyncTaskControl>,
    statuses: HashMap<String, FolderSyncStateRecord>,
}

impl Default for FolderSyncRuntime {
    fn default() -> Self {
        Self {
            tasks: HashMap::new(),
            statuses: HashMap::new(),
        }
    }
}

#[derive(Default)]
struct VaultRuntime {
    unlocked: bool,
    data: Option<VaultData>,
    key: Option<[u8; KEY_BYTES]>,
    salt: Option<Vec<u8>>,
    recovery_key: Option<[u8; KEY_BYTES]>,
    recovery_salt: Option<Vec<u8>>,
}

#[derive(Default)]
struct UpdaterRuntime {
    downloaded_version: Option<String>,
    downloaded_bytes: Option<Vec<u8>>,
}

struct AppState {
    vault: Mutex<VaultRuntime>,
    jobs: Mutex<JobRuntime>,
    folder_sync: Mutex<FolderSyncRuntime>,
    updater: Mutex<UpdaterRuntime>,
    is_quitting: AtomicBool,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            vault: Mutex::new(VaultRuntime::default()),
            jobs: Mutex::new(JobRuntime::default()),
            folder_sync: Mutex::new(FolderSyncRuntime::default()),
            updater: Mutex::new(UpdaterRuntime::default()),
            is_quitting: AtomicBool::new(false),
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VaultSetupInput {
    passphrase: String,
    remember: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VaultUnlockInput {
    passphrase: String,
    remember: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RecoveryKeyInput {
    recovery_key: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ChangePassphraseInput {
    new_passphrase: String,
    remember: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProfileInput {
    name: String,
    provider: S3Provider,
    access_key_id: String,
    secret_access_key: String,
    session_token: Option<String>,
    endpoint: Option<String>,
    region: Option<String>,
    default_bucket: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProfileUpdateInput {
    id: String,
    name: String,
    provider: S3Provider,
    access_key_id: Option<String>,
    secret_access_key: Option<String>,
    session_token: Option<Option<String>>,
    endpoint: Option<String>,
    region: Option<String>,
    default_bucket: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProfileTestInput {
    provider: S3Provider,
    endpoint: Option<String>,
    region: String,
    access_key_id: String,
    secret_access_key: String,
    default_bucket: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProfileIdInput {
    profile_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FavoritesSaveInput {
    favorites: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct JobConcurrencyInput {
    concurrency: u8,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ShareGenerateInput {
    profile_id: String,
    bucket: String,
    key: String,
    expires_in: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ObjectsListInput {
    profile_id: String,
    bucket: String,
    prefix: Option<String>,
    max_keys: Option<u16>,
    start_after: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ObjectsDeleteInput {
    profile_id: String,
    bucket: String,
    keys: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ObjectsRenameInput {
    profile_id: String,
    bucket: String,
    old_key: String,
    new_key: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ObjectsStatInput {
    profile_id: String,
    bucket: String,
    key: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UploadInput {
    profile_id: String,
    bucket: String,
    key: String,
    local_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DownloadInput {
    profile_id: String,
    bucket: String,
    key: String,
    local_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PickUploadInput {
    profile_id: String,
    bucket: String,
    prefix: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DownloadFolderInput {
    profile_id: String,
    bucket: String,
    prefix: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CopyInput {
    source_profile_id: String,
    source_bucket: String,
    source_key: String,
    dest_profile_id: String,
    dest_bucket: String,
    dest_key: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CrossBucketInput {
    source_profile_id: String,
    source_bucket: String,
    keys: Vec<String>,
    source_prefix: String,
    dest_profile_id: String,
    dest_bucket: String,
    dest_prefix: String,
    mode: TransferMode,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DownloadArchiveInput {
    profile_id: String,
    bucket: String,
    keys: Vec<String>,
    prefix: Option<String>,
    archive_name: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SyncInput {
    source_profile_id: String,
    source_bucket: String,
    source_prefix: String,
    dest_profile_id: String,
    dest_bucket: String,
    dest_prefix: String,
    mode: SyncMode,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FolderSyncToggleInput {
    id: String,
    enabled: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct IdInput {
    id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct JobIdInput {
    job_id: String,
}

struct UnlockPayload {
    data: VaultData,
    key: [u8; KEY_BYTES],
    salt: Vec<u8>,
    has_recovery_key: bool,
    recovery_salt: Option<Vec<u8>>,
    needs_rewrite: bool,
}

struct RecoveryUnlockPayload {
    data: VaultData,
    salt: Vec<u8>,
    recovery_salt: Vec<u8>,
    recovery_key: [u8; KEY_BYTES],
}

enum KeychainReadResult {
    Available(Option<String>),
    Unavailable(String),
}

pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .setup(|app| {
            hydrate_job_history_runtime(app.app_handle());

            // Custom window decorations: macOS keeps the native frame (traffic
            // lights float over an overlay title bar via tauri.conf.json), while
            // Windows/Linux drop the native frame and render our own controls.
            #[cfg(not(target_os = "macos"))]
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.set_decorations(false);
            }

            let updater_handle = app.app_handle().clone();
            tauri::async_runtime::spawn(async move {
                run_periodic_updater_checks(updater_handle).await;
            });

            let menu = build_tray_menu(app.app_handle()).map_err(std::io::Error::other)?;
            let mut tray_builder = TrayIconBuilder::with_id("object0-tray")
                .menu(&menu)
                .tooltip("object0")
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| {
                    handle_tray_menu_action(app, event.id().as_ref());
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main_window(tray.app_handle());
                    }
                });

            if let Some(icon) = app.default_window_icon() {
                tray_builder = tray_builder.icon(icon.clone());
            }

            tray_builder.build(app)?;

            refresh_tray_menu(app.app_handle());
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let app = window.app_handle();
                let state = app.state::<AppState>();
                if state.is_quitting.load(Ordering::SeqCst) {
                    return;
                }

                if folder_sync_has_active_tasks(&app) {
                    api.prevent_close();
                    let _ = window.hide();
                    refresh_tray_menu(&app);
                } else {
                    state.is_quitting.store(true, Ordering::SeqCst);
                    app.exit(0);
                }
            }
        })
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![rpc::rpc_request])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn vault_crypto_roundtrips() {
        let salt = [7u8; SALT_BYTES];
        let key = derive_key("correct horse battery staple", &salt);
        let (iv, ct) = encrypt_payload(&key, b"top secret profile blob").unwrap();
        let pt = decrypt_payload(&key, &iv, &ct).unwrap();
        assert_eq!(pt, b"top secret profile blob");
    }

    #[test]
    fn vault_decrypt_fails_with_wrong_key() {
        let key = derive_key("right", &[1u8; SALT_BYTES]);
        let wrong = derive_key("wrong", &[1u8; SALT_BYTES]);
        let (iv, ct) = encrypt_payload(&key, b"data").unwrap();
        assert!(decrypt_payload(&wrong, &iv, &ct).is_err());
    }

    #[test]
    fn derive_key_is_deterministic_and_salt_sensitive() {
        let a = derive_key("pw", &[0u8; SALT_BYTES]);
        let b = derive_key("pw", &[0u8; SALT_BYTES]);
        let c = derive_key("pw", &[1u8; SALT_BYTES]);
        assert_eq!(a, b);
        assert_ne!(a, c);
    }

    #[test]
    fn sanitize_relative_path_blocks_escapes() {
        assert!(sanitize_relative_path("../secret").is_none());
        assert!(sanitize_relative_path("/abs/path").is_none());
        assert!(sanitize_relative_path("a/../../b").is_none());
        // Windows-style traversal: backslash separators and drive-rooted paths.
        assert!(sanitize_relative_path("..\\..\\secret").is_none());
        assert!(sanitize_relative_path("a\\b").is_none());
        assert!(sanitize_relative_path("C:\\Windows\\System32").is_none());
        // Leading current-dir segment is no longer treated as a plain name.
        assert!(sanitize_relative_path("./file.txt").is_none());
        assert_eq!(
            sanitize_relative_path("ok/file.txt"),
            Some(PathBuf::from("ok/file.txt"))
        );
        assert_eq!(
            sanitize_relative_path("a/b/c.txt"),
            Some(PathBuf::from("a/b/c.txt"))
        );
    }

    #[test]
    fn wildcard_matches_basics() {
        assert!(wildcard_matches("*.log", "server.log"));
        assert!(wildcard_matches("node_modules/*", "node_modules/x"));
        assert!(wildcard_matches("a?c", "abc"));
        assert!(!wildcard_matches("*.log", "server.txt"));
        assert!(wildcard_matches("*", "anything"));
    }

    #[test]
    fn is_excluded_path_matches_basename_and_full() {
        let pats = vec![".DS_Store".to_string(), "*.tmp".to_string()];
        assert!(is_excluded_path("dir/.DS_Store", &pats));
        assert!(is_excluded_path("a/b/c.tmp", &pats));
        assert!(!is_excluded_path("a/b/c.txt", &pats));
    }

    #[test]
    fn normalize_prefix_adds_trailing_slash() {
        assert_eq!(normalize_prefix(""), "");
        assert_eq!(normalize_prefix("photos"), "photos/");
        assert_eq!(normalize_prefix("photos/"), "photos/");
    }

    #[test]
    fn parse_iso_millis_some_on_valid_none_on_garbage() {
        assert!(parse_iso_millis("2024-01-01T00:00:00Z").is_some());
        assert_eq!(parse_iso_millis("not-a-date"), None);
        assert_eq!(parse_iso_millis(""), None);
    }

    #[test]
    fn write_atomic_roundtrips_via_tempdir() {
        let dir = std::env::temp_dir().join(format!("object0-test-{}", std::process::id()));
        let path = dir.join("nested/data.json");
        write_atomic(&path, b"[1,2,3]").unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "[1,2,3]");
        let _ = fs::remove_dir_all(&dir);
    }

    // Lock the exact wire strings for the domain enums. These must stay byte-identical
    // to the frontend unions in src/shared/*.types.ts and to any persisted vault/sync
    // JSON; a rename here would silently break deserialization of existing data.
    fn assert_wire<T>(value: T, expected: &str)
    where
        T: Serialize + serde::de::DeserializeOwned + PartialEq + std::fmt::Debug,
    {
        let json = serde_json::to_string(&value).unwrap();
        assert_eq!(json, format!("\"{expected}\""));
        let back: T = serde_json::from_str(&json).unwrap();
        assert_eq!(back, value);
    }

    #[test]
    fn s3_provider_wire_format_is_stable() {
        assert_wire(S3Provider::Aws, "aws");
        assert_wire(S3Provider::R2, "r2");
        assert_wire(S3Provider::Spaces, "spaces");
        assert_wire(S3Provider::Minio, "minio");
        assert_wire(S3Provider::Gcs, "gcs");
        assert_wire(S3Provider::Backblaze, "backblaze");
        assert_wire(S3Provider::Custom, "custom");
    }

    #[test]
    fn sync_direction_wire_format_is_stable() {
        assert_wire(SyncDirection::Bidirectional, "bidirectional");
        assert_wire(SyncDirection::LocalToRemote, "local-to-remote");
        assert_wire(SyncDirection::RemoteToLocal, "remote-to-local");
    }

    #[test]
    fn conflict_resolution_wire_format_is_stable() {
        assert_wire(ConflictResolution::NewerWins, "newer-wins");
        assert_wire(ConflictResolution::LocalWins, "local-wins");
        assert_wire(ConflictResolution::RemoteWins, "remote-wins");
        assert_wire(ConflictResolution::KeepBoth, "keep-both");
    }

    #[test]
    fn folder_sync_status_serializes_to_stable_strings() {
        // Serialize-only enum (emitted to the frontend, never deserialized).
        assert_eq!(
            serde_json::to_string(&FolderSyncStatus::Idle).unwrap(),
            "\"idle\""
        );
        assert_eq!(
            serde_json::to_string(&FolderSyncStatus::Syncing).unwrap(),
            "\"syncing\""
        );
        assert_eq!(
            serde_json::to_string(&FolderSyncStatus::Watching).unwrap(),
            "\"watching\""
        );
        assert_eq!(
            serde_json::to_string(&FolderSyncStatus::Error).unwrap(),
            "\"error\""
        );
        assert_eq!(
            serde_json::to_string(&FolderSyncStatus::Paused).unwrap(),
            "\"paused\""
        );
    }

    #[test]
    fn sync_and_transfer_mode_deserialize_from_stable_strings() {
        // Deserialize-only enums (transient RPC inputs from the frontend).
        assert_eq!(
            serde_json::from_str::<SyncMode>("\"mirror\"").unwrap(),
            SyncMode::Mirror
        );
        assert_eq!(
            serde_json::from_str::<SyncMode>("\"additive\"").unwrap(),
            SyncMode::Additive
        );
        assert_eq!(
            serde_json::from_str::<SyncMode>("\"overwrite\"").unwrap(),
            SyncMode::Overwrite
        );
        assert_eq!(
            serde_json::from_str::<TransferMode>("\"copy\"").unwrap(),
            TransferMode::Copy
        );
        assert_eq!(
            serde_json::from_str::<TransferMode>("\"move\"").unwrap(),
            TransferMode::Move
        );
    }
}

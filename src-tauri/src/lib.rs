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
mod rpc;
mod rpc_method;
mod s3;
mod sync;
mod tray;
mod updater;

use folder_sync::*;
use jobs::*;
use s3::*;
use sync::*;
use tray::{build_tray_menu, handle_tray_menu_action, refresh_tray_menu, show_main_window};
use updater::*;

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

fn lock_state<'a, T>(mutex: &'a Mutex<T>) -> Result<std::sync::MutexGuard<'a, T>, String> {
    mutex.lock().map_err(|_| "State lock poisoned".to_string())
}

fn now_iso() -> String {
    Utc::now().to_rfc3339()
}

fn payload_or_null(payload: Option<Value>) -> Value {
    payload.unwrap_or(Value::Null)
}

fn parse_payload<T>(payload: Value) -> Result<T, String>
where
    T: for<'de> Deserialize<'de>,
{
    serde_json::from_value(payload).map_err(|err| format!("Invalid payload: {err}"))
}

fn ensure_parent_dir(path: &Path) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|err| format!("Failed to create {}: {err}", parent.display()))?;
    }
    Ok(())
}

/// Write `contents` to `path` atomically: write a uniquely-named temp file in
/// the same directory, then rename it over the target. Because the temp name is
/// unique and `fs::rename` is atomic on one filesystem, a reader (or a crash, or
/// a concurrent writer) never observes a torn/partial file.
fn write_atomic(path: &Path, contents: &[u8]) -> Result<(), String> {
    ensure_parent_dir(path)?;
    let tmp = path.with_file_name(format!(".object0-{}.tmp", Uuid::new_v4()));
    fs::write(&tmp, contents)
        .map_err(|err| format!("Failed to write {}: {err}", tmp.display()))?;
    fs::rename(&tmp, path).map_err(|err| {
        let _ = fs::remove_file(&tmp); // best-effort cleanup of the orphan temp
        format!("Failed to persist {}: {err}", path.display())
    })
}

fn read_vault_file(path: &Path) -> Result<VaultFileDisk, String> {
    let raw = fs::read_to_string(path)
        .map_err(|err| format!("Failed to read {}: {err}", path.display()))?;
    let value: Value =
        serde_json::from_str(&raw).map_err(|err| format!("Invalid vault JSON: {err}"))?;
    let version = value
        .get("version")
        .and_then(Value::as_u64)
        .ok_or_else(|| "Vault missing version field".to_string())?;

    match version {
        1 => serde_json::from_value::<VaultFileV1>(value)
            .map(VaultFileDisk::V1)
            .map_err(|err| format!("Invalid V1 vault format: {err}")),
        2 => serde_json::from_value::<VaultFileV2>(value)
            .map(VaultFileDisk::V2)
            .map_err(|err| format!("Invalid V2 vault format: {err}")),
        3 => serde_json::from_value::<VaultFileV3>(value)
            .map(VaultFileDisk::V3)
            .map_err(|err| format!("Invalid V3 vault format: {err}")),
        _ => Err(format!("Unsupported vault version: {version}")),
    }
}

fn unlock_with_passphrase(path: &Path, passphrase: &str) -> Result<UnlockPayload, String> {
    let file = read_vault_file(path)?;

    match file {
        VaultFileDisk::V1(v1) => {
            let salt = decode_base64(&v1.salt)?;
            let iv = decode_base64(&v1.iv)?;
            let mut ciphertext = decode_base64(&v1.data)?;
            let auth_tag = decode_base64(&v1.auth_tag)?;
            ciphertext.extend(auth_tag);

            let key = derive_key(passphrase, &salt);
            let plaintext = decrypt_payload(&key, &iv, &ciphertext)?;
            let data: VaultData = serde_json::from_slice(&plaintext)
                .map_err(|err| format!("Invalid decrypted vault payload: {err}"))?;

            Ok(UnlockPayload {
                data,
                key,
                salt,
                has_recovery_key: false,
                recovery_salt: None,
                needs_rewrite: v1.version < CURRENT_VAULT_VERSION,
            })
        }
        VaultFileDisk::V2(v2) => {
            let salt = decode_base64(&v2.salt)?;
            let iv = decode_base64(&v2.iv)?;
            let ciphertext = decode_base64(&v2.data)?;
            let key = derive_key(passphrase, &salt);
            let plaintext = decrypt_payload(&key, &iv, &ciphertext)?;
            let data: VaultData = serde_json::from_slice(&plaintext)
                .map_err(|err| format!("Invalid decrypted vault payload: {err}"))?;

            Ok(UnlockPayload {
                data,
                key,
                salt,
                has_recovery_key: false,
                recovery_salt: None,
                needs_rewrite: v2.version < CURRENT_VAULT_VERSION,
            })
        }
        VaultFileDisk::V3(v3) => {
            let salt = decode_base64(&v3.salt)?;
            let iv = decode_base64(&v3.iv)?;
            let ciphertext = decode_base64(&v3.data)?;
            let key = derive_key(passphrase, &salt);
            let plaintext = decrypt_payload(&key, &iv, &ciphertext)?;
            let data: VaultData = serde_json::from_slice(&plaintext)
                .map_err(|err| format!("Invalid decrypted vault payload: {err}"))?;

            let recovery_salt = if let Some(recovery) = &v3.recovery {
                Some(decode_base64(&recovery.salt)?)
            } else {
                None
            };

            Ok(UnlockPayload {
                data,
                key,
                salt,
                has_recovery_key: v3.recovery.is_some(),
                recovery_salt,
                needs_rewrite: false,
            })
        }
    }
}

fn unlock_with_recovery_key(
    path: &Path,
    recovery_key_plain: &str,
) -> Result<RecoveryUnlockPayload, String> {
    let v3 = match read_vault_file(path)? {
        VaultFileDisk::V3(v3) => v3,
        _ => return Err("Vault has no recovery key configured".to_string()),
    };

    let recovery = v3
        .recovery
        .ok_or_else(|| "Vault has no recovery key configured".to_string())?;

    let recovery_salt = decode_base64(&recovery.salt)?;
    let recovery_iv = decode_base64(&recovery.iv)?;
    let recovery_ciphertext = decode_base64(&recovery.data)?;
    let recovery_key = derive_key(recovery_key_plain, &recovery_salt);
    let plaintext = decrypt_payload(&recovery_key, &recovery_iv, &recovery_ciphertext)
        .map_err(|_| "Invalid recovery key".to_string())?;
    let data: VaultData = serde_json::from_slice(&plaintext)
        .map_err(|err| format!("Invalid decrypted vault payload: {err}"))?;
    let salt = decode_base64(&v3.salt)?;

    Ok(RecoveryUnlockPayload {
        data,
        salt,
        recovery_salt,
        recovery_key,
    })
}

fn save_vault(path: &Path, vault: &VaultRuntime) -> Result<(), String> {
    let data = vault
        .data
        .as_ref()
        .ok_or_else(|| "Cannot save: vault is locked".to_string())?;
    let key = vault
        .key
        .as_ref()
        .ok_or_else(|| "Cannot save: vault has no passphrase key".to_string())?;
    let salt = vault
        .salt
        .as_ref()
        .ok_or_else(|| "Cannot save: vault has no salt".to_string())?;

    let plaintext =
        serde_json::to_vec(data).map_err(|err| format!("Failed to serialize vault data: {err}"))?;
    let (iv, ciphertext) = encrypt_payload(key, &plaintext)?;

    let mut file = VaultFileV3 {
        version: CURRENT_VAULT_VERSION,
        salt: encode_base64(salt),
        iv: encode_base64(&iv),
        data: encode_base64(&ciphertext),
        recovery: None,
    };

    if let (Some(recovery_key), Some(recovery_salt)) = (&vault.recovery_key, &vault.recovery_salt) {
        let (recovery_iv, recovery_ciphertext) = encrypt_payload(recovery_key, &plaintext)?;
        file.recovery = Some(VaultRecoveryBlob {
            salt: encode_base64(recovery_salt),
            iv: encode_base64(&recovery_iv),
            data: encode_base64(&recovery_ciphertext),
        });
    } else if vault.recovery_salt.is_some() {
        if let Ok(VaultFileDisk::V3(existing)) = read_vault_file(path) {
            file.recovery = existing.recovery;
        }
    }

    ensure_parent_dir(path)?;
    let serialized = serde_json::to_string_pretty(&file)
        .map_err(|err| format!("Failed to serialize vault file: {err}"))?;
    fs::write(path, serialized).map_err(|err| format!("Failed to write {}: {err}", path.display()))
}

fn has_recovery_key_on_disk(path: &Path) -> Result<bool, String> {
    if !path.exists() {
        return Ok(false);
    }

    match read_vault_file(path)? {
        VaultFileDisk::V3(v3) => Ok(v3.recovery.is_some()),
        _ => Ok(false),
    }
}

fn lock_vault_runtime(vault: &mut VaultRuntime) {
    vault.unlocked = false;
    vault.data = None;
    vault.key = None;
    vault.salt = None;
    vault.recovery_key = None;
    vault.recovery_salt = None;
}

fn to_profile_info(profile: &Profile) -> ProfileInfo {
    ProfileInfo {
        id: profile.id.clone(),
        name: profile.name.clone(),
        provider: profile.provider.clone(),
        endpoint: profile.endpoint.clone(),
        region: profile.region.clone(),
        default_bucket: profile.default_bucket.clone(),
        created_at: profile.created_at.clone(),
        updated_at: profile.updated_at.clone(),
    }
}

fn profile_infos(vault: &VaultRuntime) -> Vec<ProfileInfo> {
    vault
        .data
        .as_ref()
        .map(|data| data.profiles.iter().map(to_profile_info).collect())
        .unwrap_or_default()
}

fn ensure_unlocked(vault: &VaultRuntime) -> Result<(), String> {
    if !vault.unlocked || vault.data.is_none() {
        return Err("Vault is locked".to_string());
    }
    Ok(())
}

fn ensure_writable(vault: &VaultRuntime) -> Result<(), String> {
    ensure_unlocked(vault)?;
    if vault.key.is_none() || vault.salt.is_none() {
        return Err("Vault must be rekeyed before writing".to_string());
    }
    Ok(())
}

fn load_favorites_from_disk() -> Vec<String> {
    let Ok(path) = favorites_path() else {
        return Vec::new();
    };
    if !path.exists() {
        return Vec::new();
    }

    match fs::read_to_string(path) {
        Ok(raw) => serde_json::from_str::<Vec<String>>(&raw).unwrap_or_default(),
        Err(_) => Vec::new(),
    }
}

fn save_favorites_to_disk(favorites: &[String]) -> Result<(), String> {
    let path = favorites_path()?;
    let payload = serde_json::to_string(favorites)
        .map_err(|err| format!("Failed to serialize favorites: {err}"))?;
    write_atomic(&path, payload.as_bytes())
}

fn is_terminal_job_status(status: JobStatus) -> bool {
    matches!(
        status,
        JobStatus::Completed | JobStatus::Failed | JobStatus::Cancelled
    )
}

fn load_job_history_from_disk() -> Vec<JobInfo> {
    let Ok(path) = job_history_path() else {
        return Vec::new();
    };
    if !path.exists() {
        return Vec::new();
    }

    let Ok(raw) = fs::read_to_string(path) else {
        return Vec::new();
    };
    let Ok(mut history) = serde_json::from_str::<Vec<JobInfo>>(&raw) else {
        return Vec::new();
    };

    history.retain(|job| is_terminal_job_status(job.status));
    if history.len() > JOB_HISTORY_MAX {
        history.truncate(JOB_HISTORY_MAX);
    }
    history
}

fn save_job_history_to_disk(history: &[JobInfo]) -> Result<(), String> {
    let path = job_history_path()?;
    let payload = serde_json::to_string(history)
        .map_err(|err| format!("Failed to serialize job history: {err}"))?;
    write_atomic(&path, payload.as_bytes())
}

fn load_folder_sync_rules_from_disk() -> Vec<Value> {
    let Ok(path) = folder_sync_rules_path() else {
        return Vec::new();
    };
    if !path.exists() {
        return Vec::new();
    }

    match fs::read_to_string(path) {
        Ok(raw) => serde_json::from_str::<Vec<Value>>(&raw).unwrap_or_default(),
        Err(_) => Vec::new(),
    }
}

fn save_folder_sync_rules_to_disk(rules: &[Value]) -> Result<(), String> {
    let path = folder_sync_rules_path()?;
    let payload = serde_json::to_string_pretty(rules)
        .map_err(|err| format!("Failed to serialize folder sync rules: {err}"))?;
    write_atomic(&path, payload.as_bytes())
}

fn remove_folder_sync_file_records(rule_id: &str) {
    if let Ok(path) = folder_sync_records_path(rule_id) {
        let _ = fs::remove_file(path);
    }
}

fn load_folder_sync_rules_records() -> Vec<FolderSyncRuleRecord> {
    load_folder_sync_rules_from_disk()
        .into_iter()
        .filter_map(|value| serde_json::from_value::<FolderSyncRuleRecord>(value).ok())
        .collect()
}

fn save_folder_sync_rules_records(rules: &[FolderSyncRuleRecord]) -> Result<(), String> {
    let values: Vec<Value> = rules
        .iter()
        .map(serde_json::to_value)
        .collect::<Result<Vec<_>, _>>()
        .map_err(|err| format!("Failed to serialize folder sync rules: {err}"))?;
    save_folder_sync_rules_to_disk(&values)
}

fn get_folder_sync_rule(rule_id: &str) -> Result<FolderSyncRuleRecord, String> {
    load_folder_sync_rules_records()
        .into_iter()
        .find(|rule| rule.id == rule_id)
        .ok_or_else(|| format!("Rule not found: {rule_id}"))
}

fn load_folder_sync_file_records(rule_id: &str) -> Vec<FolderSyncFileRecord> {
    let Ok(path) = folder_sync_records_path(rule_id) else {
        return Vec::new();
    };
    if !path.exists() {
        return Vec::new();
    }

    match fs::read_to_string(path) {
        Ok(raw) => serde_json::from_str::<Vec<FolderSyncFileRecord>>(&raw).unwrap_or_default(),
        Err(_) => Vec::new(),
    }
}

fn save_folder_sync_file_records(
    rule_id: &str,
    records: &[FolderSyncFileRecord],
) -> Result<(), String> {
    let path = folder_sync_records_path(rule_id)?;
    let payload = serde_json::to_string(records)
        .map_err(|err| format!("Failed to serialize folder sync records: {err}"))?;
    write_atomic(&path, payload.as_bytes())
}

fn update_folder_sync_file_record(
    rule_id: &str,
    record: FolderSyncFileRecord,
) -> Result<(), String> {
    let mut records = load_folder_sync_file_records(rule_id);
    if let Some(existing) = records
        .iter_mut()
        .find(|existing| existing.relative_path == record.relative_path)
    {
        *existing = record;
    } else {
        records.push(record);
    }
    save_folder_sync_file_records(rule_id, &records)
}

fn remove_folder_sync_file_record(rule_id: &str, relative_path: &str) -> Result<(), String> {
    let mut records = load_folder_sync_file_records(rule_id);
    records.retain(|record| record.relative_path != relative_path);
    save_folder_sync_file_records(rule_id, &records)
}

fn update_folder_sync_rule_result(
    rule_id: &str,
    sync_status: Option<&str>,
    sync_error: Option<&str>,
) -> Result<(), String> {
    let mut rules = load_folder_sync_rules_records();
    let Some(rule) = rules.iter_mut().find(|rule| rule.id == rule_id) else {
        return Ok(());
    };

    rule.last_sync_at = Some(now_iso());
    rule.last_sync_status = sync_status.map(str::to_string);
    rule.last_sync_error = sync_error.map(str::to_string);
    save_folder_sync_rules_records(&rules)
}

fn normalize_prefix(prefix: &str) -> String {
    if prefix.is_empty() {
        String::new()
    } else if prefix.ends_with('/') {
        prefix.to_string()
    } else {
        format!("{prefix}/")
    }
}

fn map_str<'a>(map: &'a Map<String, Value>, key: &str) -> Option<&'a str> {
    map.get(key).and_then(Value::as_str)
}

fn keyring_entry() -> Result<Entry, String> {
    Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT)
        .map_err(|err| format!("OS keychain unavailable: {err}"))
}

fn read_stored_passphrase() -> KeychainReadResult {
    let entry = match keyring_entry() {
        Ok(entry) => entry,
        Err(err) => return KeychainReadResult::Unavailable(err),
    };

    match entry.get_password() {
        Ok(passphrase) => KeychainReadResult::Available(Some(passphrase)),
        Err(keyring::Error::NoEntry) => KeychainReadResult::Available(None),
        Err(err) => KeychainReadResult::Unavailable(format!("OS keychain read failed: {err}")),
    }
}

fn store_passphrase(passphrase: &str) -> Result<(), String> {
    let entry = keyring_entry()?;
    entry
        .set_password(passphrase)
        .map_err(|err| format!("Failed to save passphrase in OS keychain: {err}"))
}

fn clear_stored_passphrase() -> Result<bool, String> {
    let entry = keyring_entry()?;
    let had_stored = match entry.get_password() {
        Ok(_) => true,
        Err(keyring::Error::NoEntry) => false,
        Err(_) => false,
    };

    match entry.delete_credential() {
        Ok(()) => Ok(had_stored),
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(err) => Err(format!("Failed to clear OS keychain entry: {err}")),
    }
}

fn to_s3_client(profile: &Profile) -> Result<S3Client, String> {
    if profile.access_key_id.trim().is_empty() || profile.secret_access_key.trim().is_empty() {
        return Err("Profile credentials are missing".to_string());
    }

    let region = profile
        .region
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("us-east-1");

    let credentials = Credentials::new(
        profile.access_key_id.clone(),
        profile.secret_access_key.clone(),
        profile.session_token.clone(),
        None,
        "object0",
    );

    let mut config_builder = aws_sdk_s3::config::Builder::new()
        .behavior_version_latest()
        .region(Region::new(region.to_string()))
        .credentials_provider(credentials);

    if let Some(endpoint) = profile
        .endpoint
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        config_builder = config_builder.endpoint_url(endpoint.to_string());
    }

    if matches!(profile.provider, S3Provider::Minio | S3Provider::Custom) {
        config_builder = config_builder.force_path_style(true);
    }

    Ok(S3Client::from_conf(config_builder.build()))
}

fn s3_datetime_to_iso(dt: &aws_sdk_s3::primitives::DateTime) -> String {
    dt.to_millis()
        .ok()
        .and_then(chrono::DateTime::<Utc>::from_timestamp_millis)
        .map(|value| value.to_rfc3339())
        .unwrap_or_else(now_iso)
}

fn profile_for_id(state: &AppState, profile_id: &str) -> Result<Profile, String> {
    let vault = lock_state(&state.vault)?;
    ensure_unlocked(&vault)?;
    let data = vault
        .data
        .as_ref()
        .ok_or_else(|| "Vault is locked".to_string())?;
    data.profiles
        .iter()
        .find(|profile| profile.id == profile_id)
        .cloned()
        .ok_or_else(|| format!("Profile not found: {profile_id}"))
}

// Convenience for the common "look up the profile, then build its S3 client" pair.
// Use the two-step form directly when the profile itself is needed afterwards.
fn s3_client_for_profile(state: &AppState, profile_id: &str) -> Result<S3Client, String> {
    let profile = profile_for_id(state, profile_id)?;
    to_s3_client(&profile)
}

fn expand_user_path(path: &str) -> PathBuf {
    if let Some(stripped) = path.strip_prefix("~/") {
        if let Ok(home) = std::env::var("HOME") {
            return PathBuf::from(home).join(stripped);
        }
    }
    PathBuf::from(path)
}

fn sanitize_relative_path(relative_path: &str) -> Option<PathBuf> {
    // Reject backslashes outright. On non-Windows builds `\` is NOT a path
    // separator, so a key like `..\..\secret` would slip past the component
    // check below yet still traverse when the same key is handled on Windows.
    if relative_path.contains('\\') {
        return None;
    }
    let candidate = Path::new(relative_path);
    // Require every component to be a plain file/dir name. This rejects, in one
    // check: absolute paths, the root dir, the `.`/`..` segments, and Windows
    // drive prefixes (e.g. `C:foo`, which parses as a `Prefix` component there).
    if candidate
        .components()
        .all(|component| matches!(component, Component::Normal(_)))
    {
        Some(candidate.to_path_buf())
    } else {
        None
    }
}

fn normalize_slashes(path: &Path) -> String {
    path.components()
        .filter_map(|part| match part {
            Component::Normal(value) => Some(value.to_string_lossy().to_string()),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("/")
}

fn join_prefix_key(prefix: &str, key: &str) -> String {
    format!("{}{}", normalize_prefix(prefix), key)
}

fn wildcard_matches(pattern: &str, text: &str) -> bool {
    let pattern = pattern.as_bytes();
    let text = text.as_bytes();

    let mut p: usize = 0;
    let mut t: usize = 0;
    let mut star_pat: Option<usize> = None;
    let mut star_text: usize = 0;

    while t < text.len() {
        if p < pattern.len() && (pattern[p] == b'?' || pattern[p] == text[t]) {
            p += 1;
            t += 1;
        } else if p < pattern.len() && pattern[p] == b'*' {
            while p < pattern.len() && pattern[p] == b'*' {
                p += 1;
            }
            star_pat = Some(p);
            star_text = t;
        } else if let Some(saved_p) = star_pat {
            star_text += 1;
            t = star_text;
            p = saved_p;
        } else {
            return false;
        }
    }

    while p < pattern.len() && pattern[p] == b'*' {
        p += 1;
    }

    p == pattern.len()
}

fn is_excluded_path(relative_path: &str, patterns: &[String]) -> bool {
    let normalized = relative_path.replace('\\', "/");
    let basename = normalized.rsplit('/').next().unwrap_or_default();

    patterns.iter().any(|pattern| {
        let pat = pattern.replace('\\', "/");
        wildcard_matches(&pat, &normalized) || wildcard_matches(&pat, basename)
    })
}

fn file_mtime_millis(path: &Path) -> Option<i64> {
    fs::metadata(path)
        .ok()
        .and_then(|meta| meta.modified().ok())
        .and_then(|mtime| mtime.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
}

fn scan_local_directory(local_path: &Path, exclude_patterns: &[String]) -> Vec<LocalFileInfo> {
    let mut files = Vec::new();
    if !local_path.exists() {
        return files;
    }

    for entry in WalkDir::new(local_path)
        .follow_links(false)
        .into_iter()
        .filter_map(Result::ok)
    {
        if !entry.file_type().is_file() {
            continue;
        }

        let Ok(relative) = entry.path().strip_prefix(local_path) else {
            continue;
        };
        let relative_path = normalize_slashes(relative);
        if relative_path.is_empty() || is_excluded_path(&relative_path, exclude_patterns) {
            continue;
        }

        let size = entry.metadata().map(|m| m.len() as i64).unwrap_or(0).max(0);
        // The file was just walked, so a stat failure is rare; epoch is an
        // acceptable "treat as changed" fallback for change detection here.
        let mtime_ms = file_mtime_millis(entry.path()).unwrap_or(0);

        files.push(LocalFileInfo {
            relative_path,
            size,
            mtime_ms,
        });
    }

    files
}

fn parse_iso_millis(value: &str) -> Option<i64> {
    chrono::DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|dt| dt.timestamp_millis())
}

fn resolve_folder_sync_conflict(
    local: &LocalFileInfo,
    remote: &RemoteFileInfo,
    conflict_resolution: ConflictResolution,
) -> (String, String) {
    match conflict_resolution {
        ConflictResolution::LocalWins => (
            "upload".to_string(),
            "Conflict resolved: local wins".to_string(),
        ),
        ConflictResolution::RemoteWins => (
            "download".to_string(),
            "Conflict resolved: remote wins".to_string(),
        ),
        ConflictResolution::NewerWins => match parse_iso_millis(&remote.last_modified) {
            Some(remote_ms) if local.mtime_ms >= remote_ms => (
                "upload".to_string(),
                "Conflict resolved: local is newer".to_string(),
            ),
            Some(_) => (
                "download".to_string(),
                "Conflict resolved: remote is newer".to_string(),
            ),
            // Remote timestamp unparseable: don't guess a winner, surface a conflict.
            None => (
                "conflict".to_string(),
                "Both sides changed (remote timestamp unparseable)".to_string(),
            ),
        },
        _ => ("conflict".to_string(), "Both sides changed".to_string()),
    }
}

fn resolve_folder_sync_action(
    local: Option<&LocalFileInfo>,
    remote: Option<&RemoteFileInfo>,
    known: Option<&FolderSyncFileRecord>,
    direction: SyncDirection,
    conflict_resolution: ConflictResolution,
) -> Option<(String, String)> {
    match (local, remote) {
        (Some(local), Some(remote)) => {
            if let Some(known) = known {
                let local_changed =
                    local.size != known.local_size || local.mtime_ms != known.local_mtime;
                let remote_changed =
                    remote.etag != known.remote_etag || remote.size != known.remote_size;

                if !local_changed && !remote_changed {
                    return None;
                }

                if local_changed && !remote_changed {
                    if direction == SyncDirection::RemoteToLocal {
                        return None;
                    }
                    return Some(("upload".to_string(), "Local file changed".to_string()));
                }

                if !local_changed && remote_changed {
                    if direction == SyncDirection::LocalToRemote {
                        return None;
                    }
                    return Some(("download".to_string(), "Remote file changed".to_string()));
                }

                Some(resolve_folder_sync_conflict(
                    local,
                    remote,
                    conflict_resolution,
                ))
            } else if local.size == remote.size {
                None
            } else {
                Some(resolve_folder_sync_conflict(
                    local,
                    remote,
                    conflict_resolution,
                ))
            }
        }
        (Some(_local), None) => {
            if known.is_some() {
                if direction == SyncDirection::LocalToRemote {
                    Some((
                        "upload".to_string(),
                        "Re-upload (remote deleted)".to_string(),
                    ))
                } else {
                    Some(("delete-local".to_string(), "Remote deleted".to_string()))
                }
            } else if direction == SyncDirection::RemoteToLocal {
                None
            } else {
                Some(("upload".to_string(), "New local file".to_string()))
            }
        }
        (None, Some(_remote)) => {
            if known.is_some() {
                if direction == SyncDirection::RemoteToLocal {
                    Some((
                        "download".to_string(),
                        "Re-download (local deleted)".to_string(),
                    ))
                } else {
                    Some(("delete-remote".to_string(), "Local deleted".to_string()))
                }
            } else if direction == SyncDirection::LocalToRemote {
                None
            } else {
                Some(("download".to_string(), "New remote file".to_string()))
            }
        }
        (None, None) => None,
    }
}

async fn generate_folder_sync_diff_for_rule(
    rule: &FolderSyncRuleRecord,
    client: &S3Client,
    known_records: &[FolderSyncFileRecord],
) -> Result<FolderSyncDiffRecord, String> {
    let local_root = expand_user_path(&rule.local_path);
    let local_files = scan_local_directory(&local_root, &rule.exclude_patterns);

    let bucket_prefix = normalize_prefix(&rule.bucket_prefix);
    let remote_objects = s3_list_all_objects(client, &rule.bucket, &bucket_prefix).await?;

    let mut local_map: HashMap<String, LocalFileInfo> = HashMap::new();
    for local in local_files {
        local_map.insert(local.relative_path.clone(), local);
    }

    let mut remote_map: HashMap<String, RemoteFileInfo> = HashMap::new();
    for RemoteObject {
        key,
        size,
        etag,
        last_modified,
    } in remote_objects
    {
        let relative = if bucket_prefix.is_empty() {
            key.clone()
        } else if key.starts_with(&bucket_prefix) {
            key[bucket_prefix.len()..].to_string()
        } else {
            continue;
        };

        if relative.is_empty() || relative.ends_with('/') {
            continue;
        }
        if is_excluded_path(&relative, &rule.exclude_patterns) {
            continue;
        }

        remote_map.insert(
            relative,
            RemoteFileInfo {
                size: size.max(0),
                etag,
                last_modified,
            },
        );
    }

    let mut known_map: HashMap<String, FolderSyncFileRecord> = HashMap::new();
    for known in known_records {
        known_map.insert(known.relative_path.clone(), known.clone());
    }

    let mut all_paths: HashSet<String> = HashSet::new();
    all_paths.extend(local_map.keys().cloned());
    all_paths.extend(remote_map.keys().cloned());
    all_paths.extend(known_map.keys().cloned());

    let mut paths: Vec<String> = all_paths.into_iter().collect();
    paths.sort();

    let mut diff = FolderSyncDiffRecord {
        uploads: Vec::new(),
        downloads: Vec::new(),
        delete_local: Vec::new(),
        delete_remote: Vec::new(),
        conflicts: Vec::new(),
        unchanged: 0,
    };

    for path in paths {
        if is_excluded_path(&path, &rule.exclude_patterns) {
            continue;
        }

        let local = local_map.get(&path);
        let remote = remote_map.get(&path);
        let known = known_map.get(&path);

        let Some((action, reason)) = resolve_folder_sync_action(
            local,
            remote,
            known,
            rule.direction,
            rule.conflict_resolution,
        ) else {
            diff.unchanged += 1;
            continue;
        };

        let entry = FolderSyncDiffEntryRecord {
            relative_path: path.clone(),
            action: action.clone(),
            reason,
            local_size: local.map(|v| v.size),
            local_mtime: local.map(|v| v.mtime_ms),
            remote_size: remote.map(|v| v.size),
            remote_last_modified: remote.map(|v| v.last_modified.clone()),
            remote_etag: remote.map(|v| v.etag.clone()),
        };

        match action.as_str() {
            "upload" => diff.uploads.push(entry),
            "download" => diff.downloads.push(entry),
            "delete-local" => diff.delete_local.push(entry),
            "delete-remote" => diff.delete_remote.push(entry),
            _ => diff.conflicts.push(entry),
        }
    }

    Ok(diff)
}

fn emit_folder_sync_status_event(app: &AppHandle, status: &FolderSyncStateRecord) {
    // FolderSyncStateRecord is camelCase Serialize; emit it directly as the event payload.
    let _ = app.emit("folder-sync:status", status);
}

fn emit_folder_sync_error_event(app: &AppHandle, rule_id: &str, error: &str) {
    let payload = FolderSyncErrorEventPayload {
        rule_id: rule_id.to_string(),
        error: error.to_string(),
    };
    let _ = app.emit("folder-sync:error", payload);
}

fn emit_folder_sync_conflict_event(
    app: &AppHandle,
    rule_id: &str,
    conflict: &FolderSyncDiffEntryRecord,
) {
    let payload = FolderSyncConflictEventPayload {
        rule_id: rule_id.to_string(),
        relative_path: conflict.relative_path.clone(),
        local_size: conflict.local_size.unwrap_or(0),
        local_mtime: conflict.local_mtime.unwrap_or(0),
        remote_size: conflict.remote_size.unwrap_or(0),
        remote_last_modified: conflict
            .remote_last_modified
            .clone()
            .unwrap_or_else(now_iso),
    };
    let _ = app.emit("folder-sync:conflict", payload);
}

fn set_and_emit_folder_sync_status(
    app: &AppHandle,
    rule_id: &str,
    status: FolderSyncStatus,
    files_watching: i64,
    last_change: Option<String>,
    current_file: Option<String>,
    progress: Option<FolderSyncProgress>,
) -> Result<(), String> {
    let record = FolderSyncStateRecord {
        rule_id: rule_id.to_string(),
        status,
        files_watching: files_watching.max(0),
        last_change,
        current_file,
        progress,
    };

    let status_changed = {
        let state = app.state::<AppState>();
        let mut runtime = lock_state(&state.folder_sync)?;
        let prev = runtime.statuses.get(rule_id).map(|r| r.status);
        runtime.statuses.insert(rule_id.to_string(), record.clone());
        prev != Some(status)
    };

    emit_folder_sync_status_event(app, &record);

    // Worker threads can transition a rule (e.g. → "paused") without going through an
    // RPC handler, which is where the tray menu is normally rebuilt. Refresh the tray
    // on a status transition so its context menu doesn't go stale. Guarded on a real
    // status change to avoid rebuilding the menu on every progress tick.
    if status_changed {
        refresh_tray_menu(app);
    }

    Ok(())
}

fn folder_sync_statuses_snapshot(app: &AppHandle) -> Vec<FolderSyncStateRecord> {
    let state = app.state::<AppState>();
    let Ok(runtime) = lock_state(&state.folder_sync) else {
        return Vec::new();
    };

    let mut statuses: Vec<FolderSyncStateRecord> = runtime.statuses.values().cloned().collect();
    statuses.sort_by(|a, b| a.rule_id.cmp(&b.rule_id));
    statuses
}

fn calculate_percentage(transferred: i64, total: i64) -> i64 {
    if total <= 0 {
        0
    } else {
        (((transferred as f64) / (total as f64)) * 100.0).round() as i64
    }
}

fn job_to_progress_event(job: &JobInfo) -> JobProgressEvent {
    JobProgressEvent {
        job_id: job.id.clone(),
        job_type: job.job_type,
        status: job.status,
        file_name: job.file_name.clone(),
        bytes_transferred: job.bytes_transferred,
        bytes_total: job.bytes_total,
        percentage: job.percentage,
        speed: job.speed,
        eta: job.eta,
        error: job.error.clone(),
    }
}

fn emit_job_progress_event(app: &AppHandle, job: &JobInfo) {
    let _ = app.emit("job:progress", job_to_progress_event(job));
}

fn emit_job_complete_event(app: &AppHandle, job: &JobInfo) {
    let complete = JobCompleteEvent {
        job_id: job.id.clone(),
        file_name: Some(job.file_name.clone()),
        success: job.status == JobStatus::Completed,
        error: job.error.clone(),
    };
    let _ = app.emit("job:complete", complete);
}

fn emit_update_available_event(
    app: &AppHandle,
    version: &str,
    update_available: bool,
    update_ready: bool,
) {
    let payload = UpdateAvailableEventPayload {
        version: version.to_string(),
        update_available,
        update_ready,
    };
    let _ = app.emit("update:available", payload);
}

fn update_job_progress(
    app: &AppHandle,
    job_id: &str,
    transferred: i64,
    total: i64,
    speed: i64,
    eta: i64,
) {
    let mut snapshot: Option<JobInfo> = None;
    let state = app.state::<AppState>();
    if let Ok(mut jobs) = lock_state(&state.jobs) {
        if let Some(job) = jobs.jobs.get_mut(job_id) {
            job.bytes_transferred = transferred.max(0);
            if total >= 0 {
                job.bytes_total = total;
            }
            job.percentage = calculate_percentage(job.bytes_transferred, job.bytes_total);
            job.speed = speed.max(0);
            job.eta = eta.max(0);
            snapshot = Some(job.clone());
        }
    }
    if let Some(job) = snapshot {
        emit_job_progress_event(app, &job);
    }
}

fn finish_job(
    app: &AppHandle,
    job_id: &str,
    status: JobStatus,
    error: Option<String>,
    bytes_transferred: Option<i64>,
) {
    let mut snapshot: Option<JobInfo> = None;
    let state = app.state::<AppState>();
    if let Ok(mut jobs) = lock_state(&state.jobs) {
        jobs.running.remove(job_id);
        jobs.cancel_flags.remove(job_id);
        if let Some(job) = jobs.jobs.get_mut(job_id) {
            job.status = status;
            if let Some(transferred) = bytes_transferred {
                job.bytes_transferred = transferred.max(0);
                if job.bytes_total <= 0 {
                    job.bytes_total = transferred.max(0);
                }
                job.percentage = calculate_percentage(job.bytes_transferred, job.bytes_total);
            }
            if matches!(status, JobStatus::Completed) {
                if job.bytes_total > 0 {
                    job.bytes_transferred = job.bytes_total;
                    job.percentage = 100;
                }
            }
            job.error = error;
            job.completed_at = Some(now_iso());
            snapshot = Some(job.clone());
        }
    }
    if let Some(job) = snapshot {
        emit_job_progress_event(app, &job);
        emit_job_complete_event(app, &job);
    }
    persist_job_history_snapshot(app);
}

fn persist_job_history_snapshot(app: &AppHandle) {
    let history = {
        let state = app.state::<AppState>();
        let Ok(jobs) = lock_state(&state.jobs) else {
            return;
        };

        let mut collected = Vec::new();
        for id in &jobs.order {
            let Some(job) = jobs.jobs.get(id) else {
                continue;
            };
            if !is_terminal_job_status(job.status) || jobs.running.contains(id) {
                continue;
            }
            collected.push(job.clone());
            if collected.len() >= JOB_HISTORY_MAX {
                break;
            }
        }
        collected
    };

    let _ = save_job_history_to_disk(&history);
}

fn hydrate_job_history_runtime(app: &AppHandle) {
    let history = load_job_history_from_disk();
    if history.is_empty() {
        return;
    }

    let state = app.state::<AppState>();
    let Ok(mut jobs) = lock_state(&state.jobs) else {
        return;
    };

    for job in history {
        if !is_terminal_job_status(job.status) {
            continue;
        }
        let id = job.id.clone();
        if jobs.jobs.contains_key(&id) {
            continue;
        }
        jobs.order.push(id.clone());
        jobs.jobs.insert(id, job);
    }

    if jobs.order.len() > JOB_HISTORY_MAX {
        jobs.order.truncate(JOB_HISTORY_MAX);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
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

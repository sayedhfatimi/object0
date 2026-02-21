use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use aws_sdk_s3::{
    config::{Credentials, Region},
    presigning::PresigningConfig,
    primitives::ByteStream,
    types::{CompletedMultipartUpload, CompletedPart, Delete, ObjectIdentifier},
    Client as S3Client,
};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use chrono::{Duration, Utc};
use flate2::{write::GzEncoder, Compression};
use keyring::Entry;
use notify::{recommended_watcher, RecursiveMode, Watcher};
use pbkdf2::pbkdf2_hmac;
use percent_encoding::{utf8_percent_encode, AsciiSet, NON_ALPHANUMERIC};
use rand::RngCore;
use rfd::FileDialog;
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use sha2::Sha512;
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

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Profile {
    id: String,
    name: String,
    provider: String,
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
    provider: String,
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
    #[allow(dead_code)]
    created_at: String,
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
    direction: String,
    enabled: bool,
    conflict_resolution: String,
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
    status: String,
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
struct FolderSyncStatusEventPayload {
    rule_id: String,
    status: String,
    files_watching: i64,
    last_change: Option<String>,
    current_file: Option<String>,
    progress: Option<FolderSyncProgress>,
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
    provider: String,
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
    provider: String,
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
    provider: String,
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
    mode: String,
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
    mode: String,
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

fn lock<'a, T>(mutex: &'a Mutex<T>) -> Result<std::sync::MutexGuard<'a, T>, String> {
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

fn object0_config_dir() -> Result<PathBuf, String> {
    let home = if cfg!(target_os = "windows") {
        std::env::var("USERPROFILE")
            .or_else(|_| std::env::var("HOME"))
            .map_err(|_| "Unable to resolve USERPROFILE/HOME".to_string())?
    } else {
        std::env::var("HOME").map_err(|_| "Unable to resolve HOME".to_string())?
    };

    let mut path = PathBuf::from(home);
    if cfg!(target_os = "macos") {
        path.push("Library");
        path.push("Application Support");
        path.push("object0");
    } else {
        path.push(".config");
        path.push("object0");
    }
    Ok(path)
}

fn vault_path() -> Result<PathBuf, String> {
    Ok(object0_config_dir()?.join("vault.enc"))
}

fn favorites_path() -> Result<PathBuf, String> {
    Ok(object0_config_dir()?.join("favorites.json"))
}

fn folder_sync_rules_path() -> Result<PathBuf, String> {
    Ok(object0_config_dir()?.join("folder-sync-rules.json"))
}

fn folder_sync_records_path(rule_id: &str) -> Result<PathBuf, String> {
    Ok(object0_config_dir()?
        .join("folder-sync")
        .join(format!("{rule_id}.json")))
}

fn job_history_path() -> Result<PathBuf, String> {
    Ok(object0_config_dir()?.join("job-history.json"))
}

fn ensure_parent_dir(path: &Path) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|err| format!("Failed to create {}: {err}", parent.display()))?;
    }
    Ok(())
}

fn random_bytes<const N: usize>() -> [u8; N] {
    let mut bytes = [0u8; N];
    rand::thread_rng().fill_bytes(&mut bytes);
    bytes
}

fn encode_base64(bytes: &[u8]) -> String {
    BASE64.encode(bytes)
}

fn decode_base64(input: &str) -> Result<Vec<u8>, String> {
    BASE64
        .decode(input)
        .map_err(|err| format!("Invalid base64 payload: {err}"))
}

fn derive_key(passphrase: &str, salt: &[u8]) -> [u8; KEY_BYTES] {
    let mut key = [0u8; KEY_BYTES];
    pbkdf2_hmac::<Sha512>(passphrase.as_bytes(), salt, PBKDF2_ITERATIONS, &mut key);
    key
}

fn encrypt_payload(key: &[u8; KEY_BYTES], plaintext: &[u8]) -> Result<(Vec<u8>, Vec<u8>), String> {
    let cipher =
        Aes256Gcm::new_from_slice(key).map_err(|err| format!("Invalid encryption key: {err}"))?;
    let iv = random_bytes::<IV_BYTES>();
    let nonce = Nonce::from_slice(&iv);
    let ciphertext = cipher
        .encrypt(nonce, plaintext)
        .map_err(|_| "Vault encryption failed".to_string())?;

    Ok((iv.to_vec(), ciphertext))
}

fn decrypt_payload(key: &[u8; KEY_BYTES], iv: &[u8], ciphertext: &[u8]) -> Result<Vec<u8>, String> {
    if iv.len() != IV_BYTES {
        return Err("Invalid vault IV length".to_string());
    }

    let cipher =
        Aes256Gcm::new_from_slice(key).map_err(|err| format!("Invalid encryption key: {err}"))?;
    let nonce = Nonce::from_slice(iv);
    cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| "Invalid passphrase".to_string())
}

fn generate_recovery_key() -> String {
    const CHARS: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let bytes = random_bytes::<RECOVERY_KEY_LENGTH>();
    let mut key = String::with_capacity(RECOVERY_KEY_LENGTH + (RECOVERY_KEY_LENGTH / 4));

    for (idx, byte) in bytes.iter().enumerate() {
        if idx > 0 && idx % 4 == 0 {
            key.push('-');
        }
        key.push(CHARS[(*byte as usize) % CHARS.len()] as char);
    }

    key
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
    ensure_parent_dir(&path)?;
    let payload = serde_json::to_string(favorites)
        .map_err(|err| format!("Failed to serialize favorites: {err}"))?;
    fs::write(&path, payload).map_err(|err| format!("Failed to write {}: {err}", path.display()))
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
    ensure_parent_dir(&path)?;
    let payload = serde_json::to_string(history)
        .map_err(|err| format!("Failed to serialize job history: {err}"))?;
    fs::write(&path, payload).map_err(|err| format!("Failed to write {}: {err}", path.display()))
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
    ensure_parent_dir(&path)?;
    let payload = serde_json::to_string_pretty(rules)
        .map_err(|err| format!("Failed to serialize folder sync rules: {err}"))?;
    fs::write(&path, payload).map_err(|err| format!("Failed to write {}: {err}", path.display()))
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
    ensure_parent_dir(&path)?;
    let payload = serde_json::to_string(records)
        .map_err(|err| format!("Failed to serialize folder sync records: {err}"))?;
    fs::write(&path, payload).map_err(|err| format!("Failed to write {}: {err}", path.display()))
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

    if matches!(profile.provider.as_str(), "minio" | "custom") {
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
    let vault = lock(&state.vault)?;
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

fn expand_user_path(path: &str) -> PathBuf {
    if let Some(stripped) = path.strip_prefix("~/") {
        if let Ok(home) = std::env::var("HOME") {
            return PathBuf::from(home).join(stripped);
        }
    }
    PathBuf::from(path)
}

fn sanitize_relative_path(relative_path: &str) -> Option<PathBuf> {
    let candidate = Path::new(relative_path);
    if candidate.is_absolute() {
        return None;
    }
    if candidate
        .components()
        .any(|c| matches!(c, Component::ParentDir))
    {
        return None;
    }
    Some(candidate.to_path_buf())
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

fn file_mtime_millis(path: &Path) -> i64 {
    fs::metadata(path)
        .ok()
        .and_then(|meta| meta.modified().ok())
        .and_then(|mtime| mtime.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
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
        let mtime_ms = file_mtime_millis(entry.path());

        files.push(LocalFileInfo {
            relative_path,
            size,
            mtime_ms,
        });
    }

    files
}

fn parse_iso_millis(value: &str) -> i64 {
    chrono::DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|dt| dt.timestamp_millis())
        .unwrap_or(0)
}

fn resolve_folder_sync_conflict(
    local: &LocalFileInfo,
    remote: &RemoteFileInfo,
    conflict_resolution: &str,
) -> (String, String) {
    match conflict_resolution {
        "local-wins" => (
            "upload".to_string(),
            "Conflict resolved: local wins".to_string(),
        ),
        "remote-wins" => (
            "download".to_string(),
            "Conflict resolved: remote wins".to_string(),
        ),
        "newer-wins" => {
            if local.mtime_ms >= parse_iso_millis(&remote.last_modified) {
                (
                    "upload".to_string(),
                    "Conflict resolved: local is newer".to_string(),
                )
            } else {
                (
                    "download".to_string(),
                    "Conflict resolved: remote is newer".to_string(),
                )
            }
        }
        _ => ("conflict".to_string(), "Both sides changed".to_string()),
    }
}

fn resolve_folder_sync_action(
    local: Option<&LocalFileInfo>,
    remote: Option<&RemoteFileInfo>,
    known: Option<&FolderSyncFileRecord>,
    direction: &str,
    conflict_resolution: &str,
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
                    if direction == "remote-to-local" {
                        return None;
                    }
                    return Some(("upload".to_string(), "Local file changed".to_string()));
                }

                if !local_changed && remote_changed {
                    if direction == "local-to-remote" {
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
                if direction == "local-to-remote" {
                    Some((
                        "upload".to_string(),
                        "Re-upload (remote deleted)".to_string(),
                    ))
                } else {
                    Some(("delete-local".to_string(), "Remote deleted".to_string()))
                }
            } else if direction == "remote-to-local" {
                None
            } else {
                Some(("upload".to_string(), "New local file".to_string()))
            }
        }
        (None, Some(_remote)) => {
            if known.is_some() {
                if direction == "remote-to-local" {
                    Some((
                        "download".to_string(),
                        "Re-download (local deleted)".to_string(),
                    ))
                } else {
                    Some(("delete-remote".to_string(), "Local deleted".to_string()))
                }
            } else if direction == "local-to-remote" {
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
    for (key, size, etag, last_modified) in remote_objects {
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
            &rule.direction,
            &rule.conflict_resolution,
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

fn folder_sync_status_payload(status: &FolderSyncStateRecord) -> FolderSyncStatusEventPayload {
    FolderSyncStatusEventPayload {
        rule_id: status.rule_id.clone(),
        status: status.status.clone(),
        files_watching: status.files_watching,
        last_change: status.last_change.clone(),
        current_file: status.current_file.clone(),
        progress: status.progress.clone(),
    }
}

fn emit_folder_sync_status_event(app: &AppHandle, status: &FolderSyncStateRecord) {
    let _ = app.emit("folder-sync:status", folder_sync_status_payload(status));
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

fn set_folder_sync_status(
    app: &AppHandle,
    rule_id: &str,
    status: &str,
    files_watching: i64,
    last_change: Option<String>,
    current_file: Option<String>,
    progress: Option<FolderSyncProgress>,
) -> Result<(), String> {
    let record = FolderSyncStateRecord {
        rule_id: rule_id.to_string(),
        status: status.to_string(),
        files_watching: files_watching.max(0),
        last_change,
        current_file,
        progress,
    };

    {
        let state = app.state::<AppState>();
        let mut runtime = lock(&state.folder_sync)?;
        runtime.statuses.insert(rule_id.to_string(), record.clone());
    }

    emit_folder_sync_status_event(app, &record);
    Ok(())
}

fn folder_sync_statuses_snapshot(app: &AppHandle) -> Vec<FolderSyncStateRecord> {
    let state = app.state::<AppState>();
    let Ok(runtime) = lock(&state.folder_sync) else {
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
    if let Ok(mut jobs) = lock(&state.jobs) {
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
    if let Ok(mut jobs) = lock(&state.jobs) {
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
        let Ok(jobs) = lock(&state.jobs) else {
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
    let Ok(mut jobs) = lock(&state.jobs) else {
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

fn env_var_non_empty(key: &str) -> Option<String> {
    std::env::var(key)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn env_updater_endpoints() -> Result<Option<Vec<Url>>, String> {
    let Some(raw) = env_var_non_empty("OBJECT0_UPDATER_ENDPOINTS") else {
        return Ok(None);
    };

    let mut endpoints = Vec::new();
    for candidate in raw
        .split(|ch: char| ch == ',' || ch == '\n' || ch == '\r')
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        let parsed = Url::parse(candidate).map_err(|err| {
            format!("Invalid updater endpoint in OBJECT0_UPDATER_ENDPOINTS ({candidate}): {err}")
        })?;
        endpoints.push(parsed);
    }

    if endpoints.is_empty() {
        return Ok(None);
    }

    Ok(Some(endpoints))
}

fn updater_local_info_endpoint() -> String {
    let Some(raw) = env_var_non_empty("OBJECT0_UPDATER_ENDPOINTS") else {
        return DEFAULT_UPDATER_ENDPOINT.to_string();
    };

    raw.split(|ch: char| ch == ',' || ch == '\n' || ch == '\r')
        .map(str::trim)
        .find(|value| !value.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| DEFAULT_UPDATER_ENDPOINT.to_string())
}

fn updater_local_info_base_url() -> String {
    let endpoint = updater_local_info_endpoint();
    let Ok(parsed) = Url::parse(&endpoint) else {
        return endpoint;
    };

    let Some(host) = parsed.host_str() else {
        return endpoint;
    };

    match parsed.port() {
        Some(port) => format!("{}://{}:{}", parsed.scheme(), host, port),
        None => format!("{}://{}", parsed.scheme(), host),
    }
}

fn updater_channel() -> String {
    env_var_non_empty("OBJECT0_UPDATER_CHANNEL")
        .unwrap_or_else(|| DEFAULT_UPDATER_CHANNEL.to_string())
}

fn configured_updater(app: &AppHandle) -> Result<tauri_plugin_updater::Updater, String> {
    let mut builder = app.updater_builder();

    if let Some(pubkey) = env_var_non_empty("OBJECT0_UPDATER_PUBKEY") {
        builder = builder.pubkey(pubkey);
    }

    if let Some(endpoints) = env_updater_endpoints()? {
        builder = builder
            .endpoints(endpoints)
            .map_err(|err| format!("Invalid updater endpoints: {err}"))?;
    }

    builder
        .build()
        .map_err(|err| format!("Updater unavailable: {err}"))
}

fn updater_cached_state(app: &AppHandle) -> (Option<String>, bool) {
    let state = app.state::<AppState>();
    let Ok(updater) = lock(&state.updater) else {
        return (None, false);
    };

    let version = updater.downloaded_version.clone();
    let ready = version.is_some() && updater.downloaded_bytes.is_some();
    (version, ready)
}

fn updater_store_downloaded(app: &AppHandle, version: String, bytes: Vec<u8>) {
    let state = app.state::<AppState>();
    let Ok(mut updater) = lock(&state.updater) else {
        return;
    };

    updater.downloaded_version = Some(version);
    updater.downloaded_bytes = Some(bytes);
}

fn updater_clear_downloaded(app: &AppHandle) {
    let state = app.state::<AppState>();
    let Ok(mut updater) = lock(&state.updater) else {
        return;
    };

    updater.downloaded_version = None;
    updater.downloaded_bytes = None;
}

fn updater_take_downloaded_if_version(app: &AppHandle, version: &str) -> Option<Vec<u8>> {
    let state = app.state::<AppState>();
    let Ok(mut updater) = lock(&state.updater) else {
        return None;
    };
    if updater.downloaded_version.as_deref() != Some(version) {
        return None;
    }

    updater.downloaded_version = None;
    updater.downloaded_bytes.take()
}

async fn download_update_if_available(app: &AppHandle) -> Result<bool, String> {
    let updater = configured_updater(app)?;
    let maybe_update = updater
        .check()
        .await
        .map_err(|err| format!("Update check failed: {err}"))?;

    let (cached_version, cached_ready) = updater_cached_state(app);
    let Some(update) = maybe_update else {
        if cached_ready {
            if let Some(version) = cached_version {
                emit_update_available_event(app, &version, true, true);
            }
            return Ok(true);
        }
        return Ok(false);
    };

    let version = update.version.clone();
    if cached_ready && cached_version.as_deref() == Some(version.as_str()) {
        emit_update_available_event(app, &version, true, true);
        return Ok(true);
    }

    let bytes = update
        .download(|_, _| {}, || {})
        .await
        .map_err(|err| format!("Update download failed: {err}"))?;

    updater_store_downloaded(app, version.clone(), bytes);
    emit_update_available_event(app, &version, true, true);
    Ok(true)
}

async fn apply_downloaded_update(app: &AppHandle) -> Result<(), String> {
    let updater = configured_updater(app)?;
    let update = updater
        .check()
        .await
        .map_err(|err| format!("Update check failed: {err}"))?
        .ok_or_else(|| "No update available to apply".to_string())?;

    let version = update.version.clone();
    let bytes = if let Some(bytes) = updater_take_downloaded_if_version(app, &version) {
        bytes
    } else {
        update
            .download(|_, _| {}, || {})
            .await
            .map_err(|err| format!("Update download failed: {err}"))?
    };

    if let Err(err) = update.install(&bytes) {
        updater_store_downloaded(app, version, bytes);
        return Err(format!("Failed to install update: {err}"));
    }

    updater_clear_downloaded(app);
    Ok(())
}

async fn run_periodic_updater_checks(app: AppHandle) {
    tokio::time::sleep(StdDuration::from_secs(UPDATE_CHECK_INITIAL_DELAY_SECS)).await;

    loop {
        if let Err(err) = download_update_if_available(&app).await {
            eprintln!("Periodic updater check failed: {err}");
        }
        tokio::time::sleep(StdDuration::from_secs(UPDATE_CHECK_INTERVAL_SECS)).await;
    }
}

async fn s3_list_all_objects(
    client: &S3Client,
    bucket: &str,
    prefix: &str,
) -> Result<Vec<(String, i64, String, String)>, String> {
    let mut continuation_token: Option<String> = None;
    let mut all_objects: Vec<(String, i64, String, String)> = Vec::new();

    loop {
        let mut request = client
            .list_objects_v2()
            .bucket(bucket.to_string())
            .max_keys(1000)
            .prefix(prefix.to_string());

        if let Some(token) = continuation_token.as_deref() {
            request = request.continuation_token(token.to_string());
        }

        let output = request.send().await.map_err(|err| err.to_string())?;

        for item in output.contents() {
            all_objects.push((
                item.key().unwrap_or_default().to_string(),
                item.size().unwrap_or(0).max(0),
                item.e_tag()
                    .unwrap_or_default()
                    .trim_matches('"')
                    .to_string(),
                item.last_modified()
                    .map(s3_datetime_to_iso)
                    .unwrap_or_else(now_iso),
            ));
        }

        if output.is_truncated().unwrap_or(false) {
            continuation_token = output.next_continuation_token().map(str::to_string);
        } else {
            break;
        }
    }

    Ok(all_objects)
}

async fn s3_upload_file(
    client: &S3Client,
    bucket: &str,
    key: &str,
    local_path: &Path,
    cancel_flag: &AtomicBool,
    mut on_progress: impl FnMut(i64, i64),
) -> Result<i64, String> {
    if cancel_flag.load(Ordering::SeqCst) {
        return Err("Job cancelled".to_string());
    }

    let total = fs::metadata(local_path)
        .map(|meta| meta.len() as i64)
        .unwrap_or(0)
        .max(0);

    if total <= MULTIPART_THRESHOLD_BYTES {
        let body = ByteStream::from_path(local_path.to_path_buf())
            .await
            .map_err(|err| format!("Failed to stream {}: {err}", local_path.display()))?;

        client
            .put_object()
            .bucket(bucket.to_string())
            .key(key.to_string())
            .body(body)
            .send()
            .await
            .map_err(|err| err.to_string())?;

        on_progress(total, total);
        return Ok(total);
    }

    let multipart = client
        .create_multipart_upload()
        .bucket(bucket.to_string())
        .key(key.to_string())
        .send()
        .await
        .map_err(|err| err.to_string())?;
    let upload_id = multipart
        .upload_id()
        .map(str::to_string)
        .ok_or_else(|| "Missing multipart upload id".to_string())?;

    let mut file = tokio_fs::File::open(local_path)
        .await
        .map_err(|err| format!("Failed to open {}: {err}", local_path.display()))?;
    let mut transferred: i64 = 0;
    let mut part_number: i32 = 1;
    let mut parts: Vec<CompletedPart> = Vec::new();

    let upload_result: Result<(), String> = async {
        loop {
            if cancel_flag.load(Ordering::SeqCst) {
                return Err("Job cancelled".to_string());
            }

            let mut buffer = vec![0u8; MULTIPART_PART_SIZE_BYTES];
            let mut read_total: usize = 0;
            while read_total < buffer.len() {
                let read = file
                    .read(&mut buffer[read_total..])
                    .await
                    .map_err(|err| format!("Failed reading {}: {err}", local_path.display()))?;
                if read == 0 {
                    break;
                }
                read_total += read;
            }

            if read_total == 0 {
                break;
            }
            buffer.truncate(read_total);

            let output = client
                .upload_part()
                .bucket(bucket.to_string())
                .key(key.to_string())
                .upload_id(upload_id.clone())
                .part_number(part_number)
                .body(ByteStream::from(buffer))
                .send()
                .await
                .map_err(|err| err.to_string())?;

            let completed_part = CompletedPart::builder()
                .set_e_tag(output.e_tag().map(str::to_string))
                .part_number(part_number)
                .build();
            parts.push(completed_part);

            transferred += read_total as i64;
            on_progress(transferred, total);
            part_number += 1;
        }

        if parts.is_empty() {
            return Err("Multipart upload produced no parts".to_string());
        }

        let completed_upload = CompletedMultipartUpload::builder()
            .set_parts(Some(parts))
            .build();

        client
            .complete_multipart_upload()
            .bucket(bucket.to_string())
            .key(key.to_string())
            .upload_id(upload_id.clone())
            .multipart_upload(completed_upload)
            .send()
            .await
            .map_err(|err| err.to_string())?;

        Ok(())
    }
    .await;

    if let Err(err) = upload_result {
        let _ = client
            .abort_multipart_upload()
            .bucket(bucket.to_string())
            .key(key.to_string())
            .upload_id(upload_id)
            .send()
            .await;
        return Err(err);
    }

    on_progress(total, total);
    Ok(total)
}

async fn s3_download_file(
    client: &S3Client,
    bucket: &str,
    key: &str,
    local_path: &Path,
    cancel_flag: &AtomicBool,
    mut on_progress: impl FnMut(i64, i64),
) -> Result<i64, String> {
    if cancel_flag.load(Ordering::SeqCst) {
        return Err("Job cancelled".to_string());
    }

    if let Some(parent) = local_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|err| format!("Failed to create {}: {err}", parent.display()))?;
    }

    let output = client
        .get_object()
        .bucket(bucket.to_string())
        .key(key.to_string())
        .send()
        .await
        .map_err(|err| err.to_string())?;
    let total = output.content_length().unwrap_or(0).max(0);

    let file = tokio_fs::File::create(local_path)
        .await
        .map_err(|err| format!("Failed to create {}: {err}", local_path.display()))?;
    let mut writer = BufWriter::new(file);
    let mut body = output.body;
    let mut transferred: i64 = 0;

    while let Some(bytes) = body
        .try_next()
        .await
        .map_err(|err| format!("Download stream failed: {err}"))?
    {
        if cancel_flag.load(Ordering::SeqCst) {
            let _ = tokio_fs::remove_file(local_path).await;
            return Err("Job cancelled".to_string());
        }

        writer
            .write_all(&bytes)
            .await
            .map_err(|err| format!("Failed writing {}: {err}", local_path.display()))?;

        transferred += bytes.len() as i64;
        on_progress(transferred, total);
    }

    writer
        .flush()
        .await
        .map_err(|err| format!("Failed flushing {}: {err}", local_path.display()))?;

    Ok(transferred.max(total))
}

async fn s3_download_archive_tar_gz(
    client: &S3Client,
    bucket: &str,
    keys: &[String],
    common_prefix: &str,
    destination_path: &Path,
    cancel_flag: &AtomicBool,
    mut on_progress: impl FnMut(i64, i64),
) -> Result<i64, String> {
    if cancel_flag.load(Ordering::SeqCst) {
        return Err("Job cancelled".to_string());
    }
    if keys.is_empty() {
        return Err("No objects selected for archive".to_string());
    }

    if let Some(parent) = destination_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|err| format!("Failed to create {}: {err}", parent.display()))?;
    }

    let result: Result<i64, String> = async {
        let archive_file = fs::File::create(destination_path).map_err(|err| {
            format!(
                "Failed to create archive {}: {err}",
                destination_path.display()
            )
        })?;
        let writer = io::BufWriter::new(archive_file);
        let mut encoder = GzEncoder::new(writer, Compression::default());

        let mut transferred: i64 = 0;
        let mut total: i64 = 0;
        const TAR_BLOCK_SIZE: usize = 512;
        const TAR_END_BLOCKS: [u8; TAR_BLOCK_SIZE * 2] = [0; TAR_BLOCK_SIZE * 2];
        const TAR_PAD_BLOCK: [u8; TAR_BLOCK_SIZE] = [0; TAR_BLOCK_SIZE];

        on_progress(0, 0);

        for key in keys {
            if cancel_flag.load(Ordering::SeqCst) {
                return Err("Job cancelled".to_string());
            }

            let relative = if !common_prefix.is_empty() && key.starts_with(common_prefix) {
                key[common_prefix.len()..].to_string()
            } else {
                key.clone()
            };
            if relative.is_empty() {
                continue;
            }

            let safe_relative = sanitize_relative_path(&relative)
                .ok_or_else(|| format!("Invalid object key for archive entry: {key}"))?;

            let output = client
                .get_object()
                .bucket(bucket.to_string())
                .key(key.to_string())
                .send()
                .await
                .map_err(|err| err.to_string())?;

            let expected_size = if let Some(size) = output.content_length() {
                size.max(0)
            } else {
                client
                    .head_object()
                    .bucket(bucket.to_string())
                    .key(key.to_string())
                    .send()
                    .await
                    .map_err(|err| err.to_string())?
                    .content_length()
                    .unwrap_or(0)
                    .max(0)
            };

            let mut header = tar::Header::new_gnu();
            header.set_entry_type(tar::EntryType::Regular);
            header.set_path(&safe_relative).map_err(|err| {
                format!(
                    "Invalid archive entry path {}: {err}",
                    safe_relative.display()
                )
            })?;
            header.set_size(expected_size as u64);
            header.set_mode(0o644);
            header.set_mtime(0);
            header.set_cksum();

            encoder.write_all(header.as_bytes()).map_err(|err| {
                format!(
                    "Failed writing tar header for {}: {err}",
                    safe_relative.display()
                )
            })?;

            let mut body = output.body;
            let mut file_transferred: i64 = 0;

            while let Some(bytes) = body
                .try_next()
                .await
                .map_err(|err| format!("Download stream failed: {err}"))?
            {
                if cancel_flag.load(Ordering::SeqCst) {
                    return Err("Job cancelled".to_string());
                }

                encoder.write_all(&bytes).map_err(|err| {
                    format!(
                        "Failed writing tar data for {}: {err}",
                        safe_relative.display()
                    )
                })?;
                file_transferred += bytes.len() as i64;

                let aggregate_total = (total + expected_size).max(transferred + file_transferred);
                on_progress(transferred + file_transferred, aggregate_total);
            }

            if file_transferred != expected_size {
                return Err(format!(
                    "Unexpected size for {} (expected {}, downloaded {})",
                    safe_relative.display(),
                    expected_size,
                    file_transferred
                ));
            }

            let padding = (TAR_BLOCK_SIZE as i64 - (file_transferred % TAR_BLOCK_SIZE as i64))
                % TAR_BLOCK_SIZE as i64;
            if padding > 0 {
                encoder
                    .write_all(&TAR_PAD_BLOCK[..padding as usize])
                    .map_err(|err| {
                        format!(
                            "Failed writing tar padding for {}: {err}",
                            safe_relative.display()
                        )
                    })?;
            }

            transferred += file_transferred;
            total += expected_size;
            on_progress(transferred, total);
        }

        encoder
            .write_all(&TAR_END_BLOCKS)
            .map_err(|err| format!("Failed finalizing tar payload: {err}"))?;
        encoder
            .finish()
            .map_err(|err| format!("Failed finalizing gzip stream: {err}"))?;

        if cancel_flag.load(Ordering::SeqCst) {
            return Err("Job cancelled".to_string());
        }

        Ok(transferred.max(total))
    }
    .await;

    if result.is_err() {
        let _ = fs::remove_file(destination_path);
    }

    result
}

async fn s3_copy_object_via_temp_file(
    source_client: &S3Client,
    source_bucket: &str,
    source_key: &str,
    dest_client: &S3Client,
    dest_bucket: &str,
    dest_key: &str,
    cancel_flag: &AtomicBool,
    mut on_progress: impl FnMut(i64, i64),
) -> Result<i64, String> {
    if cancel_flag.load(Ordering::SeqCst) {
        return Err("Job cancelled".to_string());
    }

    let head = source_client
        .head_object()
        .bucket(source_bucket.to_string())
        .key(source_key.to_string())
        .send()
        .await
        .map_err(|err| err.to_string())?;
    let size = head.content_length().unwrap_or(0).max(0);

    let temp_path = std::env::temp_dir().join(format!("object0-copy-{}", Uuid::new_v4()));

    let result = async {
        s3_download_file(
            source_client,
            source_bucket,
            source_key,
            &temp_path,
            cancel_flag,
            |transferred, _| on_progress((transferred / 2).min(size), size),
        )
        .await?;

        if cancel_flag.load(Ordering::SeqCst) {
            return Err("Job cancelled".to_string());
        }

        s3_upload_file(
            dest_client,
            dest_bucket,
            dest_key,
            &temp_path,
            cancel_flag,
            |transferred, _| on_progress((size / 2 + transferred / 2).min(size), size),
        )
        .await?;

        on_progress(size, size);
        Ok(size)
    }
    .await;

    let _ = fs::remove_file(&temp_path);
    result
}

async fn s3_copy_object(
    source_client: &S3Client,
    source_bucket: &str,
    source_key: &str,
    dest_client: &S3Client,
    dest_bucket: &str,
    dest_key: &str,
    cancel_flag: &AtomicBool,
    mut on_progress: impl FnMut(i64, i64),
) -> Result<i64, String> {
    if cancel_flag.load(Ordering::SeqCst) {
        return Err("Job cancelled".to_string());
    }

    let head = source_client
        .head_object()
        .bucket(source_bucket.to_string())
        .key(source_key.to_string())
        .send()
        .await
        .map_err(|err| err.to_string())?;
    let size = head.content_length().unwrap_or(0).max(0);

    let source_key_encoded = utf8_percent_encode(source_key, COPY_SOURCE_ENCODE_SET);
    let copy_source = format!("{}/{}", source_bucket, source_key_encoded);

    dest_client
        .copy_object()
        .bucket(dest_bucket.to_string())
        .key(dest_key.to_string())
        .copy_source(copy_source)
        .send()
        .await
        .map_err(|err| err.to_string())?;

    on_progress(size, size);
    Ok(size)
}

async fn s3_delete_keys(client: &S3Client, bucket: &str, keys: &[String]) -> Result<(), String> {
    if keys.is_empty() {
        return Ok(());
    }

    if keys.len() == 1 {
        client
            .delete_object()
            .bucket(bucket.to_string())
            .key(keys[0].clone())
            .send()
            .await
            .map_err(|err| err.to_string())?;
        return Ok(());
    }

    let mut objects = Vec::with_capacity(keys.len());
    for key in keys {
        let object = ObjectIdentifier::builder()
            .key(key.clone())
            .build()
            .map_err(|err| format!("Invalid object identifier: {err}"))?;
        objects.push(object);
    }

    let delete = Delete::builder()
        .set_objects(Some(objects))
        .build()
        .map_err(|err| format!("Invalid delete payload: {err}"))?;

    client
        .delete_objects()
        .bucket(bucket.to_string())
        .delete(delete)
        .send()
        .await
        .map_err(|err| err.to_string())?;

    Ok(())
}

fn try_start_queued_jobs(app: AppHandle) {
    let state = app.state::<AppState>();

    let mut start_now: Vec<(JobTask, Arc<AtomicBool>)> = Vec::new();
    let mut running_snapshots: Vec<JobInfo> = Vec::new();

    if let Ok(mut jobs) = lock(&state.jobs) {
        while jobs.running.len() < jobs.concurrency as usize {
            let Some(task) = jobs.queue.pop_front() else {
                break;
            };

            let cancel_flag = jobs
                .cancel_flags
                .entry(task.id.clone())
                .or_insert_with(|| Arc::new(AtomicBool::new(false)))
                .clone();
            jobs.running.insert(task.id.clone());

            if let Some(job) = jobs.jobs.get_mut(&task.id) {
                job.status = JobStatus::Running;
                job.started_at = Some(now_iso());
                job.speed = 0;
                job.eta = 0;
                running_snapshots.push(job.clone());
            }

            start_now.push((task, cancel_flag));
        }
    }

    for snapshot in running_snapshots {
        emit_job_progress_event(&app, &snapshot);
    }

    for (task, cancel_flag) in start_now {
        let app_handle = app.clone();
        tauri::async_runtime::spawn(async move {
            let result: Result<i64, String> = async {
                let state = app_handle.state::<AppState>();
                let mut speed_calc = (Instant::now(), 0i64);

                let update = |transferred: i64, total: i64, speed_calc: &mut (Instant, i64)| {
                    let now = Instant::now();
                    let dt = now.duration_since(speed_calc.0).as_secs_f64();
                    let bytes_delta = transferred - speed_calc.1;
                    let speed = if dt > 0.4 {
                        (bytes_delta as f64 / dt) as i64
                    } else {
                        0
                    };
                    let eta = if speed > 0 && total > transferred {
                        (total - transferred) / speed.max(1)
                    } else {
                        0
                    };
                    if dt > 0.4 {
                        *speed_calc = (now, transferred);
                    }
                    update_job_progress(&app_handle, &task.id, transferred, total, speed, eta);
                };

                match &task.kind {
                    JobTaskKind::Upload {
                        profile_id,
                        bucket,
                        key,
                        local_path,
                    } => {
                        let profile = profile_for_id(&state, profile_id)?;
                        let client = to_s3_client(&profile)?;
                        if local_path.trim().is_empty() {
                            update(0, 0, &mut speed_calc);
                            client
                                .put_object()
                                .bucket(bucket.to_string())
                                .key(key.to_string())
                                .body(ByteStream::from(Vec::<u8>::new()))
                                .send()
                                .await
                                .map_err(|err| err.to_string())?;
                            update(0, 0, &mut speed_calc);
                            Ok(0)
                        } else {
                            let local = expand_user_path(local_path);
                            let total = fs::metadata(&local)
                                .map(|m| m.len() as i64)
                                .unwrap_or(0)
                                .max(0);
                            update(0, total, &mut speed_calc);
                            s3_upload_file(&client, bucket, key, &local, &cancel_flag, |t, tot| {
                                update(t, tot, &mut speed_calc);
                            })
                            .await
                        }
                    }
                    JobTaskKind::Download {
                        profile_id,
                        bucket,
                        key,
                        local_path,
                    } => {
                        let profile = profile_for_id(&state, profile_id)?;
                        let client = to_s3_client(&profile)?;
                        let local = expand_user_path(local_path);
                        update(0, 0, &mut speed_calc);
                        s3_download_file(&client, bucket, key, &local, &cancel_flag, |t, tot| {
                            update(t, tot, &mut speed_calc);
                        })
                        .await
                    }
                    JobTaskKind::Copy {
                        source_profile_id,
                        source_bucket,
                        source_key,
                        dest_profile_id,
                        dest_bucket,
                        dest_key,
                    } => {
                        let src_profile = profile_for_id(&state, source_profile_id)?;
                        let dst_profile = profile_for_id(&state, dest_profile_id)?;
                        let src_client = to_s3_client(&src_profile)?;
                        let dst_client = to_s3_client(&dst_profile)?;
                        let same_profile = source_profile_id == dest_profile_id;
                        update(0, 0, &mut speed_calc);
                        if same_profile {
                            match s3_copy_object(
                                &src_client,
                                source_bucket,
                                source_key,
                                &dst_client,
                                dest_bucket,
                                dest_key,
                                &cancel_flag,
                                |t, tot| update(t, tot, &mut speed_calc),
                            )
                            .await
                            {
                                Ok(transferred) => Ok(transferred),
                                Err(err) if err == "Job cancelled" => Err(err),
                                Err(err) => s3_copy_object_via_temp_file(
                                    &src_client,
                                    source_bucket,
                                    source_key,
                                    &dst_client,
                                    dest_bucket,
                                    dest_key,
                                    &cancel_flag,
                                    |t, tot| update(t, tot, &mut speed_calc),
                                )
                                .await
                                .map_err(|fallback_err| {
                                    format!("{err}; fallback copy failed: {fallback_err}")
                                }),
                            }
                        } else {
                            s3_copy_object_via_temp_file(
                                &src_client,
                                source_bucket,
                                source_key,
                                &dst_client,
                                dest_bucket,
                                dest_key,
                                &cancel_flag,
                                |t, tot| update(t, tot, &mut speed_calc),
                            )
                            .await
                        }
                    }
                    JobTaskKind::Move {
                        source_profile_id,
                        source_bucket,
                        source_key,
                        dest_profile_id,
                        dest_bucket,
                        dest_key,
                    } => {
                        let src_profile = profile_for_id(&state, source_profile_id)?;
                        let dst_profile = profile_for_id(&state, dest_profile_id)?;
                        let src_client = to_s3_client(&src_profile)?;
                        let dst_client = to_s3_client(&dst_profile)?;
                        let same_profile = source_profile_id == dest_profile_id;
                        update(0, 0, &mut speed_calc);
                        let transferred = if same_profile {
                            match s3_copy_object(
                                &src_client,
                                source_bucket,
                                source_key,
                                &dst_client,
                                dest_bucket,
                                dest_key,
                                &cancel_flag,
                                |t, tot| update(t, tot, &mut speed_calc),
                            )
                            .await
                            {
                                Ok(transferred) => transferred,
                                Err(err) if err == "Job cancelled" => return Err(err),
                                Err(err) => s3_copy_object_via_temp_file(
                                    &src_client,
                                    source_bucket,
                                    source_key,
                                    &dst_client,
                                    dest_bucket,
                                    dest_key,
                                    &cancel_flag,
                                    |t, tot| update(t, tot, &mut speed_calc),
                                )
                                .await
                                .map_err(|fallback_err| {
                                    format!("{err}; fallback copy failed: {fallback_err}")
                                })?,
                            }
                        } else {
                            s3_copy_object_via_temp_file(
                                &src_client,
                                source_bucket,
                                source_key,
                                &dst_client,
                                dest_bucket,
                                dest_key,
                                &cancel_flag,
                                |t, tot| update(t, tot, &mut speed_calc),
                            )
                            .await?
                        };

                        if cancel_flag.load(Ordering::SeqCst) {
                            return Err("Job cancelled".to_string());
                        }

                        s3_delete_keys(&src_client, source_bucket, &[source_key.clone()]).await?;
                        Ok(transferred)
                    }
                    JobTaskKind::Delete {
                        profile_id,
                        bucket,
                        keys,
                    } => {
                        let profile = profile_for_id(&state, profile_id)?;
                        let client = to_s3_client(&profile)?;
                        update(0, keys.len() as i64, &mut speed_calc);
                        s3_delete_keys(&client, bucket, keys).await?;
                        update(keys.len() as i64, keys.len() as i64, &mut speed_calc);
                        Ok(keys.len() as i64)
                    }
                    JobTaskKind::Archive {
                        profile_id,
                        bucket,
                        keys,
                        common_prefix,
                        destination_path,
                    } => {
                        let profile = profile_for_id(&state, profile_id)?;
                        let client = to_s3_client(&profile)?;
                        let destination = expand_user_path(destination_path);
                        update(0, 0, &mut speed_calc);
                        s3_download_archive_tar_gz(
                            &client,
                            bucket,
                            keys,
                            common_prefix,
                            &destination,
                            &cancel_flag,
                            |t, tot| update(t, tot, &mut speed_calc),
                        )
                        .await
                    }
                }
            }
            .await;

            match result {
                Ok(bytes) => finish_job(
                    &app_handle,
                    &task.id,
                    JobStatus::Completed,
                    None,
                    Some(bytes),
                ),
                Err(err) if err == "Job cancelled" => {
                    finish_job(&app_handle, &task.id, JobStatus::Cancelled, Some(err), None)
                }
                Err(err) => finish_job(&app_handle, &task.id, JobStatus::Failed, Some(err), None),
            }

            try_start_queued_jobs(app_handle);
        });
    }
}

fn enqueue_job(
    app: &AppHandle,
    job_type: JobType,
    file_name: String,
    description: String,
    bytes_total: i64,
    kind: JobTaskKind,
) -> Result<String, String> {
    let job_id = Uuid::new_v4().to_string();
    let created_at = now_iso();
    let info = JobInfo {
        id: job_id.clone(),
        job_type,
        status: JobStatus::Queued,
        file_name,
        description,
        bytes_transferred: 0,
        bytes_total: bytes_total.max(0),
        percentage: 0,
        speed: 0,
        eta: 0,
        error: None,
        created_at: created_at.clone(),
        started_at: None,
        completed_at: None,
    };

    let task = JobTask {
        id: job_id.clone(),
        created_at,
        kind,
    };

    let state = app.state::<AppState>();
    {
        let mut jobs = lock(&state.jobs)?;
        jobs.jobs.insert(job_id.clone(), info.clone());
        jobs.order.retain(|id| id != &job_id);
        jobs.order.insert(0, job_id.clone());
        if jobs.order.len() > 200 {
            for removed in jobs.order.split_off(200) {
                if !jobs.running.contains(&removed) {
                    jobs.jobs.remove(&removed);
                }
            }
        }
        jobs.queue.push_back(task);
        jobs.cancel_flags
            .insert(job_id.clone(), Arc::new(AtomicBool::new(false)));
    }

    emit_job_progress_event(app, &info);
    try_start_queued_jobs(app.clone());
    Ok(job_id)
}

fn cancel_job(app: &AppHandle, job_id: &str) {
    let mut queued_cancel_snapshot: Option<JobInfo> = None;
    {
        let state = app.state::<AppState>();
        if let Ok(mut jobs) = lock(&state.jobs) {
            if let Some(index) = jobs.queue.iter().position(|task| task.id == job_id) {
                jobs.queue.remove(index);
                if let Some(job) = jobs.jobs.get_mut(job_id) {
                    job.status = JobStatus::Cancelled;
                    job.error = Some("Job cancelled".to_string());
                    job.completed_at = Some(now_iso());
                    queued_cancel_snapshot = Some(job.clone());
                }
                jobs.cancel_flags.remove(job_id);
            } else if let Some(cancel_flag) = jobs.cancel_flags.get(job_id) {
                cancel_flag.store(true, Ordering::SeqCst);
            }
        };
    }

    if let Some(job) = queued_cancel_snapshot {
        emit_job_progress_event(app, &job);
        emit_job_complete_event(app, &job);
        persist_job_history_snapshot(app);
    }
}

fn to_sync_object_map(
    objects: Vec<(String, i64, String, String)>,
    prefix: &str,
) -> HashMap<String, SyncObjectInfo> {
    let mut map = HashMap::new();
    let normalized_prefix = normalize_prefix(prefix);

    for (key, size, etag, last_modified) in objects {
        let relative = if normalized_prefix.is_empty() {
            key.clone()
        } else if key.starts_with(&normalized_prefix) {
            key[normalized_prefix.len()..].to_string()
        } else {
            continue;
        };

        if relative.is_empty() {
            continue;
        }
        if relative.ends_with('/') {
            continue;
        }

        map.insert(
            relative,
            SyncObjectInfo {
                size: size.max(0),
                etag,
                last_modified,
            },
        );
    }

    map
}

async fn generate_sync_diff(state: &AppState, input: &SyncInput) -> Result<SyncDiffRecord, String> {
    let source_profile = profile_for_id(state, &input.source_profile_id)?;
    let dest_profile = profile_for_id(state, &input.dest_profile_id)?;
    let source_client = to_s3_client(&source_profile)?;
    let dest_client = to_s3_client(&dest_profile)?;

    let source_prefix = normalize_prefix(&input.source_prefix);
    let dest_prefix = normalize_prefix(&input.dest_prefix);

    let source_objects =
        s3_list_all_objects(&source_client, &input.source_bucket, &source_prefix).await?;
    let dest_objects = s3_list_all_objects(&dest_client, &input.dest_bucket, &dest_prefix).await?;

    let source_map = to_sync_object_map(source_objects, &input.source_prefix);
    let dest_map = to_sync_object_map(dest_objects, &input.dest_prefix);

    let mut to_add = Vec::new();
    let mut to_update = Vec::new();
    let mut to_delete = Vec::new();
    let mut unchanged = 0i64;

    let mut keys: Vec<String> = source_map.keys().cloned().collect();
    keys.sort();

    for key in keys {
        let Some(src) = source_map.get(&key) else {
            continue;
        };
        if let Some(dest) = dest_map.get(&key) {
            if src.etag != dest.etag || src.size != dest.size {
                to_update.push(SyncDiffEntryRecord {
                    key: key.clone(),
                    source_size: Some(src.size),
                    dest_size: Some(dest.size),
                    source_etag: Some(src.etag.clone()),
                    dest_etag: Some(dest.etag.clone()),
                    source_last_modified: Some(src.last_modified.clone()),
                    dest_last_modified: Some(dest.last_modified.clone()),
                    selected: true,
                });
            } else {
                unchanged += 1;
            }
        } else {
            to_add.push(SyncDiffEntryRecord {
                key: key.clone(),
                source_size: Some(src.size),
                dest_size: None,
                source_etag: Some(src.etag.clone()),
                dest_etag: None,
                source_last_modified: Some(src.last_modified.clone()),
                dest_last_modified: None,
                selected: true,
            });
        }
    }

    if input.mode == "mirror" {
        let mut dest_only: Vec<String> = dest_map
            .keys()
            .filter(|key| !source_map.contains_key(*key))
            .cloned()
            .collect();
        dest_only.sort();

        for key in dest_only {
            let Some(dest) = dest_map.get(&key) else {
                continue;
            };
            to_delete.push(SyncDiffEntryRecord {
                key: key.clone(),
                source_size: None,
                dest_size: Some(dest.size),
                source_etag: None,
                dest_etag: Some(dest.etag.clone()),
                source_last_modified: None,
                dest_last_modified: Some(dest.last_modified.clone()),
                selected: true,
            });
        }
    }

    if input.mode == "overwrite" {
        return Ok(SyncDiffRecord {
            to_add: Vec::new(),
            to_update,
            to_delete: Vec::new(),
            unchanged,
        });
    }

    Ok(SyncDiffRecord {
        to_add,
        to_update,
        to_delete,
        unchanged,
    })
}

fn execute_sync_diff(
    app: &AppHandle,
    input: &SyncInput,
    diff: &SyncDiffRecord,
) -> Result<String, String> {
    let mut job_ids = Vec::new();

    let mut enqueue_copy = |entry: &SyncDiffEntryRecord| -> Result<(), String> {
        let source_key = join_prefix_key(&input.source_prefix, &entry.key);
        let dest_key = join_prefix_key(&input.dest_prefix, &entry.key);
        let file_name = entry
            .key
            .split('/')
            .filter(|part| !part.is_empty())
            .last()
            .unwrap_or(entry.key.as_str())
            .to_string();

        let job_id = enqueue_job(
            app,
            JobType::Sync,
            file_name,
            format!(
                "Sync {}:{} -> {}:{}",
                input.source_bucket, source_key, input.dest_bucket, dest_key
            ),
            entry.source_size.unwrap_or(0),
            JobTaskKind::Copy {
                source_profile_id: input.source_profile_id.clone(),
                source_bucket: input.source_bucket.clone(),
                source_key,
                dest_profile_id: input.dest_profile_id.clone(),
                dest_bucket: input.dest_bucket.clone(),
                dest_key,
            },
        )?;
        job_ids.push(job_id);
        Ok(())
    };

    for entry in diff.to_add.iter().filter(|entry| entry.selected) {
        enqueue_copy(entry)?;
    }
    for entry in diff.to_update.iter().filter(|entry| entry.selected) {
        enqueue_copy(entry)?;
    }

    let delete_keys: Vec<String> = diff
        .to_delete
        .iter()
        .filter(|entry| entry.selected)
        .map(|entry| join_prefix_key(&input.dest_prefix, &entry.key))
        .collect();
    if !delete_keys.is_empty() {
        let delete_job_id = enqueue_job(
            app,
            JobType::Delete,
            format!("{} object(s)", delete_keys.len()),
            format!("Mirror delete on {}", input.dest_bucket),
            delete_keys.len() as i64,
            JobTaskKind::Delete {
                profile_id: input.dest_profile_id.clone(),
                bucket: input.dest_bucket.clone(),
                keys: delete_keys,
            },
        )?;
        job_ids.push(delete_job_id);
    }

    Ok(job_ids
        .first()
        .cloned()
        .unwrap_or_else(|| Uuid::new_v4().to_string()))
}

fn wake_folder_sync_slot(wake_tx: &Arc<Mutex<Option<oneshot::Sender<()>>>>) {
    if let Ok(mut slot) = wake_tx.lock() {
        if let Some(tx) = slot.take() {
            let _ = tx.send(());
        }
    }
}

fn wake_folder_sync_control(control: &FolderSyncTaskControl) {
    wake_folder_sync_slot(&control.wake_tx);
}

fn mark_folder_sync_last_change(app: &AppHandle, rule_id: &str, files_watching: i64) {
    let mut snapshot: Option<FolderSyncStateRecord> = None;
    {
        let state = app.state::<AppState>();
        if let Ok(mut runtime) = lock(&state.folder_sync) {
            let record =
                runtime
                    .statuses
                    .entry(rule_id.to_string())
                    .or_insert(FolderSyncStateRecord {
                        rule_id: rule_id.to_string(),
                        status: "watching".to_string(),
                        files_watching: files_watching.max(0),
                        last_change: None,
                        current_file: None,
                        progress: None,
                    });
            record.last_change = Some(now_iso());
            record.files_watching = files_watching.max(0);
            snapshot = Some(record.clone());
        };
    }

    if let Some(record) = snapshot {
        emit_folder_sync_status_event(app, &record);
    }
}

async fn wait_for_folder_sync_wake(control: &FolderSyncTaskControl, poll_interval_ms: i64) {
    let wait_ms = poll_interval_ms.clamp(250, 86_400_000) as u64;
    let (tx, rx) = oneshot::channel::<()>();
    if let Ok(mut slot) = control.wake_tx.lock() {
        *slot = Some(tx);
    }

    let _ = tokio::time::timeout(StdDuration::from_millis(wait_ms), rx).await;

    if let Ok(mut slot) = control.wake_tx.lock() {
        *slot = None;
    }
}

async fn run_folder_sync_once(
    app: &AppHandle,
    rule: &FolderSyncRuleRecord,
    control: &FolderSyncTaskControl,
) -> Result<(), String> {
    let state = app.state::<AppState>();
    let profile = profile_for_id(&state, &rule.profile_id)?;
    let client = to_s3_client(&profile)?;

    let known_records = load_folder_sync_file_records(&rule.id);
    let diff = generate_folder_sync_diff_for_rule(rule, &client, &known_records).await?;
    for conflict in &diff.conflicts {
        emit_folder_sync_conflict_event(app, &rule.id, conflict);
    }

    let total_actions = diff.uploads.len()
        + diff.downloads.len()
        + diff.delete_local.len()
        + diff.delete_remote.len();
    let files_watching = if rule.direction == "remote-to-local" {
        0
    } else {
        1
    };

    if total_actions == 0 {
        update_folder_sync_rule_result(&rule.id, Some("success"), None)?;
        return Ok(());
    }

    let bytes_total: i64 = diff
        .uploads
        .iter()
        .map(|entry| entry.local_size.unwrap_or(0))
        .sum::<i64>()
        + diff
            .downloads
            .iter()
            .map(|entry| entry.remote_size.unwrap_or(0))
            .sum::<i64>();

    let local_root = expand_user_path(&rule.local_path);
    let mut completed: i64 = 0;
    let total = total_actions as i64;
    let mut bytes_transferred: i64 = 0;
    let mut errors: Vec<String> = Vec::new();
    let bucket_prefix = normalize_prefix(&rule.bucket_prefix);

    let emit_progress = |current_file: Option<String>,
                         completed: i64,
                         bytes_transferred: i64|
     -> Result<(), String> {
        set_folder_sync_status(
            app,
            &rule.id,
            "syncing",
            files_watching,
            Some(now_iso()),
            current_file,
            Some(FolderSyncProgress {
                completed,
                total,
                bytes_transferred: bytes_transferred.max(0),
                bytes_total: bytes_total.max(0),
            }),
        )
    };

    emit_progress(None, completed, bytes_transferred)?;

    for entry in &diff.uploads {
        if control.cancel_flag.load(Ordering::SeqCst) {
            return Err("Job cancelled".to_string());
        }
        if control.pause_flag.load(Ordering::SeqCst) {
            return Ok(());
        }

        let Some(relative_path) = sanitize_relative_path(&entry.relative_path) else {
            errors.push(format!(
                "Upload {}: invalid relative path",
                entry.relative_path
            ));
            completed += 1;
            continue;
        };

        let local_path = local_root.join(&relative_path);
        let remote_key = format!("{}{}", bucket_prefix, entry.relative_path);
        let current_file = entry.relative_path.clone();
        let base_completed = completed;
        let base_transferred = bytes_transferred;

        emit_progress(Some(current_file.clone()), completed, bytes_transferred)?;

        let upload_result = s3_upload_file(
            &client,
            &rule.bucket,
            &remote_key,
            &local_path,
            &control.cancel_flag,
            |transferred, _total| {
                let _ = emit_progress(
                    Some(current_file.clone()),
                    base_completed,
                    base_transferred + transferred,
                );
            },
        )
        .await;

        match upload_result {
            Ok(transferred) => {
                let remote_meta = client
                    .head_object()
                    .bucket(rule.bucket.clone())
                    .key(remote_key.clone())
                    .send()
                    .await
                    .map_err(|err| err.to_string())?;
                let record = FolderSyncFileRecord {
                    relative_path: entry.relative_path.clone(),
                    local_mtime: file_mtime_millis(&local_path),
                    local_size: fs::metadata(&local_path)
                        .map(|meta| meta.len() as i64)
                        .unwrap_or(0)
                        .max(0),
                    remote_etag: remote_meta
                        .e_tag()
                        .unwrap_or_default()
                        .trim_matches('"')
                        .to_string(),
                    remote_last_modified: remote_meta
                        .last_modified()
                        .map(s3_datetime_to_iso)
                        .unwrap_or_else(now_iso),
                    remote_size: remote_meta.content_length().unwrap_or(0).max(0),
                    synced_at: now_iso(),
                };
                update_folder_sync_file_record(&rule.id, record)?;
                bytes_transferred += transferred.max(0);
            }
            Err(err) => {
                errors.push(format!("Upload {}: {}", entry.relative_path, err));
            }
        }

        completed += 1;
        emit_progress(
            Some(entry.relative_path.clone()),
            completed,
            bytes_transferred,
        )?;
    }

    for entry in &diff.downloads {
        if control.cancel_flag.load(Ordering::SeqCst) {
            return Err("Job cancelled".to_string());
        }
        if control.pause_flag.load(Ordering::SeqCst) {
            return Ok(());
        }

        let Some(relative_path) = sanitize_relative_path(&entry.relative_path) else {
            errors.push(format!(
                "Download {}: invalid relative path",
                entry.relative_path
            ));
            completed += 1;
            continue;
        };

        let local_path = local_root.join(&relative_path);
        let tmp_path = PathBuf::from(format!("{}.object0-tmp", local_path.display()));
        let remote_key = format!("{}{}", bucket_prefix, entry.relative_path);
        let current_file = entry.relative_path.clone();
        let base_completed = completed;
        let base_transferred = bytes_transferred;

        emit_progress(Some(current_file.clone()), completed, bytes_transferred)?;

        let download_result = s3_download_file(
            &client,
            &rule.bucket,
            &remote_key,
            &tmp_path,
            &control.cancel_flag,
            |transferred, _total| {
                let _ = emit_progress(
                    Some(current_file.clone()),
                    base_completed,
                    base_transferred + transferred,
                );
            },
        )
        .await;

        match download_result {
            Ok(transferred) => {
                if let Some(parent) = local_path.parent() {
                    fs::create_dir_all(parent)
                        .map_err(|err| format!("Failed to create {}: {err}", parent.display()))?;
                }
                fs::rename(&tmp_path, &local_path).map_err(|err| {
                    format!(
                        "Failed to move {} -> {}: {err}",
                        tmp_path.display(),
                        local_path.display()
                    )
                })?;

                let record = FolderSyncFileRecord {
                    relative_path: entry.relative_path.clone(),
                    local_mtime: file_mtime_millis(&local_path),
                    local_size: fs::metadata(&local_path)
                        .map(|meta| meta.len() as i64)
                        .unwrap_or(0)
                        .max(0),
                    remote_etag: entry.remote_etag.clone().unwrap_or_default(),
                    remote_last_modified: entry
                        .remote_last_modified
                        .clone()
                        .unwrap_or_else(now_iso),
                    remote_size: entry.remote_size.unwrap_or(transferred.max(0)),
                    synced_at: now_iso(),
                };
                update_folder_sync_file_record(&rule.id, record)?;
                bytes_transferred += transferred.max(0);
            }
            Err(err) => {
                let _ = fs::remove_file(&tmp_path);
                errors.push(format!("Download {}: {}", entry.relative_path, err));
            }
        }

        completed += 1;
        emit_progress(
            Some(entry.relative_path.clone()),
            completed,
            bytes_transferred,
        )?;
    }

    for entry in &diff.delete_local {
        if control.cancel_flag.load(Ordering::SeqCst) {
            return Err("Job cancelled".to_string());
        }
        if control.pause_flag.load(Ordering::SeqCst) {
            return Ok(());
        }

        let Some(relative_path) = sanitize_relative_path(&entry.relative_path) else {
            errors.push(format!(
                "Delete local {}: invalid relative path",
                entry.relative_path
            ));
            completed += 1;
            continue;
        };

        let local_path = local_root.join(relative_path);
        let _ = fs::remove_file(&local_path);
        let _ = remove_folder_sync_file_record(&rule.id, &entry.relative_path);

        completed += 1;
        emit_progress(
            Some(entry.relative_path.clone()),
            completed,
            bytes_transferred,
        )?;
    }

    if !diff.delete_remote.is_empty() {
        if control.cancel_flag.load(Ordering::SeqCst) {
            return Err("Job cancelled".to_string());
        }
        if control.pause_flag.load(Ordering::SeqCst) {
            return Ok(());
        }

        let delete_keys: Vec<String> = diff
            .delete_remote
            .iter()
            .map(|entry| format!("{}{}", bucket_prefix, entry.relative_path))
            .collect();

        if let Err(err) = s3_delete_keys(&client, &rule.bucket, &delete_keys).await {
            errors.push(format!("Delete remote: {err}"));
        }

        for entry in &diff.delete_remote {
            let _ = remove_folder_sync_file_record(&rule.id, &entry.relative_path);
            completed += 1;
            emit_progress(
                Some(entry.relative_path.clone()),
                completed,
                bytes_transferred,
            )?;
        }
    }

    if errors.is_empty() {
        update_folder_sync_rule_result(&rule.id, Some("success"), None)?;
    } else {
        let sync_status = if errors.len() < total_actions {
            "partial"
        } else {
            "error"
        };
        update_folder_sync_rule_result(
            &rule.id,
            Some(sync_status),
            errors.first().map(String::as_str),
        )?;
        emit_folder_sync_error_event(app, &rule.id, &errors.join("; "));
    }

    Ok(())
}

fn stop_folder_sync_rule(app: &AppHandle, rule_id: &str) {
    let control = {
        let state = app.state::<AppState>();
        let value = if let Ok(mut runtime) = lock(&state.folder_sync) {
            runtime.tasks.remove(rule_id)
        } else {
            None
        };
        value
    };

    if let Some(control) = control {
        if let Ok(mut watcher) = control.watcher.lock() {
            *watcher = None;
        }
        control.cancel_flag.store(true, Ordering::SeqCst);
        wake_folder_sync_control(&control);
    }
}

fn start_folder_sync_rule(app: &AppHandle, rule_id: &str) -> Result<(), String> {
    let rule = get_folder_sync_rule(rule_id)?;
    if !rule.enabled {
        return Ok(());
    }

    stop_folder_sync_rule(app, rule_id);

    let control = FolderSyncTaskControl {
        cancel_flag: Arc::new(AtomicBool::new(false)),
        pause_flag: Arc::new(AtomicBool::new(false)),
        wake_tx: Arc::new(Mutex::new(None)),
        watcher: Arc::new(Mutex::new(None)),
    };

    {
        let state = app.state::<AppState>();
        let mut runtime = lock(&state.folder_sync)?;
        runtime.tasks.insert(rule.id.clone(), control.clone());
    }

    let _ = set_folder_sync_status(
        app,
        &rule.id,
        "idle",
        if rule.direction == "remote-to-local" {
            0
        } else {
            1
        },
        None,
        None,
        None,
    );

    if rule.direction != "remote-to-local" {
        let local_watch_path = expand_user_path(&rule.local_path);
        if let Err(err) = fs::create_dir_all(&local_watch_path) {
            emit_folder_sync_error_event(
                app,
                &rule.id,
                &format!(
                    "Failed to initialize watched folder {}: {err}",
                    local_watch_path.display()
                ),
            );
        } else {
            let app_for_watch = app.clone();
            let rule_id_for_watch = rule.id.clone();
            let cancel_flag = control.cancel_flag.clone();
            let pause_flag = control.pause_flag.clone();
            let wake_tx = control.wake_tx.clone();
            match recommended_watcher(move |event_result: Result<notify::Event, notify::Error>| {
                match event_result {
                    Ok(_event) => {
                        if cancel_flag.load(Ordering::SeqCst) {
                            return;
                        }
                        mark_folder_sync_last_change(&app_for_watch, &rule_id_for_watch, 1);
                        if !pause_flag.load(Ordering::SeqCst) {
                            wake_folder_sync_slot(&wake_tx);
                        }
                    }
                    Err(err) => {
                        emit_folder_sync_error_event(
                            &app_for_watch,
                            &rule_id_for_watch,
                            &format!("Folder watcher error: {err}"),
                        );
                    }
                }
            }) {
                Ok(mut watcher) => {
                    if let Err(err) = watcher.watch(&local_watch_path, RecursiveMode::Recursive) {
                        emit_folder_sync_error_event(
                            app,
                            &rule.id,
                            &format!(
                                "Failed to watch folder {}: {err}",
                                local_watch_path.display()
                            ),
                        );
                    } else if let Ok(mut watcher_slot) = control.watcher.lock() {
                        *watcher_slot = Some(watcher);
                    } else {
                        emit_folder_sync_error_event(
                            app,
                            &rule.id,
                            "Failed to store folder watcher handle",
                        );
                    }
                }
                Err(err) => {
                    emit_folder_sync_error_event(
                        app,
                        &rule.id,
                        &format!("Failed to start folder watcher: {err}"),
                    );
                }
            }
        }
    }

    let app_handle = app.clone();
    let rule_id = rule.id.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            if control.cancel_flag.load(Ordering::SeqCst) {
                break;
            }

            let rule = match get_folder_sync_rule(&rule_id) {
                Ok(rule) => rule,
                Err(err) => {
                    emit_folder_sync_error_event(&app_handle, &rule_id, &err);
                    break;
                }
            };
            if !rule.enabled {
                break;
            }

            let files_watching = if rule.direction == "remote-to-local" {
                0
            } else {
                1
            };
            if control.pause_flag.load(Ordering::SeqCst) {
                let _ = set_folder_sync_status(
                    &app_handle,
                    &rule_id,
                    "paused",
                    files_watching,
                    Some(now_iso()),
                    None,
                    None,
                );
                wait_for_folder_sync_wake(&control, rule.poll_interval_ms).await;
                continue;
            }

            match run_folder_sync_once(&app_handle, &rule, &control).await {
                Ok(()) => {
                    let status = if control.pause_flag.load(Ordering::SeqCst) {
                        "paused"
                    } else {
                        "watching"
                    };
                    let _ = set_folder_sync_status(
                        &app_handle,
                        &rule_id,
                        status,
                        files_watching,
                        Some(now_iso()),
                        None,
                        None,
                    );
                }
                Err(err) if err == "Job cancelled" => break,
                Err(err) => {
                    let _ =
                        update_folder_sync_rule_result(&rule_id, Some("error"), Some(err.as_str()));
                    let _ = set_folder_sync_status(
                        &app_handle,
                        &rule_id,
                        "error",
                        files_watching,
                        Some(now_iso()),
                        None,
                        None,
                    );
                    emit_folder_sync_error_event(&app_handle, &rule_id, &err);
                }
            }

            wait_for_folder_sync_wake(&control, rule.poll_interval_ms).await;
        }

        if let Ok(mut watcher) = control.watcher.lock() {
            *watcher = None;
        }

        let state = app_handle.state::<AppState>();
        if let Ok(mut runtime) = lock(&state.folder_sync) {
            runtime.tasks.remove(&rule_id);
        }

        if get_folder_sync_rule(&rule_id).is_ok() {
            let _ = set_folder_sync_status(
                &app_handle,
                &rule_id,
                "idle",
                0,
                Some(now_iso()),
                None,
                None,
            );
        } else {
            let state = app_handle.state::<AppState>();
            let _removed = if let Ok(mut runtime) = lock(&state.folder_sync) {
                runtime.statuses.remove(&rule_id);
                true
            } else {
                false
            };
        }
    });

    Ok(())
}

fn start_all_folder_sync_rules(app: &AppHandle) -> Result<(), String> {
    for rule in load_folder_sync_rules_records() {
        if rule.enabled {
            if let Err(err) = start_folder_sync_rule(app, &rule.id) {
                emit_folder_sync_error_event(app, &rule.id, &err);
            }
        }
    }
    Ok(())
}

fn stop_all_folder_sync_rules(app: &AppHandle) {
    let task_ids = {
        let state = app.state::<AppState>();
        let value = if let Ok(runtime) = lock(&state.folder_sync) {
            runtime.tasks.keys().cloned().collect::<Vec<_>>()
        } else {
            Vec::new()
        };
        value
    };

    for rule_id in task_ids {
        stop_folder_sync_rule(app, &rule_id);
        let _ = set_folder_sync_status(app, &rule_id, "idle", 0, Some(now_iso()), None, None);
    }
}

fn pause_all_folder_sync_rules(app: &AppHandle) {
    let controls = {
        let state = app.state::<AppState>();
        let value = if let Ok(runtime) = lock(&state.folder_sync) {
            runtime.tasks.values().cloned().collect::<Vec<_>>()
        } else {
            Vec::new()
        };
        value
    };

    for control in controls {
        control.pause_flag.store(true, Ordering::SeqCst);
        wake_folder_sync_control(&control);
    }
}

fn resume_all_folder_sync_rules(app: &AppHandle) {
    let controls = {
        let state = app.state::<AppState>();
        let value = if let Ok(runtime) = lock(&state.folder_sync) {
            runtime.tasks.values().cloned().collect::<Vec<_>>()
        } else {
            Vec::new()
        };
        value
    };

    for control in controls {
        control.pause_flag.store(false, Ordering::SeqCst);
        wake_folder_sync_control(&control);
    }
}

fn trigger_folder_sync_now(app: &AppHandle, rule_id: &str) -> Result<(), String> {
    let control = {
        let state = app.state::<AppState>();
        let value = if let Ok(runtime) = lock(&state.folder_sync) {
            runtime.tasks.get(rule_id).cloned()
        } else {
            None
        };
        value
    };

    if let Some(control) = control {
        wake_folder_sync_control(&control);
        return Ok(());
    }

    start_folder_sync_rule(app, rule_id)
}

fn folder_sync_has_active_tasks(app: &AppHandle) -> bool {
    let state = app.state::<AppState>();
    let value = if let Ok(runtime) = lock(&state.folder_sync) {
        !runtime.tasks.is_empty()
    } else {
        false
    };
    value
}

fn folder_sync_status_counts(app: &AppHandle) -> (usize, usize, usize, usize) {
    let statuses = folder_sync_statuses_snapshot(app);
    let syncing = statuses.iter().filter(|s| s.status == "syncing").count();
    let watching = statuses.iter().filter(|s| s.status == "watching").count();
    let paused = statuses.iter().filter(|s| s.status == "paused").count();
    let errors = statuses.iter().filter(|s| s.status == "error").count();
    (syncing, watching, paused, errors)
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn build_tray_menu(app: &AppHandle) -> Result<Menu<tauri::Wry>, String> {
    let (syncing, watching, paused, errors) = folder_sync_status_counts(app);
    let any_active = syncing > 0 || watching > 0;

    let mut status = "No active sync rules".to_string();
    if syncing > 0 {
        status = format!("Syncing {syncing} rule(s)...");
    } else if watching > 0 {
        status = format!("Watching {watching} rule(s)");
    } else if paused > 0 {
        status = format!("Paused ({paused} rule(s))");
    }
    if errors > 0 {
        status = format!("{status} • {errors} error(s)");
    }

    let status_item = MenuItem::with_id(app, "tray-status", status, false, None::<&str>)
        .map_err(|err| format!("Failed to build tray status item: {err}"))?;
    let open_item = MenuItem::with_id(app, TRAY_MENU_OPEN, "Open object0", true, None::<&str>)
        .map_err(|err| format!("Failed to build tray open item: {err}"))?;
    let action_item = if any_active {
        MenuItem::with_id(
            app,
            TRAY_MENU_PAUSE_ALL,
            "Pause All Syncing",
            true,
            None::<&str>,
        )
        .map_err(|err| format!("Failed to build tray pause item: {err}"))?
    } else {
        MenuItem::with_id(
            app,
            TRAY_MENU_RESUME_ALL,
            "Resume All Syncing",
            true,
            None::<&str>,
        )
        .map_err(|err| format!("Failed to build tray resume item: {err}"))?
    };
    let quit_item = MenuItem::with_id(app, TRAY_MENU_QUIT, "Quit", true, None::<&str>)
        .map_err(|err| format!("Failed to build tray quit item: {err}"))?;

    Menu::with_items(app, &[&status_item, &open_item, &action_item, &quit_item])
        .map_err(|err| format!("Failed to build tray menu: {err}"))
}

fn refresh_tray_menu(app: &AppHandle) {
    if let Some(tray) = app.tray_by_id("object0-tray") {
        if let Ok(menu) = build_tray_menu(app) {
            let _ = tray.set_menu(Some(menu));
        }

        let (syncing, _, _, _) = folder_sync_status_counts(app);
        let title = if syncing > 0 {
            "object0 • syncing"
        } else {
            "object0"
        };
        let _ = tray.set_title(Some(title));
    }
}

fn handle_tray_menu_action(app: &AppHandle, action_id: &str) {
    match action_id {
        TRAY_MENU_OPEN => show_main_window(app),
        TRAY_MENU_PAUSE_ALL => pause_all_folder_sync_rules(app),
        TRAY_MENU_RESUME_ALL => resume_all_folder_sync_rules(app),
        TRAY_MENU_QUIT => {
            let state = app.state::<AppState>();
            state.is_quitting.store(true, Ordering::SeqCst);
            stop_all_folder_sync_rules(app);
            app.exit(0);
            return;
        }
        _ => {}
    }

    refresh_tray_menu(app);
}

#[tauri::command]
async fn rpc_request(
    app: AppHandle,
    state: State<'_, AppState>,
    method: String,
    payload: Option<Value>,
) -> Result<Value, String> {
    let payload = payload_or_null(payload);

    match method.as_str() {
        "vault:status" => {
            let path = vault_path()?;
            let exists = path.exists();
            let unlocked = lock(&state.vault)?.unlocked;
            let has_recovery_key = if exists {
                has_recovery_key_on_disk(&path)?
            } else {
                false
            };

            Ok(json!({
                "exists": exists,
                "unlocked": unlocked,
                "hasRecoveryKey": has_recovery_key,
            }))
        }
        "vault:setup" => {
            let input: VaultSetupInput = parse_payload(payload)?;
            if input.passphrase.trim().is_empty() {
                return Err("Passphrase cannot be empty".to_string());
            }

            let path = vault_path()?;
            if path.exists() {
                return Err("Vault already exists".to_string());
            }

            let salt = random_bytes::<SALT_BYTES>();
            let key = derive_key(&input.passphrase, &salt);
            let recovery_salt = random_bytes::<SALT_BYTES>();
            let recovery_key_plain = generate_recovery_key();
            let recovery_key = derive_key(&recovery_key_plain, &recovery_salt);

            let mut vault = lock(&state.vault)?;
            vault.unlocked = true;
            vault.data = Some(VaultData::default());
            vault.key = Some(key);
            vault.salt = Some(salt.to_vec());
            vault.recovery_key = Some(recovery_key);
            vault.recovery_salt = Some(recovery_salt.to_vec());
            save_vault(&path, &vault)?;
            drop(vault);

            if input.remember.unwrap_or(false) {
                if let Err(err) = store_passphrase(&input.passphrase) {
                    eprintln!("{err}");
                }
            } else {
                let _ = clear_stored_passphrase();
            }

            Ok(json!({ "success": true, "recoveryKey": recovery_key_plain }))
        }
        "vault:unlock" => {
            let input: VaultUnlockInput = parse_payload(payload)?;
            if input.passphrase.trim().is_empty() {
                return Ok(json!({
                    "success": false,
                    "profiles": [],
                    "hasRecoveryKey": false,
                }));
            }

            let path = vault_path()?;
            if !path.exists() {
                return Ok(json!({
                    "success": false,
                    "profiles": [],
                    "hasRecoveryKey": false,
                }));
            }

            let has_recovery_key = has_recovery_key_on_disk(&path).unwrap_or(false);

            match unlock_with_passphrase(&path, &input.passphrase) {
                Ok(unlock) => {
                    let mut vault = lock(&state.vault)?;
                    vault.unlocked = true;
                    vault.data = Some(unlock.data);
                    vault.key = Some(unlock.key);
                    vault.salt = Some(unlock.salt);
                    vault.recovery_salt = unlock.recovery_salt;
                    vault.recovery_key = None;
                    let profiles = profile_infos(&vault);

                    if unlock.needs_rewrite {
                        save_vault(&path, &vault)?;
                    }
                    drop(vault);

                    if input.remember.unwrap_or(false) {
                        if let Err(err) = store_passphrase(&input.passphrase) {
                            eprintln!("{err}");
                        }
                    } else {
                        let _ = clear_stored_passphrase();
                    }

                    Ok(json!({
                        "success": true,
                        "profiles": profiles,
                        "hasRecoveryKey": unlock.has_recovery_key,
                    }))
                }
                Err(_) => Ok(json!({
                    "success": false,
                    "profiles": [],
                    "hasRecoveryKey": has_recovery_key,
                })),
            }
        }
        "vault:auto-unlock" | "vault:unlock-keychain" => {
            let path = vault_path()?;
            if !path.exists() {
                return Ok(json!({
                    "success": false,
                    "profiles": [],
                    "hasRecoveryKey": false,
                    "reason": "vault_missing",
                }));
            }

            let has_recovery_key = has_recovery_key_on_disk(&path).unwrap_or(false);

            {
                let vault = lock(&state.vault)?;
                if vault.unlocked {
                    return Ok(json!({
                        "success": true,
                        "profiles": profile_infos(&vault),
                        "hasRecoveryKey": has_recovery_key,
                    }));
                }
            }

            let passphrase = match read_stored_passphrase() {
                KeychainReadResult::Available(Some(passphrase)) => passphrase,
                KeychainReadResult::Available(None) => {
                    return Ok(json!({
                        "success": false,
                        "profiles": [],
                        "hasRecoveryKey": has_recovery_key,
                        "reason": "no_stored_passphrase",
                    }));
                }
                KeychainReadResult::Unavailable(detail) => {
                    return Ok(json!({
                        "success": false,
                        "profiles": [],
                        "hasRecoveryKey": has_recovery_key,
                        "reason": "keychain_unavailable",
                        "detail": detail,
                    }));
                }
            };

            match unlock_with_passphrase(&path, &passphrase) {
                Ok(unlock) => {
                    let mut vault = lock(&state.vault)?;
                    vault.unlocked = true;
                    vault.data = Some(unlock.data);
                    vault.key = Some(unlock.key);
                    vault.salt = Some(unlock.salt);
                    vault.recovery_salt = unlock.recovery_salt;
                    vault.recovery_key = None;

                    if unlock.needs_rewrite {
                        save_vault(&path, &vault)?;
                    }

                    Ok(json!({
                        "success": true,
                        "profiles": profile_infos(&vault),
                        "hasRecoveryKey": unlock.has_recovery_key,
                    }))
                }
                Err(_) => {
                    let _ = clear_stored_passphrase();
                    Ok(json!({
                        "success": false,
                        "profiles": [],
                        "hasRecoveryKey": has_recovery_key,
                        "reason": "stale_stored_passphrase",
                    }))
                }
            }
        }
        "vault:lock" => {
            let mut vault = lock(&state.vault)?;
            lock_vault_runtime(&mut vault);
            stop_all_folder_sync_rules(&app);
            refresh_tray_menu(&app);
            Ok(Value::Null)
        }
        "vault:keychain-status" => {
            let (has_stored, available, error) = match read_stored_passphrase() {
                KeychainReadResult::Available(Some(_)) => (true, true, String::new()),
                KeychainReadResult::Available(None) => (false, true, String::new()),
                KeychainReadResult::Unavailable(detail) => (false, false, detail),
            };
            Ok(json!({
                "hasStoredPassphrase": has_stored,
                "available": available,
                "error": error,
            }))
        }
        "vault:keychain-clear" => match clear_stored_passphrase() {
            Ok(had) => Ok(json!({ "success": true, "hadStoredPassphrase": had })),
            Err(_) => Ok(json!({ "success": false, "hadStoredPassphrase": false })),
        },
        "vault:recover-key" => {
            let input: RecoveryKeyInput = parse_payload(payload)?;
            let path = vault_path()?;
            if !path.exists() {
                return Ok(json!({ "success": false, "profiles": [] }));
            }

            match unlock_with_recovery_key(&path, input.recovery_key.trim()) {
                Ok(unlock) => {
                    let mut vault = lock(&state.vault)?;
                    vault.unlocked = true;
                    vault.data = Some(unlock.data);
                    vault.key = None;
                    vault.salt = Some(unlock.salt);
                    vault.recovery_salt = Some(unlock.recovery_salt);
                    vault.recovery_key = Some(unlock.recovery_key);
                    let _ = clear_stored_passphrase();

                    Ok(json!({
                        "success": true,
                        "profiles": profile_infos(&vault),
                    }))
                }
                Err(_) => Ok(json!({ "success": false, "profiles": [] })),
            }
        }
        "vault:change-passphrase" => {
            let input: ChangePassphraseInput = parse_payload(payload)?;
            if input.new_passphrase.trim().is_empty() {
                return Err("Passphrase cannot be empty".to_string());
            }

            let path = vault_path()?;
            let mut vault = lock(&state.vault)?;
            ensure_unlocked(&vault)?;

            let new_salt = random_bytes::<SALT_BYTES>();
            let new_key = derive_key(&input.new_passphrase, &new_salt);
            let new_recovery_salt = random_bytes::<SALT_BYTES>();
            let new_recovery_key_plain = generate_recovery_key();
            let new_recovery_key = derive_key(&new_recovery_key_plain, &new_recovery_salt);

            vault.key = Some(new_key);
            vault.salt = Some(new_salt.to_vec());
            vault.recovery_key = Some(new_recovery_key);
            vault.recovery_salt = Some(new_recovery_salt.to_vec());
            save_vault(&path, &vault)?;
            drop(vault);

            if input.remember.unwrap_or(false) {
                if let Err(err) = store_passphrase(&input.new_passphrase) {
                    eprintln!("{err}");
                }
            } else {
                let _ = clear_stored_passphrase();
            }

            Ok(json!({ "success": true, "recoveryKey": new_recovery_key_plain }))
        }
        "vault:add-recovery-key" => {
            let path = vault_path()?;
            let mut vault = lock(&state.vault)?;
            ensure_writable(&vault)?;

            let recovery_salt = random_bytes::<SALT_BYTES>();
            let recovery_key_plain = generate_recovery_key();
            let recovery_key = derive_key(&recovery_key_plain, &recovery_salt);

            vault.recovery_key = Some(recovery_key);
            vault.recovery_salt = Some(recovery_salt.to_vec());
            save_vault(&path, &vault)?;

            Ok(json!({ "recoveryKey": recovery_key_plain }))
        }
        "vault:has-recovery-key" => {
            let path = vault_path()?;
            Ok(json!({ "hasRecoveryKey": has_recovery_key_on_disk(&path)? }))
        }
        "vault:reset" => {
            let path = vault_path()?;
            if path.exists() {
                let _ = fs::remove_file(path);
            }
            let _ = clear_stored_passphrase();

            let mut vault = lock(&state.vault)?;
            *vault = VaultRuntime::default();
            stop_all_folder_sync_rules(&app);
            refresh_tray_menu(&app);
            Ok(json!({ "success": true }))
        }

        "profile:list" => {
            let vault = lock(&state.vault)?;
            ensure_unlocked(&vault)?;
            Ok(json!(profile_infos(&vault)))
        }
        "profile:add" => {
            let input: ProfileInput = parse_payload(payload)?;
            let path = vault_path()?;
            let mut vault = lock(&state.vault)?;
            ensure_writable(&vault)?;

            let timestamp = now_iso();
            let profile = Profile {
                id: Uuid::new_v4().to_string(),
                name: input.name,
                provider: input.provider,
                access_key_id: input.access_key_id,
                secret_access_key: input.secret_access_key,
                session_token: input.session_token,
                endpoint: input.endpoint,
                region: input.region,
                default_bucket: input.default_bucket,
                created_at: timestamp.clone(),
                updated_at: timestamp,
            };

            let data = vault
                .data
                .as_mut()
                .ok_or_else(|| "Vault is locked".to_string())?;
            data.profiles.push(profile.clone());
            save_vault(&path, &vault)?;

            Ok(json!(to_profile_info(&profile)))
        }
        "profile:update" => {
            let input: ProfileUpdateInput = parse_payload(payload)?;
            let path = vault_path()?;
            let mut vault = lock(&state.vault)?;
            ensure_writable(&vault)?;

            let data = vault
                .data
                .as_mut()
                .ok_or_else(|| "Vault is locked".to_string())?;

            let Some(profile) = data
                .profiles
                .iter_mut()
                .find(|profile| profile.id == input.id)
            else {
                return Err("Profile not found".to_string());
            };

            profile.name = input.name;
            profile.provider = input.provider;
            if let Some(access_key_id) = input.access_key_id {
                if !access_key_id.trim().is_empty() {
                    profile.access_key_id = access_key_id;
                }
            }
            if let Some(secret_access_key) = input.secret_access_key {
                if !secret_access_key.trim().is_empty() {
                    profile.secret_access_key = secret_access_key;
                }
            }
            if let Some(session_token) = input.session_token {
                profile.session_token = session_token.filter(|value| !value.trim().is_empty());
            }
            profile.endpoint = input.endpoint;
            profile.region = input.region;
            profile.default_bucket = input.default_bucket;
            profile.updated_at = now_iso();

            if profile.access_key_id.trim().is_empty() || profile.secret_access_key.trim().is_empty()
            {
                return Err("Profile credentials cannot be empty".to_string());
            }

            let profile_info = to_profile_info(profile);
            save_vault(&path, &vault)?;

            Ok(json!(profile_info))
        }
        "profile:remove" => {
            let input: IdInput = parse_payload(payload)?;
            let path = vault_path()?;
            let mut vault = lock(&state.vault)?;
            ensure_writable(&vault)?;

            let data = vault
                .data
                .as_mut()
                .ok_or_else(|| "Vault is locked".to_string())?;
            let before = data.profiles.len();
            data.profiles.retain(|profile| profile.id != input.id);

            if before == data.profiles.len() {
                return Err("Profile not found".to_string());
            }

            save_vault(&path, &vault)?;
            Ok(Value::Null)
        }
        "profile:test" => {
            let input: ProfileTestInput = parse_payload(payload)?;
            let profile = Profile {
                id: "test".to_string(),
                name: "test".to_string(),
                provider: input.provider,
                access_key_id: input.access_key_id,
                secret_access_key: input.secret_access_key,
                session_token: None,
                endpoint: input.endpoint,
                region: Some(input.region),
                default_bucket: input.default_bucket.clone(),
                created_at: now_iso(),
                updated_at: now_iso(),
            };

            let client = match to_s3_client(&profile) {
                Ok(client) => client,
                Err(error) => {
                    return Ok(json!({
                        "success": false,
                        "bucketCount": 0,
                        "error": error,
                    }));
                }
            };

            if let Some(default_bucket) = input.default_bucket {
                match client
                    .head_bucket()
                    .bucket(default_bucket.clone())
                    .send()
                    .await
                {
                    Ok(_) => {
                        return Ok(json!({
                            "success": true,
                            "bucketCount": 1,
                        }));
                    }
                    Err(_) => {
                        // Fall back to bucket listing below for providers that deny HeadBucket.
                    }
                }
            }

            match client.list_buckets().send().await {
                Ok(output) => Ok(json!({
                    "success": true,
                    "bucketCount": output.buckets().len(),
                })),
                Err(err) => Ok(json!({
                    "success": false,
                    "bucketCount": 0,
                    "error": err.to_string(),
                })),
            }
        }

        "buckets:list" => {
            let input: ProfileIdInput = parse_payload(payload)?;
            let profile = profile_for_id(&state, &input.profile_id)?;
            let client = to_s3_client(&profile)?;

            match client.list_buckets().send().await {
                Ok(output) => {
                    let buckets: Vec<Value> = output
                        .buckets()
                        .iter()
                        .filter_map(|bucket| {
                            let name = bucket.name()?;
                            let creation_date = bucket.creation_date().map(s3_datetime_to_iso);
                            Some(json!({
                                "name": name,
                                "creationDate": creation_date,
                            }))
                        })
                        .collect();
                    Ok(json!(buckets))
                }
                Err(err) => {
                    if let Some(default_bucket) = profile.default_bucket {
                        if !default_bucket.trim().is_empty() {
                            return Ok(json!([{ "name": default_bucket }]));
                        }
                    }

                    Err(format!("Unable to list buckets. {}", err))
                }
            }
        }

        "objects:list" => {
            let input: ObjectsListInput = parse_payload(payload)?;
            let profile = profile_for_id(&state, &input.profile_id)?;
            let client = to_s3_client(&profile)?;

            let mut request = client
                .list_objects_v2()
                .bucket(input.bucket.clone())
                .delimiter("/");

            if let Some(prefix) = input.prefix.as_deref() {
                request = request.prefix(prefix);
            }
            if let Some(max_keys) = input.max_keys {
                request = request.max_keys(max_keys.into());
            }
            if let Some(start_after) = input.start_after.as_deref() {
                request = request.start_after(start_after);
            }

            let output = request.send().await.map_err(|err| err.to_string())?;

            let objects: Vec<Value> = output
                .contents()
                .iter()
                .map(|item| {
                    json!({
                        "key": item.key().unwrap_or_default(),
                        "size": item.size().unwrap_or(0).max(0),
                        "lastModified": item.last_modified().map(s3_datetime_to_iso).unwrap_or_default(),
                        "etag": item.e_tag().unwrap_or_default().trim_matches('"'),
                        "storageClass": item.storage_class().map(|value| value.as_str()),
                    })
                })
                .collect();

            let prefixes: Vec<Value> = output
                .common_prefixes()
                .iter()
                .filter_map(|prefix| prefix.prefix().map(|p| json!({ "prefix": p })))
                .collect();

            let next_cursor = output
                .contents()
                .last()
                .and_then(|item| item.key().map(str::to_string));

            Ok(json!({
                "objects": objects,
                "prefixes": prefixes,
                "isTruncated": output.is_truncated().unwrap_or(false),
                "nextCursor": next_cursor,
            }))
        }
        "objects:delete" => {
            let input: ObjectsDeleteInput = parse_payload(payload)?;
            if input.keys.is_empty() {
                return Ok(Value::Null);
            }

            let profile = profile_for_id(&state, &input.profile_id)?;
            let client = to_s3_client(&profile)?;

            if input.keys.len() == 1 {
                client
                    .delete_object()
                    .bucket(input.bucket)
                    .key(input.keys[0].clone())
                    .send()
                    .await
                    .map_err(|err| err.to_string())?;
                return Ok(Value::Null);
            }

            let mut objects = Vec::with_capacity(input.keys.len());
            for key in input.keys {
                let object = ObjectIdentifier::builder()
                    .key(key)
                    .build()
                    .map_err(|err| format!("Invalid object identifier: {err}"))?;
                objects.push(object);
            }

            let delete = Delete::builder()
                .set_objects(Some(objects))
                .build()
                .map_err(|err| format!("Invalid delete payload: {err}"))?;

            client
                .delete_objects()
                .bucket(input.bucket)
                .delete(delete)
                .send()
                .await
                .map_err(|err| err.to_string())?;

            Ok(Value::Null)
        }
        "objects:rename" => {
            let input: ObjectsRenameInput = parse_payload(payload)?;
            let profile = profile_for_id(&state, &input.profile_id)?;
            let client = to_s3_client(&profile)?;

            let source_key = utf8_percent_encode(&input.old_key, COPY_SOURCE_ENCODE_SET);
            let copy_source = format!("{}/{}", input.bucket, source_key);

            client
                .copy_object()
                .copy_source(copy_source)
                .bucket(input.bucket.clone())
                .key(input.new_key)
                .send()
                .await
                .map_err(|err| err.to_string())?;

            client
                .delete_object()
                .bucket(input.bucket)
                .key(input.old_key)
                .send()
                .await
                .map_err(|err| err.to_string())?;

            Ok(Value::Null)
        }
        "objects:stat" => {
            let input: ObjectsStatInput = parse_payload(payload)?;
            let profile = profile_for_id(&state, &input.profile_id)?;
            let client = to_s3_client(&profile)?;

            let output = client
                .head_object()
                .bucket(input.bucket)
                .key(input.key)
                .send()
                .await
                .map_err(|err| err.to_string())?;

            Ok(json!({
                "size": output.content_length().unwrap_or(0).max(0),
                "etag": output.e_tag().unwrap_or_default().trim_matches('"'),
                "lastModified": output.last_modified().map(s3_datetime_to_iso).unwrap_or_else(now_iso),
                "type": output.content_type().unwrap_or("application/octet-stream"),
            }))
        }

        "transfer:upload" => {
            let input: UploadInput = parse_payload(payload)?;
            let bytes_total = if input.local_path.trim().is_empty() {
                0
            } else {
                fs::metadata(expand_user_path(&input.local_path))
                    .map(|meta| meta.len() as i64)
                    .unwrap_or(0)
                    .max(0)
            };
            let file_name = input
                .key
                .split('/')
                .filter(|part| !part.is_empty())
                .last()
                .unwrap_or(input.key.as_str())
                .to_string();
            let job_id = enqueue_job(
                &app,
                JobType::Upload,
                file_name,
                format!("Upload to {}/{}", input.bucket, input.key),
                bytes_total,
                JobTaskKind::Upload {
                    profile_id: input.profile_id,
                    bucket: input.bucket,
                    key: input.key,
                    local_path: input.local_path,
                },
            )?;
            Ok(json!({ "jobId": job_id }))
        }
        "transfer:download" => {
            let input: DownloadInput = parse_payload(payload)?;
            let file_name = input
                .key
                .split('/')
                .filter(|part| !part.is_empty())
                .last()
                .unwrap_or(input.key.as_str())
                .to_string();
            let job_id = enqueue_job(
                &app,
                JobType::Download,
                file_name,
                format!("Download {}/{}", input.bucket, input.key),
                0,
                JobTaskKind::Download {
                    profile_id: input.profile_id,
                    bucket: input.bucket,
                    key: input.key,
                    local_path: input.local_path,
                },
            )?;
            Ok(json!({ "jobId": job_id }))
        }
        "transfer:pick-and-upload" => {
            let input: PickUploadInput = parse_payload(payload)?;
            let Some(paths) = FileDialog::new().pick_files() else {
                return Err("No files selected".to_string());
            };
            if paths.is_empty() {
                return Err("No files selected".to_string());
            }

            let mut job_ids = Vec::new();
            for path in paths {
                let file_name = path
                    .file_name()
                    .and_then(|name| name.to_str())
                    .unwrap_or("file")
                    .to_string();
                let key = format!("{}{}", input.prefix, file_name);
                let bytes_total = fs::metadata(&path)
                    .map(|meta| meta.len() as i64)
                    .unwrap_or(0)
                    .max(0);
                let job_id = enqueue_job(
                    &app,
                    JobType::Upload,
                    file_name.clone(),
                    format!("Upload to {}/{}", input.bucket, key),
                    bytes_total,
                    JobTaskKind::Upload {
                        profile_id: input.profile_id.clone(),
                        bucket: input.bucket.clone(),
                        key,
                        local_path: path.to_string_lossy().to_string(),
                    },
                )?;
                job_ids.push(job_id);
            }

            Ok(json!({ "jobIds": job_ids }))
        }
        "transfer:pick-and-upload-folder" => {
            let input: PickUploadInput = parse_payload(payload)?;
            let Some(dir_path) = FileDialog::new().pick_folder() else {
                return Err("No folder selected".to_string());
            };
            let dir_name = dir_path
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("folder")
                .to_string();

            let mut files = Vec::new();
            for entry in WalkDir::new(&dir_path).into_iter().filter_map(Result::ok) {
                if entry.file_type().is_file() {
                    files.push(entry.into_path());
                }
            }
            if files.is_empty() {
                return Err("Selected folder is empty".to_string());
            }

            let mut job_ids = Vec::new();
            for file_path in files {
                let Ok(relative) = file_path.strip_prefix(&dir_path) else {
                    continue;
                };
                let relative_path = normalize_slashes(relative);
                if relative_path.is_empty() {
                    continue;
                }
                let key = format!("{}{}/{}", input.prefix, dir_name, relative_path);
                let bytes_total = fs::metadata(&file_path)
                    .map(|meta| meta.len() as i64)
                    .unwrap_or(0)
                    .max(0);
                let job_id = enqueue_job(
                    &app,
                    JobType::Upload,
                    relative_path.clone(),
                    format!("Upload to {}/{}", input.bucket, key),
                    bytes_total,
                    JobTaskKind::Upload {
                        profile_id: input.profile_id.clone(),
                        bucket: input.bucket.clone(),
                        key,
                        local_path: file_path.to_string_lossy().to_string(),
                    },
                )?;
                job_ids.push(job_id);
            }

            Ok(json!({ "jobIds": job_ids }))
        }
        "transfer:download-folder" => {
            let input: DownloadFolderInput = parse_payload(payload)?;
            let profile = profile_for_id(&state, &input.profile_id)?;
            let client = to_s3_client(&profile)?;
            let Some(destination) = FileDialog::new().pick_folder() else {
                return Err("No destination folder selected".to_string());
            };

            let prefix = normalize_prefix(&input.prefix);
            let objects = s3_list_all_objects(&client, &input.bucket, &prefix).await?;
            if objects.is_empty() {
                return Err("Folder is empty".to_string());
            }

            let folder_name = input
                .prefix
                .trim_end_matches('/')
                .split('/')
                .filter(|part| !part.is_empty())
                .last()
                .unwrap_or("download")
                .to_string();

            let mut job_ids = Vec::new();
            for (key, size, _, _) in objects {
                let relative_path = if prefix.is_empty() {
                    key.clone()
                } else if key.starts_with(&prefix) {
                    key[prefix.len()..].to_string()
                } else {
                    continue;
                };
                if relative_path.is_empty() {
                    continue;
                }
                let local_path = destination
                    .join(&folder_name)
                    .join(Path::new(&relative_path));
                let job_id = enqueue_job(
                    &app,
                    JobType::Download,
                    relative_path.clone(),
                    format!("Download {}/{}", input.bucket, key),
                    size.max(0),
                    JobTaskKind::Download {
                        profile_id: input.profile_id.clone(),
                        bucket: input.bucket.clone(),
                        key,
                        local_path: local_path.to_string_lossy().to_string(),
                    },
                )?;
                job_ids.push(job_id);
            }

            Ok(json!({ "jobIds": job_ids }))
        }
        "transfer:copy" => {
            let input: CopyInput = parse_payload(payload)?;
            let file_name = input
                .source_key
                .split('/')
                .filter(|part| !part.is_empty())
                .last()
                .unwrap_or(input.source_key.as_str())
                .to_string();
            let job_id = enqueue_job(
                &app,
                JobType::Copy,
                file_name,
                format!(
                    "Copy {}/{} -> {}/{}",
                    input.source_bucket, input.source_key, input.dest_bucket, input.dest_key
                ),
                0,
                JobTaskKind::Copy {
                    source_profile_id: input.source_profile_id,
                    source_bucket: input.source_bucket,
                    source_key: input.source_key,
                    dest_profile_id: input.dest_profile_id,
                    dest_bucket: input.dest_bucket,
                    dest_key: input.dest_key,
                },
            )?;
            Ok(json!({ "jobId": job_id }))
        }
        "transfer:move" => {
            let input: CopyInput = parse_payload(payload)?;
            let file_name = input
                .source_key
                .split('/')
                .filter(|part| !part.is_empty())
                .last()
                .unwrap_or(input.source_key.as_str())
                .to_string();
            let job_id = enqueue_job(
                &app,
                JobType::Move,
                file_name,
                format!(
                    "Move {}/{} -> {}/{}",
                    input.source_bucket, input.source_key, input.dest_bucket, input.dest_key
                ),
                0,
                JobTaskKind::Move {
                    source_profile_id: input.source_profile_id,
                    source_bucket: input.source_bucket,
                    source_key: input.source_key,
                    dest_profile_id: input.dest_profile_id,
                    dest_bucket: input.dest_bucket,
                    dest_key: input.dest_key,
                },
            )?;
            Ok(json!({ "jobId": job_id }))
        }
        "transfer:cross-bucket" => {
            let input: CrossBucketInput = parse_payload(payload)?;
            let source_profile = profile_for_id(&state, &input.source_profile_id)?;
            let source_client = to_s3_client(&source_profile)?;

            let mut expanded_keys = Vec::new();
            for key in &input.keys {
                if key.ends_with('/') {
                    let children =
                        s3_list_all_objects(&source_client, &input.source_bucket, key).await?;
                    expanded_keys
                        .extend(children.into_iter().map(|(child_key, _, _, _)| child_key));
                } else {
                    expanded_keys.push(key.clone());
                }
            }
            if expanded_keys.is_empty() {
                return Err("No objects to transfer".to_string());
            }

            let mut seen = HashSet::new();
            let mut unique_keys = Vec::new();
            for key in expanded_keys {
                if seen.insert(key.clone()) {
                    unique_keys.push(key);
                }
            }

            let is_move = input.mode == "move";
            let mut job_ids = Vec::new();
            for source_key in unique_keys {
                let relative_path = if source_key.starts_with(&input.source_prefix) {
                    source_key[input.source_prefix.len()..].to_string()
                } else {
                    source_key.clone()
                };
                let dest_key = format!("{}{}", input.dest_prefix, relative_path);
                let file_name = source_key
                    .split('/')
                    .filter(|part| !part.is_empty())
                    .last()
                    .unwrap_or(source_key.as_str())
                    .to_string();
                let job_id = enqueue_job(
                    &app,
                    if is_move {
                        JobType::Move
                    } else {
                        JobType::Copy
                    },
                    file_name,
                    format!(
                        "{} -> {}/{}",
                        if is_move { "Move" } else { "Copy" },
                        input.dest_bucket,
                        dest_key
                    ),
                    0,
                    if is_move {
                        JobTaskKind::Move {
                            source_profile_id: input.source_profile_id.clone(),
                            source_bucket: input.source_bucket.clone(),
                            source_key,
                            dest_profile_id: input.dest_profile_id.clone(),
                            dest_bucket: input.dest_bucket.clone(),
                            dest_key,
                        }
                    } else {
                        JobTaskKind::Copy {
                            source_profile_id: input.source_profile_id.clone(),
                            source_bucket: input.source_bucket.clone(),
                            source_key,
                            dest_profile_id: input.dest_profile_id.clone(),
                            dest_bucket: input.dest_bucket.clone(),
                            dest_key,
                        }
                    },
                )?;
                job_ids.push(job_id);
            }

            Ok(json!({ "jobIds": job_ids }))
        }
        "transfer:download-archive" => {
            let input: DownloadArchiveInput = parse_payload(payload)?;
            let profile = profile_for_id(&state, &input.profile_id)?;
            let client = to_s3_client(&profile)?;

            let mut resolved_keys = input.keys.clone();
            let prefix = input.prefix.unwrap_or_default();
            if resolved_keys.is_empty() && !prefix.is_empty() {
                let objects = s3_list_all_objects(&client, &input.bucket, &prefix).await?;
                resolved_keys = objects.into_iter().map(|(key, _, _, _)| key).collect();
            }
            if resolved_keys.is_empty() {
                return Err("No objects selected for archive".to_string());
            }

            let mut expanded_keys: Vec<(String, i64)> = Vec::new();
            for key in resolved_keys {
                if key.ends_with('/') {
                    let children = s3_list_all_objects(&client, &input.bucket, &key).await?;
                    expanded_keys.extend(
                        children
                            .into_iter()
                            .map(|(child_key, child_size, _, _)| (child_key, child_size.max(0))),
                    );
                } else {
                    let head = client
                        .head_object()
                        .bucket(input.bucket.clone())
                        .key(key.clone())
                        .send()
                        .await
                        .map_err(|err| err.to_string())?;
                    expanded_keys.push((key, head.content_length().unwrap_or(0).max(0)));
                }
            }
            if expanded_keys.is_empty() {
                return Err("Selected folders are empty".to_string());
            }

            let default_name = input.archive_name.unwrap_or_else(|| {
                if !prefix.is_empty() {
                    let name = prefix
                        .trim_end_matches('/')
                        .split('/')
                        .filter(|part| !part.is_empty())
                        .last()
                        .unwrap_or("archive");
                    format!("{name}.tar.gz")
                } else {
                    format!("{}-export.tar.gz", input.bucket)
                }
            });
            let archive_name = if default_name.ends_with(".tar.gz") {
                default_name
            } else {
                format!("{default_name}.tar.gz")
            };
            let Some(destination_path) = FileDialog::new().set_file_name(&archive_name).save_file()
            else {
                return Err("No destination folder selected".to_string());
            };

            let mut seen = HashSet::new();
            let mut unique_keys = Vec::new();
            let mut bytes_total = 0i64;
            for (key, size) in expanded_keys {
                if seen.insert(key.clone()) {
                    unique_keys.push(key);
                    bytes_total += size.max(0);
                }
            }

            let common_prefix = if !prefix.is_empty() {
                normalize_prefix(&prefix)
            } else {
                let mut common: Option<String> = None;
                for key in &unique_keys {
                    let parent = if let Some((head, _)) = key.rsplit_once('/') {
                        format!("{head}/")
                    } else {
                        String::new()
                    };
                    common = match common {
                        Some(existing) => {
                            let mut candidate = String::new();
                            for (a, b) in existing.chars().zip(parent.chars()) {
                                if a == b {
                                    candidate.push(a);
                                } else {
                                    break;
                                }
                            }
                            while !candidate.is_empty() && !candidate.ends_with('/') {
                                candidate.pop();
                            }
                            Some(candidate)
                        }
                        None => Some(parent),
                    };
                }
                common.unwrap_or_default()
            };

            let file_name = destination_path
                .file_name()
                .map(|value| value.to_string_lossy().to_string())
                .unwrap_or(archive_name.clone());
            let job_id = enqueue_job(
                &app,
                JobType::Archive,
                file_name,
                format!(
                    "Archive {} object(s) from {}",
                    unique_keys.len(),
                    input.bucket
                ),
                bytes_total.max(0),
                JobTaskKind::Archive {
                    profile_id: input.profile_id.clone(),
                    bucket: input.bucket.clone(),
                    keys: unique_keys,
                    common_prefix,
                    destination_path: destination_path.to_string_lossy().to_string(),
                },
            )?;

            Ok(json!({ "jobId": job_id }))
        }

        "sync:preview" => {
            let input: SyncInput = parse_payload(payload)?;
            let diff = generate_sync_diff(&state, &input).await?;
            Ok(json!(diff))
        }
        "sync:execute" => {
            let input: SyncInput = parse_payload(payload)?;
            let diff = generate_sync_diff(&state, &input).await?;
            let job_id = execute_sync_diff(&app, &input, &diff)?;
            Ok(json!({ "jobId": job_id }))
        }

        "jobs:list" => {
            let jobs_runtime = lock(&state.jobs)?;
            let mut seen = HashSet::new();
            let mut list = Vec::new();
            for id in &jobs_runtime.order {
                if let Some(job) = jobs_runtime.jobs.get(id) {
                    seen.insert(id.clone());
                    list.push(job.clone());
                }
            }
            for (id, job) in &jobs_runtime.jobs {
                if !seen.contains(id) {
                    list.push(job.clone());
                }
            }
            Ok(json!(list))
        }
        "jobs:cancel" => {
            let input: JobIdInput = parse_payload(payload)?;
            cancel_job(&app, &input.job_id);
            Ok(Value::Null)
        }
        "jobs:clear" => {
            let mut jobs_runtime = lock(&state.jobs)?;
            let removable: Vec<String> = jobs_runtime
                .jobs
                .iter()
                .filter_map(|(id, job)| {
                    let terminal = matches!(
                        job.status,
                        JobStatus::Completed | JobStatus::Failed | JobStatus::Cancelled
                    );
                    if terminal && !jobs_runtime.running.contains(id) {
                        Some(id.clone())
                    } else {
                        None
                    }
                })
                .collect();

            for id in removable {
                jobs_runtime.jobs.remove(&id);
                jobs_runtime.cancel_flags.remove(&id);
                jobs_runtime.queue.retain(|task| task.id != id);
            }
            let known_ids: HashSet<String> = jobs_runtime.jobs.keys().cloned().collect();
            let running_ids = jobs_runtime.running.clone();
            jobs_runtime
                .order
                .retain(|id| known_ids.contains(id) || running_ids.contains(id));
            drop(jobs_runtime);
            persist_job_history_snapshot(&app);
            Ok(Value::Null)
        }
        "jobs:get-concurrency" => {
            let jobs_runtime = lock(&state.jobs)?;
            Ok(json!({ "concurrency": jobs_runtime.concurrency }))
        }
        "jobs:set-concurrency" => {
            let input: JobConcurrencyInput = parse_payload(payload)?;
            {
                let mut jobs_runtime = lock(&state.jobs)?;
                jobs_runtime.concurrency = input.concurrency.clamp(1, 10);
            }
            try_start_queued_jobs(app.clone());
            let jobs_runtime = lock(&state.jobs)?;
            Ok(json!({ "concurrency": jobs_runtime.concurrency }))
        }

        "favorites:load" => Ok(json!(load_favorites_from_disk())),
        "favorites:save" => {
            let input: FavoritesSaveInput = parse_payload(payload)?;
            save_favorites_to_disk(&input.favorites)?;
            Ok(Value::Null)
        }

        "share:generate" => {
            let input: ShareGenerateInput = parse_payload(payload)?;
            let ttl = input.expires_in.clamp(1, 604_800);
            let expires_at = (Utc::now() + Duration::seconds(ttl)).to_rfc3339();
            let profile = profile_for_id(&state, &input.profile_id)?;
            let client = to_s3_client(&profile)?;

            let config = PresigningConfig::expires_in(StdDuration::from_secs(ttl as u64))
                .map_err(|err| format!("Invalid presign ttl: {err}"))?;

            let presigned = client
                .get_object()
                .bucket(input.bucket)
                .key(input.key.clone())
                .presigned(config)
                .await
                .map_err(|err| err.to_string())?;

            Ok(json!({
                "url": presigned.uri().to_string(),
                "expiresAt": expires_at,
                "key": input.key,
            }))
        }

        "folder-sync:list-rules" => Ok(json!(load_folder_sync_rules_records())),
        "folder-sync:add-rule" => {
            let mut rule = payload
                .as_object()
                .cloned()
                .ok_or_else(|| "Invalid payload: expected object".to_string())?;

            let mut rules = load_folder_sync_rules_records();
            let duplicate = rules.iter().any(|existing| {
                existing.profile_id == map_str(&rule, "profileId").unwrap_or_default()
                    && existing.bucket == map_str(&rule, "bucket").unwrap_or_default()
                    && existing.bucket_prefix == map_str(&rule, "bucketPrefix").unwrap_or_default()
                    && existing.local_path == map_str(&rule, "localPath").unwrap_or_default()
            });
            if duplicate {
                return Err("A sync rule already exists for this folder and bucket".to_string());
            }

            let profile_id = map_str(&rule, "profileId")
                .ok_or_else(|| "Invalid payload: missing profileId".to_string())?;
            let _ = profile_for_id(&state, profile_id)?;

            rule.insert("id".to_string(), Value::String(Uuid::new_v4().to_string()));
            rule.insert("enabled".to_string(), Value::Bool(true));
            rule.insert("createdAt".to_string(), Value::String(now_iso()));

            if !rule.contains_key("pollIntervalMs") {
                rule.insert("pollIntervalMs".to_string(), json!(30_000));
            }
            if !rule.contains_key("excludePatterns") {
                rule.insert(
                    "excludePatterns".to_string(),
                    json!([".DS_Store", "Thumbs.db", ".object0-tmp", "desktop.ini"]),
                );
            }

            let rule_value = Value::Object(rule);
            let rule_record = serde_json::from_value::<FolderSyncRuleRecord>(rule_value.clone())
                .map_err(|err| format!("Invalid folder sync rule: {err}"))?;
            rules.push(rule_record.clone());
            save_folder_sync_rules_records(&rules)?;
            if rule_record.enabled {
                let _ = start_folder_sync_rule(&app, &rule_record.id);
            }
            refresh_tray_menu(&app);
            Ok(json!(rule_record))
        }
        "folder-sync:update-rule" => {
            let update = payload
                .as_object()
                .cloned()
                .ok_or_else(|| "Invalid payload: expected object".to_string())?;
            let id = update
                .get("id")
                .and_then(Value::as_str)
                .ok_or_else(|| "Invalid payload: missing id".to_string())?
                .to_string();

            let mut rules = load_folder_sync_rules_records();
            if let Some(rule) = rules.iter_mut().find(|rule| rule.id == id) {
                let mut rule_value = serde_json::to_value(rule.clone())
                    .map_err(|err| format!("Failed to serialize stored rule: {err}"))?;
                let Some(rule_obj) = rule_value.as_object_mut() else {
                    return Err("Invalid stored rule format".to_string());
                };
                for (key, value) in update {
                    rule_obj.insert(key, value);
                }
                let updated_rule = serde_json::from_value::<FolderSyncRuleRecord>(rule_value)
                    .map_err(|err| format!("Invalid folder sync update: {err}"))?;
                *rule = updated_rule.clone();
                save_folder_sync_rules_records(&rules)?;

                stop_folder_sync_rule(&app, &id);
                if updated_rule.enabled {
                    let _ = start_folder_sync_rule(&app, &id);
                }
                refresh_tray_menu(&app);
                return Ok(json!(updated_rule));
            }

            Err("Rule not found".to_string())
        }
        "folder-sync:remove-rule" => {
            let input: IdInput = parse_payload(payload)?;
            let mut rules = load_folder_sync_rules_records();
            let before = rules.len();
            rules.retain(|rule| rule.id != input.id);

            if before == rules.len() {
                return Err("Rule not found".to_string());
            }

            stop_folder_sync_rule(&app, &input.id);
            save_folder_sync_rules_records(&rules)?;
            remove_folder_sync_file_records(&input.id);

            let state = app.state::<AppState>();
            if let Ok(mut runtime) = lock(&state.folder_sync) {
                runtime.statuses.remove(&input.id);
            }
            refresh_tray_menu(&app);
            Ok(Value::Null)
        }
        "folder-sync:toggle-rule" => {
            let input: FolderSyncToggleInput = parse_payload(payload)?;
            let mut rules = load_folder_sync_rules_records();

            if let Some(rule) = rules.iter_mut().find(|rule| rule.id == input.id) {
                rule.enabled = input.enabled;
                let updated = rule.clone();
                save_folder_sync_rules_records(&rules)?;

                if input.enabled {
                    let _ = start_folder_sync_rule(&app, &input.id);
                } else {
                    stop_folder_sync_rule(&app, &input.id);
                    let _ = set_folder_sync_status(
                        &app,
                        &input.id,
                        "idle",
                        0,
                        Some(now_iso()),
                        None,
                        None,
                    );
                }
                refresh_tray_menu(&app);
                return Ok(json!(updated));
            }

            Err("Rule not found".to_string())
        }
        "folder-sync:sync-now" => {
            let input: IdInput = parse_payload(payload)?;
            trigger_folder_sync_now(&app, &input.id)?;
            refresh_tray_menu(&app);
            Ok(Value::Null)
        }
        "folder-sync:start-all" => {
            start_all_folder_sync_rules(&app)?;
            refresh_tray_menu(&app);
            Ok(Value::Null)
        }
        "folder-sync:stop-all" => {
            stop_all_folder_sync_rules(&app);
            refresh_tray_menu(&app);
            Ok(Value::Null)
        }
        "folder-sync:pause-all" => {
            pause_all_folder_sync_rules(&app);
            refresh_tray_menu(&app);
            Ok(Value::Null)
        }
        "folder-sync:resume-all" => {
            resume_all_folder_sync_rules(&app);
            refresh_tray_menu(&app);
            Ok(Value::Null)
        }
        "folder-sync:get-status" => Ok(json!(folder_sync_statuses_snapshot(&app))),
        "folder-sync:preview" => {
            let input: IdInput = parse_payload(payload)?;
            let rule = get_folder_sync_rule(&input.id)?;
            let profile = profile_for_id(&state, &rule.profile_id)?;
            let client = to_s3_client(&profile)?;
            let known_records = load_folder_sync_file_records(&rule.id);
            let diff = generate_folder_sync_diff_for_rule(&rule, &client, &known_records).await?;
            Ok(json!(diff))
        }
        "folder-sync:pick-folder" => {
            let path = FileDialog::new()
                .pick_folder()
                .map(|path| path.to_string_lossy().to_string());
            Ok(json!({ "path": path }))
        }

        "updater:check" => {
            let (cached_version, cached_ready) = updater_cached_state(&app);
            let current_version = env!("CARGO_PKG_VERSION").to_string();

            let updater = match configured_updater(&app) {
                Ok(updater) => updater,
                Err(err) => {
                    let version = cached_version.unwrap_or(current_version);
                    return Ok(json!({
                        "version": version,
                        "hash": "",
                        "updateAvailable": cached_ready,
                        "updateReady": cached_ready,
                        "error": format!("Updater unavailable: {err}")
                    }));
                }
            };

            match updater.check().await {
                Ok(Some(update)) => {
                    let version = update.version;
                    let update_ready =
                        cached_ready && cached_version.as_deref() == Some(version.as_str());
                    Ok(json!({
                        "version": version,
                        "hash": "",
                        "updateAvailable": true,
                        "updateReady": update_ready,
                        "error": ""
                    }))
                }
                Ok(None) => {
                    let version = cached_version.unwrap_or(current_version);
                    Ok(json!({
                        "version": version,
                        "hash": "",
                        "updateAvailable": cached_ready,
                        "updateReady": cached_ready,
                        "error": ""
                    }))
                }
                Err(err) => {
                    let version = cached_version.unwrap_or(current_version);
                    Ok(json!({
                        "version": version,
                        "hash": "",
                        "updateAvailable": cached_ready,
                        "updateReady": cached_ready,
                        "error": format!("Update check failed: {err}")
                    }))
                }
            }
        }
        "updater:download" => {
            let success = download_update_if_available(&app).await?;
            Ok(json!({ "success": success }))
        }
        "updater:apply" => {
            apply_downloaded_update(&app).await?;
            Ok(Value::Null)
        }
        "updater:local-info" => Ok(json!({
            "version": env!("CARGO_PKG_VERSION"),
            "hash": "",
            "baseUrl": updater_local_info_base_url(),
            "channel": updater_channel(),
            "name": "object0",
            "identifier": "dev.object0.app"
        })),

        _ => Err(format!("RPC method not implemented yet: {method}")),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .setup(|app| {
            hydrate_job_history_runtime(app.app_handle());

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
        .invoke_handler(tauri::generate_handler![rpc_request])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

//! Generic helpers: state-lock, timestamps, payload parsing, atomic file IO,
//! path normalization/sanitization, and glob matching.

use super::*;

pub(crate) fn expand_user_path(path: &str) -> PathBuf {
    if let Some(stripped) = path.strip_prefix("~/") {
        if let Ok(home) = std::env::var("HOME") {
            return PathBuf::from(home).join(stripped);
        }
    }
    PathBuf::from(path)
}

pub(crate) fn sanitize_relative_path(relative_path: &str) -> Option<PathBuf> {
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

pub(crate) fn normalize_slashes(path: &Path) -> String {
    path.components()
        .filter_map(|part| match part {
            Component::Normal(value) => Some(value.to_string_lossy().to_string()),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("/")
}

pub(crate) fn join_prefix_key(prefix: &str, key: &str) -> String {
    format!("{}{}", normalize_prefix(prefix), key)
}

pub(crate) fn wildcard_matches(pattern: &str, text: &str) -> bool {
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

pub(crate) fn is_excluded_path(relative_path: &str, patterns: &[String]) -> bool {
    let normalized = relative_path.replace('\\', "/");
    let basename = normalized.rsplit('/').next().unwrap_or_default();

    patterns.iter().any(|pattern| {
        let pat = pattern.replace('\\', "/");
        wildcard_matches(&pat, &normalized) || wildcard_matches(&pat, basename)
    })
}

pub(crate) fn file_mtime_millis(path: &Path) -> Option<i64> {
    fs::metadata(path)
        .ok()
        .and_then(|meta| meta.modified().ok())
        .and_then(|mtime| mtime.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
}

pub(crate) fn scan_local_directory(local_path: &Path, exclude_patterns: &[String]) -> Vec<LocalFileInfo> {
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

pub(crate) fn parse_iso_millis(value: &str) -> Option<i64> {
    chrono::DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|dt| dt.timestamp_millis())
}


pub(crate) fn normalize_prefix(prefix: &str) -> String {
    if prefix.is_empty() {
        String::new()
    } else if prefix.ends_with('/') {
        prefix.to_string()
    } else {
        format!("{prefix}/")
    }
}

pub(crate) fn map_str<'a>(map: &'a Map<String, Value>, key: &str) -> Option<&'a str> {
    map.get(key).and_then(Value::as_str)
}

pub(crate) fn lock_state<'a, T>(mutex: &'a Mutex<T>) -> Result<std::sync::MutexGuard<'a, T>, String> {
    mutex.lock().map_err(|_| "State lock poisoned".to_string())
}

pub(crate) fn now_iso() -> String {
    Utc::now().to_rfc3339()
}

pub(crate) fn payload_or_null(payload: Option<Value>) -> Value {
    payload.unwrap_or(Value::Null)
}

pub(crate) fn parse_payload<T>(payload: Value) -> Result<T, String>
where
    T: for<'de> Deserialize<'de>,
{
    serde_json::from_value(payload).map_err(|err| format!("Invalid payload: {err}"))
}

pub(crate) fn ensure_parent_dir(path: &Path) -> Result<(), String> {
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
pub(crate) fn write_atomic(path: &Path, contents: &[u8]) -> Result<(), String> {
    ensure_parent_dir(path)?;
    let tmp = path.with_file_name(format!(".object0-{}.tmp", Uuid::new_v4()));
    fs::write(&tmp, contents)
        .map_err(|err| format!("Failed to write {}: {err}", tmp.display()))?;
    fs::rename(&tmp, path).map_err(|err| {
        let _ = fs::remove_file(&tmp); // best-effort cleanup of the orphan temp
        format!("Failed to persist {}: {err}", path.display())
    })
}

//! On-disk persistence for favorites, job history, and folder-sync rules +
//! per-rule file records.

use super::*;

pub(crate) fn load_favorites_from_disk() -> Vec<String> {
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

pub(crate) fn save_favorites_to_disk(favorites: &[String]) -> Result<(), String> {
    let path = favorites_path()?;
    let payload = serde_json::to_string(favorites)
        .map_err(|err| format!("Failed to serialize favorites: {err}"))?;
    write_atomic(&path, payload.as_bytes())
}

pub(crate) fn is_terminal_job_status(status: JobStatus) -> bool {
    matches!(
        status,
        JobStatus::Completed | JobStatus::Failed | JobStatus::Cancelled
    )
}

pub(crate) fn load_job_history_from_disk() -> Vec<JobInfo> {
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

pub(crate) fn save_job_history_to_disk(history: &[JobInfo]) -> Result<(), String> {
    let path = job_history_path()?;
    let payload = serde_json::to_string(history)
        .map_err(|err| format!("Failed to serialize job history: {err}"))?;
    write_atomic(&path, payload.as_bytes())
}

pub(crate) fn load_folder_sync_rules_from_disk() -> Vec<Value> {
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

pub(crate) fn save_folder_sync_rules_to_disk(rules: &[Value]) -> Result<(), String> {
    let path = folder_sync_rules_path()?;
    let payload = serde_json::to_string_pretty(rules)
        .map_err(|err| format!("Failed to serialize folder sync rules: {err}"))?;
    write_atomic(&path, payload.as_bytes())
}

pub(crate) fn remove_folder_sync_file_records(rule_id: &str) {
    if let Ok(path) = folder_sync_records_path(rule_id) {
        let _ = fs::remove_file(path);
    }
}

pub(crate) fn load_folder_sync_rules_records() -> Vec<FolderSyncRuleRecord> {
    load_folder_sync_rules_from_disk()
        .into_iter()
        .filter_map(|value| serde_json::from_value::<FolderSyncRuleRecord>(value).ok())
        .collect()
}

pub(crate) fn save_folder_sync_rules_records(rules: &[FolderSyncRuleRecord]) -> Result<(), String> {
    let values: Vec<Value> = rules
        .iter()
        .map(serde_json::to_value)
        .collect::<Result<Vec<_>, _>>()
        .map_err(|err| format!("Failed to serialize folder sync rules: {err}"))?;
    save_folder_sync_rules_to_disk(&values)
}

pub(crate) fn get_folder_sync_rule(rule_id: &str) -> Result<FolderSyncRuleRecord, String> {
    load_folder_sync_rules_records()
        .into_iter()
        .find(|rule| rule.id == rule_id)
        .ok_or_else(|| format!("Rule not found: {rule_id}"))
}

pub(crate) fn load_folder_sync_file_records(rule_id: &str) -> Vec<FolderSyncFileRecord> {
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

pub(crate) fn save_folder_sync_file_records(
    rule_id: &str,
    records: &[FolderSyncFileRecord],
) -> Result<(), String> {
    let path = folder_sync_records_path(rule_id)?;
    let payload = serde_json::to_string(records)
        .map_err(|err| format!("Failed to serialize folder sync records: {err}"))?;
    write_atomic(&path, payload.as_bytes())
}

pub(crate) fn update_folder_sync_file_record(
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

pub(crate) fn remove_folder_sync_file_record(rule_id: &str, relative_path: &str) -> Result<(), String> {
    let mut records = load_folder_sync_file_records(rule_id);
    records.retain(|record| record.relative_path != relative_path);
    save_folder_sync_file_records(rule_id, &records)
}

pub(crate) fn update_folder_sync_rule_result(
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

//! Live folder-sync runtime: rule start/stop, the per-rule watcher + poll
//! loop, a single sync pass, and the aggregate status/active-task queries.

use super::*;

pub(crate) fn wake_folder_sync_slot(wake_tx: &Arc<Mutex<Option<oneshot::Sender<()>>>>) {
    if let Ok(mut slot) = wake_tx.lock() {
        if let Some(tx) = slot.take() {
            let _ = tx.send(());
        }
    }
}

pub(crate) fn wake_folder_sync_control(control: &FolderSyncTaskControl) {
    wake_folder_sync_slot(&control.wake_tx);
}

pub(crate) fn mark_folder_sync_last_change(app: &AppHandle, rule_id: &str, files_watching: i64) {
    let mut snapshot: Option<FolderSyncStateRecord> = None;
    {
        let state = app.state::<AppState>();
        if let Ok(mut runtime) = lock_state(&state.folder_sync) {
            let record =
                runtime
                    .statuses
                    .entry(rule_id.to_string())
                    .or_insert(FolderSyncStateRecord {
                        rule_id: rule_id.to_string(),
                        status: FolderSyncStatus::Watching,
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

pub(crate) async fn wait_for_folder_sync_wake(control: &FolderSyncTaskControl, poll_interval_ms: i64) {
    let wait_ms =
        poll_interval_ms.clamp(FOLDER_SYNC_MIN_POLL_MS, FOLDER_SYNC_MAX_POLL_MS) as u64;
    let (tx, rx) = oneshot::channel::<()>();
    if let Ok(mut slot) = control.wake_tx.lock() {
        *slot = Some(tx);
    }

    let _ = tokio::time::timeout(StdDuration::from_millis(wait_ms), rx).await;

    if let Ok(mut slot) = control.wake_tx.lock() {
        *slot = None;
    }
}

pub(crate) async fn run_folder_sync_once(
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
    let files_watching = if rule.direction == SyncDirection::RemoteToLocal {
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
        set_and_emit_folder_sync_status(
            app,
            &rule.id,
            FolderSyncStatus::Syncing,
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
            return Err(JOB_CANCELLED.to_string());
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
                    // Just-transferred file; epoch on stat failure is a harmless
                    // "treat as changed" fallback, not a silent error.
                    local_mtime: file_mtime_millis(&local_path).unwrap_or(0),
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
            return Err(JOB_CANCELLED.to_string());
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
                    // Just-transferred file; epoch on stat failure is a harmless
                    // "treat as changed" fallback, not a silent error.
                    local_mtime: file_mtime_millis(&local_path).unwrap_or(0),
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
            return Err(JOB_CANCELLED.to_string());
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
            return Err(JOB_CANCELLED.to_string());
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

pub(crate) fn stop_folder_sync_rule(app: &AppHandle, rule_id: &str) {
    let control = {
        let state = app.state::<AppState>();
        let value = if let Ok(mut runtime) = lock_state(&state.folder_sync) {
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

pub(crate) fn start_folder_sync_rule(app: &AppHandle, rule_id: &str) -> Result<(), String> {
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
        let mut runtime = lock_state(&state.folder_sync)?;
        runtime.tasks.insert(rule.id.clone(), control.clone());
    }

    let _ = set_and_emit_folder_sync_status(
        app,
        &rule.id,
        FolderSyncStatus::Idle,
        if rule.direction == SyncDirection::RemoteToLocal {
            0
        } else {
            1
        },
        None,
        None,
        None,
    );

    if rule.direction != SyncDirection::RemoteToLocal {
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

            let files_watching = if rule.direction == SyncDirection::RemoteToLocal {
                0
            } else {
                1
            };
            if control.pause_flag.load(Ordering::SeqCst) {
                let _ = set_and_emit_folder_sync_status(
                    &app_handle,
                    &rule_id,
                    FolderSyncStatus::Paused,
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
                        FolderSyncStatus::Paused
                    } else {
                        FolderSyncStatus::Watching
                    };
                    let _ = set_and_emit_folder_sync_status(
                        &app_handle,
                        &rule_id,
                        status,
                        files_watching,
                        Some(now_iso()),
                        None,
                        None,
                    );
                }
                Err(err) if err == JOB_CANCELLED => break,
                Err(err) => {
                    let _ =
                        update_folder_sync_rule_result(&rule_id, Some("error"), Some(err.as_str()));
                    let _ = set_and_emit_folder_sync_status(
                        &app_handle,
                        &rule_id,
                        FolderSyncStatus::Error,
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
        if let Ok(mut runtime) = lock_state(&state.folder_sync) {
            runtime.tasks.remove(&rule_id);
        }

        if get_folder_sync_rule(&rule_id).is_ok() {
            let _ = set_and_emit_folder_sync_status(
                &app_handle,
                &rule_id,
                FolderSyncStatus::Idle,
                0,
                Some(now_iso()),
                None,
                None,
            );
        } else {
            let state = app_handle.state::<AppState>();
            let _removed = if let Ok(mut runtime) = lock_state(&state.folder_sync) {
                runtime.statuses.remove(&rule_id);
                true
            } else {
                false
            };
        }
    });

    Ok(())
}

pub(crate) fn start_all_folder_sync_rules(app: &AppHandle) -> Result<(), String> {
    for rule in load_folder_sync_rules_records() {
        if rule.enabled {
            if let Err(err) = start_folder_sync_rule(app, &rule.id) {
                emit_folder_sync_error_event(app, &rule.id, &err);
            }
        }
    }
    Ok(())
}

pub(crate) fn stop_all_folder_sync_rules(app: &AppHandle) {
    let task_ids = {
        let state = app.state::<AppState>();
        let value = if let Ok(runtime) = lock_state(&state.folder_sync) {
            runtime.tasks.keys().cloned().collect::<Vec<_>>()
        } else {
            Vec::new()
        };
        value
    };

    for rule_id in task_ids {
        stop_folder_sync_rule(app, &rule_id);
        let _ = set_and_emit_folder_sync_status(app, &rule_id, FolderSyncStatus::Idle, 0, Some(now_iso()), None, None);
    }
}

pub(crate) fn pause_all_folder_sync_rules(app: &AppHandle) {
    let controls = {
        let state = app.state::<AppState>();
        let value = if let Ok(runtime) = lock_state(&state.folder_sync) {
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

pub(crate) fn resume_all_folder_sync_rules(app: &AppHandle) {
    let controls = {
        let state = app.state::<AppState>();
        let value = if let Ok(runtime) = lock_state(&state.folder_sync) {
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

pub(crate) fn trigger_folder_sync_now(app: &AppHandle, rule_id: &str) -> Result<(), String> {
    let control = {
        let state = app.state::<AppState>();
        let value = if let Ok(runtime) = lock_state(&state.folder_sync) {
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

pub(crate) fn folder_sync_has_active_tasks(app: &AppHandle) -> bool {
    let state = app.state::<AppState>();
    let value = if let Ok(runtime) = lock_state(&state.folder_sync) {
        !runtime.tasks.is_empty()
    } else {
        false
    };
    value
}

pub(crate) fn folder_sync_status_counts(app: &AppHandle) -> (usize, usize, usize, usize) {
    let statuses = folder_sync_statuses_snapshot(app);
    let syncing = statuses.iter().filter(|s| s.status == FolderSyncStatus::Syncing).count();
    let watching = statuses.iter().filter(|s| s.status == FolderSyncStatus::Watching).count();
    let paused = statuses.iter().filter(|s| s.status == FolderSyncStatus::Paused).count();
    let errors = statuses.iter().filter(|s| s.status == FolderSyncStatus::Error).count();
    (syncing, watching, paused, errors)
}

pub(crate) fn resolve_folder_sync_conflict(
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

pub(crate) fn resolve_folder_sync_action(
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

pub(crate) async fn generate_folder_sync_diff_for_rule(
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

pub(crate) fn emit_folder_sync_status_event(app: &AppHandle, status: &FolderSyncStateRecord) {
    // FolderSyncStateRecord is camelCase Serialize; emit it directly as the event payload.
    let _ = app.emit("folder-sync:status", status);
}

pub(crate) fn emit_folder_sync_error_event(app: &AppHandle, rule_id: &str, error: &str) {
    let payload = FolderSyncErrorEventPayload {
        rule_id: rule_id.to_string(),
        error: error.to_string(),
    };
    let _ = app.emit("folder-sync:error", payload);
}

pub(crate) fn emit_folder_sync_conflict_event(
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

pub(crate) fn set_and_emit_folder_sync_status(
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

pub(crate) fn folder_sync_statuses_snapshot(app: &AppHandle) -> Vec<FolderSyncStateRecord> {
    let state = app.state::<AppState>();
    let Ok(runtime) = lock_state(&state.folder_sync) else {
        return Vec::new();
    };

    let mut statuses: Vec<FolderSyncStateRecord> = runtime.statuses.values().cloned().collect();
    statuses.sort_by(|a, b| a.rule_id.cmp(&b.rule_id));
    statuses
}

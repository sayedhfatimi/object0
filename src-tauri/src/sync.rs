//! Bucket-to-bucket sync: object-map building and diff generate/execute.

use super::*;

pub(crate) fn build_sync_object_map(
    objects: Vec<RemoteObject>,
    prefix: &str,
) -> HashMap<String, SyncObjectInfo> {
    let mut map = HashMap::new();
    let normalized_prefix = normalize_prefix(prefix);

    for RemoteObject {
        key,
        size,
        etag,
        last_modified,
    } in objects
    {
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

pub(crate) async fn generate_sync_diff(state: &AppState, input: &SyncInput) -> Result<SyncDiffRecord, String> {
    let source_profile = profile_for_id(state, &input.source_profile_id)?;
    let dest_profile = profile_for_id(state, &input.dest_profile_id)?;
    let source_client = to_s3_client(&source_profile)?;
    let dest_client = to_s3_client(&dest_profile)?;

    let source_prefix = normalize_prefix(&input.source_prefix);
    let dest_prefix = normalize_prefix(&input.dest_prefix);

    let source_objects =
        s3_list_all_objects(&source_client, &input.source_bucket, &source_prefix).await?;
    let dest_objects = s3_list_all_objects(&dest_client, &input.dest_bucket, &dest_prefix).await?;

    let source_map = build_sync_object_map(source_objects, &input.source_prefix);
    let dest_map = build_sync_object_map(dest_objects, &input.dest_prefix);

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

    if input.mode == SyncMode::Mirror {
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

    if input.mode == SyncMode::Overwrite {
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

pub(crate) fn execute_sync_diff(
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

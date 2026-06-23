//! RPC dispatch: the single #[tauri::command] entry point that routes every
//! frontend request to its handler. Uses `super::*` to reach the crate-root
//! state, input structs, and helper functions.

use super::*;

#[tauri::command]
pub(crate) async fn rpc_request(
    app: AppHandle,
    state: State<'_, AppState>,
    method: String,
    payload: Option<Value>,
) -> Result<Value, String> {
    let payload = payload_or_null(payload);
    let method = RpcMethod::parse(&method)
        .ok_or_else(|| format!("RPC method not implemented yet: {method}"))?;

    match method {
        RpcMethod::VaultStatus => {
            let path = vault_path()?;
            let exists = path.exists();
            let unlocked = lock_state(&state.vault)?.unlocked;
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
        RpcMethod::VaultSetup => {
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

            let mut vault = lock_state(&state.vault)?;
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
        RpcMethod::VaultUnlock => {
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
                    let mut vault = lock_state(&state.vault)?;
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
        RpcMethod::VaultAutoUnlock | RpcMethod::VaultUnlockKeychain => {
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
                let vault = lock_state(&state.vault)?;
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
                    let mut vault = lock_state(&state.vault)?;
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
        RpcMethod::VaultLock => {
            let mut vault = lock_state(&state.vault)?;
            lock_vault_runtime(&mut vault);
            stop_all_folder_sync_rules(&app);
            refresh_tray_menu(&app);
            Ok(Value::Null)
        }
        RpcMethod::VaultKeychainStatus => {
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
        RpcMethod::VaultKeychainClear => match clear_stored_passphrase() {
            Ok(had) => Ok(json!({ "success": true, "hadStoredPassphrase": had })),
            Err(_) => Ok(json!({ "success": false, "hadStoredPassphrase": false })),
        },
        RpcMethod::VaultRecoverKey => {
            let input: RecoveryKeyInput = parse_payload(payload)?;
            let path = vault_path()?;
            if !path.exists() {
                return Ok(json!({ "success": false, "profiles": [] }));
            }

            match unlock_with_recovery_key(&path, input.recovery_key.trim()) {
                Ok(unlock) => {
                    let mut vault = lock_state(&state.vault)?;
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
        RpcMethod::VaultChangePassphrase => {
            let input: ChangePassphraseInput = parse_payload(payload)?;
            if input.new_passphrase.trim().is_empty() {
                return Err("Passphrase cannot be empty".to_string());
            }

            let path = vault_path()?;
            let mut vault = lock_state(&state.vault)?;
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
        RpcMethod::VaultAddRecoveryKey => {
            let path = vault_path()?;
            let mut vault = lock_state(&state.vault)?;
            ensure_writable(&vault)?;

            let recovery_salt = random_bytes::<SALT_BYTES>();
            let recovery_key_plain = generate_recovery_key();
            let recovery_key = derive_key(&recovery_key_plain, &recovery_salt);

            vault.recovery_key = Some(recovery_key);
            vault.recovery_salt = Some(recovery_salt.to_vec());
            save_vault(&path, &vault)?;

            Ok(json!({ "recoveryKey": recovery_key_plain }))
        }
        RpcMethod::VaultHasRecoveryKey => {
            let path = vault_path()?;
            Ok(json!({ "hasRecoveryKey": has_recovery_key_on_disk(&path)? }))
        }
        RpcMethod::VaultReset => {
            let path = vault_path()?;
            if path.exists() {
                let _ = fs::remove_file(path);
            }
            let _ = clear_stored_passphrase();

            let mut vault = lock_state(&state.vault)?;
            *vault = VaultRuntime::default();
            stop_all_folder_sync_rules(&app);
            refresh_tray_menu(&app);
            Ok(json!({ "success": true }))
        }

        RpcMethod::ProfileList => {
            let vault = lock_state(&state.vault)?;
            ensure_unlocked(&vault)?;
            Ok(json!(profile_infos(&vault)))
        }
        RpcMethod::ProfileAdd => {
            let input: ProfileInput = parse_payload(payload)?;
            let path = vault_path()?;
            let mut vault = lock_state(&state.vault)?;
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
        RpcMethod::ProfileUpdate => {
            let input: ProfileUpdateInput = parse_payload(payload)?;
            let path = vault_path()?;
            let mut vault = lock_state(&state.vault)?;
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

            if profile.access_key_id.trim().is_empty()
                || profile.secret_access_key.trim().is_empty()
            {
                return Err("Profile credentials cannot be empty".to_string());
            }

            let profile_info = to_profile_info(profile);
            save_vault(&path, &vault)?;

            Ok(json!(profile_info))
        }
        RpcMethod::ProfileRemove => {
            let input: IdInput = parse_payload(payload)?;
            let path = vault_path()?;
            let mut vault = lock_state(&state.vault)?;
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
        RpcMethod::ProfileTest => {
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

        RpcMethod::BucketsList => {
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

        RpcMethod::ObjectsList => {
            let input: ObjectsListInput = parse_payload(payload)?;
            let client = s3_client_for_profile(&state, &input.profile_id)?;

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
        RpcMethod::ObjectsDelete => {
            let input: ObjectsDeleteInput = parse_payload(payload)?;
            if input.keys.is_empty() {
                return Ok(Value::Null);
            }

            let client = s3_client_for_profile(&state, &input.profile_id)?;

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
        RpcMethod::ObjectsRename => {
            let input: ObjectsRenameInput = parse_payload(payload)?;
            let client = s3_client_for_profile(&state, &input.profile_id)?;

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
        RpcMethod::ObjectsStat => {
            let input: ObjectsStatInput = parse_payload(payload)?;
            let client = s3_client_for_profile(&state, &input.profile_id)?;

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

        RpcMethod::TransferUpload => {
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
        RpcMethod::TransferDownload => {
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
        RpcMethod::TransferPickAndUpload => {
            let input: PickUploadInput = parse_payload(payload)?;
            let Some(paths) = FileDialog::new().pick_files() else {
                // User cancelled the native dialog — not an error.
                return Ok(json!({ "jobIds": [] }));
            };
            if paths.is_empty() {
                return Ok(json!({ "jobIds": [] }));
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
        RpcMethod::TransferPickAndUploadFolder => {
            let input: PickUploadInput = parse_payload(payload)?;
            let Some(dir_path) = FileDialog::new().pick_folder() else {
                // User cancelled the native dialog — not an error.
                return Ok(json!({ "jobIds": [] }));
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
        RpcMethod::TransferDownloadFolder => {
            let input: DownloadFolderInput = parse_payload(payload)?;
            let client = s3_client_for_profile(&state, &input.profile_id)?;
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
            for RemoteObject { key, size, .. } in objects {
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
                let Some(safe_relative) = sanitize_relative_path(&relative_path) else {
                    // Skip remote keys that would escape the destination directory.
                    continue;
                };
                let local_path = destination.join(&folder_name).join(&safe_relative);
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
        RpcMethod::TransferCopy => {
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
        RpcMethod::TransferMove => {
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
        RpcMethod::TransferCrossBucket => {
            let input: CrossBucketInput = parse_payload(payload)?;
            let source_profile = profile_for_id(&state, &input.source_profile_id)?;
            let source_client = to_s3_client(&source_profile)?;

            let mut expanded_keys = Vec::new();
            for key in &input.keys {
                if key.ends_with('/') {
                    let children =
                        s3_list_all_objects(&source_client, &input.source_bucket, key).await?;
                    expanded_keys
                        .extend(children.into_iter().map(|child| child.key));
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

            let is_move = input.mode == TransferMode::Move;
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
        RpcMethod::TransferDownloadArchive => {
            let input: DownloadArchiveInput = parse_payload(payload)?;
            let client = s3_client_for_profile(&state, &input.profile_id)?;

            let mut resolved_keys = input.keys.clone();
            let prefix = input.prefix.unwrap_or_default();
            if resolved_keys.is_empty() && !prefix.is_empty() {
                let objects = s3_list_all_objects(&client, &input.bucket, &prefix).await?;
                resolved_keys = objects.into_iter().map(|obj| obj.key).collect();
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
                            .map(|child| (child.key, child.size.max(0))),
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

        RpcMethod::SyncPreview => {
            let input: SyncInput = parse_payload(payload)?;
            let diff = generate_sync_diff(&state, &input).await?;
            Ok(json!(diff))
        }
        RpcMethod::SyncExecute => {
            let input: SyncInput = parse_payload(payload)?;
            let diff = generate_sync_diff(&state, &input).await?;
            let job_id = execute_sync_diff(&app, &input, &diff)?;
            Ok(json!({ "jobId": job_id }))
        }

        RpcMethod::JobsList => {
            let jobs_runtime = lock_state(&state.jobs)?;
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
        RpcMethod::JobsCancel => {
            let input: JobIdInput = parse_payload(payload)?;
            cancel_job(&app, &input.job_id);
            Ok(Value::Null)
        }
        RpcMethod::JobsClear => {
            let mut jobs_runtime = lock_state(&state.jobs)?;
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
        RpcMethod::JobsGetConcurrency => {
            let jobs_runtime = lock_state(&state.jobs)?;
            Ok(json!({ "concurrency": jobs_runtime.concurrency }))
        }
        RpcMethod::JobsSetConcurrency => {
            let input: JobConcurrencyInput = parse_payload(payload)?;
            {
                let mut jobs_runtime = lock_state(&state.jobs)?;
                jobs_runtime.concurrency =
                    input.concurrency.clamp(MIN_JOB_CONCURRENCY, MAX_JOB_CONCURRENCY);
            }
            try_start_queued_jobs(app.clone());
            let jobs_runtime = lock_state(&state.jobs)?;
            Ok(json!({ "concurrency": jobs_runtime.concurrency }))
        }

        RpcMethod::FavoritesLoad => Ok(json!(load_favorites_from_disk())),
        RpcMethod::FavoritesSave => {
            let input: FavoritesSaveInput = parse_payload(payload)?;
            save_favorites_to_disk(&input.favorites)?;
            Ok(Value::Null)
        }

        RpcMethod::ShareGenerate => {
            let input: ShareGenerateInput = parse_payload(payload)?;
            let ttl = input.expires_in.clamp(MIN_SHARE_TTL_SECS, MAX_SHARE_TTL_SECS);
            let expires_at = (Utc::now() + Duration::seconds(ttl)).to_rfc3339();
            let client = s3_client_for_profile(&state, &input.profile_id)?;

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

        RpcMethod::FolderSyncListRules => Ok(json!(load_folder_sync_rules_records())),
        RpcMethod::FolderSyncAddRule => {
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
        RpcMethod::FolderSyncUpdateRule => {
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
        RpcMethod::FolderSyncRemoveRule => {
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
            if let Ok(mut runtime) = lock_state(&state.folder_sync) {
                runtime.statuses.remove(&input.id);
            }
            refresh_tray_menu(&app);
            Ok(Value::Null)
        }
        RpcMethod::FolderSyncToggleRule => {
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
                    let _ = set_and_emit_folder_sync_status(
                        &app,
                        &input.id,
                        FolderSyncStatus::Idle,
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
        RpcMethod::FolderSyncSyncNow => {
            let input: IdInput = parse_payload(payload)?;
            trigger_folder_sync_now(&app, &input.id)?;
            refresh_tray_menu(&app);
            Ok(Value::Null)
        }
        RpcMethod::FolderSyncStartAll => {
            start_all_folder_sync_rules(&app)?;
            refresh_tray_menu(&app);
            Ok(Value::Null)
        }
        RpcMethod::FolderSyncStopAll => {
            stop_all_folder_sync_rules(&app);
            refresh_tray_menu(&app);
            Ok(Value::Null)
        }
        RpcMethod::FolderSyncPauseAll => {
            pause_all_folder_sync_rules(&app);
            refresh_tray_menu(&app);
            Ok(Value::Null)
        }
        RpcMethod::FolderSyncResumeAll => {
            resume_all_folder_sync_rules(&app);
            refresh_tray_menu(&app);
            Ok(Value::Null)
        }
        RpcMethod::FolderSyncGetStatus => Ok(json!(folder_sync_statuses_snapshot(&app))),
        RpcMethod::FolderSyncPreview => {
            let input: IdInput = parse_payload(payload)?;
            let rule = get_folder_sync_rule(&input.id)?;
            let profile = profile_for_id(&state, &rule.profile_id)?;
            let client = to_s3_client(&profile)?;
            let known_records = load_folder_sync_file_records(&rule.id);
            let diff = generate_folder_sync_diff_for_rule(&rule, &client, &known_records).await?;
            Ok(json!(diff))
        }
        RpcMethod::FolderSyncPickFolder => {
            let path = FileDialog::new()
                .pick_folder()
                .map(|path| path.to_string_lossy().to_string());
            Ok(json!({ "path": path }))
        }

        RpcMethod::UpdaterCheck => {
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
        RpcMethod::UpdaterDownload => {
            let success = download_update_if_available(&app).await?;
            Ok(json!({ "success": success }))
        }
        RpcMethod::UpdaterApply => {
            apply_downloaded_update(&app).await?;
            Ok(Value::Null)
        }
        RpcMethod::UpdaterLocalInfo => Ok(json!({
            "version": env!("CARGO_PKG_VERSION"),
            "hash": "",
            "baseUrl": updater_local_info_base_url(),
            "channel": updater_channel(),
            "name": "object0",
            "identifier": "dev.object0.app"
        })),
        RpcMethod::SystemPlatform => Ok(json!({ "os": std::env::consts::OS })),
    }
}

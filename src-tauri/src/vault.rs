//! Vault file (de)serialization, passphrase/recovery unlock, save, and the
//! profile-info + unlocked/writable guards.

use super::*;

pub(crate) fn read_vault_file(path: &Path) -> Result<VaultFileDisk, String> {
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

pub(crate) fn unlock_with_passphrase(path: &Path, passphrase: &str) -> Result<UnlockPayload, String> {
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

pub(crate) fn unlock_with_recovery_key(
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

pub(crate) fn save_vault(path: &Path, vault: &VaultRuntime) -> Result<(), String> {
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

pub(crate) fn has_recovery_key_on_disk(path: &Path) -> Result<bool, String> {
    if !path.exists() {
        return Ok(false);
    }

    match read_vault_file(path)? {
        VaultFileDisk::V3(v3) => Ok(v3.recovery.is_some()),
        _ => Ok(false),
    }
}

pub(crate) fn lock_vault_runtime(vault: &mut VaultRuntime) {
    vault.unlocked = false;
    vault.data = None;
    vault.key = None;
    vault.salt = None;
    vault.recovery_key = None;
    vault.recovery_salt = None;
}

pub(crate) fn to_profile_info(profile: &Profile) -> ProfileInfo {
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

pub(crate) fn profile_infos(vault: &VaultRuntime) -> Vec<ProfileInfo> {
    vault
        .data
        .as_ref()
        .map(|data| data.profiles.iter().map(to_profile_info).collect())
        .unwrap_or_default()
}

pub(crate) fn ensure_unlocked(vault: &VaultRuntime) -> Result<(), String> {
    if !vault.unlocked || vault.data.is_none() {
        return Err("Vault is locked".to_string());
    }
    Ok(())
}

pub(crate) fn ensure_writable(vault: &VaultRuntime) -> Result<(), String> {
    ensure_unlocked(vault)?;
    if vault.key.is_none() || vault.salt.is_none() {
        return Err("Vault must be rekeyed before writing".to_string());
    }
    Ok(())
}

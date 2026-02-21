use std::path::PathBuf;

pub fn object0_config_dir() -> Result<PathBuf, String> {
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

pub fn vault_path() -> Result<PathBuf, String> {
    Ok(object0_config_dir()?.join("vault.enc"))
}

pub fn favorites_path() -> Result<PathBuf, String> {
    Ok(object0_config_dir()?.join("favorites.json"))
}

pub fn folder_sync_rules_path() -> Result<PathBuf, String> {
    Ok(object0_config_dir()?.join("folder-sync-rules.json"))
}

pub fn folder_sync_records_path(rule_id: &str) -> Result<PathBuf, String> {
    Ok(object0_config_dir()?
        .join("folder-sync")
        .join(format!("{rule_id}.json")))
}

pub fn job_history_path() -> Result<PathBuf, String> {
    Ok(object0_config_dir()?.join("job-history.json"))
}

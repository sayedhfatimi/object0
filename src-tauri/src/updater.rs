//! Self-update: endpoint/channel config, version check, download + apply, and
//! the periodic background check loop.

use super::*;

pub(crate) fn env_var_non_empty(key: &str) -> Option<String> {
    std::env::var(key)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

pub(crate) fn env_updater_endpoints() -> Result<Option<Vec<Url>>, String> {
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

pub(crate) fn updater_local_info_endpoint() -> String {
    let Some(raw) = env_var_non_empty("OBJECT0_UPDATER_ENDPOINTS") else {
        return DEFAULT_UPDATER_ENDPOINT.to_string();
    };

    raw.split(|ch: char| ch == ',' || ch == '\n' || ch == '\r')
        .map(str::trim)
        .find(|value| !value.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| DEFAULT_UPDATER_ENDPOINT.to_string())
}

pub(crate) fn updater_local_info_base_url() -> String {
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

pub(crate) fn updater_channel() -> String {
    env_var_non_empty("OBJECT0_UPDATER_CHANNEL")
        .unwrap_or_else(|| DEFAULT_UPDATER_CHANNEL.to_string())
}

pub(crate) fn configured_updater(app: &AppHandle) -> Result<tauri_plugin_updater::Updater, String> {
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

pub(crate) fn updater_cached_state(app: &AppHandle) -> (Option<String>, bool) {
    let state = app.state::<AppState>();
    let Ok(updater) = lock_state(&state.updater) else {
        return (None, false);
    };

    let version = updater.downloaded_version.clone();
    let ready = version.is_some() && updater.downloaded_bytes.is_some();
    (version, ready)
}

pub(crate) fn updater_store_downloaded(app: &AppHandle, version: String, bytes: Vec<u8>) {
    let state = app.state::<AppState>();
    let Ok(mut updater) = lock_state(&state.updater) else {
        return;
    };

    updater.downloaded_version = Some(version);
    updater.downloaded_bytes = Some(bytes);
}

pub(crate) fn updater_clear_downloaded(app: &AppHandle) {
    let state = app.state::<AppState>();
    let Ok(mut updater) = lock_state(&state.updater) else {
        return;
    };

    updater.downloaded_version = None;
    updater.downloaded_bytes = None;
}

pub(crate) fn updater_take_downloaded_if_version(app: &AppHandle, version: &str) -> Option<Vec<u8>> {
    let state = app.state::<AppState>();
    let Ok(mut updater) = lock_state(&state.updater) else {
        return None;
    };
    if updater.downloaded_version.as_deref() != Some(version) {
        return None;
    }

    updater.downloaded_version = None;
    updater.downloaded_bytes.take()
}

pub(crate) async fn download_update_if_available(app: &AppHandle) -> Result<bool, String> {
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

pub(crate) async fn apply_downloaded_update(app: &AppHandle) -> Result<(), String> {
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

pub(crate) async fn run_periodic_updater_checks(app: AppHandle) {
    tokio::time::sleep(StdDuration::from_secs(UPDATE_CHECK_INITIAL_DELAY_SECS)).await;

    loop {
        if let Err(err) = download_update_if_available(&app).await {
            eprintln!("Periodic updater check failed: {err}");
        }
        tokio::time::sleep(StdDuration::from_secs(UPDATE_CHECK_INTERVAL_SECS)).await;
    }
}

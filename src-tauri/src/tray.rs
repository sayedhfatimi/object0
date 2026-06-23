//! System tray menu construction and tray-event handling.

use super::*;

pub(crate) fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

pub(crate) fn build_tray_menu(app: &AppHandle) -> Result<Menu<tauri::Wry>, String> {
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

pub(crate) fn refresh_tray_menu(app: &AppHandle) {
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

pub(crate) fn handle_tray_menu_action(app: &AppHandle, action_id: &str) {
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

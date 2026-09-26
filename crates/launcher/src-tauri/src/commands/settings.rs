use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_opener::OpenerExt;

use crate::models::LauncherSettings;
use crate::state::AppState;

#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub(crate) fn get_settings(state: State<'_, AppState>) -> LauncherSettings {
    let launcher = state.launcher.lock();
    launcher.settings.clone()
}

#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub(crate) fn update_settings(
    mut settings: LauncherSettings,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    let launch_on_startup = settings.launch_on_startup;
    {
        let mut launcher = state.launcher.lock();
        // Model choices are changed by their own command. A Settings dialog
        // opened earlier must not overwrite a newer choice from the overlay.
        settings.model_overrides = launcher.settings.model_overrides.clone();
        settings.text_size = launcher.settings.text_size.clone();
        launcher.settings = settings;
    }

    // Sync autostart with OS. Log failures: a registry write blocked by policy
    // or AV would otherwise leave the toggle showing a state the OS does not
    // actually have, with nothing anywhere to explain it.
    let autostart = app.autolaunch();
    let synced = if launch_on_startup {
        autostart.enable()
    } else {
        autostart.disable()
    };
    if let Err(e) = synced {
        tracing::warn!("Failed to set launch-on-startup to {launch_on_startup}: {e}");
    }

    state.save()
}

/// Persist text size immediately so the overlay controls and Settings stay in sync.
#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub(crate) fn set_text_size(
    size: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    if !matches!(size.as_str(), "small" | "normal" | "large" | "larger") {
        return Err("Invalid text size.".to_owned());
    }
    state.launcher.lock().settings.text_size = size.clone();
    state.save()?;
    app.emit("text-size-changed", size)
        .map_err(|e| format!("Could not update text size: {e}"))
}

/// Open an https URL in the default browser (Settings "Get a key" / docs links).
#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub(crate) fn open_url(app: AppHandle, url: String) -> Result<(), String> {
    if !url.starts_with("https://") {
        return Err("Only https links can be opened.".to_owned());
    }
    app.opener()
        .open_url(&url, None::<&str>)
        .map_err(|e| format!("Failed to open link: {e}"))
}

/// Open the launcher's data folder (state + logs live here).
#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub(crate) fn open_config_folder(app: AppHandle) -> Result<(), String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Cannot determine data folder: {e}"))?;
    app.opener()
        .open_path(dir.to_string_lossy().as_ref(), None::<&str>)
        .map_err(|e| format!("Failed to open folder: {e}"))
}

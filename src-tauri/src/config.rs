//! Application configuration — persistence via JSON in the Tauri app data directory.

use std::fs;
use std::path::PathBuf;
use tauri::Manager;

use crate::types::AppConfig;

/// Return the path to the config JSON file in the platform app-data directory.
pub fn config_path(app: &tauri::AppHandle) -> PathBuf {
    let dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    dir.join("config.json")
}

/// Load the persisted config, falling back to defaults if the file is missing or corrupt.
pub fn load_config(app: &tauri::AppHandle) -> AppConfig {
    let path = config_path(app);
    if path.exists() {
        let data = fs::read_to_string(&path).unwrap_or_default();
        serde_json::from_str(&data).unwrap_or(AppConfig {
            repo_path: None,
            theme: Some("light".into()),
            cf_account_id: None,
            cf_project_name: None,
            cf_api_token: None,
            cf_domain: None,
            cf_zone_id: None,
        })
    } else {
        AppConfig {
            repo_path: None,
            theme: Some("light".into()),
            cf_account_id: None,
            cf_project_name: None,
            cf_api_token: None,
            cf_domain: None,
            cf_zone_id: None,
        }
    }
}

/// Persist the config to disk, creating the parent directory if needed.
pub fn save_config(app: &tauri::AppHandle, config: &AppConfig) -> Result<(), String> {
    let path = config_path(app);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create config directory: {e}"))?;
    }
    let data = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Failed to serialize config: {e}"))?;
    fs::write(&path, data).map_err(|e| format!("Failed to write config file: {e}"))
}

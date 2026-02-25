use std::fs;
use std::path::Path;
use std::process::Command;
use std::time::Duration;
use tauri::Manager;

use crate::config;
use crate::content;
use crate::frontmatter;
use crate::git;
use crate::security;
use crate::types::*;

// ---------------------------------------------------------------------------
// Config commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn get_config(app: tauri::AppHandle) -> Result<AppConfig, String> {
    Ok(config::load_config(&app))
}

#[tauri::command]
pub fn set_config(app: tauri::AppHandle, config: AppConfig) -> Result<(), String> {
    config::save_config(&app, &config)
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn validate_repo_path(path: String) -> Result<bool, String> {
    let base = Path::new(&path);
    let has_blog = base.join("src/content/blog").is_dir();
    let has_apps = base.join("src/content/apps").is_dir();
    let has_pkg = base.join("package.json").is_file();
    Ok(has_blog && has_apps && has_pkg)
}

// ---------------------------------------------------------------------------
// Content commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn list_content(repo_path: String) -> Result<Vec<ContentEntry>, String> {
    content::list_content(&repo_path)
}

#[tauri::command]
pub fn read_file(app: tauri::AppHandle, path: String) -> Result<String, String> {
    let cfg = config::load_config(&app);
    if let Some(ref repo_path) = cfg.repo_path {
        let base = Path::new(repo_path);
        let target = Path::new(&path);
        security::ensure_within(target, base)?;
    }
    fs::read_to_string(&path).map_err(|e| format!("Failed to read {}: {}", path, e))
}

#[tauri::command]
pub fn write_file(app: tauri::AppHandle, path: String, content: String) -> Result<(), String> {
    let cfg = config::load_config(&app);
    if let Some(ref repo_path) = cfg.repo_path {
        let base = Path::new(repo_path);
        let target = Path::new(&path);
        security::ensure_within(target, base)?;
    }
    fs::write(&path, content).map_err(|e| format!("Failed to write {}: {}", path, e))
}

#[tauri::command]
pub fn create_post(repo_path: String, args: CreatePostArgs) -> Result<ContentEntry, String> {
    content::create_post(&repo_path, args)
}

#[tauri::command]
pub fn create_app(repo_path: String, args: CreateAppArgs) -> Result<ContentEntry, String> {
    content::create_app(&repo_path, args)
}

#[tauri::command]
pub async fn delete_content(repo_path: String, slug: String) -> Result<(), String> {
    content::delete_content(&repo_path, &slug)
}

// ---------------------------------------------------------------------------
// Publish / unpublish
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn publish(repo_path: String, slug: String) -> Result<ContentEntry, String> {
    let base = Path::new(&repo_path);
    let (file_path, content_type) = content::find_content_file(base, &slug)?;
    let file_content = fs::read_to_string(&file_path).map_err(|e| e.to_string())?;
    let (yaml, rest) = frontmatter::split_frontmatter(&file_content)
        .ok_or_else(|| "Could not parse frontmatter.".to_string())?;

    if frontmatter::get_yaml_bool(&yaml, "isDraft") == Some(false) {
        return frontmatter::parse_content_entry(&slug, &content_type, &file_path)
            .ok_or_else(|| "Failed to parse entry.".to_string());
    }

    let mut new_yaml = frontmatter::set_frontmatter_field(&yaml, "isDraft", "false");

    let has_pub_date = frontmatter::PUB_DATE_RE.is_match(&new_yaml);
    if !has_pub_date {
        new_yaml = frontmatter::insert_field_after(
            &new_yaml,
            "createdDate",
            "publicationDate",
            &format!("\"{}\"", frontmatter::now_iso()),
        );
    }

    let new_content = frontmatter::assemble_file(&new_yaml, &rest);
    fs::write(&file_path, &new_content).map_err(|e| e.to_string())?;

    let rel_path = file_path
        .strip_prefix(base)
        .unwrap_or(&file_path)
        .to_string_lossy()
        .to_string();
    let title = frontmatter::get_yaml_field(&new_yaml, "title").unwrap_or_else(|| slug.clone());
    git::git_add_commit_push(&repo_path, &rel_path, &format!("publish: {}", title))?;

    frontmatter::parse_content_entry(&slug, &content_type, &file_path)
        .ok_or_else(|| "Failed to parse entry after publish.".to_string())
}

#[tauri::command]
pub async fn unpublish(repo_path: String, slug: String) -> Result<ContentEntry, String> {
    let base = Path::new(&repo_path);
    let (file_path, content_type) = content::find_content_file(base, &slug)?;
    let file_content = fs::read_to_string(&file_path).map_err(|e| e.to_string())?;
    let (yaml, rest) = frontmatter::split_frontmatter(&file_content)
        .ok_or_else(|| "Could not parse frontmatter.".to_string())?;

    if frontmatter::get_yaml_bool(&yaml, "isDraft") == Some(true) {
        return frontmatter::parse_content_entry(&slug, &content_type, &file_path)
            .ok_or_else(|| "Failed to parse entry.".to_string());
    }

    let new_yaml = frontmatter::set_frontmatter_field(&yaml, "isDraft", "true");
    let new_content = frontmatter::assemble_file(&new_yaml, &rest);
    fs::write(&file_path, &new_content).map_err(|e| e.to_string())?;

    let rel_path = file_path
        .strip_prefix(base)
        .unwrap_or(&file_path)
        .to_string_lossy()
        .to_string();
    let title = frontmatter::get_yaml_field(&new_yaml, "title").unwrap_or_else(|| slug.clone());
    git::git_add_commit_push(&repo_path, &rel_path, &format!("unpublish: {}", title))?;

    frontmatter::parse_content_entry(&slug, &content_type, &file_path)
        .ok_or_else(|| "Failed to parse entry after unpublish.".to_string())
}

// ---------------------------------------------------------------------------
// Git
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn git_status(repo_path: String) -> Result<String, String> {
    git::git_status_porcelain(&repo_path)
}

// ---------------------------------------------------------------------------
// VS Code
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn open_in_vscode(path: String) -> Result<(), String> {
    if Command::new("code").arg(&path).spawn().is_ok() {
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .args(["-a", "Visual Studio Code", &path])
            .spawn()
            .map_err(|e| format!("Failed to open VS Code: {}", e))?;
        Ok(())
    }

    #[cfg(not(target_os = "macos"))]
    Err("VS Code CLI ('code') not found in PATH.".to_string())
}

// ---------------------------------------------------------------------------
// URL health check
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn check_url_health(url: String) -> Result<HealthStatus, String> {
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("Only HTTP(S) URLs are allowed".to_string());
    }
    let lower = url.to_lowercase();
    let is_dev_server = lower.starts_with("http://localhost:4322");
    if !is_dev_server
        && (lower.contains("://localhost")
            || lower.contains("://127.")
            || lower.contains("://0.0.0.0")
            || lower.contains("://[::1]")
            || lower.contains("://10.")
            || lower.contains("://192.168."))
    {
        return Err("Requests to local/private addresses are not allowed".to_string());
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .map_err(|e| e.to_string())?;

    match client.head(&url).send().await {
        Ok(resp) => {
            let status = resp.status().as_u16();
            Ok(HealthStatus {
                url,
                ok: resp.status().is_success(),
                status_code: Some(status),
            })
        }
        Err(_) => Ok(HealthStatus {
            url,
            ok: false,
            status_code: None,
        }),
    }
}

// ---------------------------------------------------------------------------
// Watcher & dev server (delegates to existing modules)
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn start_watcher(app: tauri::AppHandle, repo_path: String) -> Result<(), String> {
    crate::watcher::start_watching(&app, &repo_path)
}

#[tauri::command]
pub fn stop_watcher(app: tauri::AppHandle) -> Result<(), String> {
    crate::watcher::stop_watching(&app)
}

#[tauri::command]
pub fn start_dev_server(app: tauri::AppHandle, repo_path: String) -> Result<(), String> {
    let state = app.state::<crate::devserver::DevServerState>();
    crate::devserver::start_dev_server(&state, &repo_path)
}

#[tauri::command]
pub fn stop_dev_server(app: tauri::AppHandle) -> Result<(), String> {
    let state = app.state::<crate::devserver::DevServerState>();
    crate::devserver::stop_dev_server(&state)
}

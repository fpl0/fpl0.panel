use chrono::{DateTime, Local, Utc};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;
use tauri::Manager;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppConfig {
    pub repo_path: Option<String>,
    pub theme: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ContentEntry {
    pub slug: String,
    pub content_type: String, // "post" | "app"
    pub title: String,
    pub summary: String,
    pub tags: Vec<String>,
    pub is_draft: bool,
    pub created_date: String,
    pub publication_date: Option<String>,
    pub author: Option<String>,
    pub image: Option<String>,
    pub file_path: String,
    pub modified_date: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreatePostArgs {
    pub title: String,
    pub slug: String,
    pub summary: String,
    pub tags: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateAppArgs {
    pub title: String,
    pub slug: String,
    pub summary: String,
    pub tags: Vec<String>,
}

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

fn config_path(app: &tauri::AppHandle) -> PathBuf {
    let dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    dir.join("config.json")
}

fn load_config(app: &tauri::AppHandle) -> AppConfig {
    let path = config_path(app);
    if path.exists() {
        let data = fs::read_to_string(&path).unwrap_or_default();
        serde_json::from_str(&data).unwrap_or(AppConfig {
            repo_path: None,
            theme: Some("light".into()),
        })
    } else {
        AppConfig {
            repo_path: None,
            theme: Some("light".into()),
        }
    }
}

fn save_config(app: &tauri::AppHandle, config: &AppConfig) -> Result<(), String> {
    let path = config_path(app);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let data = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    fs::write(&path, data).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Frontmatter helpers (ported from blog scripts)
// ---------------------------------------------------------------------------

fn today_iso() -> String {
    Local::now().format("%Y-%m-%d").to_string()
}

fn to_slug(text: &str) -> String {
    let re = Regex::new(r"[^a-z0-9]+").unwrap();
    let lower = text.to_lowercase();
    let slug = re.replace_all(&lower, "-");
    slug.trim_matches('-').to_string()
}

/// Parse frontmatter from file content. Returns (yaml_block, rest_of_file).
fn split_frontmatter(content: &str) -> Option<(String, String)> {
    let re = Regex::new(r"(?s)^---\r?\n(.*?)\r?\n---").unwrap();
    if let Some(caps) = re.captures(content) {
        let full_match = caps.get(0).unwrap();
        let yaml = caps.get(1).unwrap().as_str().to_string();
        let rest = content[full_match.end()..].to_string();
        Some((yaml, rest))
    } else {
        None
    }
}

/// Get a string field from YAML frontmatter.
fn get_yaml_field(yaml: &str, key: &str) -> Option<String> {
    let pattern = format!(r#"(?m)^{}:\s*(.+)$"#, regex::escape(key));
    let re = Regex::new(&pattern).ok()?;
    let caps = re.captures(yaml)?;
    let val = caps.get(1)?.as_str().trim();
    // Strip surrounding quotes
    let val = val
        .strip_prefix('"')
        .and_then(|v| v.strip_suffix('"'))
        .or_else(|| val.strip_prefix('\'').and_then(|v| v.strip_suffix('\'')))
        .unwrap_or(val);
    Some(val.to_string())
}

/// Get a boolean field from YAML frontmatter.
fn get_yaml_bool(yaml: &str, key: &str) -> Option<bool> {
    let val = get_yaml_field(yaml, key)?;
    match val.as_str() {
        "true" => Some(true),
        "false" => Some(false),
        _ => None,
    }
}

/// Get tags array from YAML frontmatter.
fn get_yaml_tags(yaml: &str) -> Vec<String> {
    let pattern = r#"(?m)^tags:\s*\[(.*)?\]$"#;
    let re = match Regex::new(pattern) {
        Ok(r) => r,
        Err(_) => return vec![],
    };
    if let Some(caps) = re.captures(yaml) {
        if let Some(inner) = caps.get(1) {
            return inner
                .as_str()
                .split(',')
                .map(|t| {
                    t.trim()
                        .trim_matches('"')
                        .trim_matches('\'')
                        .to_string()
                })
                .filter(|t| !t.is_empty())
                .collect();
        }
    }
    vec![]
}

/// Set a frontmatter field. Updates existing or appends.
fn set_frontmatter_field(yaml: &str, key: &str, value: &str) -> String {
    let pattern = format!(r"(?m)^{}:.*$", regex::escape(key));
    let re = Regex::new(&pattern).unwrap();
    if re.is_match(yaml) {
        re.replace(yaml, format!("{}: {}", key, value))
            .to_string()
    } else {
        format!("{}\n{}: {}", yaml, key, value)
    }
}

/// Insert a field after another field in frontmatter.
fn insert_field_after(yaml: &str, after_key: &str, key: &str, value: &str) -> String {
    let pattern = format!(r"(?m)^({}:.*)$", regex::escape(after_key));
    let re = Regex::new(&pattern).unwrap();
    if re.is_match(yaml) {
        re.replace(yaml, format!("$1\n{}: {}", key, value))
            .to_string()
    } else {
        format!("{}\n{}: {}", yaml, key, value)
    }
}

/// Reassemble a file from frontmatter YAML and body.
fn assemble_file(yaml: &str, rest: &str) -> String {
    format!("---\n{}\n---{}", yaml, rest)
}

/// Parse a content file into a ContentEntry.
fn parse_content_entry(
    slug: &str,
    content_type: &str,
    file_path: &Path,
) -> Option<ContentEntry> {
    let content = fs::read_to_string(file_path).ok()?;
    let (yaml, _) = split_frontmatter(&content)?;

    let is_draft_val = get_yaml_bool(&yaml, "isDraft");
    let is_draft = is_draft_val.unwrap_or(true);

    let modified_date = fs::metadata(file_path)
        .ok()
        .and_then(|m| m.modified().ok())
        .map(|t| {
            let dt: DateTime<Utc> = t.into();
            dt.to_rfc3339()
        });

    Some(ContentEntry {
        slug: slug.to_string(),
        content_type: content_type.to_string(),
        title: get_yaml_field(&yaml, "title").unwrap_or_else(|| "(untitled)".into()),
        summary: get_yaml_field(&yaml, "summary").unwrap_or_default(),
        tags: get_yaml_tags(&yaml),
        is_draft,
        created_date: get_yaml_field(&yaml, "createdDate").unwrap_or_else(|| "unknown".into()),
        publication_date: get_yaml_field(&yaml, "publicationDate"),
        author: get_yaml_field(&yaml, "author"),
        image: get_yaml_field(&yaml, "image"),
        file_path: file_path.to_string_lossy().to_string(),
        modified_date,
    })
}

// ---------------------------------------------------------------------------
// Tauri Commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn get_config(app: tauri::AppHandle) -> Result<AppConfig, String> {
    Ok(load_config(&app))
}

#[tauri::command]
pub fn set_config(app: tauri::AppHandle, config: AppConfig) -> Result<(), String> {
    save_config(&app, &config)
}

#[tauri::command]
pub fn validate_repo_path(path: String) -> Result<bool, String> {
    let base = Path::new(&path);
    let has_blog = base.join("src/content/blog").is_dir();
    let has_apps = base.join("src/content/apps").is_dir();
    let has_pkg = base.join("package.json").is_file();
    Ok(has_blog && has_apps && has_pkg)
}

#[tauri::command]
pub fn list_content(repo_path: String) -> Result<Vec<ContentEntry>, String> {
    let base = Path::new(&repo_path);
    let blog_dir = base.join("src/content/blog");
    let apps_dir = base.join("src/content/apps");
    let mut entries: Vec<ContentEntry> = Vec::new();

    // Scan blog posts
    if blog_dir.is_dir() {
        if let Ok(readdir) = fs::read_dir(&blog_dir) {
            for entry in readdir.flatten() {
                if entry.path().is_dir() {
                    let slug = entry.file_name().to_string_lossy().to_string();
                    // Try index.mdx first, then index.md
                    let mdx_path = entry.path().join("index.mdx");
                    let md_path = entry.path().join("index.md");
                    let file_path = if mdx_path.exists() {
                        mdx_path
                    } else if md_path.exists() {
                        md_path
                    } else {
                        continue;
                    };
                    if let Some(e) = parse_content_entry(&slug, "post", &file_path) {
                        entries.push(e);
                    }
                }
            }
        }
    }

    // Scan apps
    if apps_dir.is_dir() {
        if let Ok(readdir) = fs::read_dir(&apps_dir) {
            for entry in readdir.flatten() {
                if entry.path().is_dir() {
                    let slug = entry.file_name().to_string_lossy().to_string();
                    let md_path = entry.path().join("index.md");
                    if md_path.exists() {
                        if let Some(e) = parse_content_entry(&slug, "app", &md_path) {
                            entries.push(e);
                        }
                    }
                }
            }
        }
    }

    // Sort by created_date descending
    entries.sort_by(|a, b| b.created_date.cmp(&a.created_date));
    Ok(entries)
}

#[tauri::command]
pub fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("Failed to read {}: {}", path, e))
}

#[tauri::command]
pub fn write_file(path: String, content: String) -> Result<(), String> {
    fs::write(&path, content).map_err(|e| format!("Failed to write {}: {}", path, e))
}

#[tauri::command]
pub fn create_post(repo_path: String, args: CreatePostArgs) -> Result<ContentEntry, String> {
    let slug = if args.slug.is_empty() {
        to_slug(&args.title)
    } else {
        args.slug
    };
    let post_dir = Path::new(&repo_path)
        .join("src/content/blog")
        .join(&slug);

    if post_dir.exists() {
        return Err(format!("Post \"{}\" already exists.", slug));
    }

    fs::create_dir_all(&post_dir).map_err(|e| e.to_string())?;

    let tag_list = if args.tags.is_empty() {
        "[]".to_string()
    } else {
        let inner: Vec<String> = args.tags.iter().map(|t| format!("\"{}\"", t)).collect();
        format!("[{}]", inner.join(", "))
    };

    let date = today_iso();
    let content = format!(
        "---\ntitle: \"{}\"\nsummary: \"{}\"\ncreatedDate: \"{}\"\nisDraft: true\ntags: {}\n---\n",
        args.title, args.summary, date, tag_list
    );

    let file_path = post_dir.join("index.mdx");
    fs::write(&file_path, &content).map_err(|e| e.to_string())?;

    Ok(ContentEntry {
        slug,
        content_type: "post".into(),
        title: args.title,
        summary: args.summary,
        tags: args.tags,
        is_draft: true,
        created_date: date,
        publication_date: None,
        author: Some("Filipe Lima".into()),
        image: None,
        file_path: file_path.to_string_lossy().to_string(),
        modified_date: None,
    })
}

#[tauri::command]
pub fn create_app(repo_path: String, args: CreateAppArgs) -> Result<ContentEntry, String> {
    let slug = if args.slug.is_empty() {
        to_slug(&args.title)
    } else {
        args.slug
    };
    let app_dir = Path::new(&repo_path)
        .join("src/content/apps")
        .join(&slug);

    if app_dir.exists() {
        return Err(format!("App \"{}\" already exists.", slug));
    }

    fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;

    let mut tags = args.tags.clone();
    if !tags.contains(&"app".to_string()) {
        tags.insert(0, "app".to_string());
    }

    let tag_list = if tags.is_empty() {
        "[]".to_string()
    } else {
        let inner: Vec<String> = tags.iter().map(|t| format!("\"{}\"", t)).collect();
        format!("[{}]", inner.join(", "))
    };

    let date = today_iso();
    let index_content = format!(
        "---\ntitle: \"{}\"\nsummary: \"{}\"\ncreatedDate: {}\nisDraft: true\ntags: {}\n---\n",
        args.title, args.summary, date, tag_list
    );

    let app_astro = format!(
        r#"---
/**
 * {} -- App Component
 */
---

<div class="{}-root" id="{}-root">
  <p class="{}-placeholder">App goes here.</p>
</div>

<style>
  .{}-root {{
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    color: var(--color-text);
  }}

  .{}-placeholder {{
    font-family: var(--font-serif);
    font-size: var(--font-size-h3);
    color: var(--color-text-muted);
  }}
</style>

<script>
  import {{ onPageReady }} from "../../../utils/lifecycle";

  onPageReady((signal) => {{
    const root = document.getElementById("{}-root");
    if (!root) return;

    const themeObserver = new MutationObserver(() => {{}});
    themeObserver.observe(document.documentElement, {{
      attributes: true,
      attributeFilter: ["data-theme"],
    }});
    signal.addEventListener("abort", () => themeObserver.disconnect());
  }});
</script>
"#,
        slug, slug, slug, slug, slug, slug, slug
    );

    let index_path = app_dir.join("index.md");
    let astro_path = app_dir.join("App.astro");
    fs::write(&index_path, &index_content).map_err(|e| e.to_string())?;
    fs::write(&astro_path, &app_astro).map_err(|e| e.to_string())?;

    Ok(ContentEntry {
        slug,
        content_type: "app".into(),
        title: args.title,
        summary: args.summary,
        tags,
        is_draft: true,
        created_date: date,
        publication_date: None,
        author: None,
        image: None,
        file_path: index_path.to_string_lossy().to_string(),
        modified_date: None,
    })
}

#[tauri::command]
pub async fn delete_content(repo_path: String, slug: String) -> Result<(), String> {
    let base = Path::new(&repo_path);

    // Check blog dir
    let blog_dir = base.join("src/content/blog").join(&slug);
    if blog_dir.is_dir() {
        fs::remove_dir_all(&blog_dir).map_err(|e| e.to_string())?;
        // Git operations
        git_add_commit_push(
            &repo_path,
            &format!("src/content/blog/{}", slug),
            &format!("delete: {}", slug),
        )?;
        return Ok(());
    }

    // Check apps dir
    let app_dir = base.join("src/content/apps").join(&slug);
    if app_dir.is_dir() {
        fs::remove_dir_all(&app_dir).map_err(|e| e.to_string())?;
        git_add_commit_push(
            &repo_path,
            &format!("src/content/apps/{}", slug),
            &format!("delete: {}", slug),
        )?;
        return Ok(());
    }

    Err(format!("No content found for slug \"{}\".", slug))
}

#[tauri::command]
pub async fn publish(repo_path: String, slug: String) -> Result<ContentEntry, String> {
    let base = Path::new(&repo_path);

    // Find the content file
    let (file_path, content_type) = find_content_file(base, &slug)?;
    let content = fs::read_to_string(&file_path).map_err(|e| e.to_string())?;
    let (yaml, rest) = split_frontmatter(&content)
        .ok_or_else(|| "Could not parse frontmatter.".to_string())?;

    // Check if already published
    if get_yaml_bool(&yaml, "isDraft") == Some(false) {
        // Already published, just return current state
        return parse_content_entry(&slug, &content_type, &file_path)
            .ok_or_else(|| "Failed to parse entry.".to_string());
    }

    // Set isDraft to false
    let mut new_yaml = set_frontmatter_field(&yaml, "isDraft", "false");

    // Add publicationDate if not present
    let has_pub_date = Regex::new(r"(?m)^publicationDate:")
        .unwrap()
        .is_match(&new_yaml);
    if !has_pub_date {
        new_yaml = insert_field_after(
            &new_yaml,
            "createdDate",
            "publicationDate",
            &format!("\"{}\"", today_iso()),
        );
    }

    // Write back
    let new_content = assemble_file(&new_yaml, &rest);
    fs::write(&file_path, &new_content).map_err(|e| e.to_string())?;

    // Git operations
    let rel_path = file_path
        .strip_prefix(base)
        .unwrap_or(&file_path)
        .to_string_lossy()
        .to_string();
    let title = get_yaml_field(&new_yaml, "title").unwrap_or_else(|| slug.clone());
    git_add_commit_push(&repo_path, &rel_path, &format!("publish: {}", title))?;

    parse_content_entry(&slug, &content_type, &file_path)
        .ok_or_else(|| "Failed to parse entry after publish.".to_string())
}

#[tauri::command]
pub async fn unpublish(repo_path: String, slug: String) -> Result<ContentEntry, String> {
    let base = Path::new(&repo_path);

    let (file_path, content_type) = find_content_file(base, &slug)?;
    let content = fs::read_to_string(&file_path).map_err(|e| e.to_string())?;
    let (yaml, rest) = split_frontmatter(&content)
        .ok_or_else(|| "Could not parse frontmatter.".to_string())?;

    // Check if already draft
    if get_yaml_bool(&yaml, "isDraft") == Some(true) {
        return parse_content_entry(&slug, &content_type, &file_path)
            .ok_or_else(|| "Failed to parse entry.".to_string());
    }

    let new_yaml = set_frontmatter_field(&yaml, "isDraft", "true");
    let new_content = assemble_file(&new_yaml, &rest);
    fs::write(&file_path, &new_content).map_err(|e| e.to_string())?;

    let rel_path = file_path
        .strip_prefix(base)
        .unwrap_or(&file_path)
        .to_string_lossy()
        .to_string();
    let title = get_yaml_field(&new_yaml, "title").unwrap_or_else(|| slug.clone());
    git_add_commit_push(&repo_path, &rel_path, &format!("unpublish: {}", title))?;

    parse_content_entry(&slug, &content_type, &file_path)
        .ok_or_else(|| "Failed to parse entry after unpublish.".to_string())
}

#[tauri::command]
pub fn git_status(repo_path: String) -> Result<String, String> {
    let output = Command::new("git")
        .args(["status", "--porcelain"])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| format!("Failed to run git status: {}", e))?;

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[tauri::command]
pub fn open_in_vscode(path: String) -> Result<(), String> {
    // Try `code` from PATH first, then fall back to `open -a` on macOS.
    // Tauri GUI apps on macOS don't inherit the shell PATH, so `code` is
    // often not found even when the CLI is installed.
    if Command::new("code").arg(&path).spawn().is_ok() {
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .args(["-a", "Visual Studio Code", &path])
            .spawn()
            .map_err(|e| format!("Failed to open VS Code: {}", e))?;
        return Ok(());
    }

    #[cfg(not(target_os = "macos"))]
    Err("VS Code CLI ('code') not found in PATH.".to_string())
}

#[derive(Debug, Serialize, Deserialize)]
pub struct HealthStatus {
    pub url: String,
    pub ok: bool,
    pub status_code: Option<u16>,
}

#[tauri::command]
pub async fn check_url_health(url: String) -> Result<HealthStatus, String> {
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
// Internal helpers
// ---------------------------------------------------------------------------

fn find_content_file(base: &Path, slug: &str) -> Result<(PathBuf, String), String> {
    // Check blog
    let blog_dir = base.join("src/content/blog").join(slug);
    if blog_dir.is_dir() {
        let mdx = blog_dir.join("index.mdx");
        if mdx.exists() {
            return Ok((mdx, "post".into()));
        }
        let md = blog_dir.join("index.md");
        if md.exists() {
            return Ok((md, "post".into()));
        }
    }

    // Check apps
    let app_dir = base.join("src/content/apps").join(slug);
    if app_dir.is_dir() {
        let md = app_dir.join("index.md");
        if md.exists() {
            return Ok((md, "app".into()));
        }
    }

    Err(format!("No content found for slug \"{}\".", slug))
}

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

fn git_add_commit_push(repo_path: &str, rel_path: &str, message: &str) -> Result<(), String> {
    let run = |args: &[&str]| -> Result<(), String> {
        let output = Command::new("git")
            .args(args)
            .current_dir(repo_path)
            .output()
            .map_err(|e| format!("git {} failed: {}", args[0], e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("git {} failed: {}", args[0], stderr));
        }
        Ok(())
    };

    run(&["add", rel_path])?;
    run(&["commit", "-m", message])?;
    run(&["push"])?;
    Ok(())
}

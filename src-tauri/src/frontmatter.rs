//! YAML frontmatter parsing and manipulation for MDX/Markdown content files.

use chrono::{DateTime, Local, Utc};
use regex::Regex;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::LazyLock;

use crate::types::ContentEntry;

/// Matches non-alphanumeric runs for slug generation.
pub static SLUG_RE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"[^a-z0-9]+").unwrap());
/// Captures the YAML block between `---` fences at the start of a file.
pub static FRONTMATTER_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?s)^---\r?\n(.*?)\r?\n---").unwrap());
/// Detects presence of a `publicationDate` field in frontmatter.
pub static PUB_DATE_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?m)^publicationDate:").unwrap());

/// Return the current date and time as an ISO-8601 string (YYYY-MM-DDTHH:MM) in the local timezone.
pub fn now_iso() -> String {
    Local::now().format("%Y-%m-%dT%H:%M").to_string()
}

/// Convert a title string into a URL-safe slug (lowercase, hyphens only).
pub fn to_slug(text: &str) -> String {
    let lower = text.to_lowercase();
    let slug = SLUG_RE.replace_all(&lower, "-");
    slug.trim_matches('-').to_string()
}

/// Calculate SHA-256 hash of the content body (excluding frontmatter).
pub fn calculate_content_hash(content: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(content.as_bytes());
    format!("{:x}", hasher.finalize())
}

/// Calculate SHA-256 hash of all non-metadata files in a content directory.
/// Excludes `index.md` (frontmatter managed by the panel) and hidden files.
pub fn calculate_directory_hash(dir: &Path) -> String {
    fn collect_files(dir: &Path, paths: &mut Vec<PathBuf>) {
        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.starts_with('.') {
                    continue;
                }
                let path = entry.path();
                if path.is_dir() {
                    collect_files(&path, paths);
                } else {
                    paths.push(path);
                }
            }
        }
    }

    let mut paths: Vec<PathBuf> = Vec::new();
    collect_files(dir, &mut paths);
    paths.retain(|p| *p != dir.join("index.md"));
    paths.sort();

    let mut hasher = Sha256::new();
    for path in &paths {
        let rel = path.strip_prefix(dir).unwrap_or(path);
        hasher.update(rel.to_string_lossy().as_bytes());
        if let Ok(contents) = fs::read(path) {
            hasher.update(&contents);
        }
    }
    format!("{:x}", hasher.finalize())
}

/// Parse frontmatter from file content. Returns (yaml_block, rest_of_file).
pub fn split_frontmatter(content: &str) -> Option<(String, String)> {
    if let Some(caps) = FRONTMATTER_RE.captures(content) {
        let full_match = caps.get(0).unwrap();
        let yaml = caps.get(1).unwrap().as_str().to_string();
        let rest = content[full_match.end()..].to_string();
        Some((yaml, rest))
    } else {
        None
    }
}

/// Get a string field from YAML frontmatter.
pub fn get_yaml_field(yaml: &str, key: &str) -> Option<String> {
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
pub fn get_yaml_bool(yaml: &str, key: &str) -> Option<bool> {
    let val = get_yaml_field(yaml, key)?;
    match val.as_str() {
        "true" => Some(true),
        "false" => Some(false),
        _ => None,
    }
}

/// Get tags array from YAML frontmatter.
pub fn get_yaml_tags(yaml: &str) -> Vec<String> {
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
                .map(|t| t.trim().trim_matches('"').trim_matches('\'').to_string())
                .filter(|t| !t.is_empty())
                .collect();
        }
    }
    vec![]
}

/// Set a frontmatter field. Updates existing or appends.
pub fn set_frontmatter_field(yaml: &str, key: &str, value: &str) -> String {
    let pattern = format!(r"(?m)^{}:.*$", regex::escape(key));
    let re = Regex::new(&pattern).unwrap();
    if re.is_match(yaml) {
        re.replace(yaml, format!("{}: {}", key, value)).to_string()
    } else {
        format!("{}\n{}: {}", yaml, key, value)
    }
}

/// Insert a field after another field in frontmatter.
pub fn insert_field_after(yaml: &str, after_key: &str, key: &str, value: &str) -> String {
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
pub fn assemble_file(yaml: &str, rest: &str) -> String {
    format!("---\n{}\n---{}", yaml, rest)
}

/// Parse a content file into a ContentEntry.
pub fn parse_content_entry(
    slug: &str,
    content_type: &str,
    file_path: &Path,
) -> Option<ContentEntry> {
    let content = fs::read_to_string(file_path).ok()?;
    let (yaml, rest) = split_frontmatter(&content)?;

    let is_draft = get_yaml_bool(&yaml, "isDraft").unwrap_or(true);

    let modified_date = fs::metadata(file_path)
        .ok()
        .and_then(|m| m.modified().ok())
        .map(|t| {
            let dt: DateTime<Utc> = t.into();
            dt.to_rfc3339()
        });

    let publication_date = get_yaml_field(&yaml, "publicationDate");
    let author = get_yaml_field(&yaml, "author");
    let image = get_yaml_field(&yaml, "image");
    let mut published_hash = get_yaml_field(&yaml, "publishedHash");

    // Compute current content hash: directory hash for apps, body hash for posts.
    let is_app = content_type == "app";
    let current_hash = if is_app {
        file_path.parent().map(calculate_directory_hash)
    } else {
        Some(calculate_content_hash(&rest))
    };

    // One-time migration: seed publishedHash for published content that predates change tracking.
    if !is_draft && published_hash.is_none() {
        if let Some(ref hash) = current_hash {
            let new_yaml =
                set_frontmatter_field(&yaml, "publishedHash", &format!("\"{}\"", hash));
            let new_content = assemble_file(&new_yaml, &rest);
            let _ = fs::write(file_path, new_content); // best-effort
            published_hash = Some(hash.clone());
        }
    }

    let has_changed = if !is_draft {
        match (&published_hash, &current_hash) {
            (Some(p_hash), Some(c_hash)) => c_hash != p_hash,
            _ => false,
        }
    } else {
        false
    };

    Some(ContentEntry {
        slug: slug.to_string(),
        content_type: content_type.to_string(),
        title: get_yaml_field(&yaml, "title").unwrap_or_else(|| "(untitled)".into()),
        summary: get_yaml_field(&yaml, "summary").unwrap_or_default(),
        tags: get_yaml_tags(&yaml),
        is_draft,
        created_date: get_yaml_field(&yaml, "createdDate").unwrap_or_else(|| "unknown".into()),
        publication_date,
        author,
        image,
        file_path: file_path.to_string_lossy().to_string(),
        modified_date,
        published_hash,
        has_changed,
    })
}

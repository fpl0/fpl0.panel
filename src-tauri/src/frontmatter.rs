//! YAML frontmatter parsing and manipulation for MDX/Markdown content files.

use chrono::{DateTime, Local, Utc};
use regex::Regex;
use std::fs;
use std::path::Path;
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

/// Return today's date as an ISO-8601 string (YYYY-MM-DD) in the local timezone.
pub fn today_iso() -> String {
    Local::now().format("%Y-%m-%d").to_string()
}

/// Convert a title string into a URL-safe slug (lowercase, hyphens only).
pub fn to_slug(text: &str) -> String {
    let lower = text.to_lowercase();
    let slug = SLUG_RE.replace_all(&lower, "-");
    slug.trim_matches('-').to_string()
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
pub fn set_frontmatter_field(yaml: &str, key: &str, value: &str) -> String {
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

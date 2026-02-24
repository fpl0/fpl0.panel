//! Security utilities — path traversal prevention and YAML string escaping.

use std::path::{Path, PathBuf};

/// Ensure `path` resolves to a location inside `base_dir`.
pub fn ensure_within(path: &Path, base_dir: &Path) -> Result<PathBuf, String> {
    let canonical = path
        .canonicalize()
        .map_err(|e| format!("Invalid path: {}", e))?;
    let base = base_dir
        .canonicalize()
        .map_err(|e| format!("Invalid base path: {}", e))?;
    if canonical.starts_with(&base) {
        Ok(canonical)
    } else {
        Err("Path escapes the repository directory".to_string())
    }
}

/// Escape a string for safe interpolation inside double-quoted YAML values.
pub fn escape_yaml_string(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

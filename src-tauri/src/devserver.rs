use std::env;
use std::process::{Child, Command};
use std::sync::Mutex;

pub struct DevServerState(Mutex<Option<Child>>);

impl DevServerState {
    pub fn new() -> Self {
        Self(Mutex::new(None))
    }
}

/// Build an inclusive PATH for child processes in a bundled macOS app.
/// Bundled apps don't inherit the user's shell PATH, so tools managed by
/// mise, Homebrew, or bun's own installer are invisible without this.
fn build_child_path() -> String {
    let home = env::var("HOME").unwrap_or_default();
    let mut parts: Vec<String> = Vec::new();

    let candidates = [
        format!("{}/.local/share/mise/shims", home), // mise-managed tools (node, bun, etc.)
        format!("{}/.bun/bin", home),                 // bun default install
        "/opt/homebrew/bin".to_string(),              // Homebrew (Apple Silicon)
        "/usr/local/bin".to_string(),                 // Homebrew (Intel)
    ];

    for dir in candidates {
        if std::path::Path::new(&dir).is_dir() {
            parts.push(dir);
        }
    }

    // Append whatever PATH we already have
    if let Ok(existing) = env::var("PATH") {
        for segment in existing.split(':') {
            if !segment.is_empty() && !parts.iter().any(|p| p == segment) {
                parts.push(segment.to_string());
            }
        }
    }

    parts.join(":")
}

/// Find the `bun` executable on macOS.
/// Checks well-known install locations since bundled apps can't rely on PATH.
fn find_bun() -> String {
    let home = env::var("HOME").unwrap_or_default();

    let candidates = [
        "/opt/homebrew/bin/bun".to_string(),
        "/usr/local/bin/bun".to_string(),
        format!("{}/.bun/bin/bun", home),
        // mise "latest" symlink — avoids hardcoding a specific version
        format!("{}/.local/share/mise/installs/bun/latest/bin/bun", home),
    ];

    for path in &candidates {
        if std::path::Path::new(path).exists() {
            return path.clone();
        }
    }

    "bun".to_string()
}

pub fn start_dev_server(state: &DevServerState, repo_path: &str) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;

    // Kill existing child if any
    if let Some(ref mut child) = *guard {
        let _ = child.kill();
        let _ = child.wait();
    }

    let bun_path = find_bun();
    let path_env = build_child_path();

    let child = Command::new(&bun_path)
        .args(["run", "dev", "--", "--port", "4322"])
        .current_dir(repo_path)
        .env("PATH", &path_env)
        .env("INCLUDE_DRAFTS", "true")
        .spawn()
        .map_err(|e| format!("Failed to start dev server (bun={}): {}", bun_path, e))?;

    *guard = Some(child);
    Ok(())
}

pub fn stop_dev_server(state: &DevServerState) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(ref mut child) = *guard {
        let _ = child.kill();
        let _ = child.wait();
    }
    *guard = None;
    Ok(())
}

use std::env;
use std::process::{Child, Command};
use std::sync::Mutex;

pub struct DevServerState(Mutex<Option<Child>>);

impl DevServerState {
    pub fn new() -> Self {
        Self(Mutex::new(None))
    }
}

/// Robustly find the `bun` executable on macOS.
/// Bundled apps don't inherit the shell's PATH.
fn find_bun() -> String {
    let common_paths = [
        "/usr/local/bin/bun",
        "/opt/homebrew/bin/bun",
        &format!(
            "{}/.local/share/mise/installs/bun/1.3.9/bin/bun",
            env::var("HOME").unwrap_or_default()
        ),
        &format!("{}/.bun/bin/bun", env::var("HOME").unwrap_or_default()),
    ];

    for path in common_paths {
        if std::path::Path::new(path).exists() {
            return path.to_string();
        }
    }

    "bun".to_string() // Fallback to PATH
}

pub fn start_dev_server(state: &DevServerState, repo_path: &str) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;

    // Kill existing child if any
    if let Some(ref mut child) = *guard {
        let _ = child.kill();
        let _ = child.wait();
    }

    let bun_path = find_bun();

    // Build a more inclusive PATH for the child process
    let mut path_env = env::var("PATH").unwrap_or_default();
    if !path_env.contains("/opt/homebrew/bin") {
        path_env = format!("{}:/opt/homebrew/bin:/usr/local/bin", path_env);
    }

    let child = Command::new(bun_path)
        .args(["run", "dev"])
        .current_dir(repo_path)
        .env("PATH", path_env)
        .env("INCLUDE_DRAFTS", "true")
        .spawn()
        .map_err(|e| format!("Failed to start dev server: {}", e))?;

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

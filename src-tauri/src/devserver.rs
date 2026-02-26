use std::env;
use std::process::{Child, Command};
use std::sync::Mutex;

#[cfg(unix)]
use std::os::unix::process::CommandExt;

pub struct DevServerState(Mutex<Option<Child>>);

impl DevServerState {
    pub fn new() -> Self {
        Self(Mutex::new(None))
    }
}

/// Kill a child and its entire process group (Unix).
/// The child must have been spawned with `.process_group(0)`.
fn kill_child_tree(child: &mut Child) {
    let pid = child.id();

    #[cfg(unix)]
    {
        // SIGTERM the entire process group (bun → astro → node).
        // Safety: pid is a valid u32 from Child::id(); negative pid = process group.
        unsafe {
            libc::kill(-(pid as i32), libc::SIGTERM);
        }
    }

    #[cfg(not(unix))]
    {
        let _ = child.kill();
    }

    let _ = child.wait();
}

/// Best-effort cleanup: kill any stale process listening on the dev server port.
/// This handles orphaned processes from previous panel runs that weren't cleaned up.
fn kill_stale_port_holder(port: u16) {
    #[cfg(unix)]
    {
        // Use lsof to find processes listening on the port, then kill them.
        if let Ok(output) = Command::new("lsof")
            .args(["-ti", &format!(":{}", port)])
            .output()
        {
            let pids = String::from_utf8_lossy(&output.stdout);
            for pid_str in pids.split_whitespace() {
                if let Ok(pid) = pid_str.parse::<i32>() {
                    unsafe {
                        libc::kill(pid, libc::SIGTERM);
                    }
                }
            }
        }
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

    // Kill existing managed child and its process group
    if let Some(ref mut child) = *guard {
        kill_child_tree(child);
    }
    *guard = None;

    // Kill any stale orphan from a previous panel session
    kill_stale_port_holder(4322);

    let bun_path = find_bun();
    let path_env = build_child_path();

    let mut cmd = Command::new(&bun_path);
    cmd.args(["run", "dev", "--", "--port", "4322"])
        .current_dir(repo_path)
        .env("PATH", &path_env)
        .env("INCLUDE_DRAFTS", "true");

    // Spawn in its own process group so we can kill the entire tree on exit.
    #[cfg(unix)]
    cmd.process_group(0);

    let child = cmd
        .spawn()
        .map_err(|e| format!("Failed to start dev server (bun={}): {}", bun_path, e))?;

    *guard = Some(child);
    Ok(())
}

pub fn stop_dev_server(state: &DevServerState) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(ref mut child) = *guard {
        kill_child_tree(child);
    }
    *guard = None;
    Ok(())
}

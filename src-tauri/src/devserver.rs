use std::process::{Child, Command};
use std::sync::Mutex;

pub struct DevServerState(Mutex<Option<Child>>);

impl DevServerState {
    pub fn new() -> Self {
        Self(Mutex::new(None))
    }
}

pub fn start_dev_server(state: &DevServerState, repo_path: &str) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;

    // Kill existing child if any
    if let Some(ref mut child) = *guard {
        let _ = child.kill();
        let _ = child.wait();
    }

    let child = Command::new("bun")
        .args(["run", "dev"])
        .current_dir(repo_path)
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

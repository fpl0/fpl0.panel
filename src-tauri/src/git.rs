//! Git operations — thin wrappers around the `git` CLI for add/commit/push and status.

use std::process::Command;

/// Stage a file, commit with the given message, and push to the remote.
pub fn git_add_commit_push(repo_path: &str, rel_path: &str, message: &str) -> Result<(), String> {
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

/// Return the raw `git status --porcelain` output for change detection.
pub fn git_status_porcelain(repo_path: &str) -> Result<String, String> {
    let output = Command::new("git")
        .args(["status", "--porcelain"])
        .current_dir(repo_path)
        .output()
        .map_err(|e| format!("Failed to run git status: {}", e))?;

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

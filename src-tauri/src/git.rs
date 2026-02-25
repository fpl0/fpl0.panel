//! Git operations — thin wrappers around the `git` CLI for add/commit/push and status.

use std::fs;
use std::path::Path;
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

/// Find the most recent commit hash for a file where the message started with "publish:".
pub fn find_last_publish_commit(repo_path: &str, rel_path: &str) -> Result<String, String> {
    let output = Command::new("git")
        .args([
            "log",
            "-1",
            "--grep=^publish:",
            "--format=%H",
            "--",
            rel_path,
        ])
        .current_dir(repo_path)
        .output()
        .map_err(|e| format!("Failed to run git log: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git log failed: {}", stderr));
    }

    let hash = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if hash.is_empty() {
        return Err("No publication commit found for this file.".to_string());
    }
    Ok(hash)
}

/// Reset a file to its state in the given commit.
pub fn rollback_file(repo_path: &str, commit_hash: &str, rel_path: &str) -> Result<(), String> {
    let output = Command::new("git")
        .args(["checkout", commit_hash, "--", rel_path])
        .current_dir(repo_path)
        .output()
        .map_err(|e| format!("Failed to run git checkout: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git checkout failed: {}", stderr));
    }
    Ok(())
}

/// Reset an entire directory to its state in the given commit.
/// Removes current contents first so files added after that commit are cleaned up.
pub fn rollback_directory(
    repo_path: &str,
    commit_hash: &str,
    rel_dir: &str,
) -> Result<(), String> {
    let dir_path = Path::new(repo_path).join(rel_dir);

    if dir_path.is_dir() {
        fs::remove_dir_all(&dir_path)
            .map_err(|e| format!("Failed to clean directory for rollback: {}", e))?;
    }

    let output = Command::new("git")
        .args(["checkout", commit_hash, "--", rel_dir])
        .current_dir(repo_path)
        .output()
        .map_err(|e| format!("Failed to run git checkout: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git checkout failed: {}", stderr));
    }
    Ok(())
}

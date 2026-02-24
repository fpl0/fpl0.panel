use notify_debouncer_mini::{new_debouncer, DebouncedEventKind};
use notify::RecursiveMode;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

struct WatcherInner {
    _debouncer: notify_debouncer_mini::Debouncer<notify::RecommendedWatcher>,
    watched_path: String,
}

pub struct WatcherState(Mutex<Option<WatcherInner>>);

impl WatcherState {
    pub fn new() -> Self {
        Self(Mutex::new(None))
    }
}

pub fn start_watching(app: &AppHandle, repo_path: &str) -> Result<(), String> {
    let state = app.state::<WatcherState>();
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;

    // If already watching the same path, no-op
    if let Some(inner) = guard.as_ref() {
        if inner.watched_path == repo_path {
            return Ok(());
        }
    }

    // Drop old watcher if any (different path)
    *guard = None;

    let blog_dir = PathBuf::from(repo_path).join("src/content/blog");
    let apps_dir = PathBuf::from(repo_path).join("src/content/apps");

    let app_handle = app.clone();
    let mut debouncer = new_debouncer(
        Duration::from_millis(500),
        move |result: Result<Vec<notify_debouncer_mini::DebouncedEvent>, notify::Error>| {
            if let Ok(events) = result {
                let paths: Vec<String> = events
                    .iter()
                    .filter(|e| e.kind == DebouncedEventKind::Any)
                    .map(|e| e.path.to_string_lossy().to_string())
                    .collect();
                if !paths.is_empty() {
                    let _ = app_handle.emit("content-changed", paths);
                }
            }
        },
    )
    .map_err(|e| format!("Failed to create debouncer: {}", e))?;

    let watcher = debouncer.watcher();

    if blog_dir.is_dir() {
        watcher
            .watch(&blog_dir, RecursiveMode::Recursive)
            .map_err(|e| format!("Failed to watch blog dir: {}", e))?;
    }

    if apps_dir.is_dir() {
        watcher
            .watch(&apps_dir, RecursiveMode::Recursive)
            .map_err(|e| format!("Failed to watch apps dir: {}", e))?;
    }

    *guard = Some(WatcherInner {
        _debouncer: debouncer,
        watched_path: repo_path.to_string(),
    });

    Ok(())
}

pub fn stop_watching(app: &AppHandle) -> Result<(), String> {
    let state = app.state::<WatcherState>();
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    *guard = None;
    Ok(())
}

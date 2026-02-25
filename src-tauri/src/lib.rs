use tauri::Manager;

mod cloudflare;
mod commands;
mod config;
mod content;
mod devserver;
mod frontmatter;
mod git;
mod security;
mod types;
mod watcher;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .manage(watcher::WatcherState::new())
        .manage(devserver::DevServerState::new())
        .manage(commands::HttpClient(
            reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(15))
                .build()
                .expect("Failed to build HTTP client"),
        ))
        .invoke_handler(tauri::generate_handler![
            commands::get_config,
            commands::set_config,
            commands::validate_repo_path,
            commands::list_content,
            commands::read_file,
            commands::write_file,
            commands::create_post,
            commands::create_app,
            commands::delete_content,
            commands::publish,
            commands::unpublish,
            commands::git_status,
            commands::open_in_vscode,
            commands::start_watcher,
            commands::stop_watcher,
            commands::start_dev_server,
            commands::stop_dev_server,
            commands::check_url_health,
            commands::fetch_last_deployment,
            commands::fetch_analytics,
            commands::test_cf_connection,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                let state = app.state::<devserver::DevServerState>();
                let _ = devserver::stop_dev_server(&state);
            }
        });
}

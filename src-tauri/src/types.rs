//! Shared data types serialized across the Tauri IPC boundary.

use serde::{Deserialize, Serialize};

/// Persisted application settings (repo path, theme preference).
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppConfig {
    pub repo_path: Option<String>,
    pub theme: Option<String>,
}

/// A single content entry (blog post or app) as surfaced to the frontend.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ContentEntry {
    pub slug: String,
    pub content_type: String, // "post" | "app"
    pub title: String,
    pub summary: String,
    pub tags: Vec<String>,
    pub is_draft: bool,
    pub created_date: String,
    pub publication_date: Option<String>,
    pub author: Option<String>,
    pub image: Option<String>,
    pub file_path: String,
    pub modified_date: Option<String>,
}

/// Arguments for creating a new blog post via the IPC `create_post` command.
#[derive(Debug, Serialize, Deserialize)]
pub struct CreatePostArgs {
    pub title: String,
    pub slug: String,
    pub summary: String,
    pub tags: Vec<String>,
}

/// Arguments for creating a new app entry via the IPC `create_app` command.
#[derive(Debug, Serialize, Deserialize)]
pub struct CreateAppArgs {
    pub title: String,
    pub slug: String,
    pub summary: String,
    pub tags: Vec<String>,
}

/// Result of a URL health check (dev server or production site).
#[derive(Debug, Serialize, Deserialize)]
pub struct HealthStatus {
    pub url: String,
    pub ok: bool,
    pub status_code: Option<u16>,
}

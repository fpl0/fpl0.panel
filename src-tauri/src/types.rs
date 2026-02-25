//! Shared data types serialized across the Tauri IPC boundary.

use serde::{Deserialize, Serialize};

/// Persisted application settings (repo path, theme preference, Cloudflare credentials).
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppConfig {
    pub repo_path: Option<String>,
    pub theme: Option<String>,
    // Cloudflare credentials
    pub cf_account_id: Option<String>,
    pub cf_project_name: Option<String>,
    pub cf_api_token: Option<String>,
    pub cf_domain: Option<String>,
    pub cf_zone_id: Option<String>,
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
    pub published_hash: Option<String>,
    pub has_changed: bool,
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

/// Info about the last successful Cloudflare Pages deployment.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CfDeploymentInfo {
    pub deployed_at: String,
    pub commit_hash: Option<String>,
    pub commit_message: Option<String>,
    pub status: String,
    pub url: Option<String>,
}

/// Aggregated Cloudflare traffic analytics for a given period.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CfAnalytics {
    pub period: String,
    pub total_requests: u64,
    pub daily_requests: Vec<CfDailyCount>,
    pub top_paths: Vec<CfPathCount>,
    pub top_countries: Vec<CfCountryCount>,
    pub status_codes: Vec<CfStatusCount>,
    pub browsers: Vec<CfBrowserCount>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CfDailyCount {
    pub date: String,
    pub count: u64,
    pub uniques: u64,
    pub bytes: u64,
    pub cached_bytes: u64,
    pub cached_requests: u64,
    pub threats: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CfPathCount {
    pub path: String,
    pub count: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CfCountryCount {
    pub country: String,
    pub count: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CfStatusCount {
    pub status: u16,
    pub count: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CfBrowserCount {
    pub browser: String,
    pub page_views: u64,
}


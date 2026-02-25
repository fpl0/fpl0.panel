/**
 * Typed wrappers around Tauri IPC invoke calls.
 */
import { invoke } from "@tauri-apps/api/core";

/** Port the panel's managed Astro dev server runs on (avoids conflicting with default 4321). */
export const DEV_SERVER_PORT = 4322;
export const DEV_SERVER_ORIGIN = `http://localhost:${DEV_SERVER_PORT}`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AppConfig {
  repo_path: string | null;
  theme: string | null;
  cf_account_id: string | null;
  cf_project_name: string | null;
  cf_api_token: string | null;
  cf_domain: string | null;
  cf_zone_id: string | null;
}

export interface ContentEntry {
  slug: string;
  content_type: "post" | "app";
  title: string;
  summary: string;
  tags: string[];
  is_draft: boolean;
  created_date: string;
  publication_date: string | null;
  author: string | null;
  image: string | null;
  file_path: string;
  modified_date: string | null;
  published_hash: string | null;
  has_changed: boolean;
}

export interface HealthStatus {
  url: string;
  ok: boolean;
  status_code: number | null;
}

export interface CfDeploymentInfo {
  deployed_at: string;
  commit_hash: string | null;
  commit_message: string | null;
  status: string;
  url: string | null;
}

export interface CfDailyCount {
  date: string;
  count: number;
  uniques: number;
  bytes: number;
  cached_bytes: number;
  cached_requests: number;
  threats: number;
}

export interface CfPathCount {
  path: string;
  count: number;
}

export interface CfCountryCount {
  country: string;
  count: number;
}

export interface CfStatusCount {
  status: number;
  count: number;
}

export interface CfBrowserCount {
  browser: string;
  page_views: number;
}

export interface CfAnalytics {
  period: string;
  total_requests: number;
  daily_requests: CfDailyCount[];
  top_paths: CfPathCount[];
  top_countries: CfCountryCount[];
  status_codes: CfStatusCount[];
  browsers: CfBrowserCount[];
}

export interface CreatePostArgs {
  title: string;
  slug: string;
  summary: string;
  tags: string[];
}

export interface CreateAppArgs {
  title: string;
  slug: string;
  summary: string;
  tags: string[];
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

export function getConfig(): Promise<AppConfig> {
  return invoke("get_config");
}

export function setConfig(config: AppConfig): Promise<void> {
  return invoke("set_config", { config });
}

export function validateRepoPath(path: string): Promise<boolean> {
  return invoke("validate_repo_path", { path });
}

export function listContent(repoPath: string): Promise<ContentEntry[]> {
  return invoke("list_content", { repoPath });
}

export function readFile(path: string): Promise<string> {
  return invoke("read_file", { path });
}

export function writeFile(path: string, content: string): Promise<void> {
  return invoke("write_file", { path, content });
}

export function createPost(repoPath: string, args: CreatePostArgs): Promise<ContentEntry> {
  return invoke("create_post", { repoPath, args });
}

export function createApp(repoPath: string, args: CreateAppArgs): Promise<ContentEntry> {
  return invoke("create_app", { repoPath, args });
}

export function deleteContent(repoPath: string, slug: string): Promise<void> {
  return invoke("delete_content", { repoPath, slug });
}

export function publish(repoPath: string, slug: string): Promise<ContentEntry> {
  return invoke("publish", { repoPath, slug });
}

export function unpublish(repoPath: string, slug: string): Promise<ContentEntry> {
  return invoke("unpublish", { repoPath, slug });
}

export function rollback(repoPath: string, slug: string): Promise<ContentEntry> {
  return invoke("rollback", { repoPath, slug });
}

export function gitStatus(repoPath: string): Promise<string> {
  return invoke("git_status", { repoPath });
}

export function openInVscode(path: string): Promise<void> {
  return invoke("open_in_vscode", { path });
}

export function startWatcher(repoPath: string): Promise<void> {
  return invoke("start_watcher", { repoPath });
}

export function stopWatcher(): Promise<void> {
  return invoke("stop_watcher");
}

export function startDevServer(repoPath: string): Promise<void> {
  return invoke("start_dev_server", { repoPath });
}

export function stopDevServer(): Promise<void> {
  return invoke("stop_dev_server");
}

export function checkUrlHealth(url: string): Promise<HealthStatus> {
  return invoke("check_url_health", { url });
}

export function fetchLastDeployment(): Promise<CfDeploymentInfo> {
  return invoke("fetch_last_deployment");
}

export function fetchAnalytics(days: number, engagement: boolean): Promise<CfAnalytics> {
  return invoke("fetch_analytics", { days, engagement });
}

export function testCfConnection(): Promise<string> {
  return invoke("test_cf_connection");
}

/**
 * Typed wrappers around Tauri IPC invoke calls.
 */
import { invoke } from "@tauri-apps/api/core";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AppConfig {
  repo_path: string | null;
  theme: string | null;
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
}

export interface HealthStatus {
  url: string;
  ok: boolean;
  status_code: number | null;
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

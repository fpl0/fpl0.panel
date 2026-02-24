/**
 * Content operations — CRUD actions for blog posts and apps.
 * Wraps Tauri IPC commands and reconciles results into the reactive store.
 */
import { reconcile } from "solid-js/store";
import type { ContentEntry } from "../commands";
import {
  deleteContent,
  listContent,
  publish,
  unpublish,
} from "../commands";
import { state, setState } from "./state";
import { suppressFsChange } from "./watcher";

export async function refreshEntries() {
  const repoPath = state.config.repo_path;
  if (!repoPath) return;
  const entries = await listContent(repoPath);
  setState("entries", reconcile(entries));
}

export async function publishEntry(slug: string): Promise<ContentEntry> {
  const repoPath = state.config.repo_path;
  if (!repoPath) throw new Error("No repo configured");
  suppressFsChange();
  const updated = await publish(repoPath, slug);
  await refreshEntries();
  return updated;
}

export async function unpublishEntry(slug: string): Promise<ContentEntry> {
  const repoPath = state.config.repo_path;
  if (!repoPath) throw new Error("No repo configured");
  suppressFsChange();
  const updated = await unpublish(repoPath, slug);
  await refreshEntries();
  return updated;
}

export async function deleteEntry(slug: string): Promise<void> {
  const repoPath = state.config.repo_path;
  if (!repoPath) throw new Error("No repo configured");
  suppressFsChange();
  await deleteContent(repoPath, slug);
  await refreshEntries();
  setState("view", { kind: "list" });
}

/** Patch fields on an entry in the store by slug (optimistic UI update). */
export function patchEntry(slug: string, patch: Partial<ContentEntry>) {
  const idx = state.entries.findIndex((e) => e.slug === slug);
  if (idx === -1) return;
  setState("entries", idx, patch);
}

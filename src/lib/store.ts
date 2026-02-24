/**
 * Global reactive state for the panel app.
 *
 * Uses SolidJS createStore for path-based reactivity and reconcile()
 * for efficient entry list updates. Views reference entries by slug,
 * not by value — the entries array is the single source of truth.
 */
import { createSignal, createMemo } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { listen } from "@tauri-apps/api/event";
import type { UnlistenFn } from "@tauri-apps/api/event";
import type { AppConfig, ContentEntry } from "./commands";
import {
  getConfig,
  setConfig as saveConfig,
  listContent,
  publish,
  unpublish,
  deleteContent,
  startWatcher,
  stopWatcher,
  startDevServer,
} from "./commands";

// ---------------------------------------------------------------------------
// View types (slug-based, not value-based)
// ---------------------------------------------------------------------------

export type View =
  | { kind: "list" }
  | { kind: "editor"; slug: string }
  | { kind: "app-detail"; slug: string }
  | { kind: "settings" }
  | { kind: "create" };

// ---------------------------------------------------------------------------
// App state store
// ---------------------------------------------------------------------------

interface AppState {
  config: AppConfig;
  entries: ContentEntry[];
  view: View;
  theme: "light" | "dark";
  searchOpen: boolean;
}

export const [state, setState] = createStore<AppState>({
  config: { repo_path: null, theme: null },
  entries: [],
  view: { kind: "list" },
  theme: "light",
  searchOpen: false,
});

// ---------------------------------------------------------------------------
// Derived state
// ---------------------------------------------------------------------------

export const activeEntry = createMemo(() => {
  const v = state.view;
  if (v.kind === "editor" || v.kind === "app-detail") {
    return state.entries.find((e) => e.slug === v.slug) ?? null;
  }
  return null;
});

// ---------------------------------------------------------------------------
// Navigation actions
// ---------------------------------------------------------------------------

export function navigate(view: View) {
  setState("view", view);
}

export function openEntry(entry: ContentEntry) {
  if (entry.content_type === "app") {
    setState("view", { kind: "app-detail", slug: entry.slug });
  } else {
    setState("view", { kind: "editor", slug: entry.slug });
  }
}

export function openEntryBySlug(slug: string, contentType: "post" | "app") {
  if (contentType === "app") {
    setState("view", { kind: "app-detail", slug });
  } else {
    setState("view", { kind: "editor", slug });
  }
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export function toggleSearch() {
  setState("searchOpen", !state.searchOpen);
}

export function closeSearch() {
  setState("searchOpen", false);
}

// ---------------------------------------------------------------------------
// File system watcher
// ---------------------------------------------------------------------------

let suppressUntil = 0;
let unlistenFn: UnlistenFn | null = null;

/** Signal with paths from the most recent external change (or null). */
const [lastExternalChange, setLastExternalChange] = createSignal<string[] | null>(null);
export { lastExternalChange };

/** Suppress FS change events for 1s (covers 500ms debounce + margin). */
export function suppressFsChange() {
  suppressUntil = Date.now() + 1000;
}

export function clearExternalChange() {
  setLastExternalChange(null);
}

async function setupWatcher(repoPath: string) {
  // Tear down previous listener
  if (unlistenFn) {
    unlistenFn();
    unlistenFn = null;
  }
  await stopWatcher().catch(() => {});

  await startWatcher(repoPath);

  unlistenFn = await listen<string[]>("content-changed", (event) => {
    if (Date.now() < suppressUntil) return;
    setLastExternalChange(event.payload);
    refreshEntries();
  });
}

// ---------------------------------------------------------------------------
// App initialization
// ---------------------------------------------------------------------------

export async function initApp() {
  try {
    const cfg = await getConfig();
    setState("config", cfg);
    initTheme(cfg.theme);

    if (cfg.repo_path) {
      const entries = await listContent(cfg.repo_path);
      setState("entries", reconcile(entries));
      setupWatcher(cfg.repo_path);
      startDevServer(cfg.repo_path).catch((err) => {
        addToast(`Dev server failed: ${err}`, "error");
      });
    }
  } catch {
    // First launch — no config yet
  }
}

// ---------------------------------------------------------------------------
// Entry actions (centralized refresh)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Config actions
// ---------------------------------------------------------------------------

export async function updateConfig(updates: Partial<AppConfig>) {
  const newConfig = { ...state.config, ...updates };
  await saveConfig(newConfig);
  setState("config", newConfig);

  // Refresh entries and restart watcher if repo path changed
  if (updates.repo_path) {
    const entries = await listContent(updates.repo_path);
    setState("entries", reconcile(entries));
    setupWatcher(updates.repo_path);
    startDevServer(updates.repo_path).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Optimistic entry updates
// ---------------------------------------------------------------------------

/** Patch fields on an entry in the store by slug (optimistic UI update). */
export function patchEntry(slug: string, patch: Partial<ContentEntry>) {
  const idx = state.entries.findIndex((e) => e.slug === slug);
  if (idx === -1) return;
  setState("entries", idx, patch);
}

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

export function toggleTheme() {
  const next = state.theme === "light" ? "dark" : "light";
  setState("theme", next);
  document.documentElement.setAttribute("data-theme", next);
  // Persist theme to config and update store config
  const newConfig = { ...state.config, theme: next };
  saveConfig(newConfig);
  setState("config", newConfig);
}

export function initTheme(t: string | null) {
  const resolved = t === "dark" ? "dark" : "light";
  setState("theme", resolved);
  document.documentElement.setAttribute("data-theme", resolved);
}

// ---------------------------------------------------------------------------
// Toast notifications (kept as signals — ephemeral, no store benefit)
// ---------------------------------------------------------------------------

export interface Toast {
  id: number;
  message: string;
  type: "success" | "error" | "warn";
}

let toastId = 0;
const toastTimers = new Map<number, ReturnType<typeof setTimeout>>();
const [toasts, setToasts] = createSignal<Toast[]>([]);
export { toasts };

function scheduleToastDismiss(id: number) {
  const prev = toastTimers.get(id);
  if (prev) clearTimeout(prev);
  toastTimers.set(
    id,
    setTimeout(() => {
      toastTimers.delete(id);
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000),
  );
}

export function addToast(message: string, type: Toast["type"] = "success") {
  const id = ++toastId;
  setToasts((prev) => [...prev, { id, message, type }]);
  scheduleToastDismiss(id);
  return id;
}

/** Update an existing toast in-place (message and/or type), then auto-dismiss. */
export function updateToast(id: number, message: string, type: Toast["type"] = "success") {
  setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, message, type } : t)));
  scheduleToastDismiss(id);
}

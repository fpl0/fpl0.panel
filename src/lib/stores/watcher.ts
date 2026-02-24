/**
 * File-system watcher — listens for external content changes via Tauri events.
 * Provides a 1-second suppression window so our own writes don't trigger a
 * false "external change" banner in the editor.
 */
import type { UnlistenFn } from "@tauri-apps/api/event";
import { listen } from "@tauri-apps/api/event";
import { createSignal } from "solid-js";
import { startWatcher, stopWatcher } from "../commands";

/** 1s suppression covers the 500ms file-watcher debounce plus margin. */
const FS_SUPPRESS_MS = 1000;
let suppressUntil = 0;
let unlistenFn: UnlistenFn | null = null;

/** Signal with paths from the most recent external change (or null). */
const [lastExternalChange, setLastExternalChange] = createSignal<string[] | null>(null);
export { lastExternalChange };

/** Suppress FS change events for 1s (covers 500ms debounce + margin). */
export function suppressFsChange() {
  suppressUntil = Date.now() + FS_SUPPRESS_MS;
}

export function clearExternalChange() {
  setLastExternalChange(null);
}

export async function setupWatcher(repoPath: string, onContentChanged: () => void) {
  // Tear down previous listener
  try {
    unlistenFn?.();
  } finally {
    unlistenFn = null;
  }
  await stopWatcher().catch(() => {});

  await startWatcher(repoPath);

  unlistenFn = await listen<string[]>("content-changed", (event) => {
    if (Date.now() < suppressUntil) return;
    setLastExternalChange(event.payload);
    onContentChanged();
  });
}

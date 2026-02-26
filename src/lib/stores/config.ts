import { reconcile } from "solid-js/store";
import type { AppConfig } from "../commands";
import {
  getConfig,
  listContent,
  setConfig as saveConfig,
  startDevServer,
} from "../commands";
import { state, setState } from "./state";
import { refreshEntries } from "./content";
import { setupWatcher } from "./watcher";
import { initTheme } from "./theme";
import { addToast } from "./notifications";
import { startHealthPolling } from "./health";

export async function initApp() {
  try {
    const cfg = await getConfig();
    setState("config", cfg);
    initTheme(cfg.theme);

    if (cfg.repo_path) {
      const entries = await listContent(cfg.repo_path);
      setState("entries", reconcile(entries));
      setupWatcher(cfg.repo_path, refreshEntries);
      startDevServer(cfg.repo_path).catch((err) => {
        addToast(`Dev server failed: ${err}`, "error");
      });
    }

    // Start health polling immediately on app open, then every 5 minutes
    startHealthPolling();
  } catch (err) {
    // First launch or corrupt config — use defaults
    if (err instanceof Error && !err.message.includes("No such file")) {
      addToast(`Config error: ${err.message}`, "error");
    }
  }
}

export async function updateConfig(updates: Partial<AppConfig>) {
  const newConfig = { ...state.config, ...updates };
  await saveConfig(newConfig);
  setState("config", newConfig);

  // Refresh entries and restart watcher if repo path changed
  if (updates.repo_path) {
    const entries = await listContent(updates.repo_path);
    setState("entries", reconcile(entries));
    setupWatcher(updates.repo_path, refreshEntries);
    startDevServer(updates.repo_path).catch(() => {});
  }
}

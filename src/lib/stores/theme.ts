import { setConfig as saveConfig } from "../commands";
import { state, setState } from "./state";

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

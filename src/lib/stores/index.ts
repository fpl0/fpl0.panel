/**
 * Global reactive state for the panel app.
 *
 * Uses SolidJS createStore for path-based reactivity and reconcile()
 * for efficient entry list updates. Views reference entries by slug,
 * not by value — the entries array is the single source of truth.
 */

export { state, setState, activeEntry } from "./state";
export type { View, AppState } from "./state";
export { navigate, openEntry, openEntryBySlug, confirmNavigation, cancelNavigation, setNavigationGuard } from "./navigation";
export { refreshEntries, publishEntry, unpublishEntry, rollbackEntry, deleteEntry, patchEntry } from "./content";
export { lastExternalChange, suppressFsChange, clearExternalChange, setupWatcher } from "./watcher";
export { initApp, updateConfig } from "./config";
export { toggleTheme, initTheme } from "./theme";
export { toasts, addToast, updateToast, dismissToast } from "./notifications";
export type { Toast } from "./notifications";
export { toggleSearch, closeSearch } from "./search";

/**
 * Navigation — view transitions with an optional guard for unsaved changes.
 * When `navigationGuardActive` is true, navigations are deferred to
 * `pendingNavigation` so the editor can prompt before discarding edits.
 */
import type { ContentEntry } from "../commands";
import { state, setState } from "./state";
import type { View } from "./state";

export function navigate(view: View) {
  if (state.navigationGuardActive) {
    setState("pendingNavigation", view);
    return;
  }
  setState("view", view);
}

export function openEntry(entry: ContentEntry) {
  if (entry.content_type === "app") {
    navigate({ kind: "app-detail", slug: entry.slug });
  } else {
    navigate({ kind: "editor", slug: entry.slug });
  }
}

export function openEntryBySlug(slug: string, contentType: "post" | "app") {
  if (contentType === "app") {
    navigate({ kind: "app-detail", slug });
  } else {
    navigate({ kind: "editor", slug });
  }
}

export function confirmNavigation() {
  const pending = state.pendingNavigation;
  setState("navigationGuardActive", false);
  setState("pendingNavigation", null);
  if (pending) {
    setState("view", pending);
  }
}

export function cancelNavigation() {
  setState("pendingNavigation", null);
}

export function setNavigationGuard(active: boolean) {
  setState("navigationGuardActive", active);
  if (!active) setState("pendingNavigation", null);
}

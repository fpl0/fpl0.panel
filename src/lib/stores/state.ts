import { createMemo } from "solid-js";
import { createStore } from "solid-js/store";
import type { AppConfig, ContentEntry } from "../commands";

export type View =
  | { kind: "list" }
  | { kind: "editor"; slug: string }
  | { kind: "app-detail"; slug: string }
  | { kind: "settings" }
  | { kind: "create" }
  | { kind: "analytics" };

export interface AppState {
  config: AppConfig;
  entries: ContentEntry[];
  view: View;
  theme: "light" | "dark";
  searchOpen: boolean;
  pendingNavigation: View | null;
  navigationGuardActive: boolean;
}

export const [state, setState] = createStore<AppState>({
  config: { repo_path: null, theme: null, cf_account_id: null, cf_project_name: null, cf_api_token: null, cf_domain: null, cf_zone_id: null },
  entries: [],
  view: { kind: "list" },
  theme: "light",
  searchOpen: false,
  pendingNavigation: null,
  navigationGuardActive: false,
});

export const activeEntry = createMemo(() => {
  const v = state.view;
  if (v.kind === "editor" || v.kind === "app-detail") {
    return state.entries.find((e) => e.slug === v.slug) ?? null;
  }
  return null;
});

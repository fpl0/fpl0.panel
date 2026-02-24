import { createMemo } from "solid-js";
import { createStore } from "solid-js/store";
import type { AppConfig, ContentEntry } from "../commands";

export type View =
  | { kind: "list" }
  | { kind: "editor"; slug: string }
  | { kind: "app-detail"; slug: string }
  | { kind: "settings" }
  | { kind: "create" };

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
  config: { repo_path: null, theme: null },
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

import { Match, Show, Switch } from "solid-js";
import { state } from "../lib/store";
import { TopBar } from "../components/Sidebar";
import { ContentListView } from "./ContentListView";
import { EditorView } from "./EditorView";
import { AppDetailView } from "./AppDetailView";
import { SettingsView } from "./SettingsView";
import { CreateView } from "./CreateView";
import { AnalyticsView } from "./AnalyticsView";

export function AppShell() {
  const editorSlug = () => state.view.kind === "editor" ? state.view.slug : null;
  const appDetailSlug = () => state.view.kind === "app-detail" ? state.view.slug : null;

  return (
    <div class="app-layout">
      {/* Show top bar for list/create/settings views (not editor/detail — they have their own bar) */}
      <Switch>
        <Match when={state.view.kind === "list" || state.view.kind === "create" || state.view.kind === "settings" || state.view.kind === "analytics"}>
          <TopBar />
        </Match>
      </Switch>

      <Switch>
        <Match when={state.view.kind === "list"}>
          <main class="main-panel dash-container-parent wide">
            <ContentListView />
          </main>
        </Match>
        <Match when={state.view.kind === "editor"}>
          <Show when={editorSlug()} keyed>
            {(slug) => <EditorView slug={slug} />}
          </Show>
        </Match>
        <Match when={state.view.kind === "app-detail"}>
          <Show when={appDetailSlug()} keyed>
            {(slug) => <AppDetailView slug={slug} />}
          </Show>
        </Match>
        <Match when={state.view.kind === "settings"}>
          <main class="main-panel">
            <SettingsView />
          </main>
        </Match>
        <Match when={state.view.kind === "create"}>
          <main class="main-panel">
            <CreateView />
          </main>
        </Match>
        <Match when={state.view.kind === "analytics"}>
          <main class="main-panel wide">
            <AnalyticsView />
          </main>
        </Match>
      </Switch>
    </div>
  );
}

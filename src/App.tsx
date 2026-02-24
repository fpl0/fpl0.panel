import { onMount, onCleanup, Show } from "solid-js";
import { open } from "@tauri-apps/plugin-dialog";
import { validateRepoPath } from "./lib/commands";
import {
  state,
  initApp,
  navigate,
  updateConfig,
  toggleSearch,
  closeSearch,
  addToast,
} from "./lib/store";
import { OnboardingScreen } from "./views/OnboardingScreen";
import { AppShell } from "./views/AppShell";
import { ToastContainer } from "./components/ToastContainer";
import { SearchModal } from "./components/SearchModal";

export function App() {
  onMount(() => {
    initApp();
  });

  // --- Global keyboard shortcuts ---
  function handleGlobalKeyDown(e: KeyboardEvent) {
    const mod = e.metaKey || e.ctrlKey;

    // Cmd+K — toggle search modal
    if (mod && e.key === "k") {
      e.preventDefault();
      toggleSearch();
      return;
    }

    // Cmd+N — new content
    if (mod && e.key === "n") {
      e.preventDefault();
      navigate({ kind: "create" });
      return;
    }

    // Cmd+, — settings
    if (mod && e.key === ",") {
      e.preventDefault();
      navigate({ kind: "settings" });
      return;
    }

    // Cmd+L — back to content list
    if (mod && e.key === "l") {
      e.preventDefault();
      closeSearch();
      navigate({ kind: "list" });
      return;
    }

    // Escape — close search modal
    if (e.key === "Escape") {
      if (state.searchOpen) {
        return;
      }
    }
  }

  onMount(() => document.addEventListener("keydown", handleGlobalKeyDown));
  onCleanup(() => document.removeEventListener("keydown", handleGlobalKeyDown));

  async function handleSelectRepo() {
    const selected = await open({ directory: true, multiple: false });
    if (!selected) return;
    const path = selected as string;

    const valid = await validateRepoPath(path);
    if (!valid) {
      addToast("Invalid repo: missing src/content/blog/, src/content/apps/, or package.json", "error");
      return;
    }

    await updateConfig({ repo_path: path });
    addToast("Repository connected");
  }

  return (
    <>
      <Show when={state.config.repo_path} fallback={<OnboardingScreen onSelectRepo={handleSelectRepo} />}>
        <AppShell />
      </Show>
      <Show when={state.searchOpen}>
        <SearchModal />
      </Show>
      <ToastContainer />
    </>
  );
}

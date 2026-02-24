import { open } from "@tauri-apps/plugin-dialog";
import { validateRepoPath } from "../lib/commands";
import { state, updateConfig, addToast } from "../lib/store";

export function SettingsView() {
  async function changeRepo() {
    const selected = await open({ directory: true, multiple: false });
    if (!selected) return;
    const path = selected as string;

    const valid = await validateRepoPath(path);
    if (!valid) {
      addToast("Invalid repo path", "error");
      return;
    }

    await updateConfig({ repo_path: path });
    addToast("Repository updated");
  }

  return (
    <div class="settings-view">
      <h1>Settings</h1>

      <div class="settings-section">
        <h2>Repository</h2>
        <div class="settings-row">
          <span class="settings-label">Blog repository path</span>
          <span class="settings-value">{state.config.repo_path ?? "Not set"}</span>
        </div>
        <div class="settings-action">
          <button class="btn" onClick={changeRepo}>
            Change Repository
          </button>
        </div>
      </div>

      <div class="settings-section">
        <h2>Appearance</h2>
        <div class="settings-row">
          <span class="settings-label">Theme</span>
          <span class="settings-value">{state.theme}</span>
        </div>
        <p class="settings-hint">
          Use the moon/sun icon in the top bar to toggle theme.
        </p>
      </div>
    </div>
  );
}

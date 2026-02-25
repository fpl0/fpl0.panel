import { createSignal } from "solid-js";
import { open } from "@tauri-apps/plugin-dialog";
import { validateRepoPath, testCfConnection } from "../lib/commands";
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

  // --- Cloudflare config ---
  const [cfAccountId, setCfAccountId] = createSignal(state.config.cf_account_id ?? "");
  const [cfProjectName, setCfProjectName] = createSignal(state.config.cf_project_name ?? "");
  const [cfDomain, setCfDomain] = createSignal(state.config.cf_domain ?? "");
  const [cfApiToken, setCfApiToken] = createSignal(state.config.cf_api_token ?? "");
  const [cfTesting, setCfTesting] = createSignal(false);

  async function saveCfConfig() {
    await updateConfig({
      cf_account_id: cfAccountId() || null,
      cf_project_name: cfProjectName() || null,
      cf_domain: cfDomain() || null,
      cf_api_token: cfApiToken() || null,
      cf_zone_id: null, // Reset cached zone_id so it re-discovers
    });
    addToast("Cloudflare settings saved");
  }

  async function testConnection() {
    setCfTesting(true);
    // Save first so the backend has current credentials
    await saveCfConfig();
    try {
      const msg = await testCfConnection();
      addToast(msg);
    } catch (e) {
      addToast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setCfTesting(false);
    }
  }

  return (
    <div class="settings-view">
      <h1>Settings</h1>

      <div class="settings-top-grid">
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

      <div class="settings-section settings-section-cloudflare">
        <h2>Cloudflare Pages</h2>
        <p class="settings-hint">
          Connect to Cloudflare to show deployment status and traffic analytics.
          Requires an API token with Pages:Read and Analytics:Read permissions.
        </p>

        <div class="settings-cf-fields">
          <div class="settings-field">
            <label class="settings-label" for="cf-account-id">Account ID</label>
            <input
              id="cf-account-id"
              class="settings-input"
              type="text"
              value={cfAccountId()}
              onInput={(e) => setCfAccountId(e.currentTarget.value)}
              placeholder="e.g. 1a2b3c..."
            />
          </div>

          <div class="settings-field">
            <label class="settings-label" for="cf-project-name">Project Name</label>
            <input
              id="cf-project-name"
              class="settings-input"
              type="text"
              value={cfProjectName()}
              onInput={(e) => setCfProjectName(e.currentTarget.value)}
              placeholder="e.g. fpl0-blog"
            />
          </div>

          <div class="settings-field">
            <label class="settings-label" for="cf-domain">Domain</label>
            <input
              id="cf-domain"
              class="settings-input"
              type="text"
              value={cfDomain()}
              onInput={(e) => setCfDomain(e.currentTarget.value)}
              placeholder="e.g. fpl0.io"
            />
          </div>

          <div class="settings-field">
            <label class="settings-label" for="cf-api-token">API Token</label>
            <input
              id="cf-api-token"
              class="settings-input"
              type="password"
              value={cfApiToken()}
              onInput={(e) => setCfApiToken(e.currentTarget.value)}
              placeholder="Cloudflare API token"
            />
          </div>
        </div>

        <div class="settings-action settings-cf-actions">
          <button class="btn" onClick={testConnection} disabled={cfTesting()}>
            {cfTesting() ? "Testing..." : "Test Connection"}
          </button>
          <button class="btn" onClick={saveCfConfig}>
            Save
          </button>
        </div>
      </div>

      <div class="settings-section settings-section-shortcuts">
        <h2>Keyboard Shortcuts</h2>

        <div class="settings-shortcuts-grid">
          <div class="settings-shortcut-group">
            <h3 class="settings-shortcut-heading">Global</h3>
            <div class="settings-shortcut-table">
              <div class="settings-shortcut-row">
                <kbd class="settings-kbd">⌘K</kbd>
                <span>Search</span>
              </div>
              <div class="settings-shortcut-row">
                <kbd class="settings-kbd">⌘N</kbd>
                <span>New content</span>
              </div>
              <div class="settings-shortcut-row">
                <kbd class="settings-kbd">⌘L</kbd>
                <span>Content list</span>
              </div>
              <div class="settings-shortcut-row">
                <kbd class="settings-kbd">⌘,</kbd>
                <span>Settings</span>
              </div>
              <div class="settings-shortcut-row">
                <kbd class="settings-kbd">⌘/</kbd>
                <span>Shortcuts reference</span>
              </div>
            </div>
          </div>

          <div class="settings-shortcut-group">
            <h3 class="settings-shortcut-heading">Editor</h3>
            <div class="settings-shortcut-table">
              <div class="settings-shortcut-row">
                <kbd class="settings-kbd">⌘S</kbd>
                <span>Save</span>
              </div>
              <div class="settings-shortcut-row">
                <kbd class="settings-kbd">⌘⇧P</kbd>
                <span>Publish</span>
              </div>
              <div class="settings-shortcut-row">
                <kbd class="settings-kbd">/</kbd>
                <span>Slash commands</span>
              </div>
              <div class="settings-shortcut-row">
                <kbd class="settings-kbd">⌘B</kbd>
                <span>Bold</span>
              </div>
              <div class="settings-shortcut-row">
                <kbd class="settings-kbd">⌘I</kbd>
                <span>Italic</span>
              </div>
              <div class="settings-shortcut-row">
                <kbd class="settings-kbd">⌘E</kbd>
                <span>Inline code</span>
              </div>
              <div class="settings-shortcut-row">
                <kbd class="settings-kbd">⌘K</kbd>
                <span>Link</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

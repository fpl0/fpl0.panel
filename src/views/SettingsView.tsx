import { createSignal, Switch, Match } from "solid-js";
import { open } from "@tauri-apps/plugin-dialog";
import { validateRepoPath, testCfConnection } from "../lib/commands";
import { state, updateConfig, addToast } from "../lib/store";

type SettingsSection = "project" | "cloudflare" | "shortcuts";

export function SettingsView() {
  const [activeSection, setActiveSection] = createSignal<SettingsSection>("project");

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
    <div class="settings-layout">
      <aside class="settings-sidebar">
        <h1 class="settings-title">Settings</h1>
        <nav class="settings-nav">
          <button
            class={`settings-nav-item ${activeSection() === "project" ? "is-active" : ""}`}
            onClick={() => setActiveSection("project")}
          >
            Project
          </button>
          <button
            class={`settings-nav-item ${activeSection() === "cloudflare" ? "is-active" : ""}`}
            onClick={() => setActiveSection("cloudflare")}
          >
            Cloudflare
          </button>
          <button
            class={`settings-nav-item ${activeSection() === "shortcuts" ? "is-active" : ""}`}
            onClick={() => setActiveSection("shortcuts")}
          >
            Shortcuts
          </button>
        </nav>
      </aside>

      <main class="settings-content">
        <Switch>
          <Match when={activeSection() === "project"}>
            <section class="settings-section">
              <header class="settings-section-header">
                <h2>Project Configuration</h2>
                <p class="settings-description">
                  Configure your blog repository and local environment settings.
                </p>
              </header>

              <div class="settings-group">
                <div class="settings-row">
                  <div class="settings-info">
                    <label class="settings-label">Content Directory</label>
                    <p class="settings-hint">
                      The local directory containing your MDX files and assets.
                    </p>
                  </div>
                  <div class="settings-value-with-action">
                    <span class="settings-path-value">{state.config.repo_path ?? "Not configured"}</span>
                    <button class="btn" onClick={changeRepo}>
                      Change Directory
                    </button>
                  </div>
                </div>
              </div>
            </section>
          </Match>

          <Match when={activeSection() === "cloudflare"}>
            <section class="settings-section">
              <header class="settings-section-header">
                <h2>Cloudflare</h2>
                <p class="settings-description">
                  Connect your Cloudflare account to view site traffic analytics and performance data directly in the panel.
                </p>
              </header>

              <div class="settings-group">
                <div class="settings-cf-grid">
                  <div class="settings-field">
                    <label class="settings-label" for="cf-account-id">Account ID</label>
                    <input
                      id="cf-account-id"
                      class="settings-input"
                      type="text"
                      value={cfAccountId()}
                      onInput={(e) => setCfAccountId(e.currentTarget.value)}
                      placeholder="Cloudflare Account ID"
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
                    <label class="settings-label" for="cf-domain">Site Domain</label>
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
                      placeholder="Pages:Read & Analytics:Read required"
                    />
                  </div>
                </div>

                <div class="settings-cf-actions">
                  <button class="btn" onClick={testConnection} disabled={cfTesting()}>
                    {cfTesting() ? "Testing Connection..." : "Test Connection"}
                  </button>
                  <button class="btn btn-primary" onClick={saveCfConfig}>
                    Save Changes
                  </button>
                </div>
              </div>
            </section>
          </Match>

          <Match when={activeSection() === "shortcuts"}>
            <section class="settings-section">
              <header class="settings-section-header">
                <h2>Shortcuts Reference</h2>
                <p class="settings-description">
                  Master the panel with keyboard shortcuts designed for editorial speed.
                </p>
              </header>

              <div class="settings-shortcuts-layout">
                <div class="settings-shortcut-category">
                  <h3>Navigation</h3>
                  <div class="settings-shortcut-list">
                    <div class="settings-shortcut-item">
                      <span class="shortcut-desc">Open Search</span>
                      <kbd class="settings-kbd">⌘K</kbd>
                    </div>
                    <div class="settings-shortcut-item">
                      <span class="shortcut-desc">Create New Content</span>
                      <kbd class="settings-kbd">⌘N</kbd>
                    </div>
                    <div class="settings-shortcut-item">
                      <span class="shortcut-desc">Content Library</span>
                      <kbd class="settings-kbd">⌘L</kbd>
                    </div>
                    <div class="settings-shortcut-item">
                      <span class="shortcut-desc">Open Settings</span>
                      <kbd class="settings-kbd">⌘,</kbd>
                    </div>
                  </div>
                </div>

                <div class="settings-shortcut-category">
                  <h3>Editorial</h3>
                  <div class="settings-shortcut-list">
                    <div class="settings-shortcut-item">
                      <span class="shortcut-desc">Save Draft</span>
                      <kbd class="settings-kbd">⌘S</kbd>
                    </div>
                    <div class="settings-shortcut-item">
                      <span class="shortcut-desc">Publish Changes</span>
                      <kbd class="settings-kbd">⌘⇧P</kbd>
                    </div>
                    <div class="settings-shortcut-item">
                      <span class="shortcut-desc">Format Bold</span>
                      <kbd class="settings-kbd">⌘B</kbd>
                    </div>
                    <div class="settings-shortcut-item">
                      <span class="shortcut-desc">Format Italic</span>
                      <kbd class="settings-kbd">⌘I</kbd>
                    </div>
                    <div class="settings-shortcut-item">
                      <span class="shortcut-desc">Slash Commands</span>
                      <kbd class="settings-kbd">/</kbd>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </Match>
        </Switch>
      </main>
    </div>
  );
}

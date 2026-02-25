/**
 * ContentListView — Dashboard Home
 * KPI strip, health/deployment status bar, recently published + WIP columns.
 */
import { createSignal, createMemo, For, Show, onMount, onCleanup } from "solid-js";
import { state, openEntry, navigate } from "../lib/store";
import { checkUrlHealth, DEV_SERVER_ORIGIN } from "../lib/commands";
import type { HealthStatus, CfDeploymentInfo } from "../lib/commands";
import { getCachedDeployment, refreshDeployment, getCachedAnalytics } from "../lib/stores/cfcache";

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return dateStr;
  }
}

export function ContentListView() {
  const [devHealth, setDevHealth] = createSignal<HealthStatus | null>(null);
  const [prodHealth, setProdHealth] = createSignal<HealthStatus | null>(null);

  // --- Health polling ---
  async function pollHealth() {
    checkUrlHealth(DEV_SERVER_ORIGIN).then(setDevHealth).catch(() => {});
    checkUrlHealth("https://fpl0.io").then(setProdHealth).catch(() => {});
  }

  let healthInterval: ReturnType<typeof setInterval>;
  onMount(() => {
    pollHealth();
    healthInterval = setInterval(pollHealth, 300_000);
  });
  onCleanup(() => clearInterval(healthInterval));

  // --- Cloudflare deployment polling ---
  const cfConfigured = () =>
    !!(state.config.cf_account_id && state.config.cf_project_name && state.config.cf_api_token);

  const [deployment, setDeployment] = createSignal<CfDeploymentInfo | null>(null);
  const [weeklyTraffic, setWeeklyTraffic] = createSignal<number | null>(null);

  let deployInterval: ReturnType<typeof setInterval>;
  onMount(() => {
    if (!cfConfigured()) return;
    getCachedDeployment(setDeployment);
    getCachedAnalytics(7, true, (a) => setWeeklyTraffic(a.total_requests));
    deployInterval = setInterval(() => {
      refreshDeployment().then((d) => { if (d) setDeployment(d); });
    }, 60_000);
  });
  onCleanup(() => clearInterval(deployInterval));

  // --- Stats ---
  const totalCount = createMemo(() => state.entries.length);
  const publishedCount = createMemo(() => state.entries.filter((e) => !e.is_draft).length);
  const draftCount = createMemo(() => state.entries.filter((e) => e.is_draft).length);

  // --- Recently Published (top 3, by publication_date desc) ---
  const recentPublished = createMemo(() => {
    return state.entries
      .filter((e) => !e.is_draft && e.publication_date)
      .sort((a, b) => (b.publication_date ?? "").localeCompare(a.publication_date ?? ""))
      .slice(0, 3);
  });

  // --- Work in Progress (top 3 drafts, by modified_date desc) ---
  const recentDrafts = createMemo(() => {
    return state.entries
      .filter((e) => e.is_draft && e.modified_date)
      .sort((a, b) => (b.modified_date ?? "").localeCompare(a.modified_date ?? ""))
      .slice(0, 3);
  });

  return (
    <div class="mc">
      {/* ── KPI Strip ── */}
      <Show when={state.entries.length > 0}>
        <div class="mc-kpi-strip">
          <div class="mc-kpi">
            <span class="mc-kpi-value">{totalCount()}</span>
            <span class="mc-kpi-label">entries</span>
          </div>
          <span class="mc-kpi-sep">&middot;</span>
          <div class="mc-kpi">
            <span class="mc-kpi-value">{publishedCount()}</span>
            <span class="mc-kpi-label">published</span>
          </div>
          <span class="mc-kpi-sep">&middot;</span>
          <div class="mc-kpi">
            <span class="mc-kpi-value">{draftCount()}</span>
            <span class="mc-kpi-label">drafts</span>
          </div>
          <Show when={cfConfigured() && weeklyTraffic() !== null}>
            <span class="mc-kpi-sep">&middot;</span>
            <div class="mc-kpi">
              <span class="mc-kpi-value">{weeklyTraffic()!.toLocaleString()}</span>
              <span class="mc-kpi-label">7d views</span>
            </div>
          </Show>
        </div>
      </Show>

      {/* ── Status Bar ── */}
      <div class="mc-status-bar">
        <div class="mc-status-group">
          <span class={`mc-status-dot ${devHealth()?.ok ? "up" : "down"}`} />
          <a class="mc-status-link" href={DEV_SERVER_ORIGIN} target="_blank" rel="noopener noreferrer">dev</a>
          <span class={`mc-status-dot ${prodHealth()?.ok ? "up" : "down"}`} />
          <a class="mc-status-link" href="https://fpl0.io" target="_blank" rel="noopener noreferrer">fpl0.io</a>
        </div>
        <Show when={cfConfigured()}>
          <Show when={deployment()}>
            {(dep) => (
              <div class="mc-status-group">
                <span class="mc-status-sep">|</span>
                <span class={`mc-status-dot ${dep().status === "success" ? "up" : "down"}`} />
                <Show when={dep().commit_message}>
                  <span class="mc-status-commit" title={dep().commit_message!}>
                    "{dep().commit_message!.length > 32
                      ? dep().commit_message!.slice(0, 32) + "..."
                      : dep().commit_message}"
                  </span>
                </Show>
                <span class="mc-status-time">{relativeTime(dep().deployed_at)}</span>
              </div>
            )}
          </Show>
        </Show>
      </div>

      {/* ── Two-Column Sections ── */}
      <div class="mc-columns">
        {/* Recently Published */}
        <div class="mc-section">
          <div class="mc-section-header">
            <span class="mc-section-label">Recently published</span>
          </div>
          <Show
            when={recentPublished().length > 0}
            fallback={<p class="mc-section-empty">No published entries yet.</p>}
          >
            <ul class="post-list">
              <For each={recentPublished()}>
                {(entry) => (
                  <li class="post-item">
                    <div class="post-date-col">
                      <span class="post-status-dot published" />
                      <span class="post-date">
                        {entry.publication_date ? formatDate(entry.publication_date) : "—"}
                      </span>
                    </div>
                    <div class="post-content">
                      <span class="post-title" onClick={() => openEntry(entry)}>{entry.title}</span>
                      <Show when={entry.summary}>
                        <p class="post-summary">{entry.summary}</p>
                      </Show>
                    </div>
                  </li>
                )}
              </For>
            </ul>
          </Show>
          <button class="mc-view-all" onClick={() => navigate({ kind: "library" })}>
            All published &rarr;
          </button>
        </div>

        {/* Work in Progress */}
        <div class="mc-section">
          <div class="mc-section-header">
            <span class="mc-section-label">Work in progress</span>
          </div>
          <Show
            when={recentDrafts().length > 0}
            fallback={<p class="mc-section-empty">No drafts in progress.</p>}
          >
            <ul class="post-list compact">
              <For each={recentDrafts()}>
                {(entry) => (
                  <li class="post-item">
                    <div class="post-date-col">
                      <span class="post-status-dot draft" />
                      <span class="post-date">
                        {entry.modified_date ? relativeTime(entry.modified_date) : "—"}
                      </span>
                    </div>
                    <div class="post-content">
                      <span class="post-title" onClick={() => openEntry(entry)}>{entry.title}</span>
                      <Show when={entry.summary}>
                        <p class="post-summary">{entry.summary}</p>
                      </Show>
                    </div>
                  </li>
                )}
              </For>
            </ul>
          </Show>
          <button class="mc-view-all" onClick={() => navigate({ kind: "library" })}>
            All drafts &rarr;
          </button>
        </div>
      </div>
    </div>
  );
}

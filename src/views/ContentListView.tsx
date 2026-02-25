/**
 * ContentListView — Dashboard Home
 * KPI strip, status bar, 12-week activity timeline, recently published + WIP,
 * and quick actions. Designed to answer: "What's the state of my site?",
 * "Am I shipping consistently?", and "What should I do next?"
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

/** Per-week activity breakdown: created, published, and edited counts. */
interface WeekActivity {
  created: number;
  published: number;
  edited: number;
}

function weeklyActivity(entries: typeof state.entries, weeks: number): WeekActivity[] {
  const now = Date.now();
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const data: WeekActivity[] = Array.from({ length: weeks }, () => ({ created: 0, published: 0, edited: 0 }));

  for (const e of entries) {
    // Created
    const createdTime = new Date(e.created_date).getTime();
    const createdWeek = Math.floor((now - createdTime) / msPerWeek);
    if (createdWeek >= 0 && createdWeek < weeks) {
      data[weeks - 1 - createdWeek].created++;
    }

    // Published
    if (!e.is_draft && e.publication_date) {
      const pubTime = new Date(e.publication_date).getTime();
      const pubWeek = Math.floor((now - pubTime) / msPerWeek);
      if (pubWeek >= 0 && pubWeek < weeks) {
        data[weeks - 1 - pubWeek].published++;
      }
    }

    // Edited (modified_date, excluding the creation week to avoid double-counting)
    if (e.modified_date) {
      const modTime = new Date(e.modified_date).getTime();
      const modWeek = Math.floor((now - modTime) / msPerWeek);
      if (modWeek >= 0 && modWeek < weeks && modWeek !== createdWeek) {
        data[weeks - 1 - modWeek].edited++;
      }
    }
  }

  return data;
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
  const changedCount = createMemo(() => state.entries.filter((e) => !e.is_draft && e.has_changed).length);

  // --- 12-week activity timeline ---
  const activity = createMemo(() => weeklyActivity(state.entries, 12));

  // --- Top tags ---
  const topTags = createMemo(() => {
    const counts = new Map<string, number>();
    for (const e of state.entries) {
      for (const t of e.tags) {
        counts.set(t, (counts.get(t) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  });

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

  // --- Continue working target (most recent draft) ---
  const continueDraft = createMemo(() => recentDrafts()[0] ?? null);

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
          <Show when={changedCount() > 0}>
            <span class="mc-kpi-sep">&middot;</span>
            <div class="mc-kpi">
              <span class="mc-kpi-value mc-kpi-value--warn">{changedCount()}</span>
              <span class="mc-kpi-label">modified</span>
            </div>
          </Show>
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
          <a class="mc-status-link" href={DEV_SERVER_ORIGIN} target="_blank" rel="noopener noreferrer">dev server</a>
          <span class="mc-status-label">{devHealth()?.ok ? "up" : "down"}</span>
        </div>
        <div class="mc-status-group">
          <span class={`mc-status-dot ${prodHealth()?.ok ? "up" : "down"}`} />
          <a class="mc-status-link" href="https://fpl0.io" target="_blank" rel="noopener noreferrer">fpl0.io</a>
          <span class="mc-status-label">{prodHealth()?.ok ? "reachable" : "unreachable"}</span>
        </div>
        <Show when={cfConfigured()}>
          <Show when={deployment()}>
            {(dep) => (
              <div class="mc-status-group">
                <span class="mc-status-sep">|</span>
                <span class={`mc-status-dot ${dep().status === "success" ? "up" : "down"}`} />
                <span class="mc-status-label">deploy</span>
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

      {/* ── Activity Dot Grid (12 weeks × 3 types) ── */}
      <Show when={state.entries.length > 0}>
        <div class="mc-activity">
          <span class="mc-section-label">Activity</span>
          <div class="mc-dot-grid">
            <For each={(["created", "published", "edited"] as const)}>
              {(type) => (
                <>
                  <span class={`mc-dot-label ${type}`}>{type}</span>
                  <For each={activity()}>
                    {(week) => {
                      const count = week[type];
                      const size = count === 0 ? 3 : Math.min(4 + count * 3, 14);
                      return (
                        <div class="mc-dot-cell" title={`${count} ${type}`}>
                          <span
                            class={`mc-dot ${type} ${count > 0 ? "active" : ""}`}
                            style={{ width: `${size}px`, height: `${size}px` }}
                          />
                        </div>
                      );
                    }}
                  </For>
                </>
              )}
            </For>
          </div>
        </div>
      </Show>

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
            <ul class="post-list">
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

      {/* ── Bottom Row: Top Tags + Quick Actions ── */}
      <div class="mc-bottom">
        <Show when={topTags().length > 0}>
          <div class="mc-tags-section">
            <span class="mc-section-label">Top tags</span>
            <div class="mc-tags">
              <For each={topTags()}>
                {([tag, count]) => (
                  <span class="mc-tag">
                    {tag}<span class="mc-tag-count">{count}</span>
                  </span>
                )}
              </For>
            </div>
          </div>
        </Show>
        <div class="mc-actions-section">
          <span class="mc-section-label">Quick actions</span>
          <div class="mc-actions">
            <button class="mc-action" onClick={() => navigate({ kind: "create" })}>
              + New post
            </button>
            <Show when={continueDraft()}>
              {(draft) => (
                <button class="mc-action" onClick={() => openEntry(draft())}>
                  Continue: <span class="mc-action-title">{draft().title.length > 24 ? draft().title.slice(0, 24) + "..." : draft().title}</span>
                </button>
              )}
            </Show>
          </div>
        </div>
      </div>
    </div>
  );
}

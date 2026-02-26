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

// --- Global health cache: survives component remounts ---
const HEALTH_TTL = 300_000; // 5 minutes
let lastHealthPoll = 0;
let cachedDevHealth: HealthStatus | null = null;
let cachedProdHealth: HealthStatus | null = null;

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

/** Per-day activity cell. */
interface DayCell {
  total: number;
  published: boolean;
  edited: boolean;
  date: string; // ISO YYYY-MM-DD
  month: number; // 0-based month index
}

const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const CELL_PX = 18; // target px per cell (cell width + gap)

function dailyHeat(entries: typeof state.entries, count: number): DayCell[] {
  const now = Date.now();
  const msPerDay = 24 * 60 * 60 * 1000;
  const cells: DayCell[] = [];

  for (let i = 0; i < count; i++) {
    const offset = count - 1 - i;
    const d = new Date(now - offset * msPerDay);
    cells.push({ total: 0, published: false, edited: false, date: d.toISOString().slice(0, 10), month: d.getMonth() });
  }

  for (const e of entries) {
    const created = new Date(e.created_date).getTime();
    const cDay = Math.floor((now - created) / msPerDay);
    if (cDay >= 0 && cDay < count) cells[count - 1 - cDay].total++;

    if (!e.is_draft && e.publication_date) {
      const pub = new Date(e.publication_date).getTime();
      const pDay = Math.floor((now - pub) / msPerDay);
      if (pDay >= 0 && pDay < count) {
        cells[count - 1 - pDay].total++;
        cells[count - 1 - pDay].published = true;
      }
    }

    if (e.modified_date) {
      const mod = new Date(e.modified_date).getTime();
      const mDay = Math.floor((now - mod) / msPerDay);
      const createdDay = Math.floor((now - created) / msPerDay);
      if (mDay >= 0 && mDay < count && mDay !== createdDay) {
        cells[count - 1 - mDay].total++;
        cells[count - 1 - mDay].edited = true;
      }
    }
  }

  return cells;
}

export function ContentListView() {
  const [devHealth, setDevHealth] = createSignal<HealthStatus | null>(cachedDevHealth);
  const [prodHealth, setProdHealth] = createSignal<HealthStatus | null>(cachedProdHealth);

  // --- Health polling (throttled to 5-min TTL) ---
  async function pollHealth() {
    lastHealthPoll = Date.now();
    checkUrlHealth(DEV_SERVER_ORIGIN).then((h) => { cachedDevHealth = h; setDevHealth(h); }).catch(() => {});
    checkUrlHealth("https://fpl0.io").then((h) => { cachedProdHealth = h; setProdHealth(h); }).catch(() => {});
  }

  let healthInterval: ReturnType<typeof setInterval>;
  onMount(() => {
    const stale = Date.now() - lastHealthPoll >= HEALTH_TTL;
    if (stale) pollHealth();
    healthInterval = setInterval(pollHealth, HEALTH_TTL);
  });
  onCleanup(() => clearInterval(healthInterval));

  // --- Cloudflare deployment polling ---
  const cfConfigured = () =>
    !!(state.config.cf_account_id && state.config.cf_project_name && state.config.cf_api_token);

  const [deployment, setDeployment] = createSignal<CfDeploymentInfo | null>(null);
  const [dailyTraffic, setDailyTraffic] = createSignal<number | null>(null);

  let deployInterval: ReturnType<typeof setInterval>;
  onMount(() => {
    if (!cfConfigured()) return;
    getCachedDeployment(setDeployment);
    getCachedAnalytics(1, true, (a) => setDailyTraffic(a.total_requests));
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

  // --- Daily activity strip (auto-sized to fill width) ---
  const [dayCount, setDayCount] = createSignal(0);
  const days = createMemo(() => dayCount() > 0 ? dailyHeat(state.entries, dayCount()) : []);

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
          <Show when={cfConfigured() && dailyTraffic() !== null}>
            <span class="mc-kpi-sep">&middot;</span>
            <div class="mc-kpi">
              <span class="mc-kpi-value">{dailyTraffic()!.toLocaleString()}</span>
              <span class="mc-kpi-label">24h views</span>
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

      {/* ── Activity Strip (1 cell per day, auto-fills width) ── */}
      <Show when={state.entries.length > 0}>
        <div
          class="mc-activity"
          ref={(el) => {
            requestAnimationFrame(() => {
              setDayCount(Math.max(Math.floor(el.clientWidth / CELL_PX), 14));
            });
          }}
        >
          <Show when={dayCount() > 0}>
            {(() => {
              // Center each month label within its span of cells
              const labelAt = createMemo(() => {
                const cells = days();
                const map = new Map<number, string>();
                let start = 0;
                let cur = cells[0]?.month ?? -1;
                for (let i = 0; i <= cells.length; i++) {
                  const m = i < cells.length ? cells[i].month : -2;
                  if (m !== cur) {
                    map.set(Math.floor((start + i - 1) / 2), MONTHS_SHORT[cur]);
                    start = i;
                    cur = m;
                  }
                }
                return map;
              });
              return (
                <>
                  <span class="mc-section-label">Activity · {dayCount()} days</span>
                  <div class="mc-heat-strip" style={{ "grid-template-columns": `repeat(${dayCount()}, 1fr)` }}>
                    <For each={days()}>
                      {(day, i) => {
                        const parts: string[] = [];
                        if (day.published) parts.push("published");
                        if (day.edited) parts.push("edited");
                        if (day.total > 0 && !day.published && !day.edited) parts.push("created");
                        const tip = `${formatDate(day.date)}: ${parts.length ? parts.join(" + ") : "—"}`;
                        const cls = day.published && day.edited
                          ? "has-split"
                          : day.published ? "has-published"
                          : day.total > 0 ? "has-activity" : "";
                        return (
                          <div class="mc-heat-col">
                            <div class={`mc-heat-cell ${cls}`} title={tip} />
                            <span class="mc-heat-month">{labelAt().get(i()) ?? ""}</span>
                          </div>
                        );
                      }}
                    </For>
                  </div>
                </>
              );
            })()}
          </Show>
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
                      <span
                        class="post-title"
                        tabIndex={0}
                        role="button"
                        onClick={() => openEntry(entry)}
                        onKeyDown={(e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openEntry(entry); } }}
                      >{entry.title}</span>
                      <Show when={entry.summary}>
                        <p class="post-summary">{entry.summary}</p>
                      </Show>
                    </div>
                  </li>
                )}
              </For>
            </ul>
          </Show>
          <button class="mc-view-all" onClick={() => navigate({ kind: "library", status: "published" })}>
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
                      <span
                        class="post-title"
                        tabIndex={0}
                        role="button"
                        onClick={() => openEntry(entry)}
                        onKeyDown={(e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openEntry(entry); } }}
                      >{entry.title}</span>
                      <Show when={entry.summary}>
                        <p class="post-summary">{entry.summary}</p>
                      </Show>
                    </div>
                  </li>
                )}
              </For>
            </ul>
          </Show>
          <button class="mc-view-all" onClick={() => navigate({ kind: "library", status: "draft" })}>
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
                  <button class="mc-tag" onClick={() => navigate({ kind: "library", tag })}>
                    {tag}<span class="mc-tag-count">{count}</span>
                  </button>
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

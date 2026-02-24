/**
 * ContentListView — Dashboard Home
 * Stats strip, health indicators, "Continue Working" section,
 * then the full filterable ledger list.
 */
import { createSignal, createMemo, For, Show, onMount, onCleanup } from "solid-js";
import { state, openEntry } from "../lib/store";
import { checkUrlHealth } from "../lib/commands";
import type { HealthStatus } from "../lib/commands";

type TypeFilter = "all" | "post" | "app";
type StatusFilter = "all" | "draft" | "published";
type SortBy = "created" | "modified";

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

export function ContentListView() {
  const [typeFilter, setTypeFilter] = createSignal<TypeFilter>("all");
  const [statusFilter, setStatusFilter] = createSignal<StatusFilter>("all");
  const [sortBy, setSortBy] = createSignal<SortBy>("created");
  const [devHealth, setDevHealth] = createSignal<HealthStatus | null>(null);
  const [prodHealth, setProdHealth] = createSignal<HealthStatus | null>(null);

  // --- Health polling ---
  async function pollHealth() {
    checkUrlHealth("http://localhost:4321").then(setDevHealth).catch(() => {});
    checkUrlHealth("https://fpl0.io").then(setProdHealth).catch(() => {});
  }

  let healthInterval: ReturnType<typeof setInterval>;
  onMount(() => {
    pollHealth();
    healthInterval = setInterval(pollHealth, 30_000);
  });
  onCleanup(() => clearInterval(healthInterval));

  // --- Stats ---
  const totalCount = createMemo(() => state.entries.length);
  const publishedCount = createMemo(() => state.entries.filter((e) => !e.is_draft).length);
  const draftCount = createMemo(() => state.entries.filter((e) => e.is_draft).length);

  const lastPublished = createMemo(() => {
    const published = state.entries
      .filter((e) => !e.is_draft && e.publication_date)
      .sort((a, b) => (b.publication_date ?? "").localeCompare(a.publication_date ?? ""));
    if (published.length === 0) return null;
    try {
      const d = new Date(published[0].publication_date!);
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    } catch {
      return published[0].publication_date;
    }
  });

  // --- Continue Working (recent drafts) ---
  const recentDrafts = createMemo(() => {
    return state.entries
      .filter((e) => e.is_draft && e.modified_date)
      .sort((a, b) => (b.modified_date ?? "").localeCompare(a.modified_date ?? ""))
      .slice(0, 5);
  });

  // --- Filtered list ---
  const filtered = createMemo(() => {
    let items = state.entries;
    const tf = typeFilter();
    if (tf !== "all") {
      items = items.filter((e) => e.content_type === tf);
    }
    const sf = statusFilter();
    if (sf === "draft") {
      items = items.filter((e) => e.is_draft);
    } else if (sf === "published") {
      items = items.filter((e) => !e.is_draft);
    }
    const sort = sortBy();
    items = [...items].sort((a, b) => {
      const dateA = sort === "modified" ? (a.modified_date ?? a.created_date) : a.created_date;
      const dateB = sort === "modified" ? (b.modified_date ?? b.created_date) : b.created_date;
      return dateB.localeCompare(dateA);
    });
    return items;
  });

  // --- Filter counts (single pass over entries) ---
  const filterCounts = createMemo(() => {
    const sf = statusFilter();
    const tf = typeFilter();
    let typeAll = 0, typePost = 0, typeApp = 0;
    let statusAll = 0, statusDraft = 0, statusPublished = 0;

    for (const e of state.entries) {
      const isPost = e.content_type === "post";
      const isApp = e.content_type === "app";
      const isDraft = e.is_draft;
      const matchesStatus = sf === "all" || (sf === "draft" ? isDraft : !isDraft);
      const matchesType = tf === "all" || e.content_type === tf;

      // Type counts (filtered by current status)
      if (matchesStatus) {
        typeAll++;
        if (isPost) typePost++;
        if (isApp) typeApp++;
      }
      // Status counts (filtered by current type)
      if (matchesType) {
        statusAll++;
        if (isDraft) statusDraft++;
        else statusPublished++;
      }
    }

    return { typeAll, typePost, typeApp, statusAll, statusDraft, statusPublished };
  });

  function formatDate(dateStr: string): string {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    } catch {
      return dateStr;
    }
  }

  return (
    <div class="dash-container">
      {/* ── Dashboard Sidebar (Stats & Health) ── */}
      <aside class="dash-sidebar">
        <Show when={state.entries.length > 0}>
          <div class="dash-sidebar-section">
            <div class="dash-sidebar-label">Overview</div>
            <div class="dash-stats-vertical">
              <div class="dash-stat">
                <span class="dash-stat-label">Entries</span>
                <span class="dash-stat-value">{totalCount()}</span>
              </div>
              <div class="dash-stat">
                <span class="dash-stat-label">Published</span>
                <span class="dash-stat-value">{publishedCount()}</span>
              </div>
              <div class="dash-stat">
                <span class="dash-stat-label">Drafts</span>
                <span class="dash-stat-value">{draftCount()}</span>
              </div>
            </div>
          </div>

          <div class="dash-sidebar-section">
            <div class="dash-sidebar-label">Health</div>
            <div class="dash-health-list">
              <div class="dash-health-item">
                <span class={`dash-health-dot ${devHealth()?.ok ? "up" : "down"}`} title={devHealth()?.ok ? "Server is up" : "Server is down"} />
                <a class="dash-health-link" href="http://localhost:4321" target="_blank" rel="noopener noreferrer">Dev Server</a>
                <span class="dash-health-status">{devHealth()?.ok ? "up" : "down"}</span>
              </div>
              <div class="dash-health-item">
                <span class={`dash-health-dot ${prodHealth()?.ok ? "up" : "down"}`} title={prodHealth()?.ok ? "Server is up" : "Server is down"} />
                <a class="dash-health-link" href="https://fpl0.io" target="_blank" rel="noopener noreferrer">fpl0.io</a>
                <span class="dash-health-status">{prodHealth()?.ok ? "up" : "down"}</span>
              </div>
            </div>
          </div>

          <Show when={lastPublished()}>
            <div class="dash-sidebar-section">
              <div class="dash-sidebar-label">Last Activity</div>
              <div class="dash-activity-tag">{lastPublished()}</div>
            </div>
          </Show>
        </Show>
      </aside>

      {/* ── Dashboard Main (Ledger) ── */}
      <main class="dash-main">
        {/* ── Continue Working ── */}
        <Show when={recentDrafts().length > 0}>
          <div class="dash-section">
            <div class="dash-section-label">Continue working</div>
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
                    </div>
                  </li>
                )}
              </For>
            </ul>
          </div>
        </Show>

        {/* ── All Content ── */}
        <div class="dash-section">
          <div class="dash-section-label">All content</div>

          {/* Filter bar */}
          <div class="filter-bar">
            <div class="filter-group">
              <button
                class={`filter-chip ${typeFilter() === "all" ? "active" : ""}`}
                onClick={() => setTypeFilter("all")}
              >
                All <span class="filter-count">({filterCounts().typeAll})</span>
              </button>
              <button
                class={`filter-chip ${typeFilter() === "post" ? "active" : ""}`}
                onClick={() => setTypeFilter("post")}
              >
                Posts <span class="filter-count">({filterCounts().typePost})</span>
              </button>
              <button
                class={`filter-chip ${typeFilter() === "app" ? "active" : ""}`}
                onClick={() => setTypeFilter("app")}
              >
                Apps <span class="filter-count">({filterCounts().typeApp})</span>
              </button>
            </div>

            <div class="filter-group">
              <button
                class={`filter-chip ${statusFilter() === "all" ? "active" : ""}`}
                onClick={() => setStatusFilter("all")}
              >
                All <span class="filter-count">({filterCounts().statusAll})</span>
              </button>
              <button
                class={`filter-chip ${statusFilter() === "draft" ? "active" : ""}`}
                onClick={() => setStatusFilter("draft")}
              >
                Draft <span class="filter-count">({filterCounts().statusDraft})</span>
              </button>
              <button
                class={`filter-chip ${statusFilter() === "published" ? "active" : ""}`}
                onClick={() => setStatusFilter("published")}
              >
                Published <span class="filter-count">({filterCounts().statusPublished})</span>
              </button>
            </div>

            <div class="filter-group">
              <button
                class={`filter-chip ${sortBy() === "created" ? "active" : ""}`}
                onClick={() => setSortBy("created")}
              >
                Created
              </button>
              <button
                class={`filter-chip ${sortBy() === "modified" ? "active" : ""}`}
                onClick={() => setSortBy("modified")}
              >
                Modified
              </button>
            </div>
          </div>

          {/* Ledger list */}
          <Show
            when={filtered().length > 0}
            fallback={
              <div class="content-empty">
                <p>Nothing here yet.</p>
              </div>
            }
          >
            <ul class="post-list">
              <For each={filtered()}>
                {(entry) => (
                  <li class="post-item">
                    <div class="post-date-col">
                      <span class={`post-status-dot ${entry.is_draft ? "draft" : "published"}`} />
                      <span class="post-date">{formatDate(sortBy() === "modified" ? (entry.modified_date ?? entry.created_date) : entry.created_date)}</span>
                    </div>
                    <div class="post-content">
                      <span class="post-title" onClick={() => openEntry(entry)}>{entry.title}</span>
                      <Show when={entry.summary}>
                        <p class="post-summary">{entry.summary}</p>
                      </Show>
                      <Show when={entry.content_type === "app" || entry.tags.length > 0}>
                        <div class="post-tags">
                          {entry.content_type === "app" && (
                            <span class="app-tag">app</span>
                          )}
                          <For each={entry.tags.filter((t) => entry.content_type !== "app" || t !== "app")}>
                            {(tag) => <span class="tag-card">{tag}</span>}
                          </For>
                        </div>
                      </Show>
                    </div>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </div>
      </main>
    </div>
  );
}

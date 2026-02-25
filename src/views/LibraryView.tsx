/**
 * LibraryView — Full content management ledger.
 * Search, type/status/tag filters, sort options, paginated list.
 */
import { createSignal, createMemo, For, Show } from "solid-js";
import { state, openEntry } from "../lib/store";

type TypeFilter = "all" | "post" | "app";
type StatusFilter = "all" | "draft" | "published" | "changed";
type SortBy = "created" | "modified" | "published" | "title";

const PAGE_SIZE = 20;

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return dateStr;
  }
}

export function LibraryView() {
  const [search, setSearch] = createSignal("");
  const [typeFilter, setTypeFilter] = createSignal<TypeFilter>("all");
  const [statusFilter, setStatusFilter] = createSignal<StatusFilter>("all");
  const [sortBy, setSortBy] = createSignal<SortBy>("created");
  const [selectedTags, setSelectedTags] = createSignal<Set<string>>(new Set());
  const [page, setPage] = createSignal(1);

  // --- All unique tags ---
  const allTags = createMemo(() => {
    const counts = new Map<string, number>();
    for (const e of state.entries) {
      for (const t of e.tags) {
        counts.set(t, (counts.get(t) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12);
  });

  function toggleTag(tag: string) {
    const current = selectedTags();
    const next = new Set(current);
    if (next.has(tag)) next.delete(tag);
    else next.add(tag);
    setSelectedTags(next);
    setPage(1);
  }

  // --- Filtered + sorted list ---
  const filtered = createMemo(() => {
    let items = state.entries;

    // Text search
    const q = search().toLowerCase().trim();
    if (q) {
      items = items.filter((e) =>
        e.title.toLowerCase().includes(q) ||
        e.summary.toLowerCase().includes(q) ||
        e.slug.toLowerCase().includes(q)
      );
    }

    // Type filter
    const tf = typeFilter();
    if (tf !== "all") {
      items = items.filter((e) => e.content_type === tf);
    }

    // Status filter
    const sf = statusFilter();
    if (sf === "draft") {
      items = items.filter((e) => e.is_draft);
    } else if (sf === "published") {
      items = items.filter((e) => !e.is_draft);
    } else if (sf === "changed") {
      items = items.filter((e) => !e.is_draft && e.has_changed);
    }

    // Tag filter
    const tags = selectedTags();
    if (tags.size > 0) {
      items = items.filter((e) => e.tags.some((t) => tags.has(t)));
    }

    // Sort
    const sort = sortBy();
    items = [...items].sort((a, b) => {
      if (sort === "title") return a.title.localeCompare(b.title);
      if (sort === "published") {
        const dateA = a.publication_date ?? a.created_date;
        const dateB = b.publication_date ?? b.created_date;
        return dateB.localeCompare(dateA);
      }
      const dateA = sort === "modified" ? (a.modified_date ?? a.created_date) : a.created_date;
      const dateB = sort === "modified" ? (b.modified_date ?? b.created_date) : b.created_date;
      return dateB.localeCompare(dateA);
    });
    return items;
  });

  // --- Filter counts (single pass) ---
  const filterCounts = createMemo(() => {
    const sf = statusFilter();
    const tf = typeFilter();
    let typeAll = 0, typePost = 0, typeApp = 0;
    let statusAll = 0, statusDraft = 0, statusPublished = 0, statusChanged = 0;

    for (const e of state.entries) {
      const isPost = e.content_type === "post";
      const isApp = e.content_type === "app";
      const isDraft = e.is_draft;
      const isChanged = !isDraft && e.has_changed;
      const matchesStatus = sf === "all" || (sf === "draft" ? isDraft : sf === "published" ? !isDraft : isChanged);
      const matchesType = tf === "all" || e.content_type === tf;

      if (matchesStatus) {
        typeAll++;
        if (isPost) typePost++;
        if (isApp) typeApp++;
      }
      if (matchesType) {
        statusAll++;
        if (isDraft) statusDraft++;
        else statusPublished++;
        if (isChanged) statusChanged++;
      }
    }

    return { typeAll, typePost, typeApp, statusAll, statusDraft, statusPublished, statusChanged };
  });

  // --- Pagination ---
  const totalPages = createMemo(() => Math.max(1, Math.ceil(filtered().length / PAGE_SIZE)));
  const paginatedItems = createMemo(() => {
    const start = (page() - 1) * PAGE_SIZE;
    return filtered().slice(start, start + PAGE_SIZE);
  });

  // --- Active filter detection ---
  const hasActiveFilters = createMemo(() =>
    search().trim() !== "" ||
    typeFilter() !== "all" ||
    statusFilter() !== "all" ||
    selectedTags().size > 0
  );

  function clearAllFilters() {
    setSearch("");
    setTypeFilter("all");
    setStatusFilter("all");
    setSelectedTags(new Set<string>());
    setPage(1);
  }

  // Reset page when filters change
  function setTypeAndReset(tf: TypeFilter) { setTypeFilter(tf); setPage(1); }
  function setStatusAndReset(sf: StatusFilter) { setStatusFilter(sf); setPage(1); }
  function setSortAndReset(s: SortBy) { setSortBy(s); setPage(1); }

  function displayDate(entry: typeof state.entries[0]): string {
    const sort = sortBy();
    if (sort === "published") return formatDate(entry.publication_date ?? entry.created_date);
    if (sort === "modified") return formatDate(entry.modified_date ?? entry.created_date);
    return formatDate(entry.created_date);
  }

  return (
    <div class="library-view">
      {/* ── Header ── */}
      <div class="library-header">
        <h2 class="library-title">Library</h2>
        <span class="library-total">{state.entries.length} entries</span>
      </div>

      {/* ── Search ── */}
      <input
        class="library-search"
        type="text"
        placeholder="Search titles, summaries, slugs..."
        value={search()}
        onInput={(e) => { setSearch(e.currentTarget.value); setPage(1); }}
      />

      {/* ── Filter Rows ── */}
      <div class="library-filters">
        <div class="library-filter-row">
          <span class="library-filter-label">Type</span>
          <div class="filter-group">
            <button class={`filter-chip ${typeFilter() === "all" ? "active" : ""}`} onClick={() => setTypeAndReset("all")}>
              All <span class="filter-count">{filterCounts().typeAll}</span>
            </button>
            <button class={`filter-chip ${typeFilter() === "post" ? "active" : ""}`} onClick={() => setTypeAndReset("post")}>
              Posts <span class="filter-count">{filterCounts().typePost}</span>
            </button>
            <button class={`filter-chip ${typeFilter() === "app" ? "active" : ""}`} onClick={() => setTypeAndReset("app")}>
              Apps <span class="filter-count">{filterCounts().typeApp}</span>
            </button>
          </div>
        </div>

        <div class="library-filter-row">
          <span class="library-filter-label">Status</span>
          <div class="filter-group">
            <button class={`filter-chip ${statusFilter() === "all" ? "active" : ""}`} onClick={() => setStatusAndReset("all")}>
              All <span class="filter-count">{filterCounts().statusAll}</span>
            </button>
            <button class={`filter-chip ${statusFilter() === "published" ? "active" : ""}`} onClick={() => setStatusAndReset("published")}>
              Published <span class="filter-count">{filterCounts().statusPublished}</span>
            </button>
            <button class={`filter-chip ${statusFilter() === "draft" ? "active" : ""}`} onClick={() => setStatusAndReset("draft")}>
              Draft <span class="filter-count">{filterCounts().statusDraft}</span>
            </button>
            <Show when={filterCounts().statusChanged > 0}>
              <button class={`filter-chip ${statusFilter() === "changed" ? "active" : ""}`} onClick={() => setStatusAndReset("changed")}>
                Changed <span class="filter-count">{filterCounts().statusChanged}</span>
              </button>
            </Show>
          </div>
        </div>

        <Show when={allTags().length > 0}>
          <div class="library-filter-row">
            <span class="library-filter-label">Tags</span>
            <div class="filter-group filter-group-wrap">
              <For each={allTags()}>
                {([tag, count]) => (
                  <button
                    class={`filter-chip ${selectedTags().has(tag) ? "active" : ""}`}
                    onClick={() => toggleTag(tag)}
                  >
                    {tag} <span class="filter-count">{count}</span>
                  </button>
                )}
              </For>
            </div>
          </div>
        </Show>

        <div class="library-filter-row">
          <span class="library-filter-label">Sort</span>
          <div class="filter-group">
            <button class={`filter-chip ${sortBy() === "created" ? "active" : ""}`} onClick={() => setSortAndReset("created")}>
              Created
            </button>
            <button class={`filter-chip ${sortBy() === "modified" ? "active" : ""}`} onClick={() => setSortAndReset("modified")}>
              Modified
            </button>
            <button class={`filter-chip ${sortBy() === "published" ? "active" : ""}`} onClick={() => setSortAndReset("published")}>
              Published
            </button>
            <button class={`filter-chip ${sortBy() === "title" ? "active" : ""}`} onClick={() => setSortAndReset("title")}>
              Title
            </button>
          </div>
        </div>
      </div>

      {/* ── Result Summary ── */}
      <div class="library-result-bar">
        <span class="library-result-count">
          {hasActiveFilters()
            ? `Showing ${filtered().length} of ${state.entries.length}`
            : `${filtered().length} entries`
          }
        </span>
        <Show when={hasActiveFilters()}>
          <button class="library-clear" onClick={clearAllFilters}>
            Clear filters
          </button>
        </Show>
      </div>

      {/* ── Ledger List ── */}
      <Show
        when={paginatedItems().length > 0}
        fallback={
          <div class="content-empty">
            <p>{hasActiveFilters() ? "No entries match your filters." : "Nothing here yet."}</p>
          </div>
        }
      >
        <ul class="post-list">
          <For each={paginatedItems()}>
            {(entry) => (
              <li class="post-item">
                <div class="post-date-col">
                  <span class={`post-status-dot ${entry.is_draft ? "draft" : entry.has_changed ? "changed" : "published"}`} title={entry.is_draft ? "Draft" : entry.has_changed ? "Modified since publication" : "Published"} />
                  <span class="post-date">{displayDate(entry)}</span>
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
                        {(tag) => (
                          <span
                            class={`tag-card ${selectedTags().has(tag) ? "tag-active" : ""}`}
                            onClick={() => toggleTag(tag)}
                            style={{ cursor: "pointer" }}
                          >
                            {tag}
                          </span>
                        )}
                      </For>
                    </div>
                  </Show>
                </div>
              </li>
            )}
          </For>
        </ul>
      </Show>

      {/* ── Pagination ── */}
      <Show when={totalPages() > 1}>
        <div class="library-pagination">
          <button
            class="library-page-btn"
            disabled={page() <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            &larr; prev
          </button>
          <span class="library-page-info">
            Page {page()} of {totalPages()}
          </span>
          <button
            class="library-page-btn"
            disabled={page() >= totalPages()}
            onClick={() => setPage((p) => p + 1)}
          >
            next &rarr;
          </button>
        </div>
      </Show>
    </div>
  );
}

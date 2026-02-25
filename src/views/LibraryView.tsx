/**
 * LibraryView — Full content management ledger.
 * Search, type/status/tag filters, sort options, paginated list.
 */
import { createSignal, createMemo, For, Show, onMount } from "solid-js";
import { state, openEntry, setState } from "../lib/store";

type TypeFilter = "all" | "post" | "app";
type StatusFilter = "all" | "draft" | "published" | "changed";
type SortBy = "created" | "modified" | "published" | "title";

const PAGE_SIZE = 25; // Slightly higher density

function formatDateShort(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

export function LibraryView() {
  // Read initial filters from navigation state and consume them
  const viewState = state.view.kind === "library" ? state.view : null;
  const initialTag = viewState?.tag ?? null;
  const initialStatus: StatusFilter = viewState?.status ?? "all";
  if (initialTag || viewState?.status) {
    setState("view", { kind: "library" });
  }

  const [search, setSearch] = createSignal("");
  const [typeFilter, setTypeFilter] = createSignal<TypeFilter>("all");
  const [statusFilter, setStatusFilter] = createSignal<StatusFilter>(initialStatus);
  const [sortBy, setSortBy] = createSignal<SortBy>("created");
  const [selectedTags, setSelectedTags] = createSignal<Set<string>>(
    initialTag ? new Set([initialTag]) : new Set(),
  );
  const [page, setPage] = createSignal(1);

  let searchRef: HTMLInputElement | undefined;
  onMount(() => searchRef?.focus());

  // --- All unique tags ---
  const allTags = createMemo(() => {
    const counts = new Map<string, number>();
    for (const e of state.entries) {
      if (!e.tags) continue;
      for (const t of e.tags) {
        counts.set(t, (counts.get(t) ?? 0) + 1);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  });

  const displayedTags = createMemo(() => allTags().slice(0, 20));

  function toggleTag(tag: string) {
    const current = selectedTags();
    const next = new Set(current);
    if (next.has(tag)) next.delete(tag);
    else next.add(tag);
    setSelectedTags(next);
    setPage(1);
  }

  // --- Stats memos ---
  const totalCount = createMemo(() => state.entries.length);
  const publishedCount = createMemo(() => state.entries.filter((e) => !e.is_draft).length);
  const draftCount = createMemo(() => state.entries.filter((e) => e.is_draft).length);
  const changedCount = createMemo(() => state.entries.filter((e) => !e.is_draft && e.has_changed).length);

  // --- Filtered + sorted list ---
  const filtered = createMemo(() => {
    let items = state.entries;

    // Text search
    const q = search().toLowerCase().trim();
    if (q) {
      items = items.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          e.summary.toLowerCase().includes(q) ||
          e.slug.toLowerCase().includes(q),
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
      const dateA =
        sort === "modified"
          ? (a.modified_date ?? a.created_date)
          : a.created_date;
      const dateB =
        sort === "modified"
          ? (b.modified_date ?? b.created_date)
          : b.created_date;
      return dateB.localeCompare(dateA);
    });
    return items;
  });

  // --- Filter counts (single pass) ---
  const filterCounts = createMemo(() => {
    const sf = statusFilter();
    const tf = typeFilter();
    let typeAll = 0,
      typePost = 0,
      typeApp = 0;
    let statusAll = 0,
      statusDraft = 0,
      statusPublished = 0,
      statusChanged = 0;

    for (const e of state.entries) {
      const isPost = e.content_type === "post";
      const isApp = e.content_type === "app";
      const isDraft = e.is_draft;
      const isChanged = !isDraft && e.has_changed;
      const matchesStatus =
        sf === "all" ||
        (sf === "draft" ? isDraft : sf === "published" ? !isDraft : isChanged);
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

    return {
      typeAll,
      typePost,
      typeApp,
      statusAll,
      statusDraft,
      statusPublished,
      statusChanged,
    };
  });

  // --- Pagination ---
  const totalPages = createMemo(() =>
    Math.max(1, Math.ceil(filtered().length / PAGE_SIZE)),
  );
  const paginatedItems = createMemo(() => {
    const start = (page() - 1) * PAGE_SIZE;
    return filtered().slice(start, start + PAGE_SIZE);
  });

  // --- Active filter detection ---
  const hasActiveFilters = createMemo(
    () =>
      search().trim() !== "" ||
      typeFilter() !== "all" ||
      statusFilter() !== "all" ||
      selectedTags().size > 0,
  );

  function clearAllFilters() {
    setSearch("");
    setTypeFilter("all");
    setStatusFilter("all");
    setSelectedTags(new Set<string>());
    setPage(1);
  }

  // Reset page when filters change
  function setTypeAndReset(tf: TypeFilter) {
    setTypeFilter(tf);
    setPage(1);
  }
  function setStatusAndReset(sf: StatusFilter) {
    setStatusFilter(sf);
    setPage(1);
  }
  function setSortAndReset(s: SortBy) {
    setSortBy(s);
    setPage(1);
  }

  function displayDate(entry: (typeof state.entries)[0]): string {
    const sort = sortBy();
    if (sort === "published")
      return formatDateShort(entry.publication_date ?? entry.created_date);
    if (sort === "modified")
      return formatDateShort(entry.modified_date ?? entry.created_date);
    return formatDateShort(entry.created_date);
  }

  return (
    <div class="library-view">
      {/* ── Header ── */}
      <h1 class="view-title">Library</h1>

      {/* ── Stats Strip ── */}
      <div class="library-stats-strip">
        <div class="library-kpi">
          <span class="library-kpi-value">{totalCount()}</span>
          <span class="library-kpi-label">entries</span>
        </div>
        <span class="library-kpi-sep">&middot;</span>
        <div class="library-kpi">
          <span class="library-kpi-value">{publishedCount()}</span>
          <span class="library-kpi-label">published</span>
        </div>
        <span class="library-kpi-sep">&middot;</span>
        <div class="library-kpi">
          <span class="library-kpi-value">{draftCount()}</span>
          <span class="library-kpi-label">drafts</span>
        </div>
        <Show when={changedCount() > 0}>
          <span class="library-kpi-sep">&middot;</span>
          <div class="library-kpi">
            <span class="library-kpi-value library-kpi-value--warn">{changedCount()}</span>
            <span class="library-kpi-label">modified</span>
          </div>
        </Show>
      </div>

      {/* ── Search ── */}
      <input
        ref={searchRef}
        class="library-search-input"
        type="text"
        placeholder="Search entries..."
        aria-label="Search entries"
        value={search()}
        onInput={(e) => {
          setSearch(e.currentTarget.value);
          setPage(1);
        }}
      />

      {/* ── Filter Bar ── */}
      <div class="library-filter-bar">
        <div class="filter-group">
          <button
            class={`filter-chip ${typeFilter() === "all" ? "active" : ""}`}
            onClick={() => setTypeAndReset("all")}
          >
            All {filterCounts().typeAll}
          </button>
          <button
            class={`filter-chip ${typeFilter() === "post" ? "active" : ""}`}
            onClick={() => setTypeAndReset("post")}
          >
            Posts {filterCounts().typePost}
          </button>
          <button
            class={`filter-chip ${typeFilter() === "app" ? "active" : ""}`}
            onClick={() => setTypeAndReset("app")}
          >
            Apps {filterCounts().typeApp}
          </button>
        </div>

        <div class="filter-group">
          <button
            class={`filter-chip ${statusFilter() === "all" ? "active" : ""}`}
            onClick={() => setStatusAndReset("all")}
          >
            All {filterCounts().statusAll}
          </button>
          <button
            class={`filter-chip ${statusFilter() === "published" ? "active" : ""}`}
            onClick={() => setStatusAndReset("published")}
          >
            Pub {filterCounts().statusPublished}
          </button>
          <button
            class={`filter-chip ${statusFilter() === "draft" ? "active" : ""}`}
            onClick={() => setStatusAndReset("draft")}
          >
            Dft {filterCounts().statusDraft}
          </button>
          <Show when={filterCounts().statusChanged > 0}>
            <button
              class={`filter-chip ${statusFilter() === "changed" ? "active" : ""}`}
              onClick={() => setStatusAndReset("changed")}
            >
              Chg {filterCounts().statusChanged}
            </button>
          </Show>
        </div>

        <span class="library-filter-label">Sort</span>
        <div class="filter-group">
          <For each={["created", "modified", "published", "title"] as SortBy[]}>
            {(s) => (
              <button
                class={`filter-chip ${sortBy() === s ? "active" : ""}`}
                onClick={() => setSortAndReset(s)}
              >
                {s}
              </button>
            )}
          </For>
        </div>

        <Show when={hasActiveFilters()}>
          <button class="library-clear-btn" onClick={clearAllFilters}>
            Clear
          </button>
        </Show>
      </div>

      {/* ── Tag Ribbon ── */}
      <Show when={displayedTags().length > 0}>
        <div class="library-tag-ribbon">
          <For each={displayedTags()}>
            {([tag, count]) => (
              <button
                class={`library-tag-chip ${selectedTags().has(tag) ? "active" : ""}`}
                onClick={() => toggleTag(tag)}
              >
                {tag} <span class="library-tag-count">{count}</span>
              </button>
            )}
          </For>
          <Show when={allTags().length > 20}>
            <span class="library-tag-overflow">+{allTags().length - 20} more</span>
          </Show>
        </div>
      </Show>

      {/* ── Result Summary (only when filtered) ── */}
      <Show when={hasActiveFilters()}>
        <p class="library-result-summary">
          Showing {filtered().length} matching criteria
        </p>
      </Show>

      {/* ── Entry List ── */}
      <Show
        when={paginatedItems().length > 0}
        fallback={
          <div class="library-empty">
            <p>No entries found matching your filters.</p>
          </div>
        }
      >
        <ul class="post-list">
          <For each={paginatedItems()}>
            {(entry) => (
              <li class="post-item">
                <div class="post-date-col">
                  <span
                    class={`post-status-dot ${entry.is_draft ? "draft" : entry.has_changed ? "changed" : "published"}`}
                    title={entry.is_draft ? "Draft" : entry.has_changed ? "Modified" : "Published"}
                  />
                  <span class="post-date">{displayDate(entry)}</span>
                </div>
                <div class="post-content">
                  <span
                    class="post-title"
                    tabIndex={0}
                    role="button"
                    onClick={() => openEntry(entry)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openEntry(entry);
                      }
                    }}
                  >
                    {entry.title}
                  </span>
                  <Show when={entry.summary}>
                    <p class="post-summary">{entry.summary}</p>
                  </Show>
                  <div class="library-meta">
                    <span class="library-type-badge">{entry.content_type}</span>
                    <Show when={entry.tags && entry.tags.length > 0 && entry.tags.filter(t => t !== "app").length > 0}>
                      <span class="library-meta-sep">&middot;</span>
                      <For each={entry.tags.filter(t => t !== "app").slice(0, 3)}>
                        {(tag) => (
                          <button
                            class={`library-meta-tag ${selectedTags().has(tag) ? "active" : ""}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleTag(tag);
                            }}
                          >
                            {tag}
                          </button>
                        )}
                      </For>
                      <Show when={entry.tags.filter(t => t !== "app").length > 3}>
                        <span class="library-meta-tag-overflow">+{entry.tags.filter(t => t !== "app").length - 3}</span>
                      </Show>
                    </Show>
                  </div>
                </div>
              </li>
            )}
          </For>
        </ul>
      </Show>

      {/* ── Pagination ── */}
      <Show when={totalPages() > 1}>
        <footer class="library-footer">
          <div class="library-pagination">
            <button
              class="library-page-btn"
              disabled={page() <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              &larr; Previous
            </button>
            <span class="library-page-info">
              {page()} / {totalPages()}
            </span>
            <button
              class="library-page-btn"
              disabled={page() >= totalPages()}
              onClick={() => setPage((p) => p + 1)}
            >
              Next &rarr;
            </button>
          </div>
        </footer>
      </Show>
    </div>
  );
}

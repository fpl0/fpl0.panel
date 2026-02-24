import { createSignal, createMemo, For, Show, onMount, onCleanup } from "solid-js";
import { state, openEntry, closeSearch } from "../lib/store";
import type { ContentEntry } from "../lib/commands";

export function SearchModal() {
  const [query, setQuery] = createSignal("");
  const [selectedIndex, setSelectedIndex] = createSignal(0);
  let inputRef!: HTMLInputElement;

  const results = createMemo(() => {
    const q = query().toLowerCase();
    if (q.length === 0) return [...state.entries];
    return state.entries.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        e.slug.toLowerCase().includes(q) ||
        e.tags.some((t) => t.toLowerCase().includes(q)),
    );
  });

  function close() {
    closeSearch();
    setQuery("");
    setSelectedIndex(0);
  }

  function handleOpenEntry(entry: ContentEntry) {
    openEntry(entry);
    close();
  }

  function handleKeyDown(e: KeyboardEvent) {
    const items = results();
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, items.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (items[selectedIndex()]) {
          handleOpenEntry(items[selectedIndex()]);
        }
        break;
      case "Escape":
        e.preventDefault();
        close();
        break;
    }
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      close();
    }
  }

  onMount(() => {
    inputRef.focus();
    document.addEventListener("keydown", handleKeyDown);
  });

  onCleanup(() => {
    document.removeEventListener("keydown", handleKeyDown);
  });

  return (
    <>
      <div class="search-backdrop" onClick={handleBackdropClick} />
      <div class="search-modal" role="dialog" aria-modal="true" aria-label="Search">
        <div class="search-input-wrapper">
          <svg
            class="search-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            ref={inputRef}
            class="search-input"
            type="text"
            placeholder="Search..."
            autocomplete="off"
            spellcheck={false}
            value={query()}
            onInput={(e) => {
              setQuery(e.currentTarget.value);
              setSelectedIndex(0);
            }}
          />
          <div class="search-kbd">
            <kbd>esc</kbd>
          </div>
        </div>

        <div class="search-results" role="listbox" aria-label="Search results">
          <Show
            when={results().length > 0}
            fallback={
              <div class="search-empty">
                {query().length > 0 ? "No results found" : "Type to search..."}
              </div>
            }
          >
            <For each={results()}>
              {(entry, i) => (
                <div
                  class={`search-result ${i() === selectedIndex() ? "is-selected" : ""}`}
                  role="option"
                  aria-selected={i() === selectedIndex()}
                  onClick={() => handleOpenEntry(entry)}
                  onMouseMove={() => setSelectedIndex(i())}
                >
                  <div class="search-result-title">
                    {entry.title}
                    <Show when={entry.content_type === "app"}>
                      <span class="search-result-type">app</span>
                    </Show>
                  </div>
                  <div class="search-result-meta">
                    <span class="search-result-summary">
                      {entry.summary || entry.slug}
                    </span>
                    <Show when={entry.tags.length > 0}>
                      <span class="search-result-tags">
                        <For each={entry.tags.slice(0, 3)}>
                          {(tag) => <span class="search-tag">{tag}</span>}
                        </For>
                      </span>
                    </Show>
                  </div>
                </div>
              )}
            </For>
          </Show>
        </div>

        <div class="search-footer">
          <div class="search-footer-hint">
            <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
            <span><kbd>↵</kbd> select</span>
          </div>
        </div>
      </div>
    </>
  );
}

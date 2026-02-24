import { createSignal, For, onMount } from "solid-js";
import { createPost, createApp } from "../lib/commands";
import {
  state,
  refreshEntries,
  openEntry,
  addToast,
} from "../lib/store";

const SUMMARY_MIN = 50;
const SUMMARY_MAX = 360;

export function CreateView() {
  const [contentType, setContentType] = createSignal<"post" | "app">("post");
  const [title, setTitle] = createSignal("");
  const [slug, setSlug] = createSignal("");
  const [summary, setSummary] = createSignal("");
  const [tags, setTags] = createSignal<string[]>([]);
  const [tagInput, setTagInput] = createSignal("");
  const [creating, setCreating] = createSignal(false);

  function autoSlug(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function handleTitleChange(val: string) {
    const prevAutoSlug = autoSlug(title());
    setTitle(val);
    // Only auto-slug if user hasn't manually edited slug
    if (slug() === "" || slug() === prevAutoSlug) {
      setSlug(autoSlug(val));
    }
  }

  function summaryStatus(): "valid" | "warn" | "error" {
    const len = summary().length;
    if (len === 0) return "warn";
    if (len < SUMMARY_MIN || len > SUMMARY_MAX) return "error";
    return "valid";
  }

  function handleTagKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const val = tagInput().trim().replace(",", "");
      if (val.length > 0 && !tags().includes(val)) {
        setTags([...tags(), val]);
      }
      setTagInput("");
    }
  }

  function removeTag(tag: string) {
    setTags(tags().filter((t) => t !== tag));
  }

  async function handleCreate() {
    const repoPath = state.config.repo_path;
    if (!repoPath || !title().trim()) return;

    const len = summary().length;
    if (len < SUMMARY_MIN || len > SUMMARY_MAX) {
      addToast(`Summary must be ${SUMMARY_MIN}-${SUMMARY_MAX} chars (currently ${len})`, "error");
      return;
    }

    setCreating(true);
    try {
      const args = {
        title: title(),
        slug: slug() || autoSlug(title()),
        summary: summary(),
        tags: tags(),
      };

      const entry =
        contentType() === "post"
          ? await createPost(repoPath, args)
          : await createApp(repoPath, args);

      await refreshEntries();
      addToast(`Created ${contentType()}: ${entry.title}`);
      openEntry(entry);
    } catch (e) {
      addToast(`Failed to create: ${e}`, "error");
    } finally {
      setCreating(false);
    }
  }

  let titleRef: HTMLTextAreaElement | undefined;

  onMount(() => {
    titleRef?.focus();
  });

  return (
    <div class="create-view">
      <h1>New Content</h1>

      {/* Content type */}
      <div class="metadata-field create-field-lg">
        <span class="label">Type</span>
        <div class="filter-group">
          <button
            class={`filter-chip ${contentType() === "post" ? "active" : ""}`}
            onClick={() => setContentType("post")}
          >
            Post
          </button>
          <button
            class={`filter-chip ${contentType() === "app" ? "active" : ""}`}
            onClick={() => setContentType("app")}
          >
            App
          </button>
        </div>
      </div>

      {/* Title */}
      <div class="metadata-field create-field">
        <span class="label">Title</span>
        <textarea
          ref={titleRef}
          class="metadata-title-input"
          placeholder="Your title..."
          value={title()}
          rows={1}
          onInput={(e) => {
            handleTitleChange(e.currentTarget.value);
            // Auto-expand
            e.currentTarget.style.height = "auto";
            e.currentTarget.style.height = e.currentTarget.scrollHeight + "px";
          }}
        />
      </div>

      {/* Slug */}
      <div class="metadata-field create-field">
        <span class="label">Slug</span>
        <input
          class="input"
          type="text"
          placeholder="auto-generated-from-title"
          value={slug()}
          onInput={(e) => setSlug(e.currentTarget.value)}
        />
      </div>

      {/* Summary */}
      <div class="metadata-field create-field">
        <span class="label">Summary</span>
        <div class="summary-wrapper">
          <textarea
            class="input"
            placeholder={`${SUMMARY_MIN}-${SUMMARY_MAX} characters`}
            value={summary()}
            onInput={(e) => setSummary(e.currentTarget.value)}
            rows={3}
          />
          <span class={`summary-counter ${summaryStatus()}`}>
            {summary().length}/{SUMMARY_MAX}
          </span>
        </div>
      </div>

      {/* Tags */}
      <div class="metadata-field create-field-lg">
        <span class="label">Tags</span>
        <div class="tag-input-wrapper">
          <For each={tags()}>
            {(tag) => (
              <span class="tag-chip">
                {tag}
                <button class="tag-chip-remove" onClick={() => removeTag(tag)}>
                  &times;
                </button>
              </span>
            )}
          </For>
          <input
            class="tag-input-field"
            type="text"
            placeholder="Add tag..."
            value={tagInput()}
            onInput={(e) => setTagInput(e.currentTarget.value)}
            onKeyDown={handleTagKeyDown}
          />
        </div>
      </div>

      <button
        class="btn btn-primary"
        onClick={handleCreate}
        disabled={creating() || !title().trim()}
      >
        {creating() ? "Creating..." : `Create ${contentType()}`}
      </button>
    </div>
  );
}

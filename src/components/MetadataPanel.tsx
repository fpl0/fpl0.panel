import { createSignal, createEffect, For } from "solid-js";
import type { ContentEntry } from "../lib/commands";

const SUMMARY_MIN = 50;
const SUMMARY_MAX = 360;

interface Props {
  entry: ContentEntry;
  onFieldChange: (field: string, value: string) => void;
  wordCount?: number;
  charCount?: number;
}

export function MetadataPanel(props: Props) {
  const [tags, setTags] = createSignal<string[]>([]);
  const [tagInput, setTagInput] = createSignal("");

  // Sync tags when props.entry.tags changes (fixes stale tags after publish/unpublish)
  createEffect(() => setTags(props.entry.tags));

  function summaryStatus(len: number): string {
    if (len === 0) return "warn";
    if (len < SUMMARY_MIN || len > SUMMARY_MAX) return "error";
    return "valid";
  }

  function handleTagKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const val = tagInput().trim().replace(",", "");
      if (val.length > 0 && !tags().includes(val)) {
        const newTags = [...tags(), val];
        setTags(newTags);
        props.onFieldChange("tags", `[${newTags.map((t) => `"${t}"`).join(", ")}]`);
      }
      setTagInput("");
    }
  }

  function removeTag(tag: string) {
    const newTags = tags().filter((t) => t !== tag);
    setTags(newTags);
    props.onFieldChange("tags", `[${newTags.map((t) => `"${t}"`).join(", ")}]`);
  }

  return (
    <div class="metadata-panel">
      <div class="metadata-body">
        {/* Status */}
        <div class="metadata-field">
          <span class={`status-badge ${props.entry.is_draft ? "draft" : "published"}`}>
            {props.entry.is_draft ? "Draft" : "Published"}
          </span>
        </div>

        {/* Title */}
        <div class="metadata-field">
          <textarea
            class="metadata-title-input"
            value={props.entry.title}
            placeholder="Title..."
            rows={1}
            onInput={(e) => {
              props.onFieldChange("title", e.currentTarget.value);
              // Auto-expand
              e.currentTarget.style.height = "auto";
              e.currentTarget.style.height = e.currentTarget.scrollHeight + "px";
            }}
          />
          <input
            class="metadata-slug"
            type="text"
            value={props.entry.slug}
            placeholder="slug..."
            onInput={(e) => props.onFieldChange("slug", e.currentTarget.value)}
          />
        </div>

        {/* Summary */}
        <div class="metadata-field">
          <span class="label">Summary</span>
          <div class="summary-wrapper">
            <textarea
              class="input"
              value={props.entry.summary}
              placeholder={`${SUMMARY_MIN}-${SUMMARY_MAX} characters`}
              rows={7}
              onInput={(e) => props.onFieldChange("summary", e.currentTarget.value)}
            />
            <span class={`summary-counter ${summaryStatus(props.entry.summary.length)}`}>
              {props.entry.summary.length}/{SUMMARY_MAX}
            </span>
          </div>
        </div>

        {/* Tags */}
        <div class="metadata-field">
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

        {/* Dates */}
        <div class="metadata-dates">
          <div class="metadata-field">
            <span class="label">Created</span>
            <span class="system-label">{props.entry.created_date}</span>
          </div>
          <div class="metadata-field">
            <span class="label">Published</span>
            <span class="system-label">{props.entry.publication_date || "\u2014"}</span>
          </div>
        </div>


      </div>

      {(props.wordCount != null || props.charCount != null) && (
        <div class="metadata-footer">
          <span class="system-label">
            {(props.wordCount ?? 0).toLocaleString()} words &middot; {(props.charCount ?? 0).toLocaleString()} characters
          </span>
        </div>
      )}
    </div>
  );
}

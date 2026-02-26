import { createSignal, createEffect, For } from "solid-js";
import type { ContentEntry } from "../lib/commands";
import { escapeYamlValue } from "../lib/yaml";

const SUMMARY_MIN = 50;
const SUMMARY_MAX = 360;

function formatDateTime(dateStr: string): string {
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (!m) return dateStr;
  const [, year, month, day, hours, minutes] = m;
  if (hours && minutes) return `${day}/${month}/${year} ${hours}:${minutes}`;
  return `${day}/${month}/${year}`;
}

interface Props {
  entry: ContentEntry;
  onFieldChange: (field: string, value: string) => void;
  wordCount?: number;
  charCount?: number;
}

export function MetadataPanel(props: Props) {
  const [tags, setTags] = createSignal<string[]>([]);
  const [tagInput, setTagInput] = createSignal("");
  let titleRef: HTMLTextAreaElement | undefined;

  // Auto-size title textarea when content changes reactively (rollback, external reload)
  createEffect(() => {
    void props.entry.title;
    if (titleRef) {
      requestAnimationFrame(() => {
        if (!titleRef) return;
        titleRef.style.height = "auto";
        titleRef.style.height = titleRef.scrollHeight + "px";
      });
    }
  });

  // Sync tags when props.entry.tags changes (fixes stale tags after publish/unpublish)
  createEffect(() => setTags(props.entry.tags));

  function summaryStatus(len: number): string {
    if (len === 0) return "warn";
    if (len < SUMMARY_MIN || len > SUMMARY_MAX) return "error";
    return "valid";
  }

  function serializeTags(t: string[]): string {
    return `[${t.map((v) => `"${escapeYamlValue(v)}"`).join(", ")}]`;
  }

  function handleTagKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const val = tagInput().trim().replace(",", "");
      if (val.length > 0 && !tags().includes(val)) {
        const newTags = [...tags(), val];
        setTags(newTags);
        props.onFieldChange("tags", serializeTags(newTags));
      }
      setTagInput("");
    }
    // Backspace on empty input removes the last tag
    if (e.key === "Backspace" && tagInput() === "" && tags().length > 0) {
      const newTags = tags().slice(0, -1);
      setTags(newTags);
      props.onFieldChange("tags", serializeTags(newTags));
    }
  }

  function handleTagPaste(e: ClipboardEvent) {
    const text = e.clipboardData?.getData("text/plain");
    if (!text || !text.includes(",")) return;
    e.preventDefault();
    const pasted = text.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
    const current = tags();
    const newTags = [...current, ...pasted.filter((t) => !current.includes(t))];
    setTags(newTags);
    props.onFieldChange("tags", serializeTags(newTags));
    setTagInput("");
  }

  function removeTag(tag: string) {
    const newTags = tags().filter((t) => t !== tag);
    setTags(newTags);
    props.onFieldChange("tags", serializeTags(newTags));
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
            aria-label="Title"
            value={props.entry.title}
            placeholder="Title..."
            rows={1}
            ref={(el) => {
              titleRef = el;
              requestAnimationFrame(() => {
                el.style.height = "auto";
                el.style.height = el.scrollHeight + "px";
              });
            }}
            onInput={(e) => {
              props.onFieldChange("title", e.currentTarget.value);
              e.currentTarget.style.height = "auto";
              e.currentTarget.style.height = e.currentTarget.scrollHeight + "px";
            }}
          />
          <input
            class="metadata-slug"
            type="text"
            aria-label="Slug"
            value={props.entry.slug}
            readOnly
            title="Slug is derived from the file path"
          />
        </div>

        {/* Summary */}
        <div class="metadata-field">
          <label class="label" for="meta-summary">Summary</label>
          <div class="summary-wrapper">
            <textarea
              id="meta-summary"
              class="input"
              value={props.entry.summary}
              placeholder={`${SUMMARY_MIN}-${SUMMARY_MAX} characters`}
              onInput={(e) => props.onFieldChange("summary", e.currentTarget.value)}
            />
            <span class={`summary-counter ${summaryStatus(props.entry.summary.length)}`}>
              {props.entry.summary.length}/{SUMMARY_MAX}
            </span>
          </div>
        </div>

        {/* Tags */}
        <div class="metadata-field">
          <label class="label" for="meta-tags">Tags</label>
          <div class="tag-input-wrapper">
            <For each={tags()}>
              {(tag) => (
                <span class="tag-chip">
                  {tag}
                  <button class="tag-chip-remove" aria-label={`Remove tag: ${tag}`} onClick={() => removeTag(tag)}>
                    &times;
                  </button>
                </span>
              )}
            </For>
            <input
              id="meta-tags"
              class="tag-input-field"
              type="text"
              placeholder="Add tag..."
              value={tagInput()}
              onInput={(e) => setTagInput(e.currentTarget.value)}
              onKeyDown={handleTagKeyDown}
              onPaste={handleTagPaste}
            />
          </div>
        </div>

        {/* Dates */}
        <div class="metadata-dates">
          <div class="metadata-field">
            <span class="label">Created</span>
            <span class="system-label">{formatDateTime(props.entry.created_date)}</span>
          </div>
          <div class="metadata-field">
            <span class="label">Published</span>
            <span class="system-label">{props.entry.publication_date ? formatDateTime(props.entry.publication_date) : "\u2014"}</span>
          </div>
        </div>


      </div>

      {(props.wordCount != null || props.charCount != null) && (
        <div class="metadata-footer" aria-live="polite">
          <span class="system-label">
            {(props.wordCount ?? 0).toLocaleString()} words &middot; {(props.charCount ?? 0).toLocaleString()} characters
          </span>
        </div>
      )}
    </div>
  );
}

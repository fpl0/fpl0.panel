import { createSignal, createEffect, onMount, onCleanup, Show } from "solid-js";
import type { ContentEntry } from "../lib/commands";
import { readFile, writeFile } from "../lib/commands";
import { parseMdxToEditor, serializeEditorToMdx } from "../lib/mdx";
import {
  state,
  activeEntry,
  navigate,
  publishEntry,
  unpublishEntry,
  deleteEntry,
  refreshEntries,
  patchEntry,
  addToast,
  updateToast,
  lastExternalChange,
  clearExternalChange,
  suppressFsChange,
} from "../lib/store";
import { DetailBar } from "../components/Sidebar";
import { TipTapEditor } from "../components/TipTapEditor";
import { MetadataPanel } from "../components/MetadataPanel";
import { ConfirmDialog } from "../components/ConfirmDialog";
import type { JSONContent } from "@tiptap/core";

interface Props {
  slug: string;
}

export function EditorView(props: Props) {
  const [yaml, setYaml] = createSignal("");
  const [editorContent, setEditorContent] = createSignal<JSONContent | null>(null);
  const [saveState, setSaveState] = createSignal<"saved" | "saving" | "unsaved">("saved");
  const [loading, setLoading] = createSignal(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = createSignal(false);
  const [showUnpubConfirm, setShowUnpubConfirm] = createSignal(false);
  const [publishing, setPublishing] = createSignal(false);
  const [showExternalBanner, setShowExternalBanner] = createSignal(false);
  const [wordCount, setWordCount] = createSignal(0);
  const [charCount, setCharCount] = createSignal(0);
  let saveTimeout: ReturnType<typeof setTimeout> | null = null;
  let currentDoc: JSONContent | null = null;
  let metadataChanged = false;

  // Snapshot file_path at mount so async operations don't crash if entry disappears
  let filePath = "";

  onMount(async () => {
    const e = activeEntry();
    if (!e) { navigate({ kind: "list" }); return; }
    filePath = e.file_path;
    try {
      const raw = await readFile(filePath);
      const { yaml: y, doc } = parseMdxToEditor(raw);
      setYaml(y);
      setEditorContent(doc);
      currentDoc = doc;
    } catch (err) {
      addToast(`Failed to load file: ${err}`, "error");
    } finally {
      setLoading(false);
    }
  });

  onCleanup(() => {
    if (saveTimeout) clearTimeout(saveTimeout);
  });

  function handleEditorUpdate(doc: JSONContent) {
    currentDoc = doc;
    scheduleSave();
  }

  async function saveToDisk() {
    if (!currentDoc || !filePath) return;
    setSaveState("saving");
    try {
      suppressFsChange();
      const mdx = serializeEditorToMdx(yaml(), currentDoc);
      await writeFile(filePath, mdx);
      setSaveState("saved");
      if (metadataChanged) {
        metadataChanged = false;
        await refreshEntries();
      }
    } catch (e) {
      setSaveState("unsaved");
      addToast(`Save failed: ${e}`, "error");
    }
  }

  function scheduleSave() {
    setSaveState("unsaved");
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      saveToDisk();
    }, 500);
  }

  function handleMetadataChange(field: string, value: string) {
    let yamlStr = yaml();
    const fieldRegex = new RegExp(`^${field}:.*$`, "m");

    if (field === "tags") {
      if (fieldRegex.test(yamlStr)) {
        yamlStr = yamlStr.replace(fieldRegex, `${field}: ${value}`);
      } else {
        yamlStr += `\n${field}: ${value}`;
      }
    } else if (fieldRegex.test(yamlStr)) {
      yamlStr = yamlStr.replace(fieldRegex, `${field}: "${value}"`);
    } else {
      yamlStr += `\n${field}: "${value}"`;
    }

    setYaml(yamlStr);

    // Optimistic store update for immediate UI feedback (DetailBar title, etc.)
    if (field === "tags") {
      try { patchEntry(props.slug, { tags: JSON.parse(value) }); } catch { /* keep existing */ }
    } else if (field === "title" || field === "summary") {
      patchEntry(props.slug, { [field]: value });
    }

    metadataChanged = true;
    scheduleSave();
  }

  /** Re-read the file from disk to sync local yaml after backend mutations. */
  async function syncYamlFromDisk() {
    if (!filePath) return;
    try {
      const raw = await readFile(filePath);
      const { yaml: y } = parseMdxToEditor(raw);
      setYaml(y);
    } catch { /* entry may have been deleted */ }
  }

  async function handlePublish() {
    if (!state.config.repo_path) return;
    setPublishing(true);
    const tid = addToast("Publishing...", "warn");
    await saveToDisk();
    try {
      const updated = await publishEntry(props.slug);
      await syncYamlFromDisk();
      updateToast(tid, `Published: ${updated.title}`, "success");
    } catch (e) {
      updateToast(tid, `Publish failed: ${e}`, "error");
    } finally {
      setPublishing(false);
    }
  }

  async function handleUnpublish() {
    if (!state.config.repo_path) return;
    setShowUnpubConfirm(false);
    setPublishing(true);
    const tid = addToast("Unpublishing...", "warn");
    await saveToDisk();
    try {
      const updated = await unpublishEntry(props.slug);
      await syncYamlFromDisk();
      updateToast(tid, `Unpublished: ${updated.title}`, "success");
    } catch (e) {
      updateToast(tid, `Unpublish failed: ${e}`, "error");
    } finally {
      setPublishing(false);
    }
  }

  async function handleDelete() {
    if (!state.config.repo_path) return;
    setShowDeleteConfirm(false);
    setPublishing(true);
    const tid = addToast("Deleting...", "warn");
    try {
      await deleteEntry(props.slug);
      updateToast(tid, `Deleted: ${props.slug}`, "success");
    } catch (e) {
      updateToast(tid, `Delete failed: ${e}`, "error");
    } finally {
      setPublishing(false);
    }
  }

  // Keyboard shortcuts
  function handleKeyDown(e: KeyboardEvent) {
    if (e.metaKey || e.ctrlKey) {
      if (e.key === "s") {
        e.preventDefault();
        saveToDisk();
      }
      if (e.shiftKey && e.key === "P") {
        e.preventDefault();
        handlePublish();
      }
    }
  }

  onMount(() => {
    document.addEventListener("keydown", handleKeyDown);
  });

  onCleanup(() => {
    document.removeEventListener("keydown", handleKeyDown);
  });

  // External change detection
  createEffect(() => {
    const paths = lastExternalChange();
    if (!paths || !filePath) return;
    if (paths.some((p) => filePath.includes(p) || p.includes(filePath))) {
      setShowExternalBanner(true);
    }
  });

  async function reloadFromDisk() {
    if (!filePath) return;
    try {
      const raw = await readFile(filePath);
      const { yaml: y, doc } = parseMdxToEditor(raw);
      setYaml(y);
      setEditorContent(doc);
      currentDoc = doc;
      setSaveState("saved");
      await refreshEntries();
    } catch (err) {
      addToast(`Failed to reload: ${err}`, "error");
    }
    setShowExternalBanner(false);
    clearExternalChange();
  }

  return (
    <Show when={activeEntry()} fallback={<div class="content-empty"><p>Entry not found.</p></div>} keyed>
      {(entry: ContentEntry) => (
        <>
          <DetailBar title={entry.title}>
            <div class="save-indicator">
              <div class={`save-dot ${saveState()}`} />
              {saveState() === "saved" ? "Saved" : saveState() === "saving" ? "Saving..." : "Unsaved"}
            </div>

            {entry.is_draft ? (
              <button class="btn btn-primary" onClick={handlePublish} disabled={publishing()}>
                {publishing() ? "Publishing..." : "Publish"}
              </button>
            ) : (
              <button class="btn" onClick={() => setShowUnpubConfirm(true)} disabled={publishing()}>
                {publishing() ? "Working..." : "Unpublish"}
              </button>
            )}

            <button class="btn btn-danger" onClick={() => setShowDeleteConfirm(true)} disabled={publishing()}>
              Delete
            </button>
          </DetailBar>

          <Show when={showExternalBanner()}>
            <div class="external-change-banner">
              <span>This file was modified externally.</span>
              <button class="btn btn-primary btn-sm" onClick={reloadFromDisk}>Reload from disk</button>
              <button class="btn btn-sm" onClick={() => { setShowExternalBanner(false); clearExternalChange(); }}>Dismiss</button>
            </div>
          </Show>

          <div class="editor-layout">
            <main class="editor-primary">
              <Show when={!loading() && editorContent()} fallback={<div class="content-empty"><p>Loading...</p></div>}>
                <TipTapEditor content={editorContent()!} onUpdate={handleEditorUpdate} onStatsUpdate={(w, c) => { setWordCount(w); setCharCount(c); }} />
              </Show>
            </main>
            <aside class="editor-sidebar">
              <MetadataPanel entry={entry} onFieldChange={handleMetadataChange} wordCount={wordCount()} charCount={charCount()} />
            </aside>
          </div>

          {showDeleteConfirm() && (
            <ConfirmDialog
              title="Delete content?"
              message={`This will permanently delete "${entry.title}" and all its files.`}
              confirmLabel="Delete"
              danger
              onConfirm={handleDelete}
              onCancel={() => setShowDeleteConfirm(false)}
            />
          )}

          {showUnpubConfirm() && (
            <ConfirmDialog
              title="Unpublish?"
              message={`This will revert "${entry.title}" to draft status.`}
              confirmLabel="Unpublish"
              onConfirm={handleUnpublish}
              onCancel={() => setShowUnpubConfirm(false)}
            />
          )}
        </>
      )}
    </Show>
  );
}

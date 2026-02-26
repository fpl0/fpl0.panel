import { createSignal, createEffect, onMount, onCleanup, Show } from "solid-js";
import type { ContentEntry } from "../lib/commands";
import { readFile, writeFile, DEV_SERVER_ORIGIN } from "../lib/commands";
import { parseMdxFile, serializeMdxFile } from "../lib/mdx";
import { setYamlField, escapeYamlValue } from "../lib/yaml";
import {
  state,
  activeEntry,
  navigate,
  publishEntry,
  unpublishEntry,
  rollbackEntry,
  deleteEntry,
  refreshEntries,
  patchEntry,
  addToast,
  updateToast,
  lastExternalChange,
  clearExternalChange,
  suppressFsChange,
  setNavigationGuard,
  confirmNavigation,
  cancelNavigation,
} from "../lib/store";
import { DetailBar } from "../components/Sidebar";
import { MdxEditor } from "../components/MdxEditor";
import type { EditorMethods, EditorSnapshot } from "../components/MdxEditor";
import { MetadataPanel } from "../components/MetadataPanel";
import { ConfirmDialog } from "../components/ConfirmDialog";

// Persist cursor/scroll position per slug across editor remounts (LRU, max 20)
const SNAPSHOT_MAX = 20;
const editorSnapshots = new Map<string, EditorSnapshot>();

function setSnapshot(slug: string, snap: EditorSnapshot) {
  // Delete first to refresh insertion order for LRU
  editorSnapshots.delete(slug);
  editorSnapshots.set(slug, snap);
  // Evict oldest entries when over limit
  if (editorSnapshots.size > SNAPSHOT_MAX) {
    const oldest = editorSnapshots.keys().next().value;
    if (oldest !== undefined) editorSnapshots.delete(oldest);
  }
}

interface Props {
  slug: string;
}

export function EditorView(props: Props) {
  const [yaml, setYaml] = createSignal("");
  const [unknownImports, setUnknownImports] = createSignal<string[]>([]);
  const [editorContent, setEditorContent] = createSignal<string | null>(null);
  const [saveState, setSaveState] = createSignal<"saved" | "saving" | "unsaved">("saved");
  const [loading, setLoading] = createSignal(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = createSignal(false);
  const [showUnpubConfirm, setShowUnpubConfirm] = createSignal(false);
  const [showRollbackConfirm, setShowRollbackConfirm] = createSignal(false);
  const [showReloadConfirm, setShowReloadConfirm] = createSignal(false);
  const [showPublishConfirm, setShowPublishConfirm] = createSignal(false);
  const [publishing, setPublishing] = createSignal(false);
  const [showExternalBanner, setShowExternalBanner] = createSignal(false);
  const [wordCount, setWordCount] = createSignal(0);
  const [charCount, setCharCount] = createSignal(0);
  const [showPreview, setShowPreview] = createSignal(false);
  const [iframeError, setIframeError] = createSignal(false);
  const [showShortcuts, setShowShortcuts] = createSignal(false);
  let saveTimeout: ReturnType<typeof setTimeout> | null = null;
  let saving = false;
  let pendingResave = false;
  let currentBody: string | null = null;
  let editorMethods: EditorMethods | null = null;
  let iframeRef: HTMLIFrameElement | undefined;

  // Snapshot file_path at mount so async operations don't crash if entry disappears
  let filePath = "";

  onMount(async () => {
    const e = activeEntry();
    if (!e) { navigate({ kind: "list" }); return; }
    filePath = e.file_path;
    setNavigationGuard(true);
    try {
      const raw = await readFile(filePath);
      const { yaml: y, body, unknownImports: ui } = parseMdxFile(raw);
      setYaml(y);
      setUnknownImports(ui);
      setEditorContent(body);
      currentBody = body;
    } catch (err) {
      addToast(`Failed to load file: ${err}`, "error");
    } finally {
      setLoading(false);
    }
  });

  onCleanup(() => {
    // Save editor snapshot for cursor/scroll restoration
    if (editorMethods) {
      const snap = editorMethods.getSnapshot();
      if (snap) setSnapshot(props.slug, snap);
    }
    if (saveTimeout) clearTimeout(saveTimeout);
    setNavigationGuard(false);
    document.title = "fpl0.panel";
  });

  // Window title reflects current entry
  createEffect(() => {
    const entry = activeEntry();
    if (entry) {
      document.title = `${entry.title} — fpl0.panel`;
    }
  });

  // Navigation guard: intercept pending navigation
  createEffect(() => {
    const pending = state.pendingNavigation;
    if (!pending) return;
    if (saveState() === "saved") {
      confirmNavigation();
    }
    // If unsaved, the ConfirmDialog below will show
  });

  function handleEditorUpdate(text: string) {
    currentBody = text;
    scheduleSave();
  }

  async function saveToDisk() {
    if (currentBody == null || !filePath) return;
    if (saving) {
      pendingResave = true;
      return;
    }

    saving = true;
    // Loop handles pending re-saves without recursion
    while (true) {
      setSaveState("saving");
      try {
        suppressFsChange();
        const mdx = serializeMdxFile(yaml(), currentBody, unknownImports());
        await writeFile(filePath, mdx);
        // Only report "saved" if no further changes queued
        if (!pendingResave) {
          setSaveState("saved");
          reloadIframe();
        }
      } catch (e) {
        setSaveState("unsaved");
        addToast(`Save failed: ${e}`, "error");
        break;
      }
      // Refresh entries so has_changed (and metadata) stay current in the store.
      await refreshEntries().catch(() => {});

      if (pendingResave) {
        pendingResave = false;
        continue;
      }
      break;
    }
    saving = false;
  }

  function scheduleSave() {
    setSaveState("unsaved");
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      saveToDisk();
    }, 500);
  }

  function handleMetadataChange(field: string, value: string) {
    const yamlValue = field === "tags" ? value : `"${escapeYamlValue(value)}"`;
    setYaml(setYamlField(yaml(), field, yamlValue));

    // Optimistic store update for immediate UI feedback (DetailBar title, etc.)
    if (field === "tags") {
      try { patchEntry(props.slug, { tags: JSON.parse(value) }); } catch { /* malformed JSON — keep existing tags */ }
    } else if (field === "title" || field === "summary") {
      patchEntry(props.slug, { [field]: value });
    }

    scheduleSave();
  }

  /** Re-read the file from disk to sync local yaml after backend mutations. */
  async function syncYamlFromDisk() {
    if (!filePath) return;
    try {
      const raw = await readFile(filePath);
      const { yaml: y, unknownImports: ui } = parseMdxFile(raw);
      setYaml(y);
      setUnknownImports(ui);
    } catch { /* entry may have been deleted — noop is intentional */ }
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

  async function handleRollback() {
    if (!state.config.repo_path) return;
    setShowRollbackConfirm(false);
    if (saveTimeout) { clearTimeout(saveTimeout); saveTimeout = null; }
    pendingResave = false;
    // Wait for any in-flight save to finish
    if (saving) {
      await new Promise<void>((resolve) => {
        const check = setInterval(() => { if (!saving) { clearInterval(check); resolve(); } }, 50);
      });
    }
    setPublishing(true);
    const tid = addToast("Rolling back...", "warn");
    try {
      const updated = await rollbackEntry(props.slug);
      await syncYamlFromDisk();
      // Also update editor content
      const raw = await readFile(updated.file_path);
      const { body, unknownImports: ui } = parseMdxFile(raw);
      setUnknownImports(ui);
      currentBody = body;
      if (editorMethods) {
        editorMethods.setContent(body);
      } else {
        setEditorContent(body);
      }
      setSaveState("saved");

      updateToast(tid, `Rolled back: ${updated.title}`, "success");
    } catch (e) {
      updateToast(tid, `Rollback failed: ${e}`, "error");
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

  function previewUrl() {
    return `${DEV_SERVER_ORIGIN}/blog/${props.slug}?theme=${state.theme}`;
  }

  function syncIframeTheme() {
    try {
      iframeRef?.contentWindow?.postMessage(
        { type: "setTheme", theme: state.theme },
        DEV_SERVER_ORIGIN,
      );
    } catch { /* cross-origin — ignored */ }
  }

  // Sync theme to iframe whenever the panel theme changes
  createEffect(() => {
    void state.theme; // track reactivity
    syncIframeTheme();
  });

  function reloadIframe() {
    if (iframeRef && showPreview()) {
      setIframeError(false);
      try {
        // Same-origin reload preserves scroll position
        iframeRef.contentWindow?.location.reload();
      } catch {
        // Cross-origin — fall back to src reassignment
        iframeRef.src = previewUrl();
      }
    }
  }

  // Keyboard shortcuts — scoped: Cmd+S works everywhere, others only outside metadata
  function handleKeyDown(e: KeyboardEvent) {
    if (!(e.metaKey || e.ctrlKey)) return;
    if (e.repeat) return;

    const target = e.target as HTMLElement;
    const inSidebar = target.closest(".editor-sidebar") != null;

    if (e.key === "s") {
      e.preventDefault();
      if (saveTimeout) { clearTimeout(saveTimeout); saveTimeout = null; }
      saveToDisk();
      return;
    }

    // Focus shortcuts work from anywhere
    if (e.shiftKey && e.key === "M") {
      e.preventDefault();
      const titleInput = document.querySelector<HTMLElement>(".editor-sidebar .metadata-title-input");
      titleInput?.focus();
      return;
    }
    if (e.shiftKey && e.key === "E") {
      e.preventDefault();
      const cmContent = document.querySelector<HTMLElement>(".cm-content");
      cmContent?.focus();
      return;
    }

    // Don't trigger editor-specific shortcuts from metadata inputs
    if (inSidebar) return;

    if (e.shiftKey && e.key === "P") {
      e.preventDefault();
      setShowPublishConfirm(true);
      return;
    }
    if (e.shiftKey && e.key === "V") {
      e.preventDefault();
      setShowPreview((p) => !p);
      return;
    }
    if (e.shiftKey && e.key === "?") {
      e.preventDefault();
      setShowShortcuts((p) => !p);
      return;
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
    if (paths.some((p) => p === filePath || filePath.endsWith("/" + p) || p.endsWith("/" + filePath.split("/").pop()!))) {
      setShowExternalBanner(true);
    }
  });

  async function reloadFromDisk() {
    if (!filePath) return;
    if (saveTimeout) { clearTimeout(saveTimeout); saveTimeout = null; }
    try {
      const raw = await readFile(filePath);
      const { yaml: y, body, unknownImports: ui } = parseMdxFile(raw);
      setYaml(y);
      setUnknownImports(ui);
      currentBody = body;
      // Imperative content update avoids editor destroy/recreate flicker
      if (editorMethods) {
        editorMethods.setContent(body);
      } else {
        setEditorContent(body);
      }
      setSaveState("saved");
      await refreshEntries();
    } catch (err) {
      addToast(`Failed to reload: ${err}`, "error");
    }
    setShowExternalBanner(false);
    clearExternalChange();
  }

  // Reload with conflict guard
  function handleReloadClick() {
    if (saveState() !== "saved") {
      setShowReloadConfirm(true);
    } else {
      reloadFromDisk();
    }
  }

  return (
    <Show when={activeEntry()} fallback={<div class="content-empty"><p>Entry not found.</p></div>} keyed>
      {(entry: ContentEntry) => (
        <>
          <DetailBar title="">
            <div class="save-indicator" aria-live="polite">
              <div class={`save-dot ${saveState()}`} />
              {saveState() === "saved" ? "Saved" : saveState() === "saving" ? "Saving..." : "Unsaved"}
            </div>

            <button
              class={`btn ${showPreview() ? "btn-active" : ""}`}
              onClick={() => setShowPreview((p) => !p)}
              title="Toggle live preview (Cmd+Shift+V)"
            >
              Preview
            </button>

            {entry.is_draft ? (
              <button class="btn btn-primary" onClick={() => setShowPublishConfirm(true)} disabled={publishing()}>
                {publishing() ? "Publishing..." : "Publish"}
              </button>
            ) : (
              <>
                <Show when={entry.has_changed && entry.published_hash}>
                  <button class="btn" onClick={() => setShowRollbackConfirm(true)} disabled={publishing()}>
                    Rollback
                  </button>
                </Show>
                <Show when={entry.has_changed}>
                  <button class="btn btn-primary" onClick={() => setShowPublishConfirm(true)} disabled={publishing()}>
                    {publishing() ? "Publishing..." : "Publish"}
                  </button>
                </Show>
                <button class="btn" onClick={() => setShowUnpubConfirm(true)} disabled={publishing()}>
                  Unpublish
                </button>
              </>
            )}

            <button class="btn btn-danger" onClick={() => setShowDeleteConfirm(true)} disabled={publishing()}>
              Delete
            </button>
          </DetailBar>

          <Show when={showExternalBanner()}>
            <div class="external-change-banner">
              <span>This file was modified externally.</span>
              <button class="btn btn-primary btn-sm" onClick={handleReloadClick}>Reload from disk</button>
              <button class="btn btn-sm" onClick={() => { setShowExternalBanner(false); clearExternalChange(); setSaveState("unsaved"); scheduleSave(); }} title="Keep your version">Keep mine</button>
            </div>
          </Show>

          <div class={`editor-layout ${showPreview() ? "with-preview" : ""}`}>
            <main class="editor-primary">
              <Show when={!loading() && editorContent() != null} fallback={<div class="content-empty"><p>Loading...</p></div>}>
                <MdxEditor
                  content={editorContent()!}
                  onChange={handleEditorUpdate}
                  onStatsUpdate={(w, c) => { setWordCount(w); setCharCount(c); }}
                  onEditorReady={(methods) => {
                    editorMethods = methods;
                    const snap = editorSnapshots.get(props.slug);
                    if (snap) methods.restoreSnapshot(snap);
                  }}
                />
              </Show>
            </main>

            <Show when={showPreview()}>
              <div class="preview-pane">
                <div class="app-iframe-container">
                  <iframe
                    ref={iframeRef}
                    class="app-iframe"
                    title={`Preview: ${props.slug}`}
                    src={previewUrl()}
                    onError={() => setIframeError(true)}
                    onLoad={(e) => {
                      try {
                        (e.target as HTMLIFrameElement).contentDocument;
                        setIframeError(false);
                      } catch {
                        setIframeError(true);
                      }
                      syncIframeTheme();
                    }}
                  />
                  <Show when={iframeError()}>
                    <div class="app-iframe-fallback">
                      <p>Could not reach the Astro dev server.</p>
                      <p class="system-label">Run <code>bun dev</code> in your project, then toggle Preview.</p>
                    </div>
                  </Show>
                </div>
              </div>
            </Show>

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

          {showRollbackConfirm() && (
            <ConfirmDialog
              title="Rollback changes?"
              message={`This will revert "${entry.title}" to its published state. All local changes will be lost.`}
              confirmLabel="Rollback"
              danger
              onConfirm={handleRollback}
              onCancel={() => setShowRollbackConfirm(false)}
            />
          )}

          {/* Reload conflict warning */}
          {showReloadConfirm() && (
            <ConfirmDialog
              title="Discard local changes?"
              message="You have unsaved edits. Reloading from disk will discard them."
              confirmLabel="Reload"
              danger
              onConfirm={() => { setShowReloadConfirm(false); reloadFromDisk(); }}
              onCancel={() => setShowReloadConfirm(false)}
            />
          )}

          {/* Publish confirmation (keyboard shortcut) */}
          {showPublishConfirm() && (
            <ConfirmDialog
              title="Publish to production?"
              message={`This will publish "${entry.title}" to the live site.`}
              confirmLabel="Publish"
              onConfirm={() => { setShowPublishConfirm(false); handlePublish(); }}
              onCancel={() => setShowPublishConfirm(false)}
            />
          )}

          {/* Navigation guard dialog */}
          {state.pendingNavigation && saveState() !== "saved" && (
            <ConfirmDialog
              title="Discard unsaved changes?"
              message="You have unsaved edits that will be lost if you navigate away."
              confirmLabel="Discard"
              danger
              onConfirm={confirmNavigation}
              onCancel={cancelNavigation}
            />
          )}

          {/* Keyboard shortcut help overlay */}
          {showShortcuts() && (
            <div
              class="shortcuts-overlay"
              role="dialog"
              aria-modal="true"
              aria-label="Keyboard shortcuts"
              onClick={() => setShowShortcuts(false)}
              onKeyDown={(e) => {
                if (e.key === "Escape") { e.preventDefault(); setShowShortcuts(false); return; }
                // Focus trap: cycle within the card
                if (e.key === "Tab") {
                  const card = e.currentTarget.querySelector(".shortcuts-card");
                  if (!card) return;
                  const focusable = card.querySelectorAll<HTMLElement>("button, [href], [tabindex]:not([tabindex=\"-1\"])");
                  if (focusable.length === 0) return;
                  const first = focusable[0];
                  const last = focusable[focusable.length - 1];
                  if (e.shiftKey && document.activeElement === first) {
                    e.preventDefault(); last.focus();
                  } else if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault(); first.focus();
                  }
                }
              }}
            >
              <div class="shortcuts-card" onClick={(e) => e.stopPropagation()}>
                <h3>Keyboard Shortcuts</h3>
                <dl class="shortcuts-list">
                  <div><dt>Cmd+S</dt><dd>Save</dd></div>
                  <div><dt>Cmd+B</dt><dd>Bold</dd></div>
                  <div><dt>Cmd+I</dt><dd>Italic</dd></div>
                  <div><dt>Cmd+E</dt><dd>Inline code</dd></div>
                  <div><dt>Cmd+K</dt><dd>Link</dd></div>
                  <div><dt>Cmd+Shift+X</dt><dd>Strikethrough</dd></div>
                  <div><dt>Cmd+Shift+V</dt><dd>Toggle preview</dd></div>
                  <div><dt>Cmd+Shift+P</dt><dd>Publish</dd></div>
                  <div><dt>Cmd+Shift+M</dt><dd>Focus metadata</dd></div>
                  <div><dt>Cmd+Shift+E</dt><dd>Focus editor</dd></div>
                  <div><dt>Cmd+Shift+?</dt><dd>This help</dd></div>
                </dl>
                <button class="btn btn-sm" ref={(el) => requestAnimationFrame(() => el.focus())} onClick={() => setShowShortcuts(false)}>Close</button>
              </div>
            </div>
          )}
        </>
      )}
    </Show>
  );
}

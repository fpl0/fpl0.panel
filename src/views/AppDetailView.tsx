import { createSignal, createEffect, onMount, onCleanup, Show } from "solid-js";
import type { ContentEntry } from "../lib/commands";
import { openInVscode, readFile, writeFile, DEV_SERVER_ORIGIN } from "../lib/commands";
import { setYamlField, splitFrontmatterFromContent } from "../lib/yaml";
import {
  state,
  activeEntry,
  navigate,
  publishEntry,
  unpublishEntry,
  rollbackEntry,
  deleteEntry,
  refreshEntries,
  addToast,
  updateToast,
  lastExternalChange,
  clearExternalChange,
} from "../lib/store";
import { DetailBar } from "../components/Sidebar";
import { MetadataPanel } from "../components/MetadataPanel";
import { ConfirmDialog } from "../components/ConfirmDialog";

interface Props {
  slug: string;
}

export function AppDetailView(props: Props) {
  const [showDeleteConfirm, setShowDeleteConfirm] = createSignal(false);
  const [showUnpubConfirm, setShowUnpubConfirm] = createSignal(false);
  const [showRollbackConfirm, setShowRollbackConfirm] = createSignal(false);
  const [publishing, setPublishing] = createSignal(false);
  const [iframeError, setIframeError] = createSignal(false);
  const [_saveState, setSaveState] = createSignal<"saved" | "saving" | "unsaved">("saved");

  let iframeRef: HTMLIFrameElement | undefined;

  // Snapshot file_path at mount so async operations don't crash if entry disappears
  let filePath = "";

  onMount(() => {
    const e = activeEntry();
    if (!e) { navigate({ kind: "list" }); return; }
    filePath = e.file_path;
  });

  onCleanup(() => {
    document.title = "fpl0.panel";
  });

  // Item 6 — Window title reflects current entry
  createEffect(() => {
    const entry = activeEntry();
    if (entry) {
      document.title = `${entry.title} — fpl0.panel`;
    }
  });

  // Auto-reload when any file in the app directory changes externally
  createEffect(() => {
    const paths = lastExternalChange();
    if (!paths || !filePath) return;
    // filePath is .../apps/{slug}/index.md — match any file in the parent directory
    const appDir = filePath.replace(/\/index\.md$/, "");
    if (paths.some((p) => p.startsWith(appDir))) {
      reloadIframe();
      refreshEntries().catch(() => {});
      clearExternalChange();
    }
  });

  async function handlePublish() {
    if (!state.config.repo_path) return;
    setPublishing(true);
    const tid = addToast("Publishing...", "warn");
    try {
      const updated = await publishEntry(props.slug);
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
    try {
      const updated = await unpublishEntry(props.slug);
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
    setPublishing(true);
    const tid = addToast("Rolling back...", "warn");
    try {
      const updated = await rollbackEntry(props.slug);
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

  async function handleOpenVscode() {
    const repoPath = state.config.repo_path;
    if (!repoPath) return;
    const appDir = `${repoPath}/src/content/apps/${props.slug}`;
    try {
      await openInVscode(appDir);
    } catch (e) {
      addToast(`Failed to open VS Code: ${e}`, "error");
    }
  }

  async function handleMetadataChange(field: string, value: string) {
    if (!filePath) return;
    setSaveState("saving");
    try {
      const content = await readFile(filePath);
      const parts = splitFrontmatterFromContent(content);
      if (!parts) { setSaveState("unsaved"); return; }

      const yamlValue = field === "tags" ? value : `"${value}"`;
      const newYaml = setYamlField(parts.yaml, field, yamlValue);

      const newContent = `${parts.prefix}${newYaml}${parts.suffix}${parts.rest}`;
      await writeFile(filePath, newContent);
      await refreshEntries();
      setSaveState("saved");
    } catch {
      setSaveState("unsaved");
    }
  }

  function appPreviewUrl() {
    return `${DEV_SERVER_ORIGIN}/apps/${props.slug}?theme=${state.theme}`;
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
    if (iframeRef) {
      setIframeError(false);
      iframeRef.src = appPreviewUrl();
    }
  }

  return (
    <Show when={activeEntry()} fallback={<div class="content-empty"><p>Entry not found.</p></div>} keyed>
      {(entry: ContentEntry) => (
        <>
          <DetailBar title="">
            <button class="btn" onClick={reloadIframe}>
              Reload
            </button>

            <button class="btn" onClick={handleOpenVscode}>
              VS Code
            </button>

            {entry.is_draft ? (
              <button class="btn btn-primary" onClick={handlePublish} disabled={publishing()}>
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
                  <button class="btn btn-primary" onClick={handlePublish} disabled={publishing()}>
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

          <div class="editor-layout">
            <main class="editor-primary app-iframe-container">
              <iframe
                ref={iframeRef}
                class="app-iframe"
                src={appPreviewUrl()}
                onError={() => setIframeError(true)}
                onLoad={(e) => {
                  try {
                    const doc = (e.target as HTMLIFrameElement).contentDocument;
                    if (doc && doc.title === "") {
                      // Heuristic: blank page likely means server isn't running
                    }
                    setIframeError(false);
                  } catch {
                    // Cross-origin is expected for localhost — iframe loaded fine
                    setIframeError(false);
                  }
                  syncIframeTheme();
                }}
              />
              <Show when={iframeError()}>
                <div class="app-iframe-fallback">
                  <p>Could not reach the Astro dev server.</p>
                  <p class="system-label">Run <code>bun dev</code> in your project, then click Reload.</p>
                </div>
              </Show>
            </main>

            <aside class="editor-sidebar">
              <MetadataPanel entry={entry} onFieldChange={handleMetadataChange} />
            </aside>
          </div>

          {showDeleteConfirm() && (
            <ConfirmDialog
              title="Delete content?"
              message={`This will permanently delete "${entry.title}" and all its files. This cannot be undone.`}
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
        </>
      )}
    </Show>
  );
}

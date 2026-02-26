# Editor UX Fixes — Implementation Plan

## Overview
Fix 16 UX issues identified in the editor audit, grouped by file for efficient batching.

## Phase 1: `src/styles/tokens.css` — Theme-reactive syntax tokens (Issue 15)
Add CSS custom properties for syntax highlighting colors in both `:root` and `[data-theme="dark"]` blocks. Currently hardcoded as OKLCH literals in theme.ts.

## Phase 2: `src/lib/codemirror/theme.ts` — Use CSS vars (Issue 15)
Replace 7 hardcoded OKLCH values with `var(--color-syntax-*)` references.

## Phase 3: `src/lib/codemirror/slash-commands.ts` — Cosmetic (Issue 16)
Remove blank line artifact at line 22 left from description field removal.

## Phase 4: `src/lib/codemirror/inline-previews.ts` — Previews (Issues 8, 12)
- **Issue 8**: Show placeholder widget for non-http Figure `src` (relative paths can't resolve in Tauri webview).
- **Issue 12**: Only rebuild decorations when changed ranges intersect Figure/YouTube lines. Use `decorations.map(changes)` for non-preview edits.

## Phase 5: `src/lib/yaml.ts` — Escaping (safety)
Add `escapeYamlValue()` mirroring the Rust backend's `escape_yaml_string`. Frontend currently doesn't escape quotes in title/summary metadata edits.

## Phase 6: `src/components/MdxEditor.tsx` — Core editor (Issues 5, 6, 7, 9, 10, 11, 14)
- **Issue 5**: Add `indentWithTab` to keymap.
- **Issue 6**: Add `codeLanguages` to `markdown()` config (JS/TS/JSX/TSX/HTML/CSS via `LanguageDescription.of`).
- **Issue 7**: Strip MDX/Markdown syntax before word counting.
- **Issue 9**: Save/restore `scrollTop` around programmatic `setContent`.
- **Issue 10**: Expose `getSnapshot()`/`restoreSnapshot()` methods via `onEditorReady`.
- **Issue 11**: Debounce `computeStats` with `requestIdleCallback`.
- **Issue 14**: Add `Cmd+B` (bold), `Cmd+I` (italic), `Cmd+K` (link) as custom keybindings.

## Phase 7: `src/components/MetadataPanel.tsx` — Sidebar (Issues 4, 13)
- **Issue 4**: Auto-size title textarea on mount via `ref` + `requestAnimationFrame`, plus `createEffect` for reactive re-sizing.
- **Issue 13**: Make slug field read-only (no backend rename command exists).

## Phase 8: `src/views/EditorView.tsx` — Orchestration (Issues 1, 2, 3, 10)
- **Issue 1**: Add `ConfirmDialog` before keyboard-triggered publish (`Cmd+Shift+P`).
- **Issue 2**: Scope shortcuts — only allow `Cmd+S` from metadata inputs, skip publish/preview shortcuts.
- **Issue 3**: Replace `if (saving) return` with `pendingResave` flag that re-saves after current completes.
- **Issue 10**: Store/restore `EditorSnapshot` per slug in a module-level `Map`.

## Phase 9: `src/styles/editor.css` — Supporting styles (Issues 8, 13)
- Placeholder preview widget style for non-http figures.
- Read-only slug visual style.

## Dependency Order
1. tokens.css (Phase 1) before theme.ts (Phase 2)
2. MdxEditor.tsx snapshot API (Phase 6) before EditorView.tsx snapshot usage (Phase 8)
3. yaml.ts escaping (Phase 5) before EditorView.tsx metadata handler (Phase 8)
4. All others are independent

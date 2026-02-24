# CLAUDE.md — fpl0.panel

## Project Overview

A high-fidelity management panel for `fpl0.io` built with Tauri and SolidJS. Optimized for intentional editing and publishing of technical MDX content.

## Build and Developer Commands

- **Dev**: `npm run tauri dev` (Runs the Vite dev server and Tauri window)
- **Build**: `npm run tauri build` (Packages the native executable)
- **TS Check**: `npx tsc --noEmit` (TypeScript type-checking)
- **Rust Check**: `cd src-tauri && cargo clippy --all-targets` (Rust linting)

## Architecture Guidelines

### 1. The MDX Transformation Pipeline (`src/lib/mdx/`)

The core of the application is the AST transformation engine in `src/lib/mdx/`. It handles bidirectional conversion between Markdown/MDX (MDAST) and ProseMirror JSON (TipTap):

- **`parser.ts`**: `remark-mdx` parses raw files. Custom logic maps `mdxJsxFlowElement` and `mdxJsxTextElement` nodes to Tiptap-native nodes or the `passthroughBlock`.
- **`serializer.ts`**: The editor's JSON is serialized back to Markdown + JSX strings. Uses a typed `attr()` helper for safe attribute access.
- **`imports.ts`**: Dynamically generates import statements based on component usage.
- **`frontmatter.ts`**: Splits/reassembles YAML frontmatter from MDX files.
- **`types.ts`** / **`utils.ts`**: Shared MDAST type definitions and JSX serialization helpers.

### 2. Fine-Grained Reactivity (SolidJS)

- Use **Signals** for local UI state.
- TipTap is integrated imperatively in `onMount` because it lacks native SolidJS bindings. Use the `editorInstance` signal to expose the editor to floating components like the `BubbleToolbar`.
- Central state is modularized in `src/lib/stores/` (re-exported via `src/lib/store.ts`):
  - **`state.ts`**: Core reactive store (`AppState`), view routing, config.
  - **`navigation.ts`**: View transitions with an unsaved-changes guard (`pendingNavigation`).
  - **`content.ts`**: CRUD operations (list, publish, unpublish, delete) via Tauri IPC.
  - **`notifications.ts`**: Toast system with auto-dismiss, update-in-place, and early dismissal.
  - **`watcher.ts`**: File-system change listener with suppression window to avoid self-triggered events.
  - **`config.ts`** / **`theme.ts`** / **`search.ts`**: Config persistence, theme toggle, search modal state.

### 3. Custom Editor Nodes (`src/components/editor/`)

Every complex MDX component (Figure, mermaid, LiteYouTube, Table) has a corresponding Tiptap Node implementation. 

- **Atoms**: These nodes should be `atom: true` to prevent internal cursor focus unless explicitly editing.
- **NodeViews**: Custom UI for these components is built with standard DOM APIs to avoid overhead within the ProseMirror view. **Never use `innerHTML`** — always use `document.createElement` / `document.createElementNS` to construct SVG icons and other markup.

### 4. Rust Backend (`src-tauri/src/`)

The Tauri backend is split into focused modules:

- **`commands.rs`**: Tauri IPC command handlers (the bridge between frontend and backend).
- **`content.rs`**: Content CRUD — scanning directories, creating posts/apps, deleting entries.
- **`frontmatter.rs`**: YAML frontmatter parsing, field extraction, and manipulation via regex.
- **`git.rs`**: Git CLI wrappers for add/commit/push and status checks.
- **`config.rs`**: App config persistence (JSON in the platform app-data directory).
- **`security.rs`**: Path traversal prevention (`ensure_within`) and YAML string escaping.
- **`types.rs`**: Shared data types serialized across the IPC boundary.

All Rust error paths should use `format!("Failed to <action>: {e}")` for contextual error messages, not bare `.map_err(|e| e.to_string())`.

### 5. Accessibility Patterns

- **Dialogs**: Use `role="alertdialog"`, `aria-modal="true"`, `aria-labelledby`/`aria-describedby`. Include a focus trap (Tab cycling) and auto-focus the cancel button.
- **Form fields**: Use `<label for="id">` with matching `id` on inputs, or `aria-label` for inputs without visible labels.
- **Listboxes**: Use `role="combobox"` on the input, `role="listbox"` on the list, `role="option"` on items, and `aria-activedescendant` for keyboard navigation.

## Design Principles: The "True Ledger"

### 1. Dual-Modular Scale

The interface uses two distinct mathematical ratios to ensure visual balance:

- **Content Ratio (1.25 - Major Third)**: Applied to prose and headings in the editor and guide.
- **UI Ratio (1.125 - Major Second)**: Applied to interface chrome, metadata panels, and system labels.
- **The Floor**: No text should ever render below `12px` (`var(--font-size-micro)`).

### 2. Vertical Rhythm

A strict **24px baseline grid** governs all block-level elements. All height, margin, and padding values should be derived from `var(--grid)` (4px) and multiples of the baseline to ensure the interface feels stable and professional.

### 3. Color Synthesis (OKLCH)

Colors are defined in the OKLCH space for perceptual uniformity.

- **Canvas**: Warm paper tones (`--color-bg`) optimized for long writing sessions.
- **Accents**: High-contrast teals and teals-grays (`--color-primary`) for interactive feedback.
- **Theming**: Dark mode shifts the luminance and chroma values while preserving the same perceptual relationships.

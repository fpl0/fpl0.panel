# CLAUDE.md — fpl0.panel

## Project Overview

A high-fidelity management panel for `fpl0.io` built with Tauri and SolidJS. Optimized for intentional editing and publishing of technical MDX content.

## Build and Developer Commands

- **Dev**: `npm run tauri dev` (Runs the Vite dev server and Tauri window)
- **Build**: `npm run tauri build` (Packages the native executable)
- **Check**: `npm run (bun) tsc --noEmit` (Type-checking)

## Architecture Guidelines

### 1. The MDX Transformation Pipeline (`src/lib/mdx.ts`)

The core of the application is the AST transformation engine. It handles bidirectional conversion between Markdown/MDX (MDAST) and ProseMirror JSON (TipTap):

- **Parse**: `remark-mdx` parses the raw file. Custom logic maps `mdxJsxFlowElement` and `mdxJsxTextElement` nodes to Tiptap-native nodes or the `passthroughBlock`.
- **Serialize**: The editor's JSON is serialized back to Markdown + JSX strings. Imports are dynamically generated based on component usage to keep files clean.

### 2. Fine-Grained Reactivity (SolidJS)

- Use **Signals** for local UI state.
- TipTap is integrated imperatively in `onMount` because it lacks native SolidJS bindings. Use the `editorInstance` signal to expose the editor to floating components like the `BubbleToolbar`.
- Central state (file listings, toasts, active entry) is managed in `src/lib/store.ts`.

### 3. Custom Editor Nodes (`src/components/editor/`)

Every complex MDX component (Figure, mermaid, LiteYouTube, Table) has a corresponding Tiptap Node implementation. 

- **Atoms**: These nodes should be `atom: true` to prevent internal cursor focus unless explicitly editing.
- **NodeViews**: Custom UI for these components is built with standard DOM APIs to avoid overhead within the ProseMirror view.

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

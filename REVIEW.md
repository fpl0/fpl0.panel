# Codebase Review — fpl0.panel

Deep analysis of the Tauri + SolidJS management panel. Issues are organized by severity and domain. Each finding includes the file, line numbers, and a concrete fix or recommendation.

---

## Table of Contents

1. [Security](#1-security)
2. [Memory Leaks & Cleanup](#2-memory-leaks--cleanup)
3. [Correctness & Logic Bugs](#3-correctness--logic-bugs)
4. [Error Handling](#4-error-handling)
5. [Reactivity & State Management](#5-reactivity--state-management)
6. [Accessibility](#6-accessibility)
7. [Performance](#7-performance)
8. [Type Safety](#8-type-safety)
9. [Code Style & Guideline Compliance](#9-code-style--guideline-compliance)
10. [Architecture & Structural Suggestions](#10-architecture--structural-suggestions)

---

## 1. Security

### 1.1 CRITICAL — `read_file`/`write_file` bypass path validation when `repo_path` is unset

**File:** `src-tauri/src/commands.rs:54-73`

```rust
pub fn read_file(app: tauri::AppHandle, path: String) -> Result<String, String> {
    let cfg = config::load_config(&app);
    if let Some(ref repo_path) = cfg.repo_path {
        security::ensure_within(target, base)?;
    }
    // If repo_path is None, ANY file on the system is readable/writable
    fs::read_to_string(&path).map_err(|e| format!("Failed to read {}: {}", path, e))
}
```

The `ensure_within` check only runs when `repo_path` is configured. On first launch or after config corruption, arbitrary files are accessible.

**Fix:** Return an error when `repo_path` is `None`:

```rust
let repo_path = cfg.repo_path.as_deref()
    .ok_or("Repository path not configured")?;
let base = Path::new(repo_path);
security::ensure_within(Path::new(&path), base)?;
```

### 1.2 HIGH — No slug validation in `create_post` / `create_app`

**File:** `src-tauri/src/content.rs:64-121`

User-supplied slugs are used directly in file paths without validation:

```rust
let slug = if args.slug.is_empty() {
    to_slug(&args.title)
} else {
    args.slug  // Unvalidated — could be "../../etc/passwd"
};
```

While `delete_content` validates against `..` and `/`, `create_post` does not.

**Fix:** Always normalize through `to_slug()` or validate against a strict pattern (`^[a-z0-9][a-z0-9-]*$`).

### 1.3 MEDIUM — GraphQL string interpolation in Cloudflare queries

**File:** `src-tauri/src/cloudflare.rs:144-183`

`zone_id`, `start_date`, and `end_date` are interpolated directly into GraphQL query strings via `format!()`. Although these values are currently derived from config/computation, any future code path that allows user input to flow into these fields enables GraphQL injection.

**Fix:** Use parameterized GraphQL variables instead of string interpolation.

### 1.4 MEDIUM — Plaintext credential storage

**File:** `src-tauri/src/types.rs:11-15`

Cloudflare API tokens are stored in plaintext in `config.json`. If the system is compromised, tokens are immediately exposed.

**Recommendation:** Use platform credential storage (macOS Keychain, Windows Credential Manager, Linux `libsecret`/`secret-service`).

### 1.5 LOW — SSRF check is incomplete in `check_url_health`

**File:** `src-tauri/src/commands.rs:259-274`

The URL blocklist checks common private ranges but misses:
- `169.254.x.x` (link-local)
- `172.16.0.0/12` (private range)
- `fc00::/7` (IPv6 ULA)
- DNS rebinding (resolve the hostname and check the IP, not just the URL string)

---

## 2. Memory Leaks & Cleanup

### 2.1 CRITICAL — SlashCommandMenu: orphaned keyboard listeners

**File:** `src/components/editor/SlashCommandMenu.ts:506,509,536,550`

A `document.addEventListener("keydown", handleMenuKeyDown, true)` is added each time the menu opens. If the menu DOM is removed without going through the close/escape path, the listener stays attached. Rapid `"/"` typing accumulates phantom listeners.

**Fix:** Use an `AbortController` scoped to the menu lifecycle:

```typescript
const ac = new AbortController();
document.addEventListener("keydown", handleMenuKeyDown, true, { signal: ac.signal });
// On cleanup: ac.abort();
```

### 2.2 HIGH — SlashCommandMenu: infinite `requestAnimationFrame` loop

**File:** `src/components/editor/SlashCommandMenu.ts:547-571`

`updateFixedPosition()` calls `requestAnimationFrame(updateFixedPosition)` unconditionally. It only stops when `!anchor.isConnected`, which relies on DOM timing. No cancel path exists when the ProseMirror decoration is destroyed.

**Fix:** Store the frame ID and cancel on menu teardown:

```typescript
let rafId: number;
function updateFixedPosition() { /* ... */ rafId = requestAnimationFrame(updateFixedPosition); }
// On cleanup: cancelAnimationFrame(rafId);
```

### 2.3 HIGH — FigureNode: no cleanup when node is destroyed during editing

**File:** `src/components/editor/FigureNode.ts:43-296`

An `AbortController` manages edit-mode event listeners, but if the node is unmounted while editing (e.g., user deletes the figure), the abort never fires. The NodeView return value has no `destroy()` callback.

**Fix:** Add a `destroy()` method to the NodeView return:

```typescript
return { dom, update(n) { ... }, destroy() { editAbort?.abort(); } };
```

### 2.4 MEDIUM — CodeBlockNode: `select.addEventListener("change")` never cleaned up

**File:** `src/components/editor/CodeBlockNode.ts:176-186`

The language select dropdown has a change listener with no cleanup.

### 2.5 MEDIUM — Watcher `unlistenFn` not cleaned up on app exit

**File:** `src/lib/stores/watcher.ts`

`setupWatcher` stores `unlistenFn` as module-level state, but there's no `teardownWatcher()` called when the app unmounts. The Tauri event listener can outlive the SolidJS component tree.

---

## 3. Correctness & Logic Bugs

### 3.1 HIGH — TOCTOU race in publish/unpublish

**File:** `src-tauri/src/commands.rs:95-168`

The publish flow reads a file, modifies frontmatter in memory, then writes it back. Between read and write, the file can be modified by the editor, the file watcher, or an external tool. This causes lost updates.

**Fix:** Use file locking (`fs2` crate) or atomic write-and-rename:

```rust
use fs2::FileExt;
let file = File::open(&file_path)?;
file.lock_exclusive()?;
// read, modify, write
file.unlock()?;
```

### 3.2 HIGH — Parser: unsafe non-null assertion on `summaryChild.children`

**File:** `src/lib/mdx/parser.ts:208`

```typescript
summary = extractText(summaryChild.children![0]);
```

The `!` assertion crashes if `children` is `undefined` or empty.

**Fix:**

```typescript
const firstChild = summaryChild.children?.[0];
if (firstChild) summary = extractText(firstChild);
```

### 3.3 HIGH — Serializer: assumes 3-level table cell nesting

**File:** `src/lib/mdx/serializer.ts:152-159`

```typescript
const headerCells = (headerRow?.content ?? []).map((cell) =>
  serializeInline(cell.content?.[0]?.content ?? []),
);
```

Only the first child of each cell is serialized, and only its first child's content. Multi-paragraph cells lose content silently.

**Fix:** Iterate all cell children:

```typescript
const headerCells = (headerRow?.content ?? []).map((cell) =>
  (cell.content ?? []).map(n => serializeNode(n, "")).join(""),
);
```

### 3.4 MEDIUM — Index.ts: multi-line imports not detected

**File:** `src/lib/mdx/index.ts:76-82`

The import detection regex requires `from "..."` and the closing quote on the same line, breaking for multi-line imports like:

```javascript
import {
  Component
} from "path";
```

### 3.5 MEDIUM — External change path matching is bidirectional and overly broad

**File:** `src/views/EditorView.tsx:277`

```typescript
if (paths.some((p) => filePath.includes(p) || p.includes(filePath))) {
```

Using bidirectional `includes` causes false positives. If `filePath` is `/a/b.mdx` and a changed path is `/a/b.mdx.bak`, the banner triggers incorrectly.

**Fix:** Compare normalized absolute paths with `===`.

### 3.6 MEDIUM — `suppressFsChange` window can expire before write completes

**File:** `src/lib/stores/watcher.ts:12-13`, `src/views/EditorView.tsx:125`

The 1s suppression window is a fixed `Date.now() + 1000` set *before* the async `writeFile` call. On slow I/O, the write can take >1s, and the watcher fires a false "external change" banner.

**Fix:** Extend suppression until after the write completes, or use a counter-based approach instead of a timestamp.

---

## 4. Error Handling

### 4.1 MEDIUM — 14 instances of bare `.map_err(|e| e.to_string())`

Per CLAUDE.md: *"All Rust error paths should use `format!("Failed to <action>: {e}")` for contextual error messages."*

Violations found in:
- `src-tauri/src/commands.rs` — lines 98, 136, 161, 174, 185
- `src-tauri/src/devserver.rs` — lines 68, 92
- `src-tauri/src/watcher.rs` — line 23

### 4.2 MEDIUM — Serializer silently drops unknown node types

**File:** `src/lib/mdx/serializer.ts:193`

```typescript
default:
  return "";
```

Unknown ProseMirror nodes serialize to empty strings with no warning. Content is silently lost.

**Fix:** Add a console.warn (or, since Biome disallows `console`, a debug-mode logging mechanism):

```typescript
default:
  if (import.meta.env.DEV) {
    // biome-ignore lint/suspicious/noConsole: dev-only debug logging
    console.warn(`[mdx-serializer] Unknown node type: "${node.type}"`);
  }
  return "";
```

### 4.3 MEDIUM — No ErrorBoundary wrapping EditorView

**File:** `src/views/EditorView.tsx`

TipTapEditor has an ErrorBoundary, but the surrounding EditorView (metadata panel, save logic, file I/O, publish operations) does not. Any throw crashes the entire view with no recovery.

### 4.4 LOW — Regex `.unwrap()` on dynamically constructed patterns

**File:** `src-tauri/src/frontmatter.rs:136,147`

```rust
let re = Regex::new(&pattern).unwrap();
```

While the input is `regex::escape(key)` (safe), using `.expect("...")` or `.map_err()` follows defensive practice.

---

## 5. Reactivity & State Management

### 5.1 MEDIUM — `suppressNextUpdate` flag is imperative, can race

**File:** `src/components/TipTapEditor.tsx:67,182-206`

```typescript
let suppressNextUpdate = false;
```

This boolean flag is set before calling `editor.commands.setContent()` and checked in the `onUpdate` callback. If multiple `setContentSilently` calls happen in quick succession, only the first suppression fires.

**Fix:** Use a counter instead of a boolean:

```typescript
let suppressCount = 0;
// In setContentSilently: suppressCount++;
// In onUpdate: if (suppressCount > 0) { suppressCount--; return; }
```

### 5.2 MEDIUM — ContentListView uses global mutable cache that survives remounts

**File:** `src/views/ContentListView.tsx:13-17`

```typescript
let lastHealthPoll = 0;
let cachedDevHealth: HealthStatus | null = null;
let cachedProdHealth: HealthStatus | null = null;
```

Module-level mutable state persists across component mounts. Navigating away and back uses potentially stale data. Multiple quick mounts could create overlapping intervals.

**Recommendation:** Consider a pattern similar to `cfcache.ts` (explicit TTL-based cache with callback update) which is already well-implemented.

### 5.3 LOW — LibraryView performs `setState` during component initialization

**File:** `src/views/LibraryView.tsx:28-42`

```typescript
const viewState = state.view.kind === "library" ? state.view : null;
if (initialTag || viewState?.status) {
  setState("view", { kind: "library" }); // Side effect during render
}
```

**Fix:** Move into `onMount`.

### 5.4 LOW — `View` type doesn't include `tag`/`status` for library view

**File:** `src/lib/stores/state.ts:7`

The library view type is `{ kind: "library" }` but `LibraryView` accesses `state.view.tag` and `state.view.status`, which aren't in the discriminated union. This only works because of TypeScript's structural typing being bypassed through the store.

**Fix:**

```typescript
| { kind: "library"; tag?: string; status?: "draft" | "published" | "changed" }
```

---

## 6. Accessibility

### 6.1 MEDIUM — ConfirmDialog lacks a proper focus trap

**File:** `src/components/ConfirmDialog.tsx:23-51`

CLAUDE.md requires focus traps for dialogs. The current implementation handles Tab cycling but can still be escaped via browser mechanisms. A robust focus trap should use `MutationObserver` or intercept all focus-changing events.

### 6.2 MEDIUM — SearchModal `aria-activedescendant` uses unstable index-based IDs

**File:** `src/components/SearchModal.tsx:96,121-126`

Options use `id="search-result-${i()}"` where `i` is the rendered index. When the list filters, indices shift, making screen reader announcements inconsistent.

**Fix:** Use stable slug-based IDs: `id="search-result-${entry.slug}"`.

### 6.3 LOW — TopBar navigation buttons lack `aria-current`

**File:** `src/components/Sidebar.tsx:18-30`

Active state is CSS-only (`.active` class). Screen reader users have no indication of which view is current.

**Fix:** Add `aria-current={isActive("list") ? "page" : undefined}` to nav buttons.

---

## 7. Performance

### 7.1 MEDIUM — `list_content` re-scans directories and parses frontmatter on every call

**File:** `src-tauri/src/content.rs:12-61`

Every `listContent` IPC call does a full directory scan, reads every file, parses all YAML frontmatter, and (for apps) computes recursive directory hashes. With 100+ entries, this is noticeable.

**Recommendation:** Cache entries keyed by file mtime. Only re-parse files whose mtime changed since the last scan.

### 7.2 MEDIUM — `calculate_directory_hash` reads entire file contents into memory

**File:** `src-tauri/src/frontmatter.rs:42-74`

The hash function reads every file in an app directory into memory. Large app bundles with images/binaries cause memory spikes.

**Recommendation:** Stream files through the hasher instead of buffering, or skip binary files and hash only text content + file metadata.

### 7.3 LOW — SlashCommandMenu rebuilds entire DOM on every ProseMirror state update

**File:** `src/components/editor/SlashCommandMenu.ts:369-579`

The `decorations()` function creates a fresh `Decoration.widget()` on every state change, rebuilding the entire menu DOM. For 20+ items this is wasteful.

**Recommendation:** Reuse the menu DOM and update content in-place, or memoize the filtered item list.

---

## 8. Type Safety

### 8.1 MEDIUM — `MdastNode` has catch-all index signature

**File:** `src/lib/mdx/types.ts:17`

```typescript
export interface MdastNode {
  type: string;
  // ...
  [key: string]: unknown;
}
```

The `[key: string]: unknown` makes typos like `node.heigh` (instead of `node.height`) silently return `undefined`. Consider using explicit optional properties or discriminated unions per node type.

### 8.2 MEDIUM — `MdastAttribute.value` type is ambiguous

**File:** `src/lib/mdx/types.ts:20-24`

```typescript
value: string | { value: string } | null;
```

There's no discriminant field. Code must use `typeof` checks. A discriminated union would be safer:

```typescript
type MdastAttrValue =
  | string
  | { type: "mdxJsxAttributeValueExpression"; value: string }
  | null;
```

### 8.3 LOW — `patchEntry` accepts any `Partial<ContentEntry>`

**File:** `src/lib/stores/content.ts:61-65`

Could accidentally patch read-only fields like `file_path` or `content_type`. Restrict to mutable fields:

```typescript
type PatchableFields = Pick<ContentEntry, "title" | "summary" | "tags">;
export function patchEntry(slug: string, patch: Partial<PatchableFields>) { ... }
```

---

## 9. Code Style & Guideline Compliance

### 9.1 `innerHTML = ""` violation in FigureNode

**File:** `src/components/editor/FigureNode.ts:115`

CLAUDE.md explicitly prohibits `innerHTML`. Replace with:

```typescript
while (figcaption.firstChild) figcaption.removeChild(figcaption.firstChild);
```

### 9.2 `!important` in editor CSS

**File:** `src/styles/editor.css:84`

```css
overflow: visible !important;
```

This fights TipTap's defaults via brute force. Increase specificity instead:

```css
.editor-content .tiptap.ProseMirror { overflow: visible; }
```

### 9.3 JSX escaping function conflates HTML entities with JSX string escaping

**File:** `src/lib/mdx/utils.ts:3-12`

`escapeJsxAttrValue` uses HTML entities (`&amp;`, `&lt;`, `&#123;`) for JSX attribute values. In JSX string contexts, these should be JavaScript string escapes or left unescaped. The current approach could produce `src="image&#123;1&#125;.png"` instead of `src="image{1}.png"`.

### 9.4 Inconsistent empty content handling across parser

**File:** `src/lib/mdx/parser.ts:40,72,219,234,246,274`

Some nodes return no `content` field, some return `[]`, some return `[{ type: "paragraph" }]`. This should be standardized: empty content should always be `[{ type: "paragraph" }]` for block nodes that expect children.

---

## 10. Architecture & Structural Suggestions

### 10.1 Testing infrastructure is completely absent

There are no test files, no test runner configuration, and no CI/CD pipeline. For a codebase with a complex AST transformation pipeline (MDX), file system operations, and security-sensitive code, this is the highest-leverage improvement available.

**Recommended first tests:**
- MDX parser round-trip tests (parse → serialize → parse should be stable)
- `ensure_within` with adversarial paths (`../`, symlinks, null bytes)
- Frontmatter manipulation (set/get/insert field)
- Slug validation edge cases

### 10.2 Centralize keyboard shortcut management

**Files:** `src/App.tsx:27-72`, `src/views/EditorView.tsx:251-263`, `src/components/SearchModal.tsx:64-68`

Three separate `document.addEventListener("keydown", ...)` handlers create event contention. A centralized keyboard manager (or at minimum, a shared utility that coordinates priority and event.stopPropagation) would prevent conflicts and make shortcuts discoverable.

### 10.3 Consider extracting the `cfcache.ts` pattern into a generic cache utility

The stale-while-revalidate pattern in `src/lib/stores/cfcache.ts` is well-implemented. The ad-hoc caching in `ContentListView.tsx` (module-level vars) would benefit from using the same pattern.

### 10.4 Add `destroy()` to all custom NodeViews

Only some nodes clean up resources. Establish a convention that every `addNodeView` return object includes a `destroy()` callback, even if it's a no-op, to make the contract explicit and reviewable.

### 10.5 Consider error boundaries at the view level

Currently only `TipTapEditor` has an `ErrorBoundary`. Adding one to `AppShell` (wrapping the main view switch) and individual views would prevent full-app crashes and allow graceful recovery.

---

## Summary by Priority

| Priority | Count | Key Items |
|----------|-------|-----------|
| Critical | 3 | Path validation bypass, orphaned event listeners, TOCTOU race |
| High | 6 | Slug validation, parser crash, table serialization, memory leaks (FigureNode, SlashMenu RAF), missing ErrorBoundary |
| Medium | 15 | Error message format, GraphQL injection, multi-line imports, focus trap, suppression timing, content list performance, type ambiguity |
| Low | 10 | View type gaps, `aria-current`, `patchEntry` typing, regex unwrap, LibraryView setState timing |

**Highest-leverage changes:**
1. Add mandatory path validation (security)
2. Add a test suite for the MDX pipeline (correctness)
3. Fix SlashCommandMenu memory leaks (stability)
4. Standardize Rust error messages (developer experience)
5. Add view-level ErrorBoundaries (resilience)

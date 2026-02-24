/**
 * TopBar — Matches blog's site-header-bar pattern:
 * fpl0_ logo on left, navigation links + theme toggle on right.
 * Uses blog's exact nav separators, mono-brand font, and rotating sun/moon.
 */
import type { JSX } from "solid-js";
import { state, navigate, toggleSearch, toggleTheme } from "../lib/store";

export function TopBar() {
  const isActive = (kind: string) => state.view.kind === kind;

  return (
    <header class="top-bar">
      <button class="top-bar-brand" onClick={() => navigate({ kind: "list" })}>
        fpl0<span class="cursor">_</span>
      </button>

      <nav class="top-bar-nav">
        <button
          class={`nav-link ${isActive("list") ? "active" : ""}`}
          onClick={() => navigate({ kind: "list" })}
        >
          content
        </button>
        <span class="nav-sep">/</span>
        <button
          class={`nav-link ${isActive("create") ? "active" : ""}`}
          onClick={() => navigate({ kind: "create" })}
        >
          new
        </button>
        <span class="nav-sep">/</span>
        <button
          class={`nav-link ${isActive("settings") ? "active" : ""}`}
          onClick={() => navigate({ kind: "settings" })}
        >
          settings
        </button>

        <span class="nav-sep">/</span>
        <button
          class="nav-link"
          onClick={toggleSearch}
        >
          search<kbd class="nav-kbd">⌘K</kbd>
        </button>

        <ThemeToggleButton />
      </nav>
    </header>
  );
}

/**
 * DetailBar — Three-column grid matching blog's app-shell-bar:
 * Back link | Title (center) | Actions (right)
 */
interface DetailBarProps {
  title: string;
  children?: JSX.Element;
}

export function DetailBar(props: DetailBarProps) {
  return (
    <div class="detail-bar">
      <div class="detail-bar-left">
        <button class="back-link" onClick={() => navigate({ kind: "list" })} aria-label="Back to content list">
          &larr; content
        </button>
      </div>
      <div class="detail-bar-center">
        {props.title}
      </div>
      <div class="detail-bar-right">
        {props.children}
      </div>
    </div>
  );
}

/**
 * ThemeToggle — Rotating sun/moon matching blog's ThemeToggle.astro exactly.
 */
function ThemeToggleButton() {
  return (
    <button class="theme-toggle" onClick={toggleTheme} aria-label="Toggle dark/light theme">
      <svg
        class="icon icon-sun"
        viewBox="0 0 24 24"
        fill="none"
      >
        <circle cx="12" cy="12" r="5" />
        <line x1="12" y1="1" x2="12" y2="3" />
        <line x1="12" y1="21" x2="12" y2="23" />
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
        <line x1="1" y1="12" x2="3" y2="12" />
        <line x1="21" y1="12" x2="23" y2="12" />
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
      </svg>
      <svg
        class="icon icon-moon"
        viewBox="0 0 24 24"
        fill="none"
      >
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    </button>
  );
}

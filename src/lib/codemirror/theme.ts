import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";

/**
 * "Invisible editor" theme — no gutters, no active line highlight,
 * clean writing surface using the design system's fonts and colors.
 */
export const editorTheme = EditorView.theme({
  "&": {
    fontSize: "var(--font-size-base)",
    fontFamily: "var(--font-mono)",
    color: "var(--color-text)",
    backgroundColor: "transparent",
  },
  "&.cm-focused": {
    outline: "none",
  },
  ".cm-scroller": {
    fontFamily: "var(--font-mono)",
    lineHeight: "var(--line-height-relaxed)",
  },
  ".cm-content": {
    caretColor: "var(--color-primary)",
    padding: "0",
  },
  ".cm-line": {
    padding: "0",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--color-primary)",
    borderLeftWidth: "var(--space-0-5)",
  },
  ".cm-matchingBracket": {
    backgroundColor: "var(--color-highlight)",
    outline: "var(--space-px) solid var(--color-border)",
  },
  ".cm-nonmatchingBracket": {
    backgroundColor: "var(--color-warn-surface)",
    outline: "var(--space-px) solid var(--color-error)",
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
    background: "var(--color-selection-bg, oklch(0.85 0.1 85))",
  },
  // No active line highlight — invisible editor
  ".cm-activeLine": {
    backgroundColor: "transparent",
  },
  // No gutters — they're not added, but just in case
  ".cm-gutters": {
    display: "none",
  },
  // Placeholder
  ".cm-placeholder": {
    color: "var(--color-text-muted)",
    fontStyle: "italic",
  },
  // Search matches
  ".cm-searchMatch": {
    backgroundColor: "var(--color-highlight)",
    outline: "var(--space-px) solid var(--color-primary)",
  },
  ".cm-selectionMatch": {
    backgroundColor: "var(--color-syntax-selection-match)",
  },
  // Autocomplete tooltip (slash commands)
  ".cm-tooltip": {
    backgroundColor: "var(--color-surface)",
    border: "var(--ui-border)",
    borderRadius: "var(--radius-xl)",
    boxShadow: "var(--shadow-lg)",
    overflow: "clip",
  },
  ".cm-tooltip-autocomplete": {
    minWidth: "320px",
    overflow: "hidden auto",
    animation: "slash-menu-in var(--duration-normal) var(--ease-out) both",
  },
  // Keyboard hint footer
  ".cm-tooltip-autocomplete::after": {
    content: "'↑↓ navigate  ⏎ insert  esc close'",
    display: "block",
    padding: "var(--space-2) var(--space-3)",
    fontFamily: "var(--font-sans)",
    fontSize: "var(--font-size-micro)",
    color: "var(--color-text-muted)",
    borderTop: "var(--space-px) solid var(--color-border-subtle)",
    textAlign: "center",
    letterSpacing: "var(--letter-spacing-slight)",
    opacity: "0.5",
  },
  ".cm-tooltip.cm-tooltip-autocomplete > ul": {
    maxHeight: "min(480px, 60vh)",
    fontFamily: "var(--font-sans)",
    fontSize: "var(--font-size-sm)",
    padding: "var(--space-3)",
  },
  ".cm-tooltip.cm-tooltip-autocomplete > ul > li": {
    display: "flex",
    alignItems: "center",
    padding: "var(--space-2) var(--space-3)",
    borderRadius: "var(--radius-md)",
    margin: "var(--space-0-5) 0",
    transition: "background-color var(--duration-fast) var(--ease-out)",
  },
  ".cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]": {
    backgroundColor: "var(--color-highlight)",
  },
  ".cm-tooltip-autocomplete > ul > li[aria-selected] .cm-completionLabel": {
    color: "var(--color-primary)",
  },

  // Icon container
  ".cm-slash-icon": {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "calc(var(--space-7))",
    height: "calc(var(--space-7))",
    borderRadius: "var(--radius-md)",
    backgroundColor: "var(--color-surface-raised)",
    color: "var(--color-text-muted)",
    marginRight: "var(--space-2)",
    flexShrink: "0",
    transition:
      "color var(--duration-fast) var(--ease-out), background-color var(--duration-fast) var(--ease-out)",
  },
  ".cm-tooltip-autocomplete > ul > li[aria-selected] .cm-slash-icon": {
    color: "var(--color-primary)",
    backgroundColor: "var(--color-highlight)",
  },

  ".cm-completionLabel": {
    fontFamily: "var(--font-sans)",
    fontWeight: "600",
  },
  ".cm-completionDetail": {
    fontFamily: "var(--font-mono-brand)",
    fontSize: "var(--font-size-micro)",
    fontStyle: "normal",
    marginLeft: "var(--space-2)",
    textTransform: "uppercase",
    letterSpacing: "var(--letter-spacing-loose)",
    color: "var(--color-text-muted)",
    backgroundColor: "var(--color-surface-raised)",
    borderRadius: "var(--radius-full)",
    padding: "var(--space-px) var(--space-2)",
    lineHeight: "var(--line-height-tight)",
    opacity: "0.8",
  },
  ".cm-completionMatchedText": {
    color: "var(--color-primary)",
    textDecoration: "none",
    fontWeight: "700",
  },

  // Section headers in autocomplete
  ".cm-completionSection": {
    fontFamily: "var(--font-mono-brand)",
    fontSize: "var(--font-size-micro)",
    textTransform: "uppercase",
    letterSpacing: "var(--letter-spacing-loose)",
    color: "var(--color-text-muted)",
    borderBottom: "none",
    padding: "var(--space-2) var(--space-3) var(--space-1)",
  },
  // Section separator — top border on sections after the first
  ".cm-completionSection ~ .cm-completionSection": {
    borderTop: "var(--space-px) solid var(--color-border-subtle)",
    marginTop: "var(--space-1)",
    paddingTop: "var(--space-3)",
  },
});

/** Syntax highlighting — subtle, focused on readability */
const highlightStyle = HighlightStyle.define([
  // Headings — bold, slightly larger, inherit serif
  { tag: tags.heading, fontWeight: "700", color: "var(--color-text)" },
  { tag: tags.heading1, fontSize: "1.4em" },
  { tag: tags.heading2, fontSize: "1.25em" },
  { tag: tags.heading3, fontSize: "1.1em" },
  // Emphasis
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strong, fontWeight: "700" },
  { tag: tags.strikethrough, textDecoration: "line-through", color: "var(--color-text-muted)" },
  // Inline code — switch to mono
  { tag: tags.monospace, fontFamily: "var(--font-mono)", fontSize: "0.9em", color: "var(--color-syntax-monospace)" },
  // Links
  { tag: tags.link, color: "var(--color-primary)", textDecoration: "underline" },
  { tag: tags.url, color: "var(--color-primary)", textDecoration: "underline" },
  // Quotes
  { tag: tags.quote, color: "var(--color-text-muted)", fontStyle: "italic" },
  // List markers
  { tag: tags.list, color: "var(--color-text-muted)" },
  // Meta (fenced code markers ``` , ---, etc.)
  { tag: tags.meta, color: "var(--color-text-muted)" },
  { tag: tags.processingInstruction, color: "var(--color-text-muted)" },
  // HTML/JSX tags — switch to mono for component names
  { tag: tags.angleBracket, color: "var(--color-syntax-angle-bracket)", fontFamily: "var(--font-mono)", fontSize: "0.9em" },
  { tag: tags.tagName, color: "var(--color-syntax-tag-name)", fontFamily: "var(--font-mono)", fontSize: "0.9em" },
  { tag: tags.attributeName, color: "var(--color-syntax-attr-name)", fontFamily: "var(--font-mono)", fontSize: "0.9em" },
  { tag: tags.attributeValue, color: "var(--color-syntax-attr-value)", fontFamily: "var(--font-mono)", fontSize: "0.9em" },
  // Comments
  { tag: tags.comment, color: "var(--color-syntax-comment)", fontStyle: "italic" },
  // Content
  { tag: tags.content, color: "var(--color-text)" },
]);

export const highlighting = syntaxHighlighting(highlightStyle);

/**
 * BubbleToolbar — SolidJS component rendered as a floating menu
 * that appears when text is selected.
 * Provides inline formatting: bold, italic, strikethrough, code, link, headings.
 * Link editing happens inline — the toolbar transforms into a URL input.
 */

import type { Editor } from "@tiptap/core";
import { createSignal, For, onCleanup, onMount, Show, type JSX } from "solid-js";

interface Props {
  editor: Editor;
}

interface ToolbarButton {
  key: string;
  label: string;
  icon: JSX.Element | string;
  shortcut?: string;
  isActive: () => boolean;
  action: () => void;
}

export function BubbleToolbar(props: Props) {
  const [visible, setVisible] = createSignal(false);
  const [position, setPosition] = createSignal({ top: 0, left: 0 });
  const [activeStates, setActiveStates] = createSignal<Record<string, boolean>>({});
  const [linkEditing, setLinkEditing] = createSignal(false);
  const [linkUrl, setLinkUrl] = createSignal("");
  let containerRef!: HTMLDivElement;

  function applyLink(url: string) {
    const trimmed = url.trim();
    if (trimmed) {
      props.editor.chain().focus().setLink({ href: trimmed }).run();
    } else {
      props.editor.chain().focus().unsetLink().run();
    }
    setLinkEditing(false);
    setLinkUrl("");
  }

  function cancelLink() {
    setLinkEditing(false);
    setLinkUrl("");
    setVisible(false);
    props.editor.commands.focus();
  }

  const buttons: ToolbarButton[] = [
    {
      key: "bold",
      label: "Bold",
      icon: "B",
      shortcut: "⌘B",
      isActive: () => props.editor.isActive("bold"),
      action: () => props.editor.chain().focus().toggleBold().run(),
    },
    {
      key: "italic",
      label: "Italic",
      icon: "I",
      shortcut: "⌘I",
      isActive: () => props.editor.isActive("italic"),
      action: () => props.editor.chain().focus().toggleItalic().run(),
    },
    {
      key: "strike",
      label: "Strikethrough",
      icon: "S\u0336",
      shortcut: "⌘⇧X",
      isActive: () => props.editor.isActive("strike"),
      action: () => props.editor.chain().focus().toggleStrike().run(),
    },
    {
      key: "code",
      label: "Code",
      icon: "</>",
      shortcut: "⌘E",
      isActive: () => props.editor.isActive("code"),
      action: () => props.editor.chain().focus().toggleCode().run(),
    },
    {
      key: "divider1",
      label: "",
      icon: "",
      isActive: () => false,
      action: () => {},
    },
    {
      key: "link",
      label: "Link",
      icon: (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
      ),
      shortcut: "⌘K",
      isActive: () => props.editor.isActive("link"),
      action: () => {
        if (props.editor.isActive("link")) {
          const href = props.editor.getAttributes("link").href || "";
          setLinkUrl(href);
          setLinkEditing(true);
          return;
        }
        setLinkUrl("");
        setLinkEditing(true);
      },
    },
    {
      key: "divider2",
      label: "",
      icon: "",
      isActive: () => false,
      action: () => {},
    },
    {
      key: "h2",
      label: "Heading 2",
      icon: "H2",
      isActive: () => props.editor.isActive("heading", { level: 2 }),
      action: () => props.editor.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      key: "h3",
      label: "Heading 3",
      icon: "H3",
      isActive: () => props.editor.isActive("heading", { level: 3 }),
      action: () => props.editor.chain().focus().toggleHeading({ level: 3 }).run(),
    },
  ];

  function updatePosition() {
    const { state, view } = props.editor;
    const { from, to } = state.selection;

    // Hide when no selection range, no focus, or document is empty
    if (from === to || !view.hasFocus() || state.doc.textContent.length === 0) {
      if (!linkEditing()) setVisible(false);
      return;
    }

    // Don't show in code blocks or atom nodes
    const suppressTypes = ["codeBlock", "mermaidDiagram", "figure", "youtubeEmbed", "twitterCard", "passthroughBlock"];
    if (suppressTypes.some((t) => props.editor.isActive(t))) {
      setVisible(false);
      return;
    }

    const start = view.coordsAtPos(from);
    const end = view.coordsAtPos(to);
    const editorRect = view.dom.getBoundingClientRect();

    const left = (start.top !== end.top ? start.left : (start.left + end.left) / 2) - editorRect.left;
    // Estimate toolbar height for initial placement; refine after render
    const gap = 8;
    const estimatedHeight = 40;
    const top = start.top - editorRect.top - estimatedHeight - gap;

    setPosition({ top: Math.max(0, top), left });
    setVisible(true);
    updateActiveStates();

    // Post-render: refine position using actual toolbar dimensions
    requestAnimationFrame(() => {
      if (!containerRef) return;
      const toolbarWidth = containerRef.offsetWidth;
      const toolbarHeight = containerRef.offsetHeight;
      const editorWidth = view.dom.clientWidth;

      // Vertical: use actual height + gap above selection
      const refinedTop = start.top - editorRect.top - toolbarHeight - gap;

      // Horizontal: clamp so toolbar stays within editor bounds
      const half = toolbarWidth / 2;
      const pad = 8;
      const clampedLeft = Math.min(Math.max(left, half + pad), editorWidth - half - pad);

      setPosition({ top: Math.max(0, refinedTop), left: clampedLeft });
    });
  }

  function updateActiveStates() {
    const states: Record<string, boolean> = {};
    for (const btn of buttons) {
      if (!btn.key.startsWith("divider")) {
        states[btn.key] = btn.isActive();
      }
    }
    setActiveStates(states);
  }

  function handleGlobalEscape(e: KeyboardEvent) {
    if (e.key === "Escape" && visible()) {
      if (linkEditing()) {
        cancelLink();
      } else {
        setVisible(false);
        props.editor.commands.focus();
      }
    }
  }

  function handleBlur() {
    setTimeout(() => {
      if (!linkEditing()) setVisible(false);
    }, 150);
  }

  onMount(() => {
    props.editor.on("selectionUpdate", updatePosition);
    props.editor.on("blur", handleBlur);
    props.editor.on("focus", updatePosition);
    document.addEventListener("keydown", handleGlobalEscape);
  });

  onCleanup(() => {
    props.editor.off("selectionUpdate", updatePosition);
    props.editor.off("blur", handleBlur);
    props.editor.off("focus", updatePosition);
    document.removeEventListener("keydown", handleGlobalEscape);
  });

  return (
    <Show when={visible()}>
      <div
        ref={containerRef}
        class="bubble-toolbar"
        style={{
          top: `${position().top}px`,
          left: `${position().left}px`,
        }}
      >
        <Show
          when={!linkEditing()}
          fallback={
            <div class="bubble-link-input">
              <input
                ref={(el) =>
                  setTimeout(() => {
                    el.focus();
                  }, 0)
                }
                type="text"
                class="bubble-link-field"
                placeholder="Paste or type URL..."
                aria-label="Link URL"
                value={linkUrl()}
                onInput={(e) => setLinkUrl(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    applyLink(e.currentTarget.value);
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    cancelLink();
                  }
                }}
              />
              <button
                class="bubble-btn"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyLink(linkUrl())}
                title="Apply link"
              >
                {"\u21B5"}
              </button>
            </div>
          }
        >
          <For each={buttons}>
            {(btn) =>
              btn.key.startsWith("divider") ? (
                <div class="bubble-divider" />
              ) : (
                <button
                  class={`bubble-btn ${activeStates()[btn.key] ? "active" : ""}`}
                  onClick={(e) => {
                    e.preventDefault();
                    btn.action();
                  }}
                  onMouseDown={(e) => e.preventDefault()}
                  aria-label={btn.shortcut ? `${btn.label} (${btn.shortcut})` : btn.label}
                  title={btn.shortcut ? `${btn.label} (${btn.shortcut})` : btn.label}
                >
                  {btn.icon}
                </button>
              )
            }
          </For>
        </Show>
      </div>
    </Show>
  );
}

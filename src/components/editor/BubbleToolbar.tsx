/**
 * BubbleToolbar — SolidJS component rendered as a floating menu
 * that appears when text is selected.
 * Provides inline formatting: bold, italic, strikethrough, code, link, headings.
 * Link editing happens inline — the toolbar transforms into a URL input.
 */
import { createSignal, onMount, onCleanup, Show, For } from "solid-js";
import type { Editor } from "@tiptap/core";

interface Props {
  editor: Editor;
}

interface ToolbarButton {
  key: string;
  label: string;
  icon: any;
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
      icon: (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>),
      shortcut: "⌘K",
      isActive: () => props.editor.isActive("link"),
      action: () => {
        if (props.editor.isActive("link")) {
          props.editor.chain().focus().unsetLink().run();
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

    if (from === to || !view.hasFocus()) {
      if (!linkEditing()) setVisible(false);
      return;
    }

    // Don't show in code blocks or atom nodes
    if (
      props.editor.isActive("codeBlock") ||
      props.editor.isActive("mermaidDiagram")
    ) {
      setVisible(false);
      return;
    }

    const start = view.coordsAtPos(from);
    const end = view.coordsAtPos(to);
    const editorRect = view.dom.getBoundingClientRect();

    const top = start.top - editorRect.top - 50;
    const left = (start.left + end.left) / 2 - editorRect.left;

    setPosition({ top: Math.max(0, top), left });
    setVisible(true);
    updateActiveStates();
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

  onMount(() => {
    props.editor.on("selectionUpdate", updatePosition);
    props.editor.on("blur", () => {
      // Delay hide to allow clicking inside the link input
      setTimeout(() => {
        if (!linkEditing()) setVisible(false);
      }, 150);
    });
    props.editor.on("focus", updatePosition);
    document.addEventListener("keydown", handleGlobalEscape);
  });

  onCleanup(() => {
    props.editor.off("selectionUpdate", updatePosition);
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

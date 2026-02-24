/**
 * Slash command menu — TipTap suggestion extension.
 * Type "/" on an empty line to open a block picker.
 * Keyboard navigable (arrow keys + Enter), filterable.
 */
import { Extension, type Editor, type ChainedCommands } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export interface SlashMenuItem {
  title: string;
  description: string;
  icon: string;
  group: string;
  command: (chain: ChainedCommands) => void;
}

const SLASH_ITEMS: SlashMenuItem[] = [
  // --- Text ---
  {
    title: "Heading 2",
    description: "Large section heading",
    icon: "H2",
    group: "Text",
    command: (chain) => { chain.focus().toggleHeading({ level: 2 }).run(); },
  },
  {
    title: "Heading 3",
    description: "Subsection heading",
    icon: "H3",
    group: "Text",
    command: (chain) => { chain.focus().toggleHeading({ level: 3 }).run(); },
  },
  {
    title: "Paragraph",
    description: "Plain text block",
    icon: "¶",
    group: "Text",
    command: (chain) => { chain.focus().setParagraph().run(); },
  },
  {
    title: "Blockquote",
    description: "Quoted text block",
    icon: "\u201C",
    group: "Text",
    command: (chain) => { chain.focus().toggleBlockquote().run(); },
  },

  // --- Lists ---
  {
    title: "Bullet List",
    description: "Unordered list",
    icon: "•",
    group: "Lists",
    command: (chain) => { chain.focus().toggleBulletList().run(); },
  },
  {
    title: "Ordered List",
    description: "Numbered list",
    icon: "1.",
    group: "Lists",
    command: (chain) => { chain.focus().toggleOrderedList().run(); },
  },
  {
    title: "Task List",
    description: "Checklist with checkboxes",
    icon: "\u2610",
    group: "Lists",
    command: (chain) => { chain.focus().toggleTaskList().run(); },
  },

  // --- Media ---
  {
    title: "Image",
    description: "Plain image embed",
    icon: "\u25A1",
    group: "Media",
    command: (chain) => {
      chain.focus().insertContent({ type: "image", attrs: { src: "", alt: "", title: null } }).run();
    },
  },
  {
    title: "Figure",
    description: "Image with caption and label",
    icon: "\u25A3",
    group: "Media",
    command: (chain) => {
      chain.focus().insertContent({ type: "figure", attrs: { src: "", alt: "", caption: "", label: "", width: "", height: "" } }).run();
    },
  },
  {
    title: "YouTube",
    description: "Embed YouTube video",
    icon: "▶",
    group: "Media",
    command: (chain) => {
      chain.focus().insertContent({ type: "youtubeEmbed", attrs: { videoId: "", title: "" } }).run();
    },
  },
  {
    title: "Twitter / X",
    description: "Embed tweet",
    icon: "X",
    group: "Media",
    command: (chain) => {
      chain.focus().insertContent({ type: "twitterCard", attrs: { id: "" } }).run();
    },
  },

  // --- Code ---
  {
    title: "Code Block",
    description: "Syntax highlighted code",
    icon: "{ }",
    group: "Code",
    command: (chain) => {
      chain.focus().insertContent({ type: "codeBlock", attrs: { language: null } }).run();
    },
  },
  {
    title: "Mermaid",
    description: "Mermaid diagram (rendered at build time)",
    icon: "◇",
    group: "Code",
    command: (chain) => {
      chain.focus().insertContent({ type: "mermaidDiagram", content: [{ type: "text", text: "graph TD\n  A[Start] --> B[End]" }] }).run();
    },
  },

  // --- Layout ---
  {
    title: "Details",
    description: "Collapsible section",
    icon: "▸",
    group: "Layout",
    command: (chain) => {
      chain.focus().insertContent({
        type: "details",
        attrs: { summary: "Details" },
        content: [{ type: "paragraph" }],
      }).run();
    },
  },
  {
    title: "Horizontal Rule",
    description: "Divider line",
    icon: "—",
    group: "Layout",
    command: (chain) => { chain.focus().setHorizontalRule().run(); },
  },
  {
    title: "Table",
    description: "3×3 data table",
    icon: "⊞",
    group: "Layout",
    command: (chain) => {
      chain.focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
    },
  },
  {
    title: "Footnote",
    description: "Add footnote reference and definition",
    icon: "¹",
    group: "Layout",
    command: (_chain) => {
      // Handled specially in the mousedown handler below
    },
  },
];

const slashMenuKey = new PluginKey("slashMenu");

interface SlashMenuState {
  active: boolean;
  query: string;
  range: { from: number; to: number } | null;
}

export const SlashCommandMenu = Extension.create({
  name: "slashCommandMenu",

  addProseMirrorPlugins() {
    const editor = this.editor;

    return [
      new Plugin({
        key: slashMenuKey,
        state: {
          init(): SlashMenuState {
            return { active: false, query: "", range: null };
          },
          apply(tr, prev: SlashMenuState): SlashMenuState {
            const meta = tr.getMeta(slashMenuKey) as SlashMenuState | undefined;
            if (meta) return meta;
            // If the document changed and menu is active, update query
            if (prev.active && tr.docChanged && prev.range) {
              const text = tr.doc.textBetween(prev.range.from, tr.selection.$head.pos, "");
              return { active: true, query: text.slice(1), range: { from: prev.range.from, to: tr.selection.$head.pos } };
            }
            return prev;
          },
        },
        props: {
          handleKeyDown(view, event) {
            const state = slashMenuKey.getState(view.state) as SlashMenuState | undefined;
            if (!state?.active) {
              // Check if "/" was typed at the start of an empty block
              if (event.key === "/") {
                const { $from } = view.state.selection;
                const isEmptyLine = $from.parent.content.size === 0;
                if (isEmptyLine) {
                  // Don't prevent default — let the "/" be typed, then we'll capture it
                  setTimeout(() => {
                    const tr = view.state.tr.setMeta(slashMenuKey, {
                      active: true,
                      query: "",
                      range: { from: view.state.selection.$from.pos - 1, to: view.state.selection.$from.pos },
                    } satisfies SlashMenuState);
                    view.dispatch(tr);
                  }, 0);
                }
              }
              return false;
            }

            // Menu is active
            if (event.key === "Escape") {
              const tr = view.state.tr.setMeta(slashMenuKey, { active: false, query: "", range: null } satisfies SlashMenuState);
              view.dispatch(tr);
              return true;
            }

            return false;
          },

          decorations(state) {
            const pluginState = slashMenuKey.getState(state) as SlashMenuState | undefined;
            if (!pluginState?.active || !pluginState.range) return DecorationSet.empty;

            // Create a widget decoration for the menu
            const deco = Decoration.widget(pluginState.range.from, () => {
              // Zero-size anchor so the absolutely-positioned menu
              // is placed relative to the cursor, not .editor-view
              const anchor = document.createElement("span");
              anchor.style.position = "relative";
              anchor.style.display = "inline-block";
              anchor.style.width = "0";
              anchor.style.height = "0";
              anchor.style.overflow = "visible";

              const menu = document.createElement("div");
              menu.classList.add("slash-menu");
              menu.setAttribute("data-query", pluginState.query || "");

              const query = (pluginState.query || "").toLowerCase();
              const filtered = SLASH_ITEMS.filter(
                (item) =>
                  item.title.toLowerCase().includes(query) ||
                  item.description.toLowerCase().includes(query) ||
                  item.group.toLowerCase().includes(query),
              );

              if (filtered.length === 0) {
                const empty = document.createElement("div");
                empty.classList.add("slash-menu-empty");
                empty.textContent = "No results";
                menu.appendChild(empty);
                return menu;
              }

              let currentGroup = "";
              let selectedIdx = 0;

              filtered.forEach((item, idx) => {
                if (item.group !== currentGroup) {
                  currentGroup = item.group;
                  const groupEl = document.createElement("div");
                  groupEl.classList.add("slash-menu-group");
                  groupEl.textContent = currentGroup;
                  menu.appendChild(groupEl);
                }

                const row = document.createElement("button");
                row.classList.add("slash-menu-item");
                if (idx === selectedIdx) row.classList.add("is-selected");
                row.type = "button";

                const icon = document.createElement("span");
                icon.classList.add("slash-menu-icon");
                icon.textContent = item.icon;
                row.appendChild(icon);

                const text = document.createElement("div");
                text.classList.add("slash-menu-text");

                const title = document.createElement("span");
                title.classList.add("slash-menu-title");
                title.textContent = item.title;
                text.appendChild(title);

                const desc = document.createElement("span");
                desc.classList.add("slash-menu-desc");
                desc.textContent = item.description;
                text.appendChild(desc);

                row.appendChild(text);

                row.addEventListener("mousedown", (e) => {
                  e.preventDefault();
                  e.stopPropagation();

                  // Delete the "/" character and any query text
                  const range = pluginState.range;
                  if (range) {
                    const view = editor.view;
                    const tr = view.state.tr.delete(range.from, view.state.selection.$head.pos);
                    tr.setMeta(slashMenuKey, { active: false, query: "", range: null } satisfies SlashMenuState);
                    view.dispatch(tr);
                  }

                  // Special case for footnote
                  if (item.title === "Footnote") {
                    insertFootnote(editor);
                  } else {
                    item.command(editor.chain());
                  }
                });

                menu.appendChild(row);
              });

              // Keyboard navigation within the menu
              function handleMenuKeyDown(e: KeyboardEvent) {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  selectedIdx = Math.min(selectedIdx + 1, filtered.length - 1);
                  updateSelection();
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  selectedIdx = Math.max(selectedIdx - 1, 0);
                  updateSelection();
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  const selected = filtered[selectedIdx];
                  if (selected) {
                    const range = pluginState?.range;
                    if (range) {
                      const view = editor.view;
                      const tr = view.state.tr.delete(range.from, view.state.selection.$head.pos);
                      tr.setMeta(slashMenuKey, { active: false, query: "", range: null } satisfies SlashMenuState);
                      view.dispatch(tr);
                    }
                    if (selected.title === "Footnote") {
                      insertFootnote(editor);
                    } else {
                      selected.command(editor.chain());
                    }
                  }
                  document.removeEventListener("keydown", handleMenuKeyDown, true);
                }
              }

              function updateSelection() {
                menu.querySelectorAll(".slash-menu-item").forEach((el, i) => {
                  el.classList.toggle("is-selected", i === selectedIdx);
                  if (i === selectedIdx) el.scrollIntoView({ block: "nearest" });
                });
              }

              // Attach keyboard listener
              document.addEventListener("keydown", handleMenuKeyDown, true);

              // Cleanup on unmount
              const observer = new MutationObserver(() => {
                if (!menu.isConnected) {
                  document.removeEventListener("keydown", handleMenuKeyDown, true);
                  observer.disconnect();
                }
              });
              observer.observe(menu.parentElement || document.body, { childList: true, subtree: true });

              anchor.appendChild(menu);
              return anchor;
            }, { side: -1 });

            return DecorationSet.create(state.doc, [deco]);
          },
        },
      }),
    ];
  },
});

/** Insert a footnote ref + def pair (shared logic used by slash menu and toolbar) */
export function insertFootnote(editor: Editor) {
  let count = 0;
  editor.state.doc.descendants((node) => {
    if (node.type.name === "footnoteRef") count++;
  });
  const identifier = String(count + 1);

  editor
    .chain()
    .focus()
    .insertContent({ type: "footnoteRef", attrs: { identifier } })
    .run();

  const endPos = editor.state.doc.content.size;
  editor
    .chain()
    .insertContentAt(endPos, {
      type: "footnoteDef",
      attrs: { identifier },
    })
    .run();

  editor.commands.focus("end");
}

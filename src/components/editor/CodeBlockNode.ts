/**
 * TipTap custom node for code blocks with language selector and syntax highlighting.
 * Uses lowlight (highlight.js) for real-time token coloring via ProseMirror decorations.
 */
import { mergeAttributes, Node, textblockTypeInputRule } from "@tiptap/core";
import type { Node as PmNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { common, createLowlight } from "lowlight";

/* ── lowlight setup ─────────────────────────────────────── */

const lowlight = createLowlight(common);

/** Map panel language ids to highlight.js grammar names */
const LANG_ALIASES: Record<string, string> = {
  jsx: "javascript",
  tsx: "typescript",
  html: "xml",
};

function resolveLanguage(lang: string | null): string | null {
  if (!lang) return null;
  const mapped = LANG_ALIASES[lang] || lang;
  return lowlight.registered(mapped) ? mapped : null;
}

/* ── highlight decoration plugin ────────────────────────── */

const highlightKey = new PluginKey("codeBlockHighlight");

interface HastNode {
  type: string;
  value?: string;
  properties?: { className?: string[] };
  children?: HastNode[];
}

function buildDecorations(doc: PmNode): DecorationSet {
  const decorations: Decoration[] = [];

  doc.descendants((node, pos) => {
    if (node.type.name !== "codeBlock") return;

    const lang = resolveLanguage(node.attrs.language);
    if (!lang) return;

    const code = node.textContent;
    if (!code) return;

    let result: { children?: HastNode[] };
    try {
      result = lowlight.highlight(lang, code);
    } catch {
      return;
    }

    const startPos = pos + 1;
    let offset = 0;

    function walk(nodes: HastNode[]) {
      for (const child of nodes) {
        if (child.type === "text" && child.value != null) {
          offset += child.value.length;
        } else if (child.type === "element") {
          const cls = child.properties?.className?.join(" ") || "";
          const from = startPos + offset;
          if (child.children) walk(child.children);
          const to = startPos + offset;
          if (cls && to > from) {
            decorations.push(Decoration.inline(from, to, { class: cls }));
          }
        }
      }
    }

    if (result.children) walk(result.children as HastNode[]);
  });

  return DecorationSet.create(doc, decorations);
}

/* ── language list ──────────────────────────────────────── */

const LANGUAGES = [
  { value: "", label: "Plain text" },
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "jsx", label: "JSX" },
  { value: "tsx", label: "TSX" },
  { value: "python", label: "Python" },
  { value: "rust", label: "Rust" },
  { value: "go", label: "Go" },
  { value: "css", label: "CSS" },
  { value: "html", label: "HTML" },
  { value: "bash", label: "Bash" },
  { value: "json", label: "JSON" },
  { value: "yaml", label: "YAML" },
  { value: "sql", label: "SQL" },
  { value: "mdx", label: "MDX" },
  { value: "astro", label: "Astro" },
  { value: "c", label: "C" },
  { value: "cpp", label: "C++" },
  { value: "java", label: "Java" },
  { value: "ruby", label: "Ruby" },
  { value: "swift", label: "Swift" },
  { value: "kotlin", label: "Kotlin" },
  { value: "toml", label: "TOML" },
];

/* ── node definition ────────────────────────────────────── */

export const CodeBlockNode = Node.create({
  name: "codeBlock",
  group: "block",
  content: "text*",
  marks: "",
  code: true,
  defining: true,

  addAttributes() {
    return {
      language: { default: null },
    };
  },

  parseHTML() {
    return [
      {
        tag: "pre",
        preserveWhitespace: "full",
        getAttrs: (node) => {
          const el = node as HTMLElement;
          const code = el.querySelector("code");
          const cls = code?.className || "";
          const match = cls.match(/language-(\w+)/);
          return { language: match ? match[1] : null };
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const lang = node.attrs.language;
    return [
      "pre",
      mergeAttributes(HTMLAttributes, { class: "code-block-node" }),
      ["code", { class: lang ? `language-${lang}` : undefined }, 0],
    ];
  },

  addNodeView() {
    return ({ node: initialNode, editor, getPos }) => {
      let currentNode = initialNode;

      const dom = document.createElement("div");
      dom.classList.add("code-block-node");

      const header = document.createElement("div");
      header.classList.add("code-block-header");
      header.contentEditable = "false";

      const select = document.createElement("select");
      select.classList.add("code-block-lang-select");

      for (const lang of LANGUAGES) {
        const opt = document.createElement("option");
        opt.value = lang.value;
        opt.textContent = lang.label;
        if (lang.value === (currentNode.attrs.language || "")) {
          opt.selected = true;
        }
        select.appendChild(opt);
      }

      select.addEventListener("change", () => {
        const pos = typeof getPos === "function" ? getPos() : undefined;
        if (pos == null) return;
        editor.view.dispatch(
          editor.view.state.tr.setNodeMarkup(pos, undefined, {
            ...currentNode.attrs,
            language: select.value || null,
          }),
        );
        editor.commands.focus();
      });

      header.appendChild(select);
      dom.appendChild(header);

      const pre = document.createElement("pre");
      pre.classList.add("code-block-pre");

      const contentDOM = document.createElement("code");
      contentDOM.classList.add("code-block-code");
      if (currentNode.attrs.language) {
        contentDOM.classList.add(`language-${currentNode.attrs.language}`);
      }
      pre.appendChild(contentDOM);
      dom.appendChild(pre);

      return {
        dom,
        contentDOM,
        stopEvent(event: Event) {
          if (event.target === select) return true;
          return false;
        },
        update(updatedNode) {
          if (updatedNode.type.name !== "codeBlock") return false;
          currentNode = updatedNode;
          select.value = updatedNode.attrs.language || "";
          contentDOM.className = "code-block-code";
          if (updatedNode.attrs.language) {
            contentDOM.classList.add(`language-${updatedNode.attrs.language}`);
          }
          return true;
        },
      };
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: highlightKey,
        state: {
          init(_, { doc }) {
            return buildDecorations(doc);
          },
          apply(tr, decorations, _oldState, newState) {
            if (!tr.docChanged) return decorations.map(tr.mapping, newState.doc);

            // Only rebuild if a code block was affected
            let codeBlockChanged = false;
            tr.steps.forEach((_step, i) => {
              const map = tr.mapping.maps[i];
              map.forEach((oldStart, oldEnd) => {
                newState.doc.nodesBetween(
                  tr.mapping.map(oldStart),
                  Math.min(tr.mapping.map(oldEnd), newState.doc.content.size),
                  (node) => {
                    if (node.type.name === "codeBlock") codeBlockChanged = true;
                  },
                );
              });
            });

            if (codeBlockChanged) return buildDecorations(newState.doc);
            return decorations.map(tr.mapping, newState.doc);
          },
        },
        props: {
          decorations(state) {
            return this.getState(state);
          },
        },
      }),
    ];
  },

  addInputRules() {
    return [
      textblockTypeInputRule({
        find: /^```([a-z]*)?[\s\n]$/,
        type: this.type,
        getAttributes: (match) => ({
          language: match[1] || null,
        }),
      }),
    ];
  },

  addKeyboardShortcuts() {
    return {
      "Mod-Shift-c": () => this.editor.commands.toggleNode("codeBlock", "paragraph"),
      Tab: ({ editor }) => {
        if (editor.isActive("codeBlock")) {
          editor.commands.insertContent("  ");
          return true;
        }
        return false;
      },
      "Shift-Tab": ({ editor }) => {
        if (editor.isActive("codeBlock")) {
          const { state, dispatch } = editor.view;
          const { $from } = state.selection;
          // Get text from the start of the code block to cursor
          const textBefore = state.doc.textBetween($from.start(), $from.pos, "\0", "\0");
          const lastNewline = textBefore.lastIndexOf("\n");
          const lineStartOffset = lastNewline === -1 ? 0 : lastNewline + 1;
          const lineStartPos = $from.start() + lineStartOffset;
          // Check leading spaces at line start
          const afterStart = state.doc.textBetween(lineStartPos, Math.min(lineStartPos + 2, $from.end()));
          const match = afterStart.match(/^ {1,2}/);
          if (match) {
            dispatch(state.tr.delete(lineStartPos, lineStartPos + match[0].length));
          }
          return true;
        }
        return false;
      },
    };
  },
});

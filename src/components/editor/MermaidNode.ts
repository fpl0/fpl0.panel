/**
 * TipTap custom node for Mermaid diagrams.
 * Code editor area for Mermaid syntax with a styled container.
 * Serializes to ```mermaid code blocks in MDX.
 */
import { Node, mergeAttributes } from "@tiptap/core";

export const MermaidNode = Node.create({
  name: "mermaidDiagram",
  group: "block",
  content: "text*",
  marks: "",
  code: true,
  defining: true,

  parseHTML() {
    return [{ tag: "div[data-type='mermaid-diagram']" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "mermaid-diagram",
        class: "mermaid-node",
      }),
      ["div", { class: "mermaid-node-header", contenteditable: "false" }, ""],
      ["pre", { class: "mermaid-node-code" }, ["code", {}, 0]],
    ];
  },

  addNodeView() {
    return ({ node: _initialNode }) => {
      void _initialNode;

      const dom = document.createElement("div");
      dom.classList.add("mermaid-node");

      // --- Header bar ---
      const header = document.createElement("div");
      header.classList.add("mermaid-node-header");
      header.contentEditable = "false";

      const icon = document.createElement("span");
      icon.classList.add("mermaid-node-icon");
      icon.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`;
      header.appendChild(icon);

      const label = document.createElement("span");
      label.classList.add("mermaid-node-label");
      label.textContent = "Mermaid Diagram";
      header.appendChild(label);

      const hint = document.createElement("span");
      hint.classList.add("mermaid-node-hint");
      hint.textContent = "rendered at build time";
      header.appendChild(hint);

      dom.appendChild(header);

      // --- Code editing area (content hole) ---
      const codeWrap = document.createElement("pre");
      codeWrap.classList.add("mermaid-node-code");

      const contentDOM = document.createElement("code");
      codeWrap.appendChild(contentDOM);

      dom.appendChild(codeWrap);

      return {
        dom,
        contentDOM,
        update(updatedNode) {
          if (updatedNode.type.name !== "mermaidDiagram") return false;
          return true;
        },
      };
    };
  },

  addKeyboardShortcuts() {
    return {
      // Tab inserts spaces in the code area
      Tab: ({ editor }) => {
        if (editor.isActive("mermaidDiagram")) {
          editor.commands.insertContent("  ");
          return true;
        }
        return false;
      },
    };
  },
});

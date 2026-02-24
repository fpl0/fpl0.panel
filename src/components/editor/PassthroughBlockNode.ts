/**
 * TipTap custom node for passthrough blocks.
 * Stores raw JSX/HTML that round-trips without modification.
 * Double-click to edit raw content in a textarea.
 */
import { Node, mergeAttributes } from "@tiptap/core";

export const PassthroughBlockNode = Node.create({
  name: "passthroughBlock",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      content: { default: "" },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-type='passthrough']" }];
  },

  renderHTML({ HTMLAttributes }) {
    const content = HTMLAttributes.content || "";
    const preview =
      content.length > 80 ? `${content.slice(0, 80)}...` : content;
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "passthrough",
        class: "passthrough-node",
      }),
      preview,
    ];
  },

  addNodeView() {
    return ({ node: initialNode, editor, getPos }) => {
      let currentNode = initialNode;
      let editing = false;
      let textareaEl: HTMLTextAreaElement | null = null;

      const dom = document.createElement("div");
      dom.classList.add("passthrough-node");

      // --- Header ---
      const header = document.createElement("div");
      header.classList.add("passthrough-header");
      header.contentEditable = "false";

      const badge = document.createElement("span");
      badge.classList.add("passthrough-badge");
      badge.textContent = "Raw JSX";
      header.appendChild(badge);

      const hint = document.createElement("span");
      hint.classList.add("embed-edit-hint");
      hint.textContent = "Double-click to edit";
      header.appendChild(hint);

      dom.appendChild(header);

      // --- Content preview ---
      const preview = document.createElement("pre");
      preview.classList.add("passthrough-preview");
      dom.appendChild(preview);

      function updatePreview() {
        const content = currentNode.attrs.content || "";
        preview.textContent = content || "(empty)";
        if (!content) preview.classList.add("is-empty");
        else preview.classList.remove("is-empty");
      }

      function startEdit() {
        if (editing) return;
        editing = true;
        dom.classList.add("is-editing");

        textareaEl = document.createElement("textarea");
        textareaEl.classList.add("passthrough-textarea");
        textareaEl.value = currentNode.attrs.content || "";
        textareaEl.placeholder = "<ComponentName prop=\"value\" />";
        textareaEl.rows = Math.max(
          3,
          (currentNode.attrs.content || "").split("\n").length + 1,
        );

        preview.style.display = "none";
        dom.appendChild(textareaEl);

        setTimeout(() => {
          textareaEl?.focus();
        }, 0);

        textareaEl.addEventListener("keydown", (e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            cancelEdit();
          }
          // Cmd+Enter to save
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            finishEdit(textareaEl!.value);
          }
          e.stopPropagation();
        });

        textareaEl.addEventListener("blur", () => {
          finishEdit(textareaEl?.value ?? "");
        });
      }

      function finishEdit(newContent: string) {
        if (!editing) return;
        editing = false;
        dom.classList.remove("is-editing");

        if (textareaEl) {
          textareaEl.remove();
          textareaEl = null;
        }
        preview.style.display = "";

        if (newContent !== currentNode.attrs.content) {
          const pos = typeof getPos === "function" ? getPos() : undefined;
          if (pos == null) return;
          editor.view.dispatch(
            editor.view.state.tr.setNodeMarkup(pos, undefined, {
              ...currentNode.attrs,
              content: newContent,
            }),
          );
        }
      }

      function cancelEdit() {
        editing = false;
        dom.classList.remove("is-editing");
        if (textareaEl) {
          textareaEl.remove();
          textareaEl = null;
        }
        preview.style.display = "";
        editor.commands.focus();
      }

      dom.addEventListener("dblclick", (e) => {
        e.preventDefault();
        e.stopPropagation();
        startEdit();
      });

      updatePreview();

      return {
        dom,
        stopEvent(event: Event) {
          if (editing && textareaEl && event.target === textareaEl) return true;
          return false;
        },
        update(updatedNode) {
          if (updatedNode.type.name !== "passthroughBlock") return false;
          currentNode = updatedNode;
          if (!editing) updatePreview();
          return true;
        },
      };
    };
  },
});

/**
 * TipTap custom node for <details>/<summary> collapsible blocks.
 * Non-atomic: body content is editable via a content hole.
 * Click the summary header to edit its text inline.
 */
import { Node, mergeAttributes } from "@tiptap/core";

export const DetailsNode = Node.create({
  name: "details",
  group: "block",
  content: "block+",
  defining: true,

  addAttributes() {
    return {
      summary: { default: "Details" },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-type='details']" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "details",
        class: "details-node",
      }),
      [
        "div",
        { class: "details-node-summary", contenteditable: "false" },
        HTMLAttributes.summary || "Details",
      ],
      ["div", { class: "details-node-content" }, 0],
    ];
  },

  addNodeView() {
    return ({ node: initialNode, editor, getPos }) => {
      let currentNode = initialNode;
      let editing = false;
      let inputEl: HTMLInputElement | null = null;

      const dom = document.createElement("div");
      dom.classList.add("details-node");

      // --- Summary bar (non-editable, click to change inline) ---
      const summaryEl = document.createElement("div");
      summaryEl.classList.add("details-node-summary");
      summaryEl.contentEditable = "false";

      const toggleIcon = document.createElement("span");
      toggleIcon.classList.add("details-node-toggle");
      toggleIcon.textContent = "+";
      summaryEl.appendChild(toggleIcon);

      const summaryText = document.createElement("span");
      summaryText.classList.add("details-node-summary-text");
      summaryText.textContent = currentNode.attrs.summary;
      summaryEl.appendChild(summaryText);

      const editHint = document.createElement("span");
      editHint.classList.add("details-node-edit-hint");
      editHint.textContent = "click to edit";
      summaryEl.appendChild(editHint);

      dom.appendChild(summaryEl);

      // --- Content hole (editable) ---
      const contentDOM = document.createElement("div");
      contentDOM.classList.add("details-node-content");
      dom.appendChild(contentDOM);

      function startEdit() {
        if (editing) return;
        editing = true;

        inputEl = document.createElement("input");
        inputEl.type = "text";
        inputEl.classList.add("details-node-summary-input");
        inputEl.value = currentNode.attrs.summary;
        inputEl.placeholder = "Summary text…";

        summaryText.style.display = "none";
        editHint.style.display = "none";
        toggleIcon.after(inputEl);
        setTimeout(() => {
          inputEl?.focus();
          inputEl?.select();
        }, 0);

        inputEl.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            finishEdit(inputEl!.value.trim());
          }
          if (e.key === "Escape") {
            e.preventDefault();
            cancelEdit();
          }
          e.stopPropagation();
        });

        inputEl.addEventListener("blur", () => {
          // Delay to avoid closing on transient focus changes
          setTimeout(() => {
            if (editing) finishEdit(inputEl?.value.trim() ?? "");
          }, 150);
        });
      }

      function finishEdit(newSummary: string) {
        if (!editing) return;
        editing = false;
        const value = newSummary || "Details";
        if (inputEl) {
          inputEl.remove();
          inputEl = null;
        }
        summaryText.style.display = "";
        editHint.style.display = "";

        if (value !== currentNode.attrs.summary) {
          const pos = typeof getPos === "function" ? getPos() : undefined;
          if (pos == null) return;
          editor.view.dispatch(
            editor.view.state.tr.setNodeMarkup(pos, undefined, {
              ...currentNode.attrs,
              summary: value,
            }),
          );
        }
      }

      function cancelEdit() {
        editing = false;
        if (inputEl) {
          inputEl.remove();
          inputEl = null;
        }
        summaryText.style.display = "";
        editHint.style.display = "";
      }

      // Click to edit (changed from dbl-click)
      summaryEl.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        startEdit();
      });

      return {
        dom,
        contentDOM,
        stopEvent(event: Event) {
          // Prevent ProseMirror from processing events on the summary bar
          // (mousedown would steal focus from the edit input)
          if (summaryEl.contains(event.target as globalThis.Node)) return true;
          return false;
        },
        update(updatedNode) {
          if (updatedNode.type.name !== "details") return false;
          currentNode = updatedNode;
          if (!editing) {
            summaryText.textContent = updatedNode.attrs.summary;
          }
          return true;
        },
      };
    };
  },
});

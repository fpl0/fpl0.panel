/**
 * TipTap inline atom node for footnote references [^n].
 * Renders as a superscript badge. Click to edit identifier inline.
 */
import { Node, mergeAttributes } from "@tiptap/core";

export const FootnoteRefNode = Node.create({
  name: "footnoteRef",
  group: "inline",
  inline: true,
  atom: true,

  addAttributes() {
    return {
      identifier: { default: "" },
    };
  },

  parseHTML() {
    return [{ tag: "sup[data-type='footnote-ref']" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "sup",
      mergeAttributes(HTMLAttributes, {
        "data-type": "footnote-ref",
        class: "footnote-ref-node",
      }),
      `[${HTMLAttributes.identifier || ""}]`,
    ];
  },

  addNodeView() {
    return ({ node: initialNode, editor, getPos }) => {
      let currentNode = initialNode;
      let editing = false;
      let inputEl: HTMLInputElement | null = null;

      const dom = document.createElement("sup");
      dom.classList.add("footnote-ref-node");
      dom.setAttribute("title", `Footnote ${currentNode.attrs.identifier}`);
      dom.textContent = `[${currentNode.attrs.identifier}]`;

      function startEdit() {
        if (editing) return;
        editing = true;

        inputEl = document.createElement("input");
        inputEl.type = "text";
        inputEl.classList.add("footnote-ref-input");
        inputEl.value = currentNode.attrs.identifier;
        inputEl.placeholder = "#";
        inputEl.size = 4;

        dom.textContent = "";
        dom.appendChild(inputEl);
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
          finishEdit(inputEl?.value.trim() ?? "");
        });
      }

      function finishEdit(newId: string) {
        if (!editing) return;
        editing = false;
        const value = newId || currentNode.attrs.identifier;
        if (inputEl) {
          inputEl.remove();
          inputEl = null;
        }
        dom.textContent = `[${currentNode.attrs.identifier}]`;

        if (value && value !== currentNode.attrs.identifier) {
          const pos = typeof getPos === "function" ? getPos() : undefined;
          if (pos == null) return;
          editor.view.dispatch(
            editor.view.state.tr.setNodeMarkup(pos, undefined, {
              ...currentNode.attrs,
              identifier: value,
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
        dom.textContent = `[${currentNode.attrs.identifier}]`;
        editor.commands.focus();
      }

      // Click to edit (changed from dbl-click)
      dom.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        startEdit();
      });

      return {
        dom,
        stopEvent(event: Event) {
          if (editing && inputEl && event.target === inputEl) return true;
          return false;
        },
        update(updatedNode) {
          if (updatedNode.type.name !== "footnoteRef") return false;
          currentNode = updatedNode;
          if (!editing) {
            dom.textContent = `[${updatedNode.attrs.identifier}]`;
            dom.setAttribute(
              "title",
              `Footnote ${updatedNode.attrs.identifier}`,
            );
          }
          return true;
        },
      };
    };
  },
});

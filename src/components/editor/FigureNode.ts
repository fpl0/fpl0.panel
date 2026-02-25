/**
 * TipTap custom node for <Figure> components.
 * WYSIWYG preview with actual image, editable caption/label/alt.
 * Maps to the blog's Figure.astro component.
 */
import { mergeAttributes, Node } from "@tiptap/core";

export const FigureNode = Node.create({
  name: "figure",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      src: { default: "" },
      alt: { default: "" },
      caption: { default: "" },
      label: { default: "" },
      width: { default: "" },
      height: { default: "" },
    };
  },

  parseHTML() {
    return [{ tag: "figure[data-type='figure']" }];
  },

  renderHTML({ HTMLAttributes }) {
    const { src, alt, caption, label } = HTMLAttributes;
    return [
      "figure",
      mergeAttributes(HTMLAttributes, {
        "data-type": "figure",
        class: "figure-node",
      }),
      ["img", { src, alt }],
      ...(caption || label
        ? [["figcaption", {}, ...(label ? [["strong", {}, label], " "] : []), caption || ""]]
        : []),
    ];
  },

  addNodeView() {
    return ({ node: initialNode, editor, getPos }) => {
      let currentNode = initialNode;
      let editing = false;
      let formContainer: HTMLDivElement | null = null;
      let editAbort: AbortController | null = null;

      const dom = document.createElement("figure");
      dom.classList.add("figure-node");

      // --- Image element ---
      const img = document.createElement("img");
      img.classList.add("figure-node-img");
      dom.appendChild(img);

      // --- Caption ---
      const figcaption = document.createElement("figcaption");
      figcaption.classList.add("figure-node-caption");
      dom.appendChild(figcaption);

      // --- Empty state ---
      const emptyState = document.createElement("div");
      emptyState.classList.add("figure-node-empty");

      const emptySvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      emptySvg.setAttribute("viewBox", "0 0 24 24");
      emptySvg.setAttribute("width", "32");
      emptySvg.setAttribute("height", "32");
      emptySvg.setAttribute("fill", "none");
      emptySvg.setAttribute("stroke", "currentColor");
      emptySvg.setAttribute("stroke-width", "1.5");
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("x", "3");
      rect.setAttribute("y", "3");
      rect.setAttribute("width", "18");
      rect.setAttribute("height", "18");
      rect.setAttribute("rx", "2");
      rect.setAttribute("ry", "2");
      emptySvg.appendChild(rect);
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", "8.5");
      circle.setAttribute("cy", "8.5");
      circle.setAttribute("r", "1.5");
      emptySvg.appendChild(circle);
      const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
      polyline.setAttribute("points", "21 15 16 10 5 21");
      emptySvg.appendChild(polyline);
      emptyState.appendChild(emptySvg);

      const emptyLabel = document.createElement("span");
      emptyLabel.textContent = "Click to add image";
      emptyState.appendChild(emptyLabel);

      dom.appendChild(emptyState);

      // --- Edit hint ---
      const editHint = document.createElement("span");
      editHint.classList.add("figure-edit-hint");
      editHint.textContent = "Click to edit";
      dom.appendChild(editHint);

      function updateDisplay() {
        const { src, alt, caption, label } = currentNode.attrs;

        if (src) {
          img.src = src;
          img.alt = alt || "";
          img.style.display = "block";
          emptyState.style.display = "none";

          if (caption || label) {
            figcaption.style.display = "";
            figcaption.innerHTML = "";
            if (label) {
              const strong = document.createElement("strong");
              strong.textContent = label;
              figcaption.appendChild(strong);
              figcaption.appendChild(document.createTextNode(" "));
            }
            if (caption) {
              figcaption.appendChild(document.createTextNode(caption));
            }
          } else {
            figcaption.style.display = "none";
          }
        } else {
          img.style.display = "none";
          figcaption.style.display = "none";
          emptyState.style.display = "";
        }
      }

      function startEdit() {
        if (editing) return;
        editing = true;
        dom.classList.add("is-editing");

        formContainer = document.createElement("div");
        formContainer.classList.add("figure-edit-form");

        editAbort = new AbortController();
        const { signal } = editAbort;

        const fields = [
          { key: "src", label: "Image URL", placeholder: "https://…" },
          { key: "alt", label: "Alt text", placeholder: "Describe the image…" },
          { key: "caption", label: "Caption", placeholder: "Figure caption…" },
          { key: "label", label: "Label", placeholder: "Fig. 1 (optional)…" },
          { key: "width", label: "Width", placeholder: "e.g. 800" },
          { key: "height", label: "Height", placeholder: "e.g. 600" },
        ];

        const inputs: Record<string, HTMLInputElement> = {};

        for (const field of fields) {
          const row = document.createElement("div");
          row.classList.add("figure-edit-row");

          const fieldId = `figure-${field.key}-${Math.random().toString(36).slice(2, 8)}`;
          const lbl = document.createElement("label");
          lbl.classList.add("figure-edit-label");
          lbl.textContent = field.label;
          lbl.setAttribute("for", fieldId);
          row.appendChild(lbl);

          const input = document.createElement("input");
          input.type = "text";
          input.id = fieldId;
          input.classList.add("embed-node-input");
          input.value = (currentNode.attrs[field.key] as string) || "";
          input.placeholder = field.placeholder;
          row.appendChild(input);

          inputs[field.key] = input;
          formContainer.appendChild(row);
        }

        const actions = document.createElement("div");
        actions.classList.add("figure-edit-actions");

        const saveBtn = document.createElement("button");
        saveBtn.classList.add("figure-edit-save");
        saveBtn.textContent = "Save";
        saveBtn.addEventListener(
          "click",
          (e) => {
            e.stopPropagation();
            finishEdit(inputs);
          },
          { signal },
        );

        const cancelBtn = document.createElement("button");
        cancelBtn.classList.add("figure-edit-cancel");
        cancelBtn.textContent = "Cancel";
        cancelBtn.addEventListener(
          "click",
          (e) => {
            e.stopPropagation();
            cancelEdit();
          },
          { signal },
        );

        actions.appendChild(saveBtn);
        actions.appendChild(cancelBtn);
        formContainer.appendChild(actions);

        dom.appendChild(formContainer);

        // Focus first input
        setTimeout(() => inputs.src.focus(), 0);

        // Keyboard shortcuts
        formContainer.addEventListener(
          "keydown",
          (e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              finishEdit(inputs);
            }
            if (e.key === "Escape") {
              e.preventDefault();
              cancelEdit();
            }
            e.stopPropagation();
          },
          { signal },
        );
      }

      function finishEdit(inputs: Record<string, HTMLInputElement>) {
        if (!editing) return;
        editing = false;
        dom.classList.remove("is-editing");

        const newAttrs: Record<string, string> = {};
        for (const [key, input] of Object.entries(inputs)) {
          newAttrs[key] = input.value.trim();
        }

        editAbort?.abort();
        editAbort = null;
        formContainer?.remove();
        formContainer = null;

        const pos = typeof getPos === "function" ? getPos() : undefined;
        if (pos == null) return;
        editor.view.dispatch(editor.view.state.tr.setNodeMarkup(pos, undefined, newAttrs));
      }

      function cancelEdit() {
        editing = false;
        dom.classList.remove("is-editing");
        editAbort?.abort();
        editAbort = null;
        formContainer?.remove();
        formContainer = null;
        editor.commands.focus();
      }

      dom.addEventListener("click", (e) => {
        if (editing) return;
        if ((e.target as HTMLElement).closest(".figure-edit-form")) return;
        e.preventDefault();
        e.stopPropagation();
        startEdit();
      });

      // Auto-start editing when inserted empty
      if (!currentNode.attrs.src) {
        setTimeout(() => startEdit(), 20);
      }

      updateDisplay();

      return {
        dom,
        stopEvent(event: Event) {
          if (editing && formContainer?.contains(event.target as globalThis.Node)) return true;
          return false;
        },
        ignoreMutation() {
          return true;
        },
        update(updatedNode) {
          if (updatedNode.type.name !== "figure") return false;
          currentNode = updatedNode;
          if (!editing) updateDisplay();
          return true;
        },
      };
    };
  },
});

/**
 * TipTap custom node for <TwitterCard> embeds.
 * Styled preview card with X logo, tweet ID, and link.
 * Click card to edit tweet ID inline.
 */
import { mergeAttributes, Node } from "@tiptap/core";

export const TwitterCardNode = Node.create({
  name: "twitterCard",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      id: { default: "" },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-type='twitter-card']" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "twitter-card",
        class: "twitter-card-node",
      }),
      `Tweet: ${HTMLAttributes.id || ""}`,
    ];
  },

  addNodeView() {
    return ({ node: initialNode, editor, getPos }) => {
      let currentNode = initialNode;
      let editing = false;
      let inputEl: HTMLInputElement | null = null;
      let editAbort: AbortController | null = null;

      const dom = document.createElement("div");
      dom.classList.add("twitter-card-node");

      // --- Card header ---
      const header = document.createElement("div");
      header.classList.add("tweet-node-header");

      const logo = document.createElement("span");
      logo.classList.add("tweet-node-logo");
      const logoSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      logoSvg.setAttribute("viewBox", "0 0 24 24");
      logoSvg.setAttribute("width", "18");
      logoSvg.setAttribute("height", "18");
      const logoPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
      logoPath.setAttribute("d", "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z");
      logoPath.setAttribute("fill", "currentColor");
      logoSvg.appendChild(logoPath);
      logo.appendChild(logoSvg);
      header.appendChild(logo);

      const label = document.createElement("span");
      label.classList.add("tweet-node-label");
      header.appendChild(label);

      const editHint = document.createElement("span");
      editHint.classList.add("embed-edit-hint");
      editHint.textContent = "Click to edit";
      header.appendChild(editHint);

      dom.appendChild(header);

      // --- Link preview ---
      const linkPreview = document.createElement("a");
      linkPreview.classList.add("tweet-node-link");
      linkPreview.target = "_blank";
      linkPreview.rel = "noopener noreferrer";
      dom.appendChild(linkPreview);

      function updateDisplay() {
        const id = currentNode.attrs.id;
        if (id) {
          label.textContent = `Tweet ${id}`;
          label.classList.remove("is-placeholder");
          linkPreview.href = `https://twitter.com/i/status/${id}`;
          linkPreview.textContent = `twitter.com/i/status/${id}`;
          linkPreview.style.display = "";
        } else {
          label.textContent = "Enter tweet ID…";
          label.classList.add("is-placeholder");
          linkPreview.style.display = "none";
        }
      }

      function startEdit() {
        if (editing) return;
        editing = true;
        dom.classList.add("is-editing");

        inputEl = document.createElement("input");
        inputEl.type = "text";
        inputEl.classList.add("embed-node-input");
        inputEl.value = currentNode.attrs.id || "";
        inputEl.placeholder = "Tweet ID or URL…";
        inputEl.setAttribute("aria-label", "Tweet ID or URL");

        editAbort = new AbortController();
        const { signal } = editAbort;

        label.style.display = "none";
        editHint.style.display = "none";
        linkPreview.style.display = "none";
        header.appendChild(inputEl);

        setTimeout(() => {
          inputEl?.focus();
          inputEl?.select();
        }, 0);

        inputEl.addEventListener(
          "keydown",
          (e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              finishEdit(inputEl!.value.trim());
            }
            if (e.key === "Escape") {
              e.preventDefault();
              cancelEdit();
            }
            e.stopPropagation();
          },
          { signal },
        );

        inputEl.addEventListener(
          "blur",
          () => {
            finishEdit(inputEl?.value.trim() ?? "");
          },
          { signal },
        );
      }

      function extractTweetId(input: string): string {
        // Support pasting full Twitter/X URLs
        const urlMatch = input.match(/(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)/);
        if (urlMatch) return urlMatch[1];
        return input;
      }

      function finishEdit(rawValue: string) {
        if (!editing) return;
        editing = false;
        dom.classList.remove("is-editing");

        const newId = extractTweetId(rawValue);

        editAbort?.abort();
        editAbort = null;
        if (inputEl) {
          inputEl.remove();
          inputEl = null;
        }
        label.style.display = "";
        editHint.style.display = "";

        if (newId !== currentNode.attrs.id) {
          const pos = typeof getPos === "function" ? getPos() : undefined;
          if (pos == null) return;
          editor.view.dispatch(
            editor.view.state.tr.setNodeMarkup(pos, undefined, {
              ...currentNode.attrs,
              id: newId,
            }),
          );
        }
        updateDisplay();
      }

      function cancelEdit() {
        editing = false;
        dom.classList.remove("is-editing");
        editAbort?.abort();
        editAbort = null;
        if (inputEl) {
          inputEl.remove();
          inputEl = null;
        }
        label.style.display = "";
        editHint.style.display = "";
        updateDisplay();
        editor.commands.focus();
      }

      dom.addEventListener("click", (e) => {
        if (editing) return;
        e.preventDefault();
        e.stopPropagation();
        startEdit();
      });

      // Auto-start editing when inserted empty
      if (!currentNode.attrs.id) {
        setTimeout(() => startEdit(), 20);
      }

      updateDisplay();

      return {
        dom,
        stopEvent(event: Event) {
          if (editing && inputEl && event.target === inputEl) return true;
          return false;
        },
        ignoreMutation() {
          return true;
        },
        update(updatedNode) {
          if (updatedNode.type.name !== "twitterCard") return false;
          currentNode = updatedNode;
          if (!editing) updateDisplay();
          return true;
        },
      };
    };
  },
});

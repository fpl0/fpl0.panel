/**
 * TipTap custom node for <LiteYouTube> embeds.
 * WYSIWYG preview with YouTube thumbnail, title overlay, and play button.
 * Click the overlay to edit videoId/title inline.
 */
import { mergeAttributes, Node } from "@tiptap/core";

export const YouTubeEmbedNode = Node.create({
  name: "youtubeEmbed",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      videoId: { default: "" },
      title: { default: "" },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-type='youtube-embed']" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "youtube-embed",
        class: "youtube-embed-node",
      }),
      `YouTube: ${HTMLAttributes.title || HTMLAttributes.videoId}`,
    ];
  },

  addNodeView() {
    return ({ node: initialNode, editor, getPos }) => {
      let currentNode = initialNode;
      let editing = false;
      let inputContainer: HTMLDivElement | null = null;
      let editAbort: AbortController | null = null;

      // --- Root container ---
      const dom = document.createElement("div");
      dom.classList.add("youtube-embed-node");

      // --- Thumbnail preview ---
      const preview = document.createElement("div");
      preview.classList.add("yt-preview");
      dom.appendChild(preview);

      // Play button
      const playBtn = document.createElement("div");
      playBtn.classList.add("yt-play-btn");
      const playSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      playSvg.setAttribute("viewBox", "0 0 68 48");
      const bgPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
      bgPath.setAttribute("d", "M66.52 7.74c-.78-2.93-2.49-5.41-5.42-6.19C55.79.13 34 0 34 0S12.21.13 6.9 1.55C3.97 2.33 2.27 4.81 1.48 7.74.06 13.05 0 24 0 24s.06 10.95 1.48 16.26c.78 2.93 2.49 5.41 5.42 6.19C12.21 47.87 34 48 34 48s21.79-.13 27.1-1.55c2.93-.78 4.64-3.26 5.42-6.19C67.94 34.95 68 24 68 24s-.06-10.95-1.48-16.26z");
      bgPath.setAttribute("fill", "#c00");
      const triPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
      triPath.setAttribute("d", "M45 24 27 14v20");
      triPath.setAttribute("fill", "#fff");
      playSvg.appendChild(bgPath);
      playSvg.appendChild(triPath);
      playBtn.appendChild(playSvg);
      preview.appendChild(playBtn);

      // Title overlay
      const titleOverlay = document.createElement("div");
      titleOverlay.classList.add("yt-title-overlay");
      preview.appendChild(titleOverlay);

      // --- Edit overlay (appears on click) ---
      const editOverlay = document.createElement("div");
      editOverlay.classList.add("yt-edit-overlay");
      const editHintSpan = document.createElement("span");
      editHintSpan.classList.add("embed-edit-hint");
      editHintSpan.textContent = "Click to edit";
      editOverlay.appendChild(editHintSpan);
      preview.appendChild(editOverlay);

      function updatePreview() {
        const vid = currentNode.attrs.videoId;
        const title = currentNode.attrs.title;

        if (vid) {
          preview.style.backgroundImage = `url("https://i.ytimg.com/vi/${vid}/hqdefault.jpg")`;
          preview.classList.remove("is-empty");
          titleOverlay.textContent = title || vid;
        } else {
          preview.style.backgroundImage = "none";
          preview.classList.add("is-empty");
          titleOverlay.textContent = "YouTube Video";
        }
      }

      function startEdit() {
        if (editing) return;
        editing = true;
        dom.classList.add("is-editing");

        inputContainer = document.createElement("div");
        inputContainer.classList.add("yt-edit-form");

        editAbort = new AbortController();
        const { signal } = editAbort;

        const idInput = document.createElement("input");
        idInput.type = "text";
        idInput.classList.add("embed-node-input");
        idInput.value = currentNode.attrs.videoId || "";
        idInput.placeholder = "Video ID or YouTube URL…";
        idInput.setAttribute("aria-label", "Video ID or YouTube URL");

        const titleInput = document.createElement("input");
        titleInput.type = "text";
        titleInput.classList.add("embed-node-input");
        titleInput.value = currentNode.attrs.title || "";
        titleInput.placeholder = "Title (optional)…";
        titleInput.setAttribute("aria-label", "Video title");

        const hint = document.createElement("span");
        hint.classList.add("embed-edit-hint");
        hint.textContent = "Enter to save · Esc to cancel";

        inputContainer.appendChild(idInput);
        inputContainer.appendChild(titleInput);
        inputContainer.appendChild(hint);
        dom.appendChild(inputContainer);

        setTimeout(() => {
          idInput.focus();
          idInput.select();
        }, 0);

        function handleKeyDown(e: KeyboardEvent) {
          if (e.key === "Enter") {
            e.preventDefault();
            finishEdit(extractVideoId(idInput.value.trim()), titleInput.value.trim());
          }
          if (e.key === "Escape") {
            e.preventDefault();
            cancelEdit();
          }
          e.stopPropagation();
        }

        idInput.addEventListener("keydown", handleKeyDown, { signal });
        titleInput.addEventListener("keydown", handleKeyDown, { signal });
      }

      function extractVideoId(input: string): string {
        // Support pasting full YouTube URLs
        const urlMatch = input.match(
          /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
        );
        if (urlMatch) return urlMatch[1];
        // Assume it's already a video ID
        return input;
      }

      function finishEdit(newVideoId: string, newTitle: string) {
        if (!editing) return;
        editing = false;
        dom.classList.remove("is-editing");
        editAbort?.abort();
        editAbort = null;
        inputContainer?.remove();
        inputContainer = null;

        if (newVideoId !== currentNode.attrs.videoId || newTitle !== currentNode.attrs.title) {
          const pos = typeof getPos === "function" ? getPos() : undefined;
          if (pos == null) return;
          editor.view.dispatch(
            editor.view.state.tr.setNodeMarkup(pos, undefined, {
              ...currentNode.attrs,
              videoId: newVideoId,
              title: newTitle,
            }),
          );
        }
      }

      function cancelEdit() {
        editing = false;
        dom.classList.remove("is-editing");
        editAbort?.abort();
        editAbort = null;
        inputContainer?.remove();
        inputContainer = null;
        editor.commands.focus();
      }

      // Click preview to edit
      preview.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        startEdit();
      });

      // Auto-start editing when inserted empty
      if (!currentNode.attrs.videoId) {
        setTimeout(() => startEdit(), 20);
      }

      updatePreview();

      return {
        dom,
        stopEvent(event: Event) {
          if (editing && inputContainer?.contains(event.target as globalThis.Node)) return true;
          return false;
        },
        update(updatedNode) {
          if (updatedNode.type.name !== "youtubeEmbed") return false;
          currentNode = updatedNode;
          if (!editing) updatePreview();
          return true;
        },
      };
    };
  },
});

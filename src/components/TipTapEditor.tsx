/**
 * TipTap WYSIWYG editor with SolidJS integration.
 * Uses imperative creation in onMount since TipTap has no SolidJS bindings.
 *
 * Architecture:
 * - No static toolbar — uses floating BubbleToolbar on text selection
 * - Slash command menu (/) for inserting blocks
 * - Inline command bar for URL/text input (replaces window.prompt in Tauri)
 * - Character/word count in footer
 *
 * IMPORTANT: No window.prompt / window.alert / window.confirm — these are
 * disabled in Tauri's WebView.
 */

import type { JSONContent } from "@tiptap/core";
import { Editor } from "@tiptap/core";
import CharacterCount from "@tiptap/extension-character-count";
import Dropcursor from "@tiptap/extension-dropcursor";
import Gapcursor from "@tiptap/extension-gapcursor";
import Highlight from "@tiptap/extension-highlight";
import HorizontalRule from "@tiptap/extension-horizontal-rule";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { Table } from "@tiptap/extension-table";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableRow } from "@tiptap/extension-table-row";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import Typography from "@tiptap/extension-typography";
import Underline from "@tiptap/extension-underline";
import StarterKit from "@tiptap/starter-kit";
import { createSignal, ErrorBoundary, onCleanup, onMount, Show } from "solid-js";
import { BubbleToolbar } from "./editor/BubbleToolbar";
import { CodeBlockNode } from "./editor/CodeBlockNode";
import { DetailsNode } from "./editor/DetailsNode";
import { FigureNode } from "./editor/FigureNode";
import { FootnoteDefNode } from "./editor/FootnoteDefNode";
import { FootnoteRefNode } from "./editor/FootnoteRefNode";
import { MermaidNode } from "./editor/MermaidNode";
import { PassthroughBlockNode } from "./editor/PassthroughBlockNode";
import { SlashCommandMenu } from "./editor/SlashCommandMenu";
import { TwitterCardNode } from "./editor/TwitterCardNode";
import { YouTubeEmbedNode } from "./editor/YouTubeEmbedNode";
import { DescriptionList, DescriptionTerm, DescriptionDetails } from "./editor/DefinitionList";

interface Props {
  content: JSONContent;
  onUpdate: (doc: JSONContent) => void;
  onStatsUpdate?: (words: number, characters: number) => void;
}

export function TipTapEditor(props: Props) {
  let editorRef!: HTMLDivElement;
  let editor: Editor | null = null;

  // Character / word count
  const [_charCount, setCharCount] = createSignal(0);
  const [_wordCount, setWordCount] = createSignal(0);

  // Editor reference for BubbleToolbar
  const [editorInstance, setEditorInstance] = createSignal<Editor | null>(null);

  // ---------------------------------------------------------------------------
  // Command bar — replaces window.prompt() for URL / text input
  // ---------------------------------------------------------------------------
  const [cmdBar, setCmdBar] = createSignal<{
    placeholder: string;
    initial: string;
    resolve: (value: string | null) => void;
  } | null>(null);

  /** Show a one-line input bar above the editor. Returns the entered value or null on cancel. */
  // @ts-expect-error — entry point for command bar, will be wired to editor actions
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function promptInline(placeholder: string, initial = ""): Promise<string | null> {
    return new Promise((resolve) => {
      setCmdBar({ placeholder, initial, resolve });
    });
  }

  function dismissCmdBar(value: string | null) {
    const bar = cmdBar();
    if (bar) {
      bar.resolve(value);
      setCmdBar(null);
    }
  }

  // ---------------------------------------------------------------------------
  // Update counts
  // ---------------------------------------------------------------------------
  function updateCounts() {
    if (!editor) return;
    const storage = editor.storage.characterCount;
    if (storage) {
      const w = storage.words();
      const c = storage.characters();
      setCharCount(c);
      setWordCount(w);
      props.onStatsUpdate?.(w, c);
    }
  }

  // ---------------------------------------------------------------------------
  // Editor setup
  // ---------------------------------------------------------------------------
  onMount(() => {
    editor = new Editor({
      element: editorRef,
      extensions: [
        StarterKit.configure({
          codeBlock: false, // We use our custom CodeBlockNode
          horizontalRule: false,
          dropcursor: false,
          gapcursor: false,
        }),
        CodeBlockNode,
        Image.configure({ inline: false }),
        Link.configure({ openOnClick: false }),
        Table.configure({ resizable: false }),
        TableRow,
        TableCell,
        TableHeader,
        Placeholder.configure({
          placeholder: ({ node }) => {
            if (node.type.name === "heading") return "Give it a name…";
            return "What's on your mind?";
          },
        }),
        Typography,
        HorizontalRule,
        TaskList,
        TaskItem.configure({ nested: true }),
        Underline,
        Highlight.configure({ multicolor: false }),
        Dropcursor.configure({
          color: "var(--color-primary)",
          width: 2,
        }),
        Gapcursor,
        CharacterCount,

        // Custom nodes
        FigureNode,
        YouTubeEmbedNode,
        PassthroughBlockNode,
        TwitterCardNode,
        DetailsNode,
        FootnoteRefNode,
        FootnoteDefNode,
        MermaidNode,
        DescriptionList,
        DescriptionTerm,
        DescriptionDetails,

        // Slash command menu
        SlashCommandMenu,
      ],
      content: props.content,
      editorProps: {
        attributes: {
          class: "content",
        },
      },
      onUpdate: ({ editor: e }) => {
        props.onUpdate(e.getJSON());
        updateCounts();
      },
      onSelectionUpdate: () => {
        updateCounts();
      },
      onCreate: ({ editor: e }) => {
        updateCounts();
        e.commands.focus();
      },
    });

    setEditorInstance(editor);
  });

  onCleanup(() => {
    editor?.destroy();
  });

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div class="editor-view">
      {/* Command bar — inline replacement for window.prompt */}
      <Show when={cmdBar()}>
        {(bar) => (
          <div class="editor-cmd-bar">
            <input
              ref={(el) =>
                setTimeout(() => {
                  el.focus();
                  el.select();
                }, 0)
              }
              type="text"
              class="editor-cmd-input"
              placeholder={bar().placeholder}
              value={bar().initial}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  dismissCmdBar(e.currentTarget.value.trim() || null);
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  dismissCmdBar(null);
                  editor?.commands.focus();
                }
              }}
            />
            <span class="editor-cmd-hint">Enter to confirm &middot; Esc to cancel</span>
          </div>
        )}
      </Show>

      {/* Floating bubble toolbar — appears on text selection */}
      <Show when={editorInstance()}>{(ed) => <BubbleToolbar editor={ed()} />}</Show>

      {/* Editor content area */}
      <ErrorBoundary
        fallback={(err) => (
          <div class="content-empty">
            <p>Editor crashed: {err.message}</p>
            <p>Save your work and reload the application.</p>
          </div>
        )}
      >
        <div class="editor-content">
          <div ref={editorRef} />
        </div>
      </ErrorBoundary>
    </div>
  );
}

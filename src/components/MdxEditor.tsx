/**
 * CodeMirror 6 MDX editor with SolidJS integration.
 * Monospace code editor surface optimized for MDX authoring.
 * Uses imperative creation in onMount since CM6 has no SolidJS bindings.
 */

import {
  EditorView,
  drawSelection,
  keymap,
  placeholder,
  type KeyBinding,
} from "@codemirror/view";
import { EditorState, type StateCommand, Annotation } from "@codemirror/state";
import {
  markdown,
  markdownLanguage,
  markdownKeymap,
} from "@codemirror/lang-markdown";
import {
  bracketMatching,
  indentOnInput,
  LanguageDescription,
} from "@codemirror/language";
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
} from "@codemirror/autocomplete";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { onCleanup, onMount } from "solid-js";
import { editorTheme, highlighting } from "../lib/codemirror/theme";
import {
  slashCommandSource,
  slashAddToOptions,
} from "../lib/codemirror/slash-commands";


// ---------------------------------------------------------------------------
// Fenced code block language support (lazy-loaded)
// ---------------------------------------------------------------------------

const codeLanguages = [
  LanguageDescription.of({
    name: "javascript",
    alias: ["js"],
    load: async () => (await import("@codemirror/lang-javascript")).javascript(),
  }),
  LanguageDescription.of({
    name: "typescript",
    alias: ["ts"],
    load: async () =>
      (await import("@codemirror/lang-javascript")).javascript({
        typescript: true,
      }),
  }),
  LanguageDescription.of({
    name: "jsx",
    load: async () =>
      (await import("@codemirror/lang-javascript")).javascript({ jsx: true }),
  }),
  LanguageDescription.of({
    name: "tsx",
    load: async () =>
      (await import("@codemirror/lang-javascript")).javascript({
        jsx: true,
        typescript: true,
      }),
  }),
  LanguageDescription.of({
    name: "html",
    load: async () => (await import("@codemirror/lang-html")).html(),
  }),
  LanguageDescription.of({
    name: "css",
    load: async () => (await import("@codemirror/lang-css")).css(),
  }),
  LanguageDescription.of({
    name: "json",
    load: async () => (await import("@codemirror/lang-json")).json(),
  }),
  LanguageDescription.of({
    name: "python",
    alias: ["py"],
    load: async () => (await import("@codemirror/lang-python")).python(),
  }),
];

// ---------------------------------------------------------------------------
// Markdown formatting keybindings (Cmd+B, Cmd+I, Cmd+K)
// ---------------------------------------------------------------------------

function wrapSelection(marker: string): StateCommand {
  return ({ state: st, dispatch }) => {
    const { from, to } = st.selection.main;
    // No selection — insert paired markers and place cursor between
    if (from === to) {
      const insert = `${marker}${marker}`;
      dispatch(
        st.update({
          changes: { from, to, insert },
          selection: { anchor: from + marker.length },
        }),
      );
      return true;
    }
    const selected = st.doc.sliceString(from, to);
    // If already wrapped, unwrap (but only if inner text doesn't contain the marker)
    const inner = selected.slice(marker.length, -marker.length);
    if (
      selected.startsWith(marker) &&
      selected.endsWith(marker) &&
      selected.length >= marker.length * 2 &&
      !inner.includes(marker)
    ) {
      dispatch(
        st.update({
          changes: {
            from,
            to,
            insert: selected.slice(marker.length, -marker.length),
          },
        }),
      );
      return true;
    }
    // Check surrounding text
    const before = st.doc.sliceString(
      Math.max(0, from - marker.length),
      from,
    );
    const after = st.doc.sliceString(
      to,
      Math.min(st.doc.length, to + marker.length),
    );
    if (before === marker && after === marker) {
      dispatch(
        st.update({
          changes: [
            { from: from - marker.length, to: from, insert: "" },
            { from: to, to: to + marker.length, insert: "" },
          ],
        }),
      );
      return true;
    }
    // Wrap
    dispatch(
      st.update({
        changes: { from, to, insert: `${marker}${selected}${marker}` },
        selection: {
          anchor: from + marker.length,
          head: to + marker.length,
        },
      }),
    );
    return true;
  };
}

const insertLink: StateCommand = ({ state: st, dispatch }) => {
  const { from, to } = st.selection.main;
  const selected = st.doc.sliceString(from, to);
  if (selected) {
    // If selection is a URL, place it in the URL position
    if (/^https?:\/\//.test(selected)) {
      const insert = `[text](${selected})`;
      dispatch(
        st.update({
          changes: { from, to, insert },
          selection: { anchor: from + 1, head: from + 5 },
        }),
      );
    } else {
      const insert = `[${selected}](url)`;
      dispatch(
        st.update({
          changes: { from, to, insert },
          selection: {
            anchor: from + selected.length + 3,
            head: from + selected.length + 6,
          },
        }),
      );
    }
  } else {
    const insert = "[text](url)";
    dispatch(
      st.update({
        changes: { from, to, insert },
        selection: { anchor: from + 1, head: from + 5 },
      }),
    );
  }
  return true;
};

const markdownFormattingKeymap: KeyBinding[] = [
  { key: "Mod-b", run: wrapSelection("**") },
  { key: "Mod-i", run: wrapSelection("*") },
  { key: "Mod-e", run: wrapSelection("`") },
  { key: "Mod-Shift-x", run: wrapSelection("~~") },
  { key: "Mod-k", run: insertLink },
];

// ---------------------------------------------------------------------------
// Word count — strips MDX/Markdown syntax for accurate prose count
// ---------------------------------------------------------------------------

function countWords(doc: string): number {
  // Strip fenced code blocks (handles unclosed blocks gracefully)
  const lines = doc.split("\n");
  const proseLines: string[] = [];
  let inCodeBlock = false;
  for (const line of lines) {
    if (/^```/.test(line)) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (!inCodeBlock) proseLines.push(line);
  }
  const cleaned = proseLines
    .join("\n")
    .replace(/<[A-Z]\w+[^>]*\/>/g, "") // JSX self-closing
    .replace(/<\/?[A-Z]\w+[^>]*>/g, "") // JSX open/close
    .replace(/<\/?[a-z]\w*[^>]*>/g, "") // HTML tags
    .replace(/^import\s.*$/gm, "") // imports
    .replace(/^#{1,6}\s/gm, "") // heading markers
    .replace(/\*{1,3}|_{1,3}/g, "") // bold/italic
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links -> text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "") // images
    .replace(/^---$/gm, "") // hr
    .replace(/`([^`]*)`/g, "$1") // inline code -> text
    .replace(/^>\s?/gm, "") // blockquote markers
    .replace(/^[\s]*[-*+]\s/gm, "") // unordered list markers
    .replace(/^[\s]*\d+\.\s/gm, "") // ordered list markers
    .replace(/&[#a-z0-9]+;/gi, " "); // HTML entities
  return cleaned.trim()
    ? cleaned
        .trim()
        .split(/\s+/)
        .filter((w) => w.length > 0).length
    : 0;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EditorSnapshot {
  scrollTop: number;
  selection: { anchor: number; head: number };
}

export interface EditorMethods {
  setContent: (text: string) => void;
  getSnapshot: () => EditorSnapshot | null;
  restoreSnapshot: (snap: EditorSnapshot) => void;
}

interface Props {
  content: string;
  onChange: (text: string) => void;
  onStatsUpdate?: (words: number, chars: number) => void;
  onEditorReady?: (methods: EditorMethods) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/** Annotation marking programmatic (non-user) content changes. */
const programmaticChange = Annotation.define<boolean>();

/** Safe requestIdleCallback with setTimeout fallback. */
const rIC: typeof requestIdleCallback =
  typeof requestIdleCallback === "function"
    ? requestIdleCallback
    : ((cb: () => void) => setTimeout(cb, 0)) as typeof requestIdleCallback;
const cIC: typeof cancelIdleCallback =
  typeof cancelIdleCallback === "function"
    ? cancelIdleCallback
    : ((id: number) => clearTimeout(id)) as typeof cancelIdleCallback;

export function MdxEditor(props: Props) {
  let containerRef!: HTMLDivElement;
  let view: EditorView | null = null;
  let statsTimer: ReturnType<typeof rIC> | null = null;

  function computeStats(doc: string) {
    const chars = doc.length;
    const words = countWords(doc);
    props.onStatsUpdate?.(words, chars);
  }

  function debouncedStats(doc: string) {
    if (statsTimer != null) cIC(statsTimer);
    statsTimer = rIC(() => computeStats(doc));
  }

  onMount(() => {
    const startState = EditorState.create({
      doc: props.content,
      extensions: [
        history(),
        drawSelection(),
        bracketMatching(),
        closeBrackets(),
        indentOnInput(),
        highlightSelectionMatches(),
        EditorView.lineWrapping,
        placeholder("What's on your mind?"),
        markdown({ base: markdownLanguage, codeLanguages }),
        editorTheme,
        highlighting,
        autocompletion({
          override: [slashCommandSource],
          activateOnTyping: true,
          icons: false,
          addToOptions: slashAddToOptions,
        }),

        keymap.of([
          ...markdownFormattingKeymap,
          indentWithTab,
          ...closeBracketsKeymap,
          ...markdownKeymap,
          ...defaultKeymap,
          ...historyKeymap,
          ...searchKeymap,
        ]),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged) return;
          // Skip programmatic (non-user) changes
          if (update.transactions.some((t) => t.annotation(programmaticChange))) return;
          const text = update.state.doc.toString();
          props.onChange(text);
          debouncedStats(text);
        }),
      ],
    });

    view = new EditorView({
      state: startState,
      parent: containerRef,
    });

    computeStats(props.content);

    props.onEditorReady?.({
      setContent: (text: string) => {
        if (!view) return;
        const scrollTop = view.scrollDOM.scrollTop;
        const docLen = view.state.doc.length;
        view.dispatch({
          changes: { from: 0, to: docLen, insert: text },
          selection: {
            anchor: Math.min(view.state.selection.main.anchor, text.length),
            head: Math.min(view.state.selection.main.head, text.length),
          },
          annotations: programmaticChange.of(true),
        });
        computeStats(text);
        requestAnimationFrame(() => {
          if (view) view.scrollDOM.scrollTop = scrollTop;
        });
      },
      getSnapshot: () => {
        if (!view) return null;
        const sel = view.state.selection.main;
        return {
          scrollTop: view.scrollDOM.scrollTop,
          selection: { anchor: sel.anchor, head: sel.head },
        };
      },
      restoreSnapshot: (snap: EditorSnapshot) => {
        if (!view) return;
        const docLen = view.state.doc.length;
        const anchor = Math.min(snap.selection.anchor, docLen);
        const head = Math.min(snap.selection.head, docLen);
        view.dispatch({ selection: { anchor, head } });
        view.focus();
        requestAnimationFrame(() => {
          if (view) view.scrollDOM.scrollTop = snap.scrollTop;
        });
      },
    });
  });

  onCleanup(() => {
    if (statsTimer != null) cIC(statsTimer);
    view?.destroy();
    view = null;
  });

  return (
    <div class="mdx-editor">
      <div ref={containerRef} />
    </div>
  );
}

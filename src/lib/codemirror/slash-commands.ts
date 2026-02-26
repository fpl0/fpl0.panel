import type { CompletionContext, CompletionResult, Completion } from "@codemirror/autocomplete";
import { EditorSelection } from "@codemirror/state";

interface SlashItem {
  label: string;
  section: string;
  detail: string;
  icon: string;
  template: string;
  /** Regex to find insertion point — cursor will be placed after the match */
  cursorTarget?: RegExp;
  /** Regex to find placeholder text — matched text will be selected for replacement */
  selectTarget?: RegExp;
}

const slashItems: SlashItem[] = [
  // Text
  {
    label: "Heading 2",
    section: "Text",
    detail: "h2",
    icon: "heading",
    template: "## ",
  },
  {
    label: "Heading 3",
    section: "Text",
    detail: "h3",
    icon: "heading",
    template: "### ",
  },
  {
    label: "Blockquote",
    section: "Text",
    detail: "> quote",
    icon: "quote",
    template: "> ",
  },

  // Lists
  {
    label: "Bullet List",
    section: "Lists",
    detail: "- item",
    icon: "list",
    template: "- ",
  },
  {
    label: "Ordered List",
    section: "Lists",
    detail: "1. item",
    icon: "listOrdered",
    template: "1. ",
  },
  {
    label: "Task List",
    section: "Lists",
    detail: "checkbox",
    icon: "taskList",
    template: "- [ ] ",
  },

  // Media
  {
    label: "Figure",
    section: "Media",
    detail: "image",
    icon: "image",
    template: '<Figure src="" alt="" width={0} height={0} label="" caption="" />',
    cursorTarget: /src="/,
  },
  {
    label: "YouTube",
    section: "Media",
    detail: "video",
    icon: "youtube",
    template: '<LiteYouTube videoId="" title="" />',
    cursorTarget: /videoId="/,
  },
  {
    label: "Twitter / X",
    section: "Media",
    detail: "tweet",
    icon: "twitter",
    template: '<TwitterCard tweetId="" />',
    cursorTarget: /tweetId="/,
  },

  // Code
  {
    label: "Code Block",
    section: "Code",
    detail: "```",
    icon: "code",
    template: "```language\n\n```",
    selectTarget: /language/,
  },
  {
    label: "Mermaid",
    section: "Code",
    detail: "diagram",
    icon: "mermaid",
    template: "```mermaid\ngraph TD\n  A[Start] --> B[End]\n```",
    selectTarget: /graph TD\n  A\[Start\] --> B\[End\]/,
  },

  // Layout
  {
    label: "Details",
    section: "Layout",
    detail: "collapse",
    icon: "details",
    template: "<details>\n<summary>Title</summary>\n\nContent\n\n</details>",
    selectTarget: /Title/,
  },
  {
    label: "Horizontal Rule",
    section: "Layout",
    detail: "---",
    icon: "rule",
    template: "---\n\n",
  },
  {
    label: "Table",
    section: "Layout",
    detail: "grid",
    icon: "table",
    template:
      '<Table label="" caption="">\n\n| Col 1 | Col 2 |\n| --- | --- |\n| Cell | Cell |\n\n</Table>',
    selectTarget: /Col 1/,
  },
  {
    label: "Definition List",
    section: "Layout",
    detail: "term",
    icon: "definition",
    template: "Term\n: Definition",
    selectTarget: /Term/,
  },
  {
    label: "Footnote",
    section: "Layout",
    detail: "[^n]",
    icon: "footnote",
    template: "[^1]",
  },
];

// ---------------------------------------------------------------------------
// SVG Icon System
// Uses document.createElementNS per CLAUDE.md — never innerHTML.
// ---------------------------------------------------------------------------

const SVG_NS = "http://www.w3.org/2000/svg";

function svgEl(tag: string, attrs: Record<string, string>): SVGElement {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function createSvgIcon(
  children: (parent: SVGSVGElement) => void,
): () => SVGSVGElement {
  return () => {
    const svg = document.createElementNS(SVG_NS, "svg") as SVGSVGElement;
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("width", "16");
    svg.setAttribute("height", "16");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.5");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    children(svg);
    return svg;
  };
}

const iconBuilders: Record<string, () => SVGSVGElement> = {
  heading: createSvgIcon((svg) => {
    // H with a crossbar
    svg.appendChild(svgEl("line", { x1: "2", y1: "3", x2: "2", y2: "13" }));
    svg.appendChild(svgEl("line", { x1: "9", y1: "3", x2: "9", y2: "13" }));
    svg.appendChild(svgEl("line", { x1: "2", y1: "8", x2: "9", y2: "8" }));
    // Small decorative lines
    svg.appendChild(svgEl("line", { x1: "12", y1: "6", x2: "14", y2: "6" }));
    svg.appendChild(svgEl("line", { x1: "12", y1: "9", x2: "14", y2: "9" }));
  }),

  quote: createSvgIcon((svg) => {
    // Opening quote marks
    svg.appendChild(svgEl("path", { d: "M3 5 C3 3, 6 3, 6 5 C6 7, 3 8, 3 8" }));
    svg.appendChild(svgEl("path", { d: "M9 5 C9 3, 12 3, 12 5 C12 7, 9 8, 9 8" }));
    // Line below
    svg.appendChild(svgEl("line", { x1: "3", y1: "11", x2: "13", y2: "11" }));
  }),

  list: createSvgIcon((svg) => {
    // Bullets
    svg.appendChild(svgEl("circle", { cx: "3", cy: "4", r: "1", fill: "currentColor", stroke: "none" }));
    svg.appendChild(svgEl("circle", { cx: "3", cy: "8", r: "1", fill: "currentColor", stroke: "none" }));
    svg.appendChild(svgEl("circle", { cx: "3", cy: "12", r: "1", fill: "currentColor", stroke: "none" }));
    // Lines
    svg.appendChild(svgEl("line", { x1: "6", y1: "4", x2: "14", y2: "4" }));
    svg.appendChild(svgEl("line", { x1: "6", y1: "8", x2: "14", y2: "8" }));
    svg.appendChild(svgEl("line", { x1: "6", y1: "12", x2: "14", y2: "12" }));
  }),

  listOrdered: createSvgIcon((svg) => {
    // Numbers (as simple strokes approximation)
    svg.appendChild(svgEl("text", { x: "1", y: "5.5", "font-size": "5", fill: "currentColor", stroke: "none", "font-family": "system-ui" })).textContent = "1";
    svg.appendChild(svgEl("text", { x: "1", y: "9.5", "font-size": "5", fill: "currentColor", stroke: "none", "font-family": "system-ui" })).textContent = "2";
    svg.appendChild(svgEl("text", { x: "1", y: "13.5", "font-size": "5", fill: "currentColor", stroke: "none", "font-family": "system-ui" })).textContent = "3";
    // Lines
    svg.appendChild(svgEl("line", { x1: "6", y1: "4", x2: "14", y2: "4" }));
    svg.appendChild(svgEl("line", { x1: "6", y1: "8", x2: "14", y2: "8" }));
    svg.appendChild(svgEl("line", { x1: "6", y1: "12", x2: "14", y2: "12" }));
  }),

  taskList: createSvgIcon((svg) => {
    // Checkbox
    svg.appendChild(svgEl("rect", { x: "1.5", y: "2.5", width: "5", height: "5", rx: "1" }));
    // Checkmark
    svg.appendChild(svgEl("polyline", { points: "2.5,5 3.8,6.5 5.5,3.5" }));
    // Lines
    svg.appendChild(svgEl("line", { x1: "9", y1: "5", x2: "14", y2: "5" }));
    // Empty checkbox
    svg.appendChild(svgEl("rect", { x: "1.5", y: "9.5", width: "5", height: "5", rx: "1" }));
    svg.appendChild(svgEl("line", { x1: "9", y1: "12", x2: "14", y2: "12" }));
  }),

  image: createSvgIcon((svg) => {
    // Frame
    svg.appendChild(svgEl("rect", { x: "1.5", y: "2.5", width: "13", height: "11", rx: "1.5" }));
    // Mountain
    svg.appendChild(svgEl("polyline", { points: "1.5,11 5,7 8,10 10,8.5 14.5,13" }));
    // Sun
    svg.appendChild(svgEl("circle", { cx: "11", cy: "5.5", r: "1.5" }));
  }),

  youtube: createSvgIcon((svg) => {
    // Rounded rectangle
    svg.appendChild(svgEl("rect", { x: "1", y: "3", width: "14", height: "10", rx: "2" }));
    // Play triangle
    svg.appendChild(svgEl("polygon", { points: "6.5,5.5 6.5,10.5 11,8", fill: "currentColor", stroke: "none" }));
  }),

  twitter: createSvgIcon((svg) => {
    // Simplified bird / X shape
    svg.appendChild(svgEl("path", { d: "M2 3 L7 8 L2 13" }));
    svg.appendChild(svgEl("path", { d: "M14 3 L9 8 L14 13" }));
  }),

  code: createSvgIcon((svg) => {
    // Angle brackets
    svg.appendChild(svgEl("polyline", { points: "5,3 1.5,8 5,13" }));
    svg.appendChild(svgEl("polyline", { points: "11,3 14.5,8 11,13" }));
    // Slash
    svg.appendChild(svgEl("line", { x1: "9.5", y1: "2.5", x2: "6.5", y2: "13.5" }));
  }),

  mermaid: createSvgIcon((svg) => {
    // Flowchart nodes
    svg.appendChild(svgEl("rect", { x: "4.5", y: "1", width: "7", height: "4", rx: "1" }));
    svg.appendChild(svgEl("rect", { x: "1", y: "11", width: "5", height: "4", rx: "1" }));
    svg.appendChild(svgEl("rect", { x: "10", y: "11", width: "5", height: "4", rx: "1" }));
    // Connecting lines
    svg.appendChild(svgEl("line", { x1: "6.5", y1: "5", x2: "3.5", y2: "11" }));
    svg.appendChild(svgEl("line", { x1: "9.5", y1: "5", x2: "12.5", y2: "11" }));
  }),

  details: createSvgIcon((svg) => {
    // Disclosure triangle
    svg.appendChild(svgEl("polygon", { points: "2,4 6,7 2,10", fill: "currentColor", stroke: "none" }));
    // Summary line
    svg.appendChild(svgEl("line", { x1: "8", y1: "7", x2: "14", y2: "7" }));
    // Content lines
    svg.appendChild(svgEl("line", { x1: "4", y1: "11", x2: "14", y2: "11" }));
    svg.appendChild(svgEl("line", { x1: "4", y1: "14", x2: "11", y2: "14" }));
  }),

  rule: createSvgIcon((svg) => {
    // Three dots for thematic break
    svg.appendChild(svgEl("circle", { cx: "4", cy: "8", r: "1.2", fill: "currentColor", stroke: "none" }));
    svg.appendChild(svgEl("circle", { cx: "8", cy: "8", r: "1.2", fill: "currentColor", stroke: "none" }));
    svg.appendChild(svgEl("circle", { cx: "12", cy: "8", r: "1.2", fill: "currentColor", stroke: "none" }));
  }),

  table: createSvgIcon((svg) => {
    // Outer frame
    svg.appendChild(svgEl("rect", { x: "1.5", y: "2", width: "13", height: "12", rx: "1.5" }));
    // Horizontal dividers
    svg.appendChild(svgEl("line", { x1: "1.5", y1: "6", x2: "14.5", y2: "6" }));
    svg.appendChild(svgEl("line", { x1: "1.5", y1: "10", x2: "14.5", y2: "10" }));
    // Vertical divider
    svg.appendChild(svgEl("line", { x1: "8", y1: "2", x2: "8", y2: "14" }));
  }),

  definition: createSvgIcon((svg) => {
    // "D" letterform abstraction
    svg.appendChild(svgEl("line", { x1: "2", y1: "3", x2: "2", y2: "8" }));
    svg.appendChild(svgEl("path", { d: "M2 3 C8 3, 8 8, 2 8" }));
    // Definition line
    svg.appendChild(svgEl("line", { x1: "5", y1: "12", x2: "14", y2: "12" }));
    svg.appendChild(svgEl("circle", { cx: "3", cy: "12", r: "0.8", fill: "currentColor", stroke: "none" }));
  }),

  footnote: createSvgIcon((svg) => {
    // Superscript number
    svg.appendChild(svgEl("text", { x: "8", y: "6", "font-size": "6", fill: "currentColor", stroke: "none", "font-family": "system-ui", "font-weight": "bold" })).textContent = "1";
    // Underline
    svg.appendChild(svgEl("line", { x1: "3", y1: "12", x2: "13", y2: "12" }));
    svg.appendChild(svgEl("line", { x1: "3", y1: "14.5", x2: "10", y2: "14.5" }));
  }),
};

// ---------------------------------------------------------------------------
// Completion source
// ---------------------------------------------------------------------------

/** Type-safe icon association — WeakMap so short-lived Completion objects get GC'd. */
const completionIcons = new WeakMap<Completion, string>();

/**
 * CodeMirror completion source for slash commands.
 * Triggers when `/` is typed at the start of a line (empty or whitespace-only).
 */
export function slashCommandSource(context: CompletionContext): CompletionResult | null {
  const line = context.state.doc.lineAt(context.pos);
  const textBefore = line.text.slice(0, context.pos - line.from);

  // Must be `/` at line start, optionally followed by filter text
  const match = textBefore.match(/^\s*\/(\w*)$/);
  if (!match) return null;

  // `slashPos` is the "/" itself; `from` is one char after it.
  // This way CM's filter query is the typed chars *after* "/" (e.g. "he")
  // and fuzzy-matches labels like "Heading 2" correctly.
  const slashPos = line.from + textBefore.indexOf("/");
  const from = slashPos + 1;

  const completions: Completion[] = slashItems.map((item) => {
    const c: Completion = {
      label: item.label,
      detail: item.detail,
      section: item.section,
      apply: (view, _completion, from, to) => {
        // Replace from the "/" (one char before `from`) through cursor
        const replaceFrom = from - 1;
        const insert = item.template;
        const selection = getSelection(item, replaceFrom, insert);
        view.dispatch({
          changes: { from: replaceFrom, to, insert },
          selection,
        });
      },
    };
    completionIcons.set(c, item.icon);
    return c;
  });

  return {
    from,
    options: completions,
    filter: true,
    validFor: /^\w*$/,
  };
}

// ---------------------------------------------------------------------------
// addToOptions — custom rendering hooks for CM6 autocomplete
// ---------------------------------------------------------------------------

export const slashAddToOptions = [
  {
    render(completion: Completion): HTMLElement | null {
      const iconKey = completionIcons.get(completion);
      if (!iconKey) return null;
      const builder = iconBuilders[iconKey];
      if (!builder) return null;

      const container = document.createElement("span");
      container.className = "cm-slash-icon";
      container.setAttribute("aria-hidden", "true");
      container.appendChild(builder());
      return container;
    },
    position: 20,
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSelection(item: SlashItem, from: number, insert: string): EditorSelection {
  if (item.selectTarget) {
    const match = item.selectTarget.exec(insert);
    if (match) {
      const anchor = from + match.index;
      const head = anchor + match[0].length;
      return EditorSelection.create([EditorSelection.range(anchor, head)]);
    }
  }
  if (item.cursorTarget) {
    const match = item.cursorTarget.exec(insert);
    if (match) {
      return EditorSelection.create([EditorSelection.cursor(from + match.index + match[0].length)]);
    }
  }
  return EditorSelection.create([EditorSelection.cursor(from + insert.length)]);
}

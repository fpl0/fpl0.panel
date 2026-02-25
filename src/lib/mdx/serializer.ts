import type { JSONContent } from "@tiptap/core";
import { escapeJsxAttrValue } from "./utils";

/** Type-safe accessor for node attributes, defaulting to the provided fallback. */
function attr(node: JSONContent, key: string, fallback: string): string;
function attr(node: JSONContent, key: string, fallback: number): number;
function attr(node: JSONContent, key: string, fallback: string | number): string | number {
  const val = node.attrs?.[key];
  if (val == null) return fallback;
  return typeof fallback === "number" ? Number(val) : String(val);
}

export function proseMirrorToMdx(doc: JSONContent): string {
  return (doc.content ?? []).map((n) => serializeNode(n, "")).join("\n\n");
}

function serializeList(
  node: JSONContent,
  indent: string,
  markerFn: (item: JSONContent, i: number) => string,
): string {
  return (node.content ?? [])
    .map((item, i) => {
      const marker = markerFn(item, i);
      const padding = " ".repeat(marker.length);
      const children = item.content ?? [];
      const parts: string[] = [];

      for (let c = 0; c < children.length; c++) {
        const child = children[c];
        const isNestedList =
          child.type === "bulletList" ||
          child.type === "orderedList" ||
          child.type === "taskList";

        if (c === 0) {
          // First child gets the marker
          parts.push(`${indent}${marker}${serializeNode(child, indent + padding)}`);
        } else if (isNestedList) {
          // Nested lists recurse with increased indent
          parts.push(serializeNode(child, indent + padding));
        } else {
          // Continuation paragraphs
          parts.push(`${indent}${padding}${serializeNode(child, indent + padding)}`);
        }
      }

      return parts.join("\n");
    })
    .join("\n");
}

function serializeNode(node: JSONContent, indent = ""): string {
  switch (node.type) {
    case "paragraph":
      return serializeInline(node.content ?? []);

    case "heading": {
      const level = attr(node, "level", 2);
      const prefix = "#".repeat(level);
      return `${prefix} ${serializeInline(node.content ?? [])}`;
    }

    case "blockquote": {
      const inner = (node.content ?? []).map((n) => serializeNode(n, "")).join("\n\n");
      return inner
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n");
    }

    case "bulletList":
      return serializeList(node, indent, () => "- ");

    case "orderedList":
      return serializeList(node, indent, (_item, i) => `${i + 1}. `);

    case "taskList":
      return serializeList(node, indent, (item) => {
        const checked = item.attrs?.checked ? "x" : " ";
        return `- [${checked}] `;
      });

    case "codeBlock": {
      const lang = attr(node, "language", "");
      const code = (node.content ?? []).map((c) => c.text ?? "").join("");
      return `\`\`\`${lang}\n${code}\n\`\`\``;
    }

    case "mermaidDiagram": {
      const code = (node.content ?? []).map((c) => c.text ?? "").join("");
      return `\`\`\`mermaid\n${code}\n\`\`\``;
    }

    case "horizontalRule":
      return "---";

    case "image": {
      const src = attr(node, "src", "");
      const alt = attr(node, "alt", "");
      return `![${alt}](${src})`;
    }

    case "figure": {
      const src = attr(node, "src", "");
      const alt = attr(node, "alt", "");
      const caption = attr(node, "caption", "");
      const label = attr(node, "label", "");
      const width = attr(node, "width", "");
      const height = attr(node, "height", "");
      const pairs = [`src="${escapeJsxAttrValue(src)}"`, `alt="${escapeJsxAttrValue(alt)}"`];
      if (width) pairs.push(`width={${width}}`);
      if (height) pairs.push(`height={${height}}`);
      if (label) pairs.push(`label="${escapeJsxAttrValue(label)}"`);
      if (caption) pairs.push(`caption="${escapeJsxAttrValue(caption)}"`);
      return `<Figure ${pairs.join(" ")} />`;
    }

    case "youtubeEmbed": {
      const videoId = attr(node, "videoId", "");
      const title = attr(node, "title", "");
      return `<LiteYouTube videoId="${escapeJsxAttrValue(videoId)}" title="${escapeJsxAttrValue(title)}" />`;
    }

    case "twitterCard": {
      const id = attr(node, "id", "");
      return `<TwitterCard id="${escapeJsxAttrValue(id)}" />`;
    }

    case "details": {
      const summary = attr(node, "summary", "Details");
      const inner = (node.content ?? []).map((n) => serializeNode(n, "")).join("\n\n");
      return `<details>\n<summary>${escapeJsxAttrValue(summary)}</summary>\n\n${inner}\n\n</details>`;
    }

    case "footnoteDef": {
      const identifier = attr(node, "identifier", "");
      const text = serializeInline(node.content ?? []);
      return `[^${identifier}]: ${text}`;
    }

    case "passthroughBlock":
      return attr(node, "content", "");

    case "table": {
      const label = attr(node, "label", "") || undefined;
      const caption = attr(node, "caption", "") || undefined;

      const rows = node.content ?? [];
      if (rows.length === 0) return "";
      const headerRow = rows[0];
      const headerCells = (headerRow?.content ?? []).map((cell) =>
        serializeInline(cell.content?.[0]?.content ?? []),
      );
      const separator = headerCells.map(() => "---");
      const bodyRows = rows
        .slice(1)
        .map((row) =>
          (row.content ?? []).map((cell) => serializeInline(cell.content?.[0]?.content ?? [])),
        );

      const lines = [
        `| ${headerCells.join(" | ")} |`,
        `| ${separator.join(" | ")} |`,
        ...bodyRows.map((cells) => `| ${cells.join(" | ")} |`),
      ];
      const tableStr = lines.join("\n");

      if (label || caption) {
        const attrs = [];
        if (label) attrs.push(`label="${escapeJsxAttrValue(label)}"`);
        if (caption) attrs.push(`caption="${escapeJsxAttrValue(caption)}"`);
        return `<Table ${attrs.join(" ")}>\n${tableStr}\n</Table>`;
      }
      return tableStr;
    }

    case "descriptionList": {
      const inner = (node.content ?? []).map((n) => serializeNode(n, "")).join("\n");
      return `<dl>\n${inner}\n</dl>`;
    }

    case "descriptionTerm": {
      return `  <dt>${serializeInline(node.content ?? [])}</dt>`;
    }

    case "descriptionDetails": {
      const inner = (node.content ?? []).map((n) => serializeNode(n, "")).join("\n");
      return `  <dd>${inner}</dd>`;
    }

    default:
      return "";
  }
}

function serializeInline(nodes: JSONContent[]): string {
  return nodes.map(serializeInlineNode).join("");
}

function serializeInlineNode(node: JSONContent): string {
  if (node.type === "text") {
    const marks = node.marks ?? [];
    // inlineJsx mark: emit raw text with no wrapping
    if (marks.some((m) => m.type === "inlineJsx")) {
      return node.text ?? "";
    }
    let text = node.text ?? "";
    for (const mark of marks) {
      switch (mark.type) {
        case "bold":
          text = `**${text}**`;
          break;
        case "italic":
          text = `*${text}*`;
          break;
        case "strike":
          text = `~~${text}~~`;
          break;
        case "code":
          text = `\`${text}\``;
          break;
        case "link":
          text = `[${text}](${String(mark.attrs?.href ?? "")})`;
          break;
        case "underline":
          text = `<u>${text}</u>`;
          break;
        default:
          break;
      }
    }
    return text;
  }
  if (node.type === "image") {
    return `![${attr(node, "alt", "")}](${attr(node, "src", "")})`;
  }
  if (node.type === "footnoteRef") {
    return `[^${attr(node, "identifier", "")}]`;
  }
  if (node.type === "hardBreak") {
    return "  \n";
  }
  return "";
}

/**
 * MDX <-> TipTap ProseMirror serialization.
 *
 * Parse:  MDX string -> split frontmatter/body -> unified MDAST -> ProseMirror JSON
 * Serialize: ProseMirror JSON -> MDX markdown + JSX -> prepend frontmatter YAML
 */
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkFrontmatter from "remark-frontmatter";
import remarkMdx from "remark-mdx";
import remarkGfm from "remark-gfm";
import type { JSONContent } from "@tiptap/core";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MdastNode {
  type: string;
  children?: MdastNode[];
  value?: string;
  url?: string;
  title?: string | null;
  alt?: string;
  depth?: number;
  ordered?: boolean;
  lang?: string | null;
  meta?: string | null;
  name?: string;
  attributes?: MdastAttribute[];
  checked?: boolean | null;
  [key: string]: unknown;
}

interface MdastAttribute {
  type: string;
  name: string;
  value: string | { value: string } | null;
}

// ---------------------------------------------------------------------------
// Frontmatter splitting
// ---------------------------------------------------------------------------

export function splitFrontmatter(mdx: string): { yaml: string; body: string } {
  const match = mdx.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { yaml: "", body: mdx };
  return {
    yaml: match[1],
    body: mdx.slice(match[0].length),
  };
}

export function assembleMdx(
  yaml: string,
  body: string,
  imports: string[],
): string {
  const importBlock =
    imports.length > 0 ? `\n${imports.join("\n")}\n` : "";
  return `---\n${yaml}\n---${importBlock}\n${body}`;
}

// ---------------------------------------------------------------------------
// Parse: MDX body -> MDAST -> ProseMirror JSON
// ---------------------------------------------------------------------------

function parseBodyToMdast(body: string): MdastNode {
  const tree = unified()
    .use(remarkParse)
    .use(remarkFrontmatter)
    .use(remarkMdx)
    .use(remarkGfm)
    .parse(body) as unknown as MdastNode;
  return tree;
}

function mdastToProseMirror(node: MdastNode): JSONContent | null {
  switch (node.type) {
    case "root":
      return {
        type: "doc",
        content: (node.children ?? [])
          .map(mdastToProseMirror)
          .filter((n): n is JSONContent => n !== null),
      };

    case "paragraph": {
      const content = inlineChildren(node);
      if (content.length === 0) return null;
      return { type: "paragraph", content };
    }

    case "heading":
      return {
        type: "heading",
        attrs: { level: node.depth ?? 2 },
        content: inlineChildren(node),
      };

    case "blockquote":
      return {
        type: "blockquote",
        content: (node.children ?? [])
          .map(mdastToProseMirror)
          .filter((n): n is JSONContent => n !== null),
      };

    case "list": {
      // Check if this is a task list
      const isTaskList = (node.children ?? []).some(
        (child) => child.checked != null,
      );

      if (isTaskList) {
        return {
          type: "taskList",
          content: (node.children ?? [])
            .map((child) => {
              const content = (child.children ?? [])
                .map(mdastToProseMirror)
                .filter((n): n is JSONContent => n !== null);
              return {
                type: "taskItem",
                attrs: { checked: child.checked === true },
                content:
                  content.length > 0
                    ? content
                    : [{ type: "paragraph" }],
              };
            }) as JSONContent[],
        };
      }

      const listType = node.ordered ? "orderedList" : "bulletList";
      return {
        type: listType,
        content: (node.children ?? [])
          .map(mdastToProseMirror)
          .filter((n): n is JSONContent => n !== null),
      };
    }

    case "listItem":
      return {
        type: "listItem",
        content: (node.children ?? [])
          .map(mdastToProseMirror)
          .filter((n): n is JSONContent => n !== null),
      };

    case "code": {
      const codeText = node.value ?? "";

      // Mermaid code blocks -> mermaidDiagram node
      if (node.lang === "mermaid") {
        return {
          type: "mermaidDiagram",
          ...(codeText
            ? { content: [{ type: "text", text: codeText }] }
            : {}),
        };
      }

      return {
        type: "codeBlock",
        attrs: { language: node.lang ?? null },
        ...(codeText
          ? { content: [{ type: "text", text: codeText }] }
          : {}),
      };
    }

    case "thematicBreak":
      return { type: "horizontalRule" };

    case "image":
      return {
        type: "image",
        attrs: {
          src: node.url ?? "",
          alt: node.alt ?? "",
          title: node.title ?? null,
        },
      };

    case "table": {
      const rows = (node.children ?? []).map((row, rowIdx) => {
        const cells = (row.children ?? []).map((cell) => {
          const cellType = rowIdx === 0 ? "tableHeader" : "tableCell";
          return {
            type: cellType,
            content: (cell.children ?? [])
              .map(mdastToProseMirror)
              .filter((n): n is JSONContent => n !== null),
          };
        });
        return { type: "tableRow" as const, content: cells };
      });
      return { type: "table", content: rows };
    }

    // MDX JSX elements — store as passthrough or recognized components
    case "mdxJsxFlowElement":
    case "mdxJsxTextElement": {
      const name = node.name ?? "unknown";

      // YouTube embeds
      if (name === "LiteYouTube") {
        const videoId = getAttr(node, "videoId") ?? getAttr(node, "videoid") ?? "";
        const videoTitle = getAttr(node, "title") ?? "";
        return {
          type: "youtubeEmbed",
          attrs: { videoId, title: videoTitle },
        };
      }

      // Figure
      if (name === "Figure") {
        const src = getAttr(node, "src") ?? "";
        const alt = getAttr(node, "alt") ?? "";
        const caption = getAttr(node, "caption") ?? "";
        const label = getAttr(node, "label") ?? "";
        const width = getAttr(node, "width") ?? "";
        const height = getAttr(node, "height") ?? "";
        return {
          type: "figure",
          attrs: { src, alt, caption, label, width, height },
        };
      }

      // Table Component Wrapper
      if (name === "Table") {
        const label = getAttr(node, "label") ?? "";
        const caption = getAttr(node, "caption") ?? "";
        
        // Find the inner markdown table
        const tableNode = (node.children ?? []).find(c => c.type === "table");
        if (tableNode) {
          const pmTable = mdastToProseMirror(tableNode);
          if (pmTable && pmTable.type === "table") {
            pmTable.attrs = { ...(pmTable.attrs ?? {}), label, caption };
            return pmTable;
          }
        }
      }

      // TwitterCard
      if (name === "TwitterCard") {
        const id = getAttr(node, "id") ?? "";
        return {
          type: "twitterCard",
          attrs: { id },
        };
      }

      // <details> with <summary>
      if (name === "details") {
        // Find the <summary> child — remark-mdx may parse it as:
        //   1. A direct mdxJsxFlowElement
        //   2. An mdxJsxTextElement wrapped in a paragraph
        function isSummaryChild(c: MdastNode): boolean {
          if (c.type === "mdxJsxFlowElement" && c.name === "summary") return true;
          if (
            c.type === "paragraph" &&
            c.children?.length === 1 &&
            c.children[0].type === "mdxJsxTextElement" &&
            c.children[0].name === "summary"
          ) return true;
          return false;
        }

        const summaryChild = (node.children ?? []).find(isSummaryChild);
        let summary = "Details";
        if (summaryChild) {
          if (summaryChild.type === "mdxJsxFlowElement") {
            summary = extractText(summaryChild);
          } else {
            // Paragraph wrapping an mdxJsxTextElement
            summary = extractText(summaryChild.children![0]);
          }
        }

        const bodyChildren = (node.children ?? [])
          .filter((c) => !isSummaryChild(c))
          .map(mdastToProseMirror)
          .filter((n): n is JSONContent => n !== null);
        return {
          type: "details",
          attrs: { summary },
          content:
            bodyChildren.length > 0
              ? bodyChildren
              : [{ type: "paragraph" }],
        };
      }

      // Generic JSX passthrough
      return {
        type: "passthroughBlock",
        attrs: { content: serializeMdxElement(node) },
      };
    }

    // Footnote definitions
    case "footnoteDefinition": {
      const identifier = (node.identifier as string) ?? "";
      // Flatten first paragraph's inline children into content
      const firstPara = (node.children ?? []).find(
        (c) => c.type === "paragraph",
      );
      const content = firstPara ? inlineChildren(firstPara) : [];
      return {
        type: "footnoteDef",
        attrs: { identifier },
        content: content.length > 0 ? content : [],
      };
    }

    // MDX import/export statements — skip (handled separately)
    case "mdxjsEsm":
      return null;

    case "html":
      return {
        type: "passthroughBlock",
        attrs: { content: node.value ?? "" },
      };

    default:
      // Unknown block nodes => passthrough
      if (node.value) {
        return {
          type: "paragraph",
          content: [{ type: "text", text: node.value }],
        };
      }
      return null;
  }
}

function inlineChildren(node: MdastNode): JSONContent[] {
  const result: JSONContent[] = [];
  for (const child of node.children ?? []) {
    const inline = mdastInline(child);
    if (inline) result.push(inline);
  }
  return result;
}

function mdastInline(node: MdastNode): JSONContent | null {
  switch (node.type) {
    case "text": {
      const text = node.value ?? "";
      if (!text) return null;
      return { type: "text", text };
    }

    case "strong": {
      const children = inlineChildren(node);
      return applyMark(children, { type: "bold" });
    }

    case "emphasis": {
      const children = inlineChildren(node);
      return applyMark(children, { type: "italic" });
    }

    case "delete": {
      const children = inlineChildren(node);
      return applyMark(children, { type: "strike" });
    }

    case "inlineCode":
      return {
        type: "text",
        text: node.value ?? "",
        marks: [{ type: "code" }],
      };

    case "link": {
      const children = inlineChildren(node);
      return applyMark(children, {
        type: "link",
        attrs: { href: node.url ?? "", target: "_blank" },
      });
    }

    case "image":
      return {
        type: "image",
        attrs: {
          src: node.url ?? "",
          alt: node.alt ?? "",
          title: node.title ?? null,
        },
      };

    case "mdxJsxTextElement": {
      return {
        type: "text",
        text: serializeMdxElement(node),
        marks: [{ type: "code" }],
      };
    }

    case "footnoteReference": {
      const identifier = (node.identifier as string) ?? "";
      return {
        type: "footnoteRef",
        attrs: { identifier },
      };
    }

    default:
      if (node.value) {
        return { type: "text", text: node.value };
      }
      return null;
  }
}

function applyMark(
  children: JSONContent[],
  mark: { type: string; attrs?: Record<string, unknown> },
): JSONContent | null {
  if (children.length === 0) return null;
  // Apply mark to first text child (simplification)
  const first = children[0];
  if (!first) return null;
  return {
    ...first,
    marks: [...(first.marks ?? []), mark],
  };
}

function getAttr(node: MdastNode, name: string): string | null {
  const attr = (node.attributes ?? []).find((a) => a.name === name);
  if (!attr) return null;
  if (typeof attr.value === "string") return attr.value;
  if (
    attr.value &&
    typeof attr.value === "object" &&
    "value" in attr.value
  )
    return attr.value.value;
  return null;
}

function serializeMdxElement(node: MdastNode): string {
  const name = node.name ?? "unknown";
  const attrs = (node.attributes ?? [])
    .map((a) => {
      const val =
        typeof a.value === "string"
          ? a.value
          : a.value?.value ?? "";
      return `${a.name}="${val}"`;
    })
    .join(" ");
  const attrStr = attrs.length > 0 ? ` ${attrs}` : "";
  if (!node.children || node.children.length === 0) {
    return `<${name}${attrStr} />`;
  }
  return `<${name}${attrStr}>...</${name}>`;
}

function extractText(node: MdastNode): string {
  if (node.value) return node.value;
  return (node.children ?? []).map(extractText).join("");
}

// ---------------------------------------------------------------------------
// Serialize: ProseMirror JSON -> MDX body
// ---------------------------------------------------------------------------

function proseMirrorToMdx(doc: JSONContent): string {
  return (doc.content ?? []).map(serializeNode).join("\n\n");
}

function serializeNode(node: JSONContent): string {
  switch (node.type) {
    case "paragraph":
      return serializeInline(node.content ?? []);

    case "heading": {
      const level = (node.attrs?.level as number) ?? 2;
      const prefix = "#".repeat(level);
      return `${prefix} ${serializeInline(node.content ?? [])}`;
    }

    case "blockquote": {
      const inner = (node.content ?? [])
        .map(serializeNode)
        .join("\n\n");
      return inner
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n");
    }

    case "bulletList":
      return (node.content ?? [])
        .map((item) => {
          const inner = (item.content ?? [])
            .map(serializeNode)
            .join("\n\n");
          return `- ${inner}`;
        })
        .join("\n");

    case "orderedList":
      return (node.content ?? [])
        .map((item, i) => {
          const inner = (item.content ?? [])
            .map(serializeNode)
            .join("\n\n");
          return `${i + 1}. ${inner}`;
        })
        .join("\n");

    case "taskList":
      return (node.content ?? [])
        .map((item) => {
          const checked = item.attrs?.checked ? "x" : " ";
          const inner = (item.content ?? [])
            .map(serializeNode)
            .join("\n\n");
          return `- [${checked}] ${inner}`;
        })
        .join("\n");

    case "codeBlock": {
      const lang = (node.attrs?.language as string) ?? "";
      const code = (node.content ?? [])
        .map((c) => c.text ?? "")
        .join("");
      return `\`\`\`${lang}\n${code}\n\`\`\``;
    }

    case "mermaidDiagram": {
      const code = (node.content ?? [])
        .map((c) => c.text ?? "")
        .join("");
      return `\`\`\`mermaid\n${code}\n\`\`\``;
    }

    case "horizontalRule":
      return "---";

    case "image": {
      const src = (node.attrs?.src as string) ?? "";
      const alt = (node.attrs?.alt as string) ?? "";
      return `![${alt}](${src})`;
    }

    case "figure": {
      const src = (node.attrs?.src as string) ?? "";
      const alt = (node.attrs?.alt as string) ?? "";
      const caption = (node.attrs?.caption as string) ?? "";
      const label = (node.attrs?.label as string) ?? "";
      const width = (node.attrs?.width as string) ?? "";
      const height = (node.attrs?.height as string) ?? "";
      const attrs = [`src="${src}"`, `alt="${alt}"`];
      if (width) attrs.push(`width={${width}}`);
      if (height) attrs.push(`height={${height}}`);
      if (label) attrs.push(`label="${label}"`);
      if (caption) attrs.push(`caption="${caption}"`);
      return `<Figure ${attrs.join(" ")} />`;
    }

    case "youtubeEmbed": {
      const videoId = (node.attrs?.videoId as string) ?? "";
      const title = (node.attrs?.title as string) ?? "";
      return `<LiteYouTube videoId="${videoId}" title="${title}" />`;
    }

    case "twitterCard": {
      const id = (node.attrs?.id as string) ?? "";
      return `<TwitterCard id="${id}" />`;
    }

    case "details": {
      const summary = (node.attrs?.summary as string) ?? "Details";
      const inner = (node.content ?? [])
        .map(serializeNode)
        .join("\n\n");
      return `<details>\n<summary>${summary}</summary>\n\n${inner}\n\n</details>`;
    }

    case "footnoteDef": {
      const identifier = (node.attrs?.identifier as string) ?? "";
      const text = serializeInline(node.content ?? []);
      return `[^${identifier}]: ${text}`;
    }

    case "passthroughBlock":
      return (node.attrs?.content as string) ?? "";

    case "table": {
      const label = node.attrs?.label as string | undefined;
      const caption = node.attrs?.caption as string | undefined;

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
          (row.content ?? []).map((cell) =>
            serializeInline(cell.content?.[0]?.content ?? []),
          ),
        );

      const lines = [
        `| ${headerCells.join(" | ")} |`,
        `| ${separator.join(" | ")} |`,
        ...bodyRows.map((cells) => `| ${cells.join(" | ")} |`),
      ];
      const tableStr = lines.join("\n");

      if (label || caption) {
        const attrs = [];
        if (label) attrs.push(`label="${label}"`);
        if (caption) attrs.push(`caption="${caption}"`);
        return `<Table ${attrs.join(" ")}>\n${tableStr}\n</Table>`;
      }
      return tableStr;
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
    let text = node.text ?? "";
    const marks = node.marks ?? [];
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
          text = `[${text}](${(mark.attrs?.href as string) ?? ""})`;
          break;
        case "underline":
          // MDX doesn't have underline — use HTML
          text = `<u>${text}</u>`;
          break;
        case "highlight":
          text = `==${text}==`;
          break;
        default:
          break;
      }
    }
    return text;
  }
  if (node.type === "image") {
    return `![${(node.attrs?.alt as string) ?? ""}](${(node.attrs?.src as string) ?? ""})`;
  }
  if (node.type === "footnoteRef") {
    const identifier = (node.attrs?.identifier as string) ?? "";
    return `[^${identifier}]`;
  }
  if (node.type === "hardBreak") {
    return "  \n";
  }
  return "";
}

// ---------------------------------------------------------------------------
// Auto-import generation
// ---------------------------------------------------------------------------

function generateImports(body: string): string[] {
  const imports: string[] = [];
  const componentMap: Record<string, string> = {
    LiteYouTube:
      'import LiteYouTube from "../../../components/LiteYouTube.astro";',
    Figure: 'import Figure from "../../../components/Figure.astro";',
    Table: 'import Table from "../../../components/Table.astro";',
    TwitterCard:
      'import TwitterCard from "../../../components/TwitterCard.astro";',
  };

  for (const [component, importStatement] of Object.entries(componentMap)) {
    if (body.includes(`<${component}`)) {
      imports.push(importStatement);
    }
  }

  return imports;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function parseMdxToEditor(mdx: string): {
  yaml: string;
  doc: JSONContent;
} {
  const { yaml, body } = splitFrontmatter(mdx);
  // Strip import lines from body before parsing
  const cleanBody = body
    .split("\n")
    .filter((line) => !line.startsWith("import "))
    .join("\n")
    .trim();
  const mdast = parseBodyToMdast(cleanBody);
  const doc = mdastToProseMirror(mdast) ?? {
    type: "doc",
    content: [],
  };
  return { yaml, doc };
}

export function serializeEditorToMdx(
  yaml: string,
  doc: JSONContent,
): string {
  const body = proseMirrorToMdx(doc);
  const imports = generateImports(body);
  return assembleMdx(yaml, body, imports);
}

import type { JSONContent } from "@tiptap/core";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkMdx from "remark-mdx";
import remarkParse from "remark-parse";
import { unified } from "unified";
import type { MdastNode } from "./types";
import { extractText, getAttr, serializeMdxElement } from "./utils";

/**
 * Parse a Markdown/MDX body string into a generic MDAST tree.
 *
 * The cast is necessary because unified's `Root` type doesn't include MDX
 * extensions (mdxJsxFlowElement, mdxJsxTextElement, etc.) and our `MdastNode`
 * interface covers the superset of all node shapes we handle.
 */
export function parseBodyToMdast(body: string): MdastNode {
  const tree = unified()
    .use(remarkParse)
    .use(remarkFrontmatter)
    .use(remarkMdx)
    .use(remarkGfm)
    .parse(body);
  // unified's Root structurally satisfies MdastNode (type, children, etc.)
  return tree as unknown as MdastNode;
}

export function mdastToProseMirror(node: MdastNode): JSONContent | null {
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
      const isTaskList = (node.children ?? []).some((child) => child.checked != null);

      if (isTaskList) {
        return {
          type: "taskList",
          content: (node.children ?? []).map((child) => {
            const content = (child.children ?? [])
              .map(mdastToProseMirror)
              .filter((n): n is JSONContent => n !== null);
            return {
              type: "taskItem",
              attrs: { checked: child.checked === true },
              content: content.length > 0 ? content : [{ type: "paragraph" }],
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

      if (node.lang === "mermaid") {
        return {
          type: "mermaidDiagram",
          ...(codeText ? { content: [{ type: "text", text: codeText }] } : {}),
        };
      }

      return {
        type: "codeBlock",
        attrs: { language: node.lang ?? null },
        ...(codeText ? { content: [{ type: "text", text: codeText }] } : {}),
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

    case "mdxJsxFlowElement":
    case "mdxJsxTextElement": {
      const name = node.name ?? "unknown";

      if (name === "LiteYouTube") {
        const videoId = getAttr(node, "videoId") ?? getAttr(node, "videoid") ?? "";
        const videoTitle = getAttr(node, "title") ?? "";
        return {
          type: "youtubeEmbed",
          attrs: { videoId, title: videoTitle },
        };
      }

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

      if (name === "Table") {
        const label = getAttr(node, "label") ?? "";
        const caption = getAttr(node, "caption") ?? "";

        const tableNode = (node.children ?? []).find((c) => c.type === "table");
        if (tableNode) {
          const pmTable = mdastToProseMirror(tableNode);
          if (pmTable && pmTable.type === "table") {
            pmTable.attrs = { ...(pmTable.attrs ?? {}), label, caption };
            return pmTable;
          }
        }
      }

      if (name === "TwitterCard") {
        const id = getAttr(node, "id") ?? "";
        return {
          type: "twitterCard",
          attrs: { id },
        };
      }

      if (name === "details") {
        function isSummaryChild(c: MdastNode): boolean {
          if (c.type === "mdxJsxFlowElement" && c.name === "summary") return true;
          if (
            c.type === "paragraph" &&
            c.children?.length === 1 &&
            c.children[0].type === "mdxJsxTextElement" &&
            c.children[0].name === "summary"
          )
            return true;
          return false;
        }

        const summaryChild = (node.children ?? []).find(isSummaryChild);
        let summary = "Details";
        if (summaryChild) {
          if (summaryChild.type === "mdxJsxFlowElement") {
            summary = extractText(summaryChild);
          } else {
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
          content: bodyChildren.length > 0 ? bodyChildren : [{ type: "paragraph" }],
        };
      }

      if (name === "dl") {
        // Flatten paragraph wrappers remark-mdx may insert around dt/dd
        const rawChildren = (node.children ?? []).flatMap(c =>
          c.type === "paragraph" ? (c.children ?? []) : c,
        );
        const children = rawChildren
          .map(mdastToProseMirror)
          .filter((n): n is JSONContent => n !== null)
          .filter(c => c.type === "descriptionTerm" || c.type === "descriptionDetails");
        return {
          type: "descriptionList",
          content: children.length > 0 ? children : undefined,
        };
      }

      if (name === "dt") {
        // dt expects inline* content — unwrap paragraph wrappers then extract inline nodes
        const flatChildren = (node.children ?? []).flatMap(c =>
          c.type === "paragraph" ? (c.children ?? []) : [c],
        );
        const content = inlineChildren({ ...node, children: flatChildren });
        return {
          type: "descriptionTerm",
          content: content.length > 0 ? content : undefined,
        };
      }

      if (name === "dd") {
        // dd expects block+ content — ensure children are block nodes
        const children = (node.children ?? [])
          .map(mdastToProseMirror)
          .filter((n): n is JSONContent => n !== null);
        // If all children are inline (text that fell through default), wrap in a paragraph
        const allInline = children.length > 0 && children.every(c =>
          c.type === "text" || c.type === "image" || c.type === "footnoteRef",
        );
        const blockChildren = allInline
          ? [{ type: "paragraph", content: children }]
          : children;
        // If children are still empty (bare text nodes), try inlineChildren as fallback
        if (blockChildren.length === 0) {
          const inline = inlineChildren(node);
          if (inline.length > 0) {
            return {
              type: "descriptionDetails",
              content: [{ type: "paragraph", content: inline }],
            };
          }
        }
        return {
          type: "descriptionDetails",
          content: blockChildren.length > 0 ? blockChildren : [{ type: "paragraph" }],
        };
      }

      return {
        type: "passthroughBlock",
        attrs: { content: serializeMdxElement(node) },
      };
    }

    case "footnoteDefinition": {
      const identifier = (node.identifier as string) ?? "";
      const content: JSONContent[] = [];
      for (const child of node.children ?? []) {
        if (child.type === "paragraph") {
          const inline = inlineChildren(child);
          if (content.length > 0 && inline.length > 0) {
            content.push({ type: "hardBreak" });
          }
          content.push(...inline);
        }
      }
      return {
        type: "footnoteDef",
        attrs: { identifier },
        content: content.length > 0 ? content : [],
      };
    }

    case "mdxjsEsm":
      return null;

    case "html":
      return {
        type: "passthroughBlock",
        attrs: { content: node.value ?? "" },
      };

    default:
      if (node.value) {
        return {
          type: "paragraph",
          content: [{ type: "text", text: node.value }],
        };
      }
      return null;
  }
}

export function inlineChildren(node: MdastNode): JSONContent[] {
  const result: JSONContent[] = [];
  for (const child of node.children ?? []) {
    const inline = mdastInline(child);
    if (inline) {
      if (Array.isArray(inline)) {
        result.push(...inline);
      } else {
        result.push(inline);
      }
    }
  }
  return result;
}

function mdastInline(node: MdastNode): JSONContent | JSONContent[] | null {
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
        marks: [{ type: "inlineJsx" }],
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
): JSONContent[] | null {
  if (children.length === 0) return null;
  return children.map((child) => ({
    ...child,
    marks: [...(child.marks ?? []), mark],
  }));
}

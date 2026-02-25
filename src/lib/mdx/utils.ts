import type { MdastNode } from "./types";

export function escapeJsxAttrValue(val: string): string {
  return val
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, "&quot;")
    .replace(/\{/g, "&#123;")
    .replace(/\}/g, "&#125;");
}

export function getAttr(node: MdastNode, name: string): string | null {
  const attr = (node.attributes ?? []).find((a) => a.name === name);
  if (!attr) return null;
  if (typeof attr.value === "string") return attr.value;
  if (attr.value && typeof attr.value === "object" && "value" in attr.value)
    return attr.value.value;
  return null;
}

export function extractText(node: MdastNode): string {
  if (node.value) return node.value;
  return (node.children ?? []).map(extractText).join("");
}

/** Serialize an MDAST node back to markdown/MDX text. */
function serializeMdastNode(node: MdastNode): string {
  switch (node.type) {
    case "text":
      return node.value ?? "";
    case "emphasis":
      return `*${serializeMdastChildren(node)}*`;
    case "strong":
      return `**${serializeMdastChildren(node)}**`;
    case "delete":
      return `~~${serializeMdastChildren(node)}~~`;
    case "inlineCode":
      return `\`${node.value ?? ""}\``;
    case "link":
      return `[${serializeMdastChildren(node)}](${node.url ?? ""})`;
    case "image":
      return `![${node.alt ?? ""}](${node.url ?? ""})`;
    case "paragraph":
      return serializeMdastChildren(node);
    case "break":
      return "  \n";
    case "mdxJsxTextElement":
    case "mdxJsxFlowElement":
      return serializeMdxElement(node);
    default:
      if (node.value) return node.value;
      return serializeMdastChildren(node);
  }
}

function serializeMdastChildren(node: MdastNode): string {
  return (node.children ?? []).map(serializeMdastNode).join("");
}

function serializeAttr(a: { name: string; value: string | { type?: string; value: string } | null }): string {
  // Boolean attribute (value: null) — emit bare name
  if (a.value === null || a.value === undefined) {
    return a.name;
  }
  // Expression attribute (mdxJsxAttributeValueExpression)
  if (typeof a.value === "object" && a.value !== null) {
    if (a.value.type === "mdxJsxAttributeValueExpression") {
      return `${a.name}={${a.value.value}}`;
    }
    return `${a.name}="${escapeJsxAttrValue(a.value.value)}"`;
  }
  // Simple string attribute
  return `${a.name}="${escapeJsxAttrValue(a.value)}"`;
}

export function serializeMdxElement(node: MdastNode): string {
  const name = node.name ?? "unknown";
  const attrs = (node.attributes ?? []).map(serializeAttr).join(" ");
  const attrStr = attrs.length > 0 ? ` ${attrs}` : "";
  if (!node.children || node.children.length === 0) {
    return `<${name}${attrStr} />`;
  }
  const inner = serializeMdastChildren(node);
  return `<${name}${attrStr}>${inner}</${name}>`;
}

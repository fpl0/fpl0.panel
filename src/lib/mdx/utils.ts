import type { MdastNode } from "./types";

export function escapeJsxAttrValue(val: string): string {
  return val.replace(/\\/g, "\\\\").replace(/"/g, "&quot;");
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

export function serializeMdxElement(node: MdastNode): string {
  const name = node.name ?? "unknown";
  const attrs = (node.attributes ?? [])
    .map((a) => {
      const val = typeof a.value === "string" ? a.value : (a.value?.value ?? "");
      return `${a.name}="${escapeJsxAttrValue(val)}"`;
    })
    .join(" ");
  const attrStr = attrs.length > 0 ? ` ${attrs}` : "";
  if (!node.children || node.children.length === 0) {
    return `<${name}${attrStr} />`;
  }
  return `<${name}${attrStr}>...</${name}>`;
}

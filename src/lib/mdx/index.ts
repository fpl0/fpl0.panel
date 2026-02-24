/**
 * MDX <-> TipTap ProseMirror serialization.
 *
 * Parse:  MDX string -> split frontmatter/body -> unified MDAST -> ProseMirror JSON
 * Serialize: ProseMirror JSON -> MDX markdown + JSX -> prepend frontmatter YAML
 */

import type { JSONContent } from "@tiptap/core";
import { splitFrontmatter, assembleMdx } from "./frontmatter";
import { generateImports } from "./imports";
import { parseBodyToMdast, mdastToProseMirror } from "./parser";
import { proseMirrorToMdx } from "./serializer";

export { splitFrontmatter, assembleMdx } from "./frontmatter";

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

export function serializeEditorToMdx(yaml: string, doc: JSONContent): string {
  const body = proseMirrorToMdx(doc);
  const imports = generateImports(body);
  return assembleMdx(yaml, body, imports);
}

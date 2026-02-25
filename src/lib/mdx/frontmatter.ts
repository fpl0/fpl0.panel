export function splitFrontmatter(mdx: string): { yaml: string; body: string } {
  const match = mdx.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { yaml: "", body: mdx };
  return {
    yaml: match[1],
    body: mdx.slice(match[0].length),
  };
}

export function assembleMdx(yaml: string, body: string, imports: string[]): string {
  const importBlock = imports.length > 0 ? `\n${imports.join("\n")}` : "";
  return `---\n${yaml}\n---${importBlock}\n\n${body}\n`;
}

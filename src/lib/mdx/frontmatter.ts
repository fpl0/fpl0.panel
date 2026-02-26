export function splitFrontmatter(mdx: string): { yaml: string; body: string } {
  const match = mdx.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { yaml: "", body: mdx };
  return {
    yaml: match[1],
    body: mdx.slice(match[0].length),
  };
}

export function assembleMdx(yaml: string, body: string, imports: string[]): string {
  const yamlSection = `---\n${yaml.trim()}\n---`;
  const importSection = imports.length > 0 ? `\n\n${imports.join("\n")}` : "";
  const bodySection = `\n\n${body.trimStart()}`;
  return `${yamlSection}${importSection}${bodySection}\n`;
}

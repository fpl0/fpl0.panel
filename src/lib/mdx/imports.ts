const componentMap: Record<string, string> = {
  LiteYouTube: 'import LiteYouTube from "../../../components/LiteYouTube.astro";',
  Figure: 'import Figure from "../../../components/Figure.astro";',
  Table: 'import Table from "../../../components/Table.astro";',
  TwitterCard: 'import TwitterCard from "../../../components/TwitterCard.astro";',
};

export function generateImports(body: string): string[] {
  const imports: string[] = [];
  const lines = body.split(/\r?\n/);
  let cleanBodySegments: string[] = [];
  let inCodeFence = false;

  for (const line of lines) {
    if (/^```/.test(line.trimStart())) {
      inCodeFence = !inCodeFence;
      continue;
    }
    if (!inCodeFence) {
      cleanBodySegments.push(line);
    }
  }

  const cleanBody = cleanBodySegments.join("\n");

  for (const [component, importStatement] of Object.entries(componentMap)) {
    if (new RegExp(`<${component}[\\s/>]`).test(cleanBody)) {
      imports.push(importStatement);
    }
  }

  return imports;
}

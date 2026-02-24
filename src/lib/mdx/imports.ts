const componentMap: Record<string, string> = {
  LiteYouTube: 'import LiteYouTube from "../../../components/LiteYouTube.astro";',
  Figure: 'import Figure from "../../../components/Figure.astro";',
  Table: 'import Table from "../../../components/Table.astro";',
  TwitterCard: 'import TwitterCard from "../../../components/TwitterCard.astro";',
};

export function generateImports(body: string): string[] {
  const imports: string[] = [];

  for (const [component, importStatement] of Object.entries(componentMap)) {
    if (new RegExp(`<${component}[\\s/>]`).test(body)) {
      imports.push(importStatement);
    }
  }

  return imports;
}

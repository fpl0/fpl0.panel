/**
 * MDX string-based serialization.
 *
 * Parse:     MDX string -> split frontmatter/body -> strip imports -> body string
 * Serialize: body string -> auto-generate imports -> assemble full MDX file
 */

import { splitFrontmatter, assembleMdx } from "./frontmatter";
import { generateImports } from "./imports";

export { splitFrontmatter, assembleMdx } from "./frontmatter";

/** Known component imports that are auto-generated from body content. */
const KNOWN_IMPORT_PREFIXES = [
  "LiteYouTube",
  "Figure",
  "Table",
  "TwitterCard",
];

function isKnownImport(line: string): boolean {
  return KNOWN_IMPORT_PREFIXES.some((name) =>
    new RegExp(`\\b${name}\\b`).test(line),
  );
}

interface ExtractedImports {
  cleanBody: string;
  unknownImports: string[];
}

/**
 * Extract import statements from the MDX body, handling:
 * - Code fence state (imports inside fences are not real imports)
 * - Multi-line imports (accumulates until closing quote + semicolon)
 * - Separates known auto-generated imports from unknown ones to preserve
 */
function extractImports(body: string): ExtractedImports {
  const lines = body.split(/\r?\n/);
  const cleanLines: string[] = [];
  const unknownImports: string[] = [];
  let inCodeFence = false;
  let accumulatingImport = false;
  let importBuffer = "";

  for (const line of lines) {
    // Track code fence state
    if (/^```/.test(line.trimStart())) {
      inCodeFence = !inCodeFence;
      cleanLines.push(line);
      continue;
    }

    if (inCodeFence) {
      cleanLines.push(line);
      continue;
    }

    // If we're accumulating a multi-line import
    if (accumulatingImport) {
      importBuffer += "\n" + line;
      // Check if this line closes the import (has a from "..." or from '...')
      if (/from\s+["']/.test(line) && /["'];?\s*$/.test(line.trim())) {
        accumulatingImport = false;
        if (!isKnownImport(importBuffer)) {
          unknownImports.push(importBuffer);
        }
        importBuffer = "";
      }
      continue;
    }

    // Check if this line starts an import
    if (/^\s*import\s/.test(line)) {
      // Single-line import: has from "..." on the same line, or is a side-effect import
      if (
        (/from\s+["']/.test(line) && /["'];?\s*$/.test(line.trim())) ||
        /^import\s+["']/.test(line.trim())
      ) {
        if (!isKnownImport(line)) {
          unknownImports.push(line);
        }
      } else {
        // Multi-line import — start accumulating
        accumulatingImport = true;
        importBuffer = line;
      }
      continue;
    }

    cleanLines.push(line);
  }

  // If we were still accumulating (malformed import), preserve it
  if (accumulatingImport && importBuffer) {
    unknownImports.push(importBuffer);
  }

  return {
    cleanBody: cleanLines.join("\n"),
    unknownImports,
  };
}

export function parseMdxFile(mdx: string): {
  yaml: string;
  body: string;
  unknownImports: string[];
} {
  const { yaml, body } = splitFrontmatter(mdx);
  const { cleanBody, unknownImports } = extractImports(body);
  return { yaml, body: cleanBody, unknownImports };
}

export function serializeMdxFile(
  yaml: string,
  body: string,
  unknownImports: string[] = [],
): string {
  const autoImports = generateImports(body);
  const allImports = [...unknownImports, ...autoImports];
  return assembleMdx(yaml, body, allImports);
}

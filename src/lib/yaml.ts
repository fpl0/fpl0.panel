/** Escape a string for safe interpolation inside double-quoted YAML values. */
export function escapeYamlValue(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r");
}

/** Escape a string for safe use in a RegExp constructor. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Set or update a field in a YAML frontmatter string. */
export function setYamlField(yaml: string, field: string, value: string): string {
  const fieldRegex = new RegExp(`^${escapeRegExp(field)}:.*$`, "m");
  if (fieldRegex.test(yaml)) {
    return yaml.replace(fieldRegex, `${field}: ${value}`);
  }
  return `${yaml}\n${field}: ${value}`;
}

/**
 * Split a full file content string into its frontmatter parts.
 * Returns null if no frontmatter is found.
 */
export function splitFrontmatterFromContent(content: string): {
  prefix: string;
  yaml: string;
  suffix: string;
  rest: string;
} | null {
  const match = content.match(/^(---\r?\n)([\s\S]*?)(\r?\n---)/);
  if (!match) return null;
  return {
    prefix: match[1],
    yaml: match[2],
    suffix: match[3],
    rest: content.slice(match[0].length),
  };
}

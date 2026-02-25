/**
 * TipTap mark for inline JSX elements like <kbd>, <Callout>, etc.
 * Preserves raw JSX text through round-trips without converting to backtick code.
 */
import { Mark } from "@tiptap/core";

export const InlineJsxMark = Mark.create({
  name: "inlineJsx",

  parseHTML() {
    return [{ tag: "span[data-inline-jsx]" }];
  },

  renderHTML() {
    return ["span", { "data-inline-jsx": "", class: "inline-jsx-mark" }, 0];
  },
});

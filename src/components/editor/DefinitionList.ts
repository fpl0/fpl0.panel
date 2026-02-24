import { mergeAttributes, Node } from "@tiptap/core";

export const DescriptionList = Node.create({
  name: "descriptionList",
  group: "block",
  content: "(descriptionTerm descriptionDetails+)+",

  parseHTML() {
    return [{ tag: "dl" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["dl", mergeAttributes(HTMLAttributes), 0];
  },
});

export const DescriptionTerm = Node.create({
  name: "descriptionTerm",
  group: "block",
  content: "inline*",

  parseHTML() {
    return [{ tag: "dt" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["dt", mergeAttributes(HTMLAttributes), 0];
  },
});

export const DescriptionDetails = Node.create({
  name: "descriptionDetails",
  group: "block",
  content: "block+",

  parseHTML() {
    return [{ tag: "dd" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["dd", mergeAttributes(HTMLAttributes), 0];
  },
});

/**
 * TipTap block node for footnote definitions [^n]: text.
 * Content hole holds the inline definition text.
 * The [^identifier]: label is rendered via CSS ::before on the outer div.
 */
import { Node, mergeAttributes } from "@tiptap/core";

export const FootnoteDefNode = Node.create({
  name: "footnoteDef",
  group: "block",
  content: "inline*",

  addAttributes() {
    return {
      identifier: { default: "" },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-type='footnote-def']" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "footnote-def",
        "data-identifier": HTMLAttributes.identifier || "",
        class: "footnote-def-node",
      }),
      0,
    ];
  },

  addNodeView() {
    return ({ node: initialNode }) => {
      let currentNode = initialNode;

      const dom = document.createElement("div");
      dom.classList.add("footnote-def-node");
      dom.dataset.identifier = currentNode.attrs.identifier;

      const contentDOM = document.createElement("div");
      contentDOM.classList.add("footnote-def-node-content");
      dom.appendChild(contentDOM);

      return {
        dom,
        contentDOM,
        update(updatedNode) {
          if (updatedNode.type.name !== "footnoteDef") return false;
          currentNode = updatedNode;
          dom.dataset.identifier = updatedNode.attrs.identifier;
          return true;
        },
      };
    };
  },
});

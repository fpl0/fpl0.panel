export type { JSONContent } from "@tiptap/core";

export interface MdastNode {
  type: string;
  children?: MdastNode[];
  value?: string;
  url?: string;
  title?: string | null;
  alt?: string;
  depth?: number;
  ordered?: boolean;
  lang?: string | null;
  meta?: string | null;
  name?: string;
  attributes?: MdastAttribute[];
  checked?: boolean | null;
  [key: string]: unknown;
}

export interface MdastAttribute {
  type: string;
  name: string;
  value: string | { value: string } | null;
}

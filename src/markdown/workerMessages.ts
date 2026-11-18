import type { RootContent } from "hast";

export type MarkdownWorkerRequest = { content: string };
export type MarkdownRenderBlock = { node: RootContent; estimatedHeight: number };
export type MarkdownHeading = {
  id: string;
  title: string;
  level: 1 | 2 | 3 | 4 | 5 | 6;
};
export type MarkdownOutlineEntry = MarkdownHeading & {
  blockIndex: number;
};

export type MarkdownWorkerResponse =
  | { type: "phase"; phase: "parse" | "plugins" | "sending" }
  | { type: "blocks"; blocks: MarkdownRenderBlock[]; headings: MarkdownOutlineEntry[]; processed: number; total: number }
  | { type: "complete"; total: number }
  | { type: "error"; message: string };

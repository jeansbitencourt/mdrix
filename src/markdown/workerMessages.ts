import type { RootContent } from "hast";

export type MarkdownWorkerRequest = { content: string };
export type MarkdownRenderBlock = { node: RootContent; estimatedHeight: number };

export type MarkdownWorkerResponse =
  | { type: "phase"; phase: "parse" | "plugins" | "sending" }
  | { type: "blocks"; blocks: MarkdownRenderBlock[]; processed: number; total: number }
  | { type: "complete"; total: number }
  | { type: "error"; message: string };

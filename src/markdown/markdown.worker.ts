import GithubSlugger from "github-slugger";
import { toString } from "mdast-util-to-string";
import { unified } from "unified";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import rehypeHighlight from "rehype-highlight";
import rehypeSlug from "rehype-slug";
import type { Element, Root as HastRoot } from "hast";
import type { Root as MarkdownRoot } from "mdast";
import type { MarkdownRenderBlock, MarkdownWorkerRequest, MarkdownWorkerResponse } from "./workerMessages";

type WorkerScope = {
  onmessage: ((event: MessageEvent<MarkdownWorkerRequest>) => void) | null;
  postMessage: (message: MarkdownWorkerResponse) => void;
};

const scope = self as unknown as WorkerScope;
const maxChunkChars = 8 * 1024;
const outputBatchSize = 128;
type MarkdownChunk = { content: string; start: number };
const parser = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath);
const converter = unified().use(remarkRehype);
const highlighter = unified().use(rehypeHighlight, { detect: false, ignoreMissing: true });
const wholeDocumentConverter = unified()
  .use(remarkRehype)
  .use(rehypeSlug)
  .use(removeUnsafeLinks);

scope.onmessage = (event) => {
  void processMarkdown(event.data);
};

async function processMarkdown({ content }: MarkdownWorkerRequest) {
  try {
    scope.postMessage({ type: "phase", phase: "parse" });
    const chunks = splitMarkdownSource(content);
    const referenceDefinitions: string[] = [];
    let total = 0;
    let containsFootnotes = false;

    for (const chunk of chunks) {
      const tree = parser.parse(chunk.content) as MarkdownRoot;
      for (const node of tree.children) {
        if (node.type === "footnoteDefinition") containsFootnotes = true;
        if (node.type === "definition" && node.position) {
          referenceDefinitions.push(chunk.content.slice(node.position.start.offset, node.position.end.offset));
        } else if (node.type !== "html") {
          total += 1;
        }
      }
    }

    scope.postMessage({ type: "phase", phase: "plugins" });
    if (containsFootnotes) {
      const markdownTree = parser.parse(content) as MarkdownRoot;
      const htmlTree = wholeDocumentConverter.runSync(markdownTree) as HastRoot;
      await sendBlocks(htmlTree.children);
    } else {
      await renderMarkdownChunks(chunks, referenceDefinitions, total);
    }
  } catch (cause) {
    scope.postMessage({
      type: "error",
      message: cause instanceof Error ? cause.message : "Falha ao preparar a visualização Markdown.",
    });
  }
}

async function renderMarkdownChunks(chunks: MarkdownChunk[], definitions: string[], total: number) {
  const slugger = new GithubSlugger();
  const definitionPrefix = definitions.length > 0 ? `${definitions.join("\n\n")}\n\n` : "";
  scope.postMessage({ type: "phase", phase: "sending" });
  let processed = 0;

  for (const chunk of chunks) {
    const markdownTree = parser.parse(`${definitionPrefix}${chunk.content}`) as MarkdownRoot;
    adjustSourceOffsets(markdownTree, chunk.start - definitionPrefix.length);
    const headingSlugs = createHeadingSlugs(markdownTree, slugger);
    const htmlTree = converter.runSync(markdownTree) as HastRoot;
    const highlightedTree = highlighter.runSync(htmlTree) as HastRoot;
    applyHeadingSlugs(highlightedTree, headingSlugs);
    removeUnsafeLinksFromTree(highlightedTree);
    processed += postBlockBatch(highlightedTree.children, processed, total);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }

  scope.postMessage({ type: "complete", total });
}

async function sendBlocks(nodes: HastRoot["children"]) {
  const total = countRenderableBlocks(nodes);
  scope.postMessage({ type: "phase", phase: "sending" });
  let processed = 0;

  while (nodes.length > 0) {
    const batch = nodes.splice(0, outputBatchSize);
    const highlightedTree = highlighter.runSync({ type: "root", children: batch }) as HastRoot;
    processed += postBlockBatch(highlightedTree.children, processed, total);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }

  scope.postMessage({ type: "complete", total });
}

function createHeadingSlugs(tree: MarkdownRoot, slugger: GithubSlugger): Map<number, string> {
  const slugs = new Map<number, string>();
  visitMarkdownNodes(tree, (node) => {
    if (node.type === "heading" && node.position) {
      slugs.set(node.position.start.line, slugger.slug(toString(node)));
    }
  });
  return slugs;
}

function visitMarkdownNodes(node: { type: string; children?: unknown[] }, callback: (node: { type: string; position?: MarkdownRoot["position"] }) => void): void {
  callback(node as { type: string; position?: MarkdownRoot["position"] });
  if (node.children) {
    for (const child of node.children) {
      if (child && typeof child === "object" && "type" in child) {
        visitMarkdownNodes(child as { type: string; children?: unknown[] }, callback);
      }
    }
  }
}

function splitMarkdownSource(content: string): MarkdownChunk[] {
  const lines = content.split("\n");
  const chunks: MarkdownChunk[] = [];
  let chunkStart = 0;
  let lineStart = 0;
  let chunkHasList = false;
  let fence: { marker: string; length: number } | null = null;
  let mathFence = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    const lineEnd = lineStart + line.length;

    if (fence) {
      const close = new RegExp(`^ {0,3}${fence.marker}{${fence.length},}\\s*$`);
      if (close.test(line)) fence = null;
      lineStart = lineEnd + 1;
      continue;
    }

    if (mathFence) {
      if (trimmed === "$$") mathFence = false;
      lineStart = lineEnd + 1;
      continue;
    }

    const openFence = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (openFence) {
      fence = { marker: openFence[0], length: openFence.length };
      lineStart = lineEnd + 1;
      continue;
    }
    if (trimmed === "$$") {
      mathFence = true;
      lineStart = lineEnd + 1;
      continue;
    }

    if (isListMarker(line)) chunkHasList = true;
    if (trimmed === "" && lineStart - chunkStart >= maxChunkChars && !keepMarkdownGroup(lines, index, chunkHasList)) {
      const chunk = content.slice(chunkStart, lineStart);
      if (chunk.trim()) chunks.push({ content: chunk, start: chunkStart });
      chunkStart = lineEnd + 1;
      chunkHasList = false;
    }

    lineStart = lineEnd + 1;
  }

  const lastChunk = content.slice(chunkStart);
  if (lastChunk.trim()) chunks.push({ content: lastChunk, start: chunkStart });
  return chunks.length > 0 ? chunks : [{ content, start: 0 }];
}

function adjustSourceOffsets(node: { position?: MarkdownRoot["position"]; children?: unknown[] }, offset: number): void {
  const position = node.position;
  if (position?.start.offset !== undefined) position.start.offset = Math.max(0, position.start.offset + offset);
  if (position?.end.offset !== undefined) position.end.offset = Math.max(0, position.end.offset + offset);
  if (node.children) {
    for (const child of node.children) {
      if (child && typeof child === "object" && "type" in child) {
        adjustSourceOffsets(child as { position?: MarkdownRoot["position"]; children?: unknown[] }, offset);
      }
    }
  }
}

function keepMarkdownGroup(lines: string[], index: number, chunkHasList: boolean): boolean {
  const previous = previousNonBlankLine(lines, index - 1);
  const next = nextNonBlankLine(lines, index + 1);
  if (chunkHasList && (isListMarker(next) || isIndentedLine(next))) return true;
  return isQuoteLine(previous) || isQuoteLine(next) || isIndentedLine(next);
}

function previousNonBlankLine(lines: string[], start: number): string {
  for (let index = start; index >= 0; index -= 1) {
    if (lines[index].trim()) return lines[index];
  }
  return "";
}

function nextNonBlankLine(lines: string[], start: number): string {
  for (let index = start; index < lines.length; index += 1) {
    if (lines[index].trim()) return lines[index];
  }
  return "";
}

function isListMarker(line: string): boolean {
  return /^ {0,3}(?:[-+*]|\d+[.)])\s+/.test(line);
}

function isQuoteLine(line: string): boolean {
  return /^ {0,3}>/.test(line);
}

function isIndentedLine(line: string): boolean {
  return /^(?: {4,}|\t)/.test(line);
}

function applyHeadingSlugs(tree: HastRoot, slugs: Map<number, string>) {
  visitElements(tree, (element) => {
    if (!/^h[1-6]$/.test(element.tagName) || !element.position) return;
    const slug = slugs.get(element.position.start.line);
    if (slug) element.properties.id = slug;
  });
}

function postBlockBatch(nodes: HastRoot["children"], previousCount: number, total: number) {
  const blocks: MarkdownRenderBlock[] = nodes
    .filter((node) => node.type !== "text" || node.value.trim().length > 0)
    .map((node) => ({
    node,
    estimatedHeight: estimateHeight(node),
    }));
  scope.postMessage({
    type: "blocks",
    blocks,
    processed: previousCount + blocks.length,
    total,
  });
  return blocks.length;
}

function countRenderableBlocks(nodes: HastRoot["children"]): number {
  return nodes.filter((node) => node.type !== "text" || node.value.trim().length > 0).length;
}

function estimateHeight(node: MarkdownRenderBlock["node"]): number {
  const element = node.type === "element" ? node : null;
  const tag = element?.tagName;
  const lines = node.position
    ? Math.max(1, node.position.end.line - node.position.start.line + 1)
    : 1;
  const textLength = measureText(node);
  const wrappedLines = Math.max(lines, Math.ceil(textLength / 92));

  if (tag === "h1") return Math.max(56, wrappedLines * 30 + 24);
  if (tag === "h2") return Math.max(50, wrappedLines * 28 + 26);
  if (tag === "h3" || tag === "h4" || tag === "h5" || tag === "h6") {
    return Math.max(44, wrappedLines * 26 + 24);
  }
  if (tag === "pre") return Math.max(76, lines * 22 + 42);
  if (tag === "ul" || tag === "ol") return Math.max(54, lines * 29 + 34);
  if (tag === "table") return Math.max(90, lines * 32 + 38);
  return Math.max(44, wrappedLines * 28 + 30);
}

function measureText(node: MarkdownRenderBlock["node"]): number {
  if (node.type === "text") return node.value.length;
  if ("children" in node) return node.children.reduce((total, child) => total + measureText(child), 0);
  return 0;
}

function removeUnsafeLinks() {
  return (tree: HastRoot) => {
    removeUnsafeLinksFromTree(tree);
  };
}

function removeUnsafeLinksFromTree(tree: HastRoot) {
  visitElements(tree, (element) => {
    if (element.tagName !== "a") return;
    const href = element.properties.href;
    if (typeof href !== "string") return;
    const hasScheme = /^[a-z][a-z\d+.-]*:/i.test(href);
    const allowedScheme = /^(https?:|mailto:)/i.test(href);
    if ((hasScheme && !allowedScheme) || href.startsWith("//")) {
      delete element.properties.href;
    }
  });
}

function visitElements(node: HastRoot | Element, callback: (element: Element) => void): void {
  if (node.type === "element") callback(node);
  if ("children" in node) {
    for (const child of node.children) {
      if (child.type === "element") visitElements(child, callback);
    }
  }
}

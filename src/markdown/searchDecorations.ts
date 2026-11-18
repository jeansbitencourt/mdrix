import type { Element, Root, RootContent, Text } from "hast";
import type { Plugin } from "unified";
import { findOccurrences } from "../app/text";

type SourcePosition = {
  start?: { offset?: number };
  end?: { offset?: number };
};
type SearchNode = {
  type: string;
  value?: string;
  children?: SearchNode[];
  position?: SourcePosition;
  properties?: Element["properties"];
  tagName?: string;
};

export function rehypeSearch(query: string, activeOffset: number | null): Plugin<[], Root> {
  return function searchPlugin() {
    return (tree) => decorateSearchTree(tree, query, activeOffset);
  };
}

export function decorateSearchTree(tree: Root, query: string, activeOffset: number | null): void {
  for (const child of tree.children) {
    if (child.type !== "element") continue;
    addSourceProperties(child);
    if (activeOffset !== null && containsOffset(child.position, activeOffset)) {
      addClass(child, "markdown-search-current-block");
    }
    decorateChildren(child, query, activeOffset);
  }
}

export function decorateSearchNode(node: RootContent, query: string, activeOffset: number | null): RootContent {
  return decorateNode(cloneSearchNode(node as SearchNode), query, activeOffset) as RootContent;
}

export function sourceRange(node: RootContent): { start: number; end: number } | null {
  const position = (node as SearchNode).position;
  const start = position?.start?.offset;
  const end = position?.end?.offset;
  return typeof start === "number" && typeof end === "number" ? { start, end } : null;
}

export function containsOffset(position: SourcePosition | undefined, offset: number): boolean {
  const start = position?.start?.offset;
  const end = position?.end?.offset;
  return typeof start === "number" && typeof end === "number" && start <= offset && offset < end;
}

function decorateChildren(parent: SearchNode, query: string, activeOffset: number | null): void {
  if (!parent.children) return;
  parent.children = parent.children.flatMap((child) => {
    if (child.type === "text") return decorateText(child, query, activeOffset);
    decorateChildren(child, query, activeOffset);
    return child;
  });
}

function decorateNode(node: SearchNode, query: string, activeOffset: number | null): SearchNode {
  if (node.type === "element") {
    addSourceProperties(node as unknown as Element);
    if (activeOffset !== null && containsOffset(node.position, activeOffset)) {
      addClass(node as unknown as Element, "markdown-search-current-block");
    }
  }
  decorateChildren(node, query, activeOffset);
  return node;
}

function decorateText(node: SearchNode, query: string, activeOffset: number | null): SearchNode[] {
  if (!query || typeof node.value !== "string") return [node];
  const offsets = findOccurrences(node.value, query);
  if (offsets.length === 0) return [node];

  const sourceStart = node.position?.start?.offset;
  const result: SearchNode[] = [];
  let previous = 0;
  for (const offset of offsets) {
    if (offset > previous) result.push(textSlice(node, previous, offset, node.value.slice(previous, offset)));
    const absoluteOffset = typeof sourceStart === "number" ? sourceStart + offset : null;
    const mark: Element = {
      type: "element",
      tagName: "mark",
      properties: {
        className: [
          "markdown-search-match",
          ...(absoluteOffset !== null && absoluteOffset === activeOffset ? ["markdown-search-match-current"] : []),
        ],
      },
      children: [{ type: "text", value: node.value.slice(offset, offset + query.length) } as Text],
    };
    result.push(mark as unknown as SearchNode);
    previous = offset + query.length;
  }
  if (previous < node.value.length) result.push(textSlice(node, previous, node.value.length, node.value.slice(previous)));
  return result;
}

function textSlice(node: SearchNode, start: number, end: number, value: string): SearchNode {
  const sourceStart = node.position?.start?.offset;
  const position = node.position && typeof sourceStart === "number"
    ? {
      ...node.position,
      start: { ...node.position.start, offset: sourceStart + start },
      end: { ...node.position.end, offset: sourceStart + end },
    }
    : node.position;
  return { ...node, value, position };
}

function cloneSearchNode(node: SearchNode): SearchNode {
  const properties = node.properties
    ? {
      ...node.properties,
      ...(Array.isArray(node.properties.className)
        ? { className: [...node.properties.className] }
        : {}),
    }
    : undefined;
  return {
    ...node,
    ...(node.position
      ? {
        position: {
          ...node.position,
          ...(node.position.start ? { start: { ...node.position.start } } : {}),
          ...(node.position.end ? { end: { ...node.position.end } } : {}),
        },
      }
      : {}),
    ...(properties ? { properties } : {}),
    ...(node.children ? { children: node.children.map(cloneSearchNode) } : {}),
  };
}

function addSourceProperties(element: Element): void {
  const range = sourceRange(element as unknown as RootContent);
  if (!range) return;
  element.properties["data-source-start"] = range.start;
  element.properties["data-source-end"] = range.end;
}

function addClass(element: Element, className: string): void {
  const existing = element.properties.className;
  const classes = Array.isArray(existing) ? existing : typeof existing === "string" ? [existing] : [];
  if (!classes.includes(className)) element.properties.className = [...classes, className];
}

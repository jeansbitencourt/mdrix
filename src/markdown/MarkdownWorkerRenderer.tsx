import { useEffect, useMemo, useRef, useState } from "react";
import { Fragment } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
import { toJsxRuntime, type Components as HastComponents } from "hast-util-to-jsx-runtime";
import type { Components } from "react-markdown";
import { containsOffset, decorateSearchNode, sourceRange } from "./searchDecorations";
import type { MarkdownRenderBlock, MarkdownWorkerResponse } from "./workerMessages";

type Props = {
  content: string;
  components: Components;
  search: string;
  searchOffset: number | null;
  searchNavigation: number;
};
type Snapshot = {
  content: string;
  blocks: MarkdownRenderBlock[];
  phase: "parse" | "plugins" | "sending";
  processed: number;
  total: number;
  complete: boolean;
  error: string | null;
};
type Viewport = { offset: number; height: number };
type Measurements = { content: string; values: Map<number, number> };

const overscan = 720;
const emptyMeasurements = new Map<number, number>();

export default function MarkdownWorkerRenderer({ content, components, search, searchOffset, searchNavigation }: Props) {
  const [snapshot, setSnapshot] = useState<Snapshot>(() => emptySnapshot(content));
  const [measurements, setMeasurements] = useState<Measurements>(() => ({ content, values: new Map() }));
  const [viewport, setViewport] = useState<Viewport>({ offset: 0, height: 0 });
  const articleRef = useRef<HTMLElement>(null);
  const spacerRef = useRef<HTMLDivElement>(null);
  const updateViewportRef = useRef<() => void>(() => undefined);
  const lastScrolledSearchRef = useRef<string | null>(null);

  useEffect(() => {
    const worker = new Worker(new URL("./markdown.worker.ts", import.meta.url), { type: "module" });
    setSnapshot(emptySnapshot(content));
    setMeasurements({ content, values: new Map() });

    worker.onmessage = (event: MessageEvent<MarkdownWorkerResponse>) => {
      const message = event.data;
      if (message.type === "error") {
        setSnapshot((current) => current.content === content
          ? { ...current, complete: true, error: message.message }
          : current);
        worker.terminate();
        return;
      }

      if (message.type === "complete") worker.terminate();

      setSnapshot((current) => {
        if (current.content !== content) return current;
        if (message.type === "phase") return { ...current, phase: message.phase };
        if (message.type === "blocks") {
          return {
            ...current,
            blocks: [...current.blocks, ...message.blocks],
            processed: message.processed,
            total: message.total,
          };
        }
        return { ...current, complete: true, total: message.total };
      });
    };
    worker.onerror = (event) => {
      setSnapshot((current) => current.content === content
        ? { ...current, complete: true, error: event.message || "Falha ao preparar a visualização Markdown." }
        : current);
      worker.terminate();
    };
    worker.postMessage({ content });

    return () => worker.terminate();
  }, [content]);

  useEffect(() => {
    const article = articleRef.current;
    const scrollContainer = article?.parentElement;
    if (!article || !scrollContainer) return;

    let frame = 0;
    const update = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const spacer = spacerRef.current;
        if (!spacer) return;
        const containerRect = scrollContainer.getBoundingClientRect();
        const spacerRect = spacer.getBoundingClientRect();
        const spacerTop = spacerRect.top - containerRect.top + scrollContainer.scrollTop;
        setViewport({
          offset: Math.max(0, scrollContainer.scrollTop - spacerTop),
          height: scrollContainer.clientHeight,
        });
      });
    };

    updateViewportRef.current = update;
    scrollContainer.addEventListener("scroll", update, { passive: true });
    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(scrollContainer);
    update();

    return () => {
      scrollContainer.removeEventListener("scroll", update);
      resizeObserver.disconnect();
      if (frame) cancelAnimationFrame(frame);
      updateViewportRef.current = () => undefined;
    };
  }, []);

  const current = snapshot.content === content ? snapshot : emptySnapshot(content);
  const blocks = current.blocks;
  const currentMeasurements = measurements.content === content ? measurements.values : emptyMeasurements;
  const layout = useMemo(() => {
    const offsets = new Array<number>(blocks.length + 1);
    offsets[0] = 0;
    for (let index = 0; index < blocks.length; index += 1) {
      offsets[index + 1] = offsets[index] + (currentMeasurements.get(index) ?? blocks[index].estimatedHeight);
    }
    return { offsets, height: offsets[blocks.length] ?? 0 };
  }, [blocks, currentMeasurements]);

  const start = blocks.length === 0
    ? 0
    : findBlock(layout.offsets, Math.max(0, viewport.offset - overscan));
  const end = blocks.length === 0
    ? 0
    : Math.min(blocks.length, findBlock(layout.offsets, viewport.offset + viewport.height + overscan) + 1);
  const visible = blocks.slice(start, Math.max(start, end));

  useEffect(() => {
    updateViewportRef.current();
  }, [blocks.length, layout.height]);

  useEffect(() => {
    if (searchOffset === null) {
      lastScrolledSearchRef.current = null;
      return;
    }

    const requestKey = `${searchNavigation}:${searchOffset}`;
    if (lastScrolledSearchRef.current === requestKey) return;
    const blockIndex = blocks.findIndex((block) => containsOffset(block.node.position, searchOffset));
    if (blockIndex < 0) return;

    const article = articleRef.current;
    const spacer = spacerRef.current;
    const scrollContainer = article?.parentElement;
    if (!spacer || !scrollContainer) return;

    lastScrolledSearchRef.current = requestKey;
    const spacerRect = spacer.getBoundingClientRect();
    const containerRect = scrollContainer.getBoundingClientRect();
    const spacerTop = spacerRect.top - containerRect.top + scrollContainer.scrollTop;
    scrollContainer.scrollTo({
      top: spacerTop + layout.offsets[blockIndex],
      behavior: "smooth",
    });
  }, [blocks, layout.offsets, searchOffset, searchNavigation]);

  useEffect(() => {
    const spacer = spacerRef.current;
    if (!spacer || visible.length === 0) return;

    const observer = new ResizeObserver((entries) => {
      const measured = new Map<number, number>();
      for (const entry of entries) {
        const index = Number((entry.target as HTMLElement).dataset.virtualIndex);
        if (Number.isInteger(index)) measured.set(index, entry.contentRect.height);
      }
      if (measured.size === 0) return;

      setMeasurements((currentState) => {
        const values = currentState.content === content
          ? new Map(currentState.values)
          : new Map<number, number>();
        let changed = currentState.content !== content;
        for (const [index, height] of measured) {
          const previous = values.get(index);
          if (previous === undefined || Math.abs(previous - height) > 1) {
            values.set(index, height);
            changed = true;
          }
        }
        return changed ? { content, values } : currentState;
      });
    });

    spacer.querySelectorAll<HTMLElement>("[data-virtual-index]").forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [content, visible.length, start, end, blocks.length]);

  const percentage = current.total > 0
    ? Math.min(100, Math.round((current.processed / current.total) * 100))
    : null;
  const progressMessage = current.phase === "parse"
    ? "Analisando a estrutura Markdown…"
    : current.phase === "plugins"
      ? "Formatando matemática e código…"
      : percentage === null
        ? "Preparando os blocos…"
        : `Preparando visualização: ${percentage}%`;

  return (
    <article className="markdown-document markdown-virtual-document" ref={articleRef}>
      {!current.complete && (
        <div className="markdown-progress-anchor">
          <div className="markdown-progress" role="status" aria-live="polite">
            <span className="loading-spinner" aria-hidden="true" />
            <span className="markdown-progress-copy">
              <strong>{progressMessage}</strong>
              {current.total > 0 && <small>{current.processed.toLocaleString("pt-BR")} de {current.total.toLocaleString("pt-BR")} blocos</small>}
            </span>
            {percentage !== null && <progress max={100} value={percentage} aria-label="Progresso da visualização" />}
          </div>
        </div>
      )}

      {current.error ? (
        <div className="markdown-render-error" role="alert">
          <strong>Não foi possível preparar a visualização.</strong>
          <span>{current.error}</span>
          <small>O conteúdo continua disponível no modo de edição.</small>
        </div>
      ) : (
        <div className="markdown-virtual-spacer" ref={spacerRef} style={{ height: layout.height }}>
          {visible.map((block, offset) => {
            const index = start + offset;
            const decoratedNode = decorateSearchNode(block.node, search, searchOffset);
            const tree = { type: "root" as const, children: [decoratedNode] };
            const rendered = toJsxRuntime(tree, {
              Fragment,
              jsx,
              jsxs,
              components: components as Partial<HastComponents>,
              passKeys: true,
            });
            const range = sourceRange(block.node);
            const isCurrentBlock = searchOffset !== null && containsOffset(block.node.position, searchOffset);
            return (
              <div
                className={`markdown-virtual-block${isCurrentBlock ? " markdown-search-current-block" : ""}`}
                data-virtual-index={index}
                data-source-start={range?.start}
                data-source-end={range?.end}
                key={`${index}-${block.node.position?.start.offset ?? index}`}
                style={{ top: layout.offsets[index] }}
              >
                {rendered}
              </div>
            );
          })}
        </div>
      )}
    </article>
  );
}

function emptySnapshot(content: string): Snapshot {
  return { content, blocks: [], phase: "parse", processed: 0, total: 0, complete: false, error: null };
}

function findBlock(offsets: number[], offset: number): number {
  let low = 0;
  let high = offsets.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (offsets[middle + 1] <= offset) low = middle + 1;
    else high = middle;
  }
  return Math.min(low, offsets.length - 2);
}

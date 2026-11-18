import { Children, isValidElement, memo, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown, { defaultUrlTransform, type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import rehypeSlug from "rehype-slug";
import { invoke } from "@tauri-apps/api/core";
import MermaidBlock from "./MermaidBlock";
import MarkdownMath from "./MarkdownMath";
import MarkdownWorkerRenderer from "./MarkdownWorkerRenderer";
import { rehypeSearch } from "./searchDecorations";

type Props = {
  content: string;
  documentPath: string;
  dark: boolean;
  onError: (message: string | null) => void;
  search: string;
  searchOffset: number | null;
  searchNavigation: number;
  restoreOffset: number | null;
  restoreProgress: number | null;
  onScrollRestored: () => void;
  targetFragment: string | null;
  onFragmentNavigated: () => void;
  onNavigateFragment: (fragment: string) => void;
};
const largeDocumentThreshold = 128 * 1024;

function LocalImage({ src, alt, documentPath }: { src?: string; alt?: string; documentPath: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setDataUrl(null);
    setFailed(false);
    if (!src || /^(https?:|data:|file:|\/\/)/i.test(src)) {
      setFailed(true);
      return () => { cancelled = true; };
    }
    void invoke<string>("read_relative_image", { documentPath, relativePath: src })
      .then((data) => { if (!cancelled) setDataUrl(data); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [src, documentPath]);

  if (failed) return <span className="image-missing">Imagem local indisponível: {alt || src || "sem descrição"}</span>;
  if (!dataUrl) return <span className="image-loading">Carregando imagem…</span>;
  return <img src={dataUrl} alt={alt ?? ""} loading="lazy" />;
}

const MarkdownViewer = memo(function MarkdownViewer({
  content,
  documentPath,
  dark,
  onError,
  search,
  searchOffset,
  searchNavigation,
  restoreOffset,
  restoreProgress,
  onScrollRestored,
  targetFragment,
  onFragmentNavigated,
  onNavigateFragment,
}: Props) {
  const articleRef = useRef<HTMLElement>(null);
  const lastRestoreRef = useRef<string | null>(null);
  const components = useMemo<Components>(() => ({
    img({ src, alt }) {
      return <LocalImage src={src} alt={alt} documentPath={documentPath} />;
    },
    a({ href, children, ...props }) {
      const isExternal = /^https?:\/\//i.test(href ?? "") || /^mailto:/i.test(href ?? "") || href?.startsWith("//");
      return (
        <a
          {...props}
          href={href}
          onClick={(event) => {
            if (href?.startsWith("#")) {
              event.preventDefault();
              const rawFragment = href.slice(1);
              let fragment = rawFragment;
              try { fragment = decodeURIComponent(rawFragment); } catch { /* Keep the literal fragment. */ }
              onNavigateFragment(fragment);
              return;
            }
            event.preventDefault();
            if (!href) {
              onError("O link não tem um destino válido.");
              return;
            }
            if (isExternal) {
              const url = href.startsWith("//") ? `https:${href}` : href;
              void invoke("open_external", { url }).catch((cause) => onError(String(cause)));
              return;
            }
            void invoke<string | null>("open_local_link", { documentPath, href })
              .then((fragment) => {
                if (typeof fragment === "string") onNavigateFragment(fragment);
              })
              .catch((cause) => onError(String(cause)));
          }}
        >
          {children}
        </a>
      );
    },
    code({ className, children, ...props }) {
      const classes = className ?? "";
      const language = /language-([\w-]+)/.exec(classes)?.[1];
      if (language === "mermaid") {
        return <MermaidBlock chart={String(children).replace(/\n$/, "")} dark={dark} />;
      }
      if (classes.includes("math-inline")) {
        return <MarkdownMath expression={String(children)} display={false} />;
      }
      if (language === "math") {
        return <MarkdownMath expression={String(children).replace(/\n$/, "")} display />;
      }
      return <code className={className} {...props}>{children}</code>;
    },
    table({ children, ...props }) {
      return (
        <div className="markdown-table-scroll" role="region" aria-label="Tabela Markdown rolável" tabIndex={0}>
          <table {...props}>{children}</table>
        </div>
      );
    },
    pre({ children, ...props }) {
      const child = Children.toArray(children);
      if (child.length === 1 && isValidElement(child[0]) && child[0].type === MarkdownMath) {
        return child[0];
      }
      return <pre {...props}>{children}</pre>;
    },
    input({ checked, ...props }) {
      return <input type="checkbox" checked={checked} disabled {...props} />;
    },
  }), [dark, documentPath, onError, onNavigateFragment]);

  useEffect(() => {
    if (content.length >= largeDocumentThreshold) return;
    if (searchOffset !== null || targetFragment !== null) {
      if (restoreOffset !== null || restoreProgress !== null) onScrollRestored();
      return;
    }
    if (restoreOffset === null && restoreProgress === null) return;
    const restoreKey = `${content.length}:${restoreOffset ?? "progress"}:${restoreProgress ?? ""}`;
    if (lastRestoreRef.current === restoreKey) return;
    const article = articleRef.current;
    const scrollContainer = article?.parentElement;
    if (!article || !scrollContainer) return;

    if (restoreOffset !== null) {
      const nodes = Array.from(article.querySelectorAll<HTMLElement>("[data-source-start][data-source-end]"));
      let target: HTMLElement | null = null;
      let nearestDistance = Number.POSITIVE_INFINITY;
      for (const node of nodes) {
        const start = Number(node.dataset.sourceStart);
        const end = Number(node.dataset.sourceEnd);
        if (start <= restoreOffset && restoreOffset < end) {
          target = node;
          break;
        }
        const distance = Math.min(Math.abs(start - restoreOffset), Math.abs(end - restoreOffset));
        if (distance < nearestDistance) {
          target = node;
          nearestDistance = distance;
        }
      }
      if (!target) {
        if (nodes.length > 0) return;
        const max = scrollContainer.scrollHeight - scrollContainer.clientHeight;
        scrollContainer.scrollTop = (restoreProgress ?? 0) * Math.max(0, max);
        lastRestoreRef.current = restoreKey;
        onScrollRestored();
        return;
      }
      lastRestoreRef.current = restoreKey;
      const targetTop = target.getBoundingClientRect().top
        - scrollContainer.getBoundingClientRect().top
        + scrollContainer.scrollTop;
      scrollContainer.scrollTop = Math.max(0, targetTop - 32);
      onScrollRestored();
      return;
    }

    lastRestoreRef.current = restoreKey;
    const max = scrollContainer.scrollHeight - scrollContainer.clientHeight;
    scrollContainer.scrollTop = (restoreProgress ?? 0) * Math.max(0, max);
    onScrollRestored();
  }, [content, onScrollRestored, restoreOffset, restoreProgress, searchOffset]);

  useEffect(() => {
    if (!targetFragment || content.length >= largeDocumentThreshold) return;
    const article = articleRef.current;
    const scrollContainer = article?.parentElement;
    if (!article || !scrollContainer) return;
    const target = Array.from(article.querySelectorAll<HTMLElement>("[id]"))
      .find((element) => element.id === targetFragment);
    if (target) {
      const targetTop = target.getBoundingClientRect().top
        - scrollContainer.getBoundingClientRect().top
        + scrollContainer.scrollTop;
      scrollContainer.scrollTop = Math.max(0, targetTop - 24);
    }
    onFragmentNavigated();
  }, [content, onFragmentNavigated, targetFragment]);

  useEffect(() => {
    if (content.length >= largeDocumentThreshold || searchOffset === null || targetFragment !== null) return;
    const article = articleRef.current;
    const target = article?.querySelector<HTMLElement>(
      ".markdown-search-match-current, .markdown-search-current-block",
    );
    const scrollContainer = article?.parentElement;
    if (!target || !scrollContainer) return;

    const targetRect = target.getBoundingClientRect();
    const containerRect = scrollContainer.getBoundingClientRect();
    const targetTop = targetRect.top - containerRect.top + scrollContainer.scrollTop;
    const centeredTop = targetTop - (scrollContainer.clientHeight - targetRect.height) / 2;
    scrollContainer.scrollTo({ top: Math.max(0, centeredTop), behavior: "smooth" });
  }, [content, search, searchOffset, searchNavigation, targetFragment]);

  if (content.length >= largeDocumentThreshold) {
    return (
      <MarkdownWorkerRenderer
        content={content}
        components={components}
        search={search}
        searchOffset={searchOffset}
        searchNavigation={searchNavigation}
        restoreOffset={restoreOffset}
        restoreProgress={restoreProgress}
        onScrollRestored={onScrollRestored}
        targetFragment={targetFragment}
        onFragmentNavigated={onFragmentNavigated}
      />
    );
  }

  return (
    <article className="markdown-document" ref={articleRef}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[
          rehypeKatex,
          [rehypeHighlight, { detect: false, ignoreMissing: true }],
          rehypeSlug,
          rehypeSearch(search, searchOffset),
        ]}
        components={components}
        urlTransform={(value) => /^file:(?:\/\/|\/)/i.test(value) ? value : defaultUrlTransform(value)}
        skipHtml
      >
        {content}
      </ReactMarkdown>
    </article>
  );
});

export default MarkdownViewer;

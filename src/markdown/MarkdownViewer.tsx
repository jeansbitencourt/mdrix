import { Children, isValidElement, memo, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
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
}: Props) {
  const articleRef = useRef<HTMLElement>(null);
  const components = useMemo<Components>(() => ({
    img({ src, alt }) {
      return <LocalImage src={src} alt={alt} documentPath={documentPath} />;
    },
    a({ href, children, ...props }) {
      const isExternal = /^https?:\/\//i.test(href ?? "") || /^mailto:/i.test(href ?? "");
      return (
        <a
          {...props}
          href={href}
          onClick={(event) => {
            if (href?.startsWith("#")) return;
            event.preventDefault();
            if (!isExternal || !href) {
              onError("Links para outros arquivos ainda não estão habilitados.");
              return;
            }
            void invoke("open_external", { url: href }).catch((cause) => onError(String(cause)));
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
  }), [dark, documentPath, onError]);

  useEffect(() => {
    if (content.length >= largeDocumentThreshold || searchOffset === null) return;
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
  }, [content, search, searchOffset, searchNavigation]);

  if (content.length >= largeDocumentThreshold) {
    return (
      <MarkdownWorkerRenderer
        content={content}
        components={components}
        search={search}
        searchOffset={searchOffset}
        searchNavigation={searchNavigation}
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
        skipHtml
      >
        {content}
      </ReactMarkdown>
    </article>
  );
});

export default MarkdownViewer;

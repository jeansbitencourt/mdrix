import { useEffect, useLayoutEffect, useRef } from "react";
import type { CSSProperties } from "react";
import type { MarkdownHeading } from "../markdown/workerMessages";

type Props = {
  headings: MarkdownHeading[];
  activeHeadingId: string | null;
  onNavigate: (id: string) => void;
  variant: "rail" | "dialog";
  open?: boolean;
  onClose?: () => void;
};

export default function TableOfContents({
  headings,
  activeHeadingId,
  onNavigate,
  variant,
  open = false,
  onClose,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const listRef = useRef<HTMLElement>(null);
  const headingRefs = useRef(new Map<string, HTMLButtonElement>());

  useLayoutEffect(() => {
    if (variant !== "dialog") return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open, variant]);

  useEffect(() => {
    if (!activeHeadingId || (variant === "dialog" && !open)) return;
    const list = listRef.current;
    const item = headingRefs.current.get(activeHeadingId);
    if (!list || !item) return;
    const listRect = list.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    if (itemRect.top < listRect.top) list.scrollTop -= listRect.top - itemRect.top;
    else if (itemRect.bottom > listRect.bottom) list.scrollTop += itemRect.bottom - listRect.bottom;
  }, [activeHeadingId, open, variant]);

  const entries = headings.map((heading) => {
    const depth = Math.max(0, heading.level - headings[0].level);
    const style = { paddingInlineStart: `${12 + depth * 12}px` } as CSSProperties;
    const active = activeHeadingId === heading.id;
    return (
      <li key={heading.id}>
        <button
          ref={(element) => {
            if (element) headingRefs.current.set(heading.id, element);
            else headingRefs.current.delete(heading.id);
          }}
          className={`toc-entry${active ? " is-active" : ""}`}
          style={style}
          type="button"
          title={heading.title}
          aria-current={active ? "location" : undefined}
          onClick={() => {
            onNavigate(heading.id);
            if (variant === "dialog") onClose?.();
          }}
        >
          {heading.title}
        </button>
      </li>
    );
  });

  if (variant === "rail") {
    return (
      <aside className="toc-rail" aria-label="Navegação por títulos">
        <h2 className="toc-heading">Neste documento</h2>
        <nav aria-label="Títulos do documento" ref={listRef}>
          <ol className="toc-list">{entries}</ol>
        </nav>
      </aside>
    );
  }

  return (
    <dialog
      ref={dialogRef}
      className="toc-dialog"
      aria-labelledby="toc-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose?.();
      }}
      onClose={onClose}
    >
      <div className="toc-dialog-content">
        <header className="toc-dialog-header">
          <h2 className="toc-heading" id="toc-dialog-title">Neste documento</h2>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Fechar menu de títulos">×</button>
        </header>
        <nav aria-label="Títulos do documento" ref={listRef}>
          <ol className="toc-list">{entries}</ol>
        </nav>
      </div>
    </dialog>
  );
}

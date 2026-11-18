import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import EmptyState from "../components/EmptyState";
import { LoadingOverlay, Notice, PendingChanges } from "../components/Feedback";
import SearchStrip from "../components/SearchStrip";
import StatusBar from "../components/StatusBar";
import TableOfContents from "../components/TableOfContents";
import Toolbar from "../components/Toolbar";
import MarkdownViewer from "../markdown/MarkdownViewer";
import { markdownEditorHighlighting } from "../markdown/editorHighlight";
import type { MarkdownHeading } from "../markdown/workerMessages";
import { findOccurrences, normalizeNewlines } from "./text";
import type { LaunchTarget, LoadedDocument, Mode, PendingAction } from "./types";

type SearchState = { query: string; selectedIndex: number; navigation: number };
type ScrollRestore = { sourceOffset: number | null; progress: number };

function visibleReaderOffset(surface: HTMLElement): number | null {
  const viewport = surface.getBoundingClientRect();
  const candidates = surface.querySelectorAll<HTMLElement>("[data-source-start][data-source-end]");
  let selected: HTMLElement | null = null;
  let selectedTop = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const rect = candidate.getBoundingClientRect();
    if (rect.bottom <= viewport.top + 32 || rect.top >= viewport.bottom) continue;
    const top = Math.max(rect.top, viewport.top + 32);
    if (top < selectedTop) {
      selected = candidate;
      selectedTop = top;
    }
  }
  const offset = selected?.dataset.sourceStart;
  return offset === undefined ? null : Number(offset);
}

function scrollProgress(container: HTMLElement): number {
  const max = container.scrollHeight - container.clientHeight;
  return max > 0 ? container.scrollTop / max : 0;
}

export default function App() {
  const [document, setDocument] = useState<LoadedDocument | null>(null);
  const [content, setContent] = useState("");
  const [renderedContent, setRenderedContent] = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [mode, setMode] = useState<Mode>("read");
  const [dark, setDark] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchState, setSearchState] = useState<SearchState>({ query: "", selectedIndex: -1, navigation: 0 });
  const search = searchState.query;
  const searchNavigation = searchState.navigation;
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [loadingMessage, setLoadingMessage] = useState<string | null>(null);
  const [openingDialog, setOpeningDialog] = useState(false);
  const [scrollRestore, setScrollRestore] = useState<ScrollRestore | null>(null);
  const [targetFragment, setTargetFragment] = useState<string | null>(null);
  const [outlineState, setOutlineState] = useState<{ content: string; headings: MarkdownHeading[] }>({ content: "", headings: [] });
  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null);
  const [contentsMenuOpen, setContentsMenuOpen] = useState(false);
  const [wideContentsLayout, setWideContentsLayout] = useState(() =>
    window.matchMedia("(min-width: 1380px)").matches,
  );
  const outline = outlineState.content === renderedContent ? outlineState.headings : [];
  const dirty = content !== savedContent;
  const busy = Boolean(loadingMessage) || openingDialog;
  const searchMatches = useMemo(() => findOccurrences(content, search), [content, search]);
  const currentSearchIndex = searchMatches.length > 0
    ? Math.min(Math.max(searchState.selectedIndex, 0), searchMatches.length - 1)
    : -1;
  const activeSearchOffset = currentSearchIndex >= 0 ? searchMatches[currentSearchIndex] : null;

  const viewerRef = useRef<HTMLDivElement>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const dirtyRef = useRef(dirty);
  const contentRef = useRef(content);
  const documentRef = useRef(document);
  const pendingRef = useRef(pending);
  const loadSequenceRef = useRef(0);
  const openDialogRef = useRef(false);
  const scrollRestoreRef = useRef<ScrollRestore | null>(null);
  dirtyRef.current = dirty;
  contentRef.current = content;
  documentRef.current = document;
  pendingRef.current = pending;
  scrollRestoreRef.current = scrollRestore;

  const handleModeChange = useCallback(() => {
    if (!documentRef.current) {
      setError("Abra um arquivo Markdown para alternar o modo.");
      return;
    }
    if (mode === "edit") {
      setRenderedContent(contentRef.current);
      setActiveHeadingId(null);
    }
    setContentsMenuOpen(false);
    const source = mode === "read" ? viewerRef.current : editorViewRef.current?.scrollDOM;
    if (source) {
      const restore = {
        sourceOffset: mode === "read"
          ? visibleReaderOffset(source)
          : (() => {
            const view = editorViewRef.current;
            if (!view) return null;
            const rect = view.scrollDOM.getBoundingClientRect();
            return view.posAtCoords({ x: rect.left + 48, y: rect.top + 32 });
          })(),
        progress: scrollProgress(source),
      };
      scrollRestoreRef.current = restore;
      setScrollRestore(restore);
    }
    setMode((current) => current === "read" ? "edit" : "read");
  }, [mode]);

  const handleOutlineChange = useCallback((headings: MarkdownHeading[]) => {
    setOutlineState({ content: renderedContent, headings });
  }, [renderedContent]);

  const handleActiveHeadingChange = useCallback((headingId: string | null) => {
    setActiveHeadingId(headingId);
  }, []);

  const loadPath = useCallback(async (path: string, fragment: string | null = null) => {
    const sequence = loadSequenceRef.current + 1;
    loadSequenceRef.current = sequence;
    setLoadingMessage("Abrindo documento…");
    setError(null);
    setStatus(null);
    try {
      const loaded = await invoke<LoadedDocument>("load_document", { path });
      if (sequence !== loadSequenceRef.current) return;
      const normalized = normalizeNewlines(loaded.content);
      setDocument({ ...loaded, content: normalized });
      setContent(normalized);
      setRenderedContent(normalized);
      setSavedContent(normalized);
      setContentsMenuOpen(false);
      setError(null);
      setStatus(null);
      setPending(null);
      setScrollRestore(null);
      scrollRestoreRef.current = null;
      setTargetFragment(fragment);
      setSearchState((current) => ({ query: "", selectedIndex: -1, navigation: current.navigation + 1 }));
    } catch (cause) {
      if (sequence === loadSequenceRef.current) setError(String(cause));
    } finally {
      if (sequence === loadSequenceRef.current) setLoadingMessage(null);
    }
  }, []);

  const restoreEditorPosition = useCallback((view: EditorView) => {
    const restore = scrollRestoreRef.current;
    if (!restore) return;
    if (restore.sourceOffset !== null) {
      const offset = Math.min(Math.max(restore.sourceOffset, 0), view.state.doc.length);
      view.dispatch({ effects: EditorView.scrollIntoView(offset, { y: "start", yMargin: 28 }) });
    } else {
      const max = view.scrollDOM.scrollHeight - view.scrollDOM.clientHeight;
      view.scrollDOM.scrollTop = restore.progress * Math.max(0, max);
    }
    scrollRestoreRef.current = null;
    setScrollRestore(null);
  }, []);

  const handleScrollRestored = useCallback(() => {
    scrollRestoreRef.current = null;
    setScrollRestore(null);
  }, []);

  const handleFragmentNavigated = useCallback(() => {
    setTargetFragment(null);
  }, []);

  const handleNavigateFragment = useCallback((fragment: string) => {
    setTargetFragment(fragment);
  }, []);

  const requestOpen = useCallback(async (path: string) => {
    if (dirtyRef.current) {
      setPending({ kind: "open", path });
    } else {
      await loadPath(path);
    }
  }, [loadPath]);

  const openFile = useCallback(async () => {
    if (openDialogRef.current) return;
    openDialogRef.current = true;
    setOpeningDialog(true);
    try {
      const selected = await invoke<string | null>("open_markdown_dialog");
      if (typeof selected === "string") await requestOpen(selected);
    } catch (cause) {
      setError(String(cause));
    } finally {
      openDialogRef.current = false;
      setOpeningDialog(false);
    }
  }, [requestOpen]);

  const saveCurrent = useCallback(async (): Promise<boolean> => {
    const current = documentRef.current;
    if (!current) {
      setError("Abra um arquivo Markdown antes de salvar.");
      return false;
    }

    const normalized = normalizeNewlines(contentRef.current);
    if (normalized === savedContent) {
      setStatus("Nenhuma alteração para salvar.");
      return true;
    }
    const serialized = current.lineEnding === "\r\n" ? normalized.replace(/\n/g, "\r\n") : normalized;
    try {
      const result = await invoke<{ fingerprint: string }>("save_document", {
        path: current.path,
        expectedHash: current.fingerprint,
        contents: serialized,
      });
      setDocument({ ...current, fingerprint: result.fingerprint });
      setSavedContent(normalized);
      setError(null);
      setStatus("Alterações salvas.");
      return true;
    } catch (cause) {
      setError(String(cause));
      return false;
    }
  }, [savedContent]);

  const continuePending = useCallback(async (discard: boolean) => {
    const action = pendingRef.current;
    if (!action) return;
    if (!discard && !(await saveCurrent())) return;

    setPending(null);
    if (action.kind === "open") await loadPath(action.path);
    else await getCurrentWindow().destroy();
  }, [loadPath, saveCurrent]);

  useEffect(() => {
    void invoke<LaunchTarget | null>("take_launch_path").then((target) => {
      if (target) return loadPath(target.path, target.fragment);
    }).catch((cause) => setError(String(cause)));
  }, [loadPath]);

  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | undefined;
    void getCurrentWindow().onCloseRequested((event) => {
      if (dirtyRef.current) {
        event.preventDefault();
        setPending({ kind: "close" });
      }
    }).then((stop) => {
      if (active) unlisten = stop;
      else stop();
    });
    return () => { active = false; unlisten?.(); };
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1380px)");
    const updateLayout = () => setWideContentsLayout(media.matches);
    media.addEventListener("change", updateLayout);
    updateLayout();
    return () => media.removeEventListener("change", updateLayout);
  }, []);

  useEffect(() => {
    if (wideContentsLayout || mode !== "read" || outline.length === 0) {
      setContentsMenuOpen(false);
    }
  }, [mode, outline.length, wideContentsLayout]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      if (loadingMessage || openingDialog) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "o") {
        event.preventDefault();
        void openFile();
      } else if (key === "s") {
        event.preventDefault();
        void saveCurrent();
      } else if (key === "e") {
        event.preventDefault();
        handleModeChange();
      } else if (key === "f") {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [handleModeChange, loadingMessage, openingDialog, openFile, saveCurrent]);

  useEffect(() => {
    if (mode !== "edit") return;
    return () => { editorViewRef.current = null; };
  }, [mode]);

  useEffect(() => {
    if (mode !== "edit" || !scrollRestore) return;
    const view = editorViewRef.current;
    if (view) restoreEditorPosition(view);
  }, [mode, restoreEditorPosition, scrollRestore]);

  useEffect(() => {
    if (mode !== "edit" || activeSearchOffset === null) return;
    const view = editorViewRef.current;
    if (!view) return;
    view.dispatch({
      selection: { anchor: activeSearchOffset, head: activeSearchOffset + search.length },
      effects: EditorView.scrollIntoView(activeSearchOffset, { y: "center" }),
    });
  }, [mode, activeSearchOffset, search, searchNavigation]);

  const editorExtensions = useMemo(() => [
    markdown({ base: markdownLanguage }),
    ...markdownEditorHighlighting,
    EditorView.lineWrapping,
  ], []);
  const fileName = document?.path.split(/[\\/]/).at(-1) ?? "Sem documento";

  const changeSearch = useCallback((value: string) => {
    setSearchState((current) => ({
      query: value,
      selectedIndex: 0,
      navigation: current.navigation + 1,
    }));
  }, []);

  const moveSearch = useCallback((direction: -1 | 1) => {
    if (searchMatches.length === 0) return;
    setSearchState((current) => {
      if (current.selectedIndex < 0) {
        return {
          ...current,
          selectedIndex: direction > 0 ? 0 : searchMatches.length - 1,
          navigation: current.navigation + 1,
        };
      }
      const visibleIndex = Math.min(current.selectedIndex, searchMatches.length - 1);
      return {
        ...current,
        selectedIndex: (visibleIndex + direction + searchMatches.length) % searchMatches.length,
        navigation: current.navigation + 1,
      };
    });
  }, [searchMatches]);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchState((current) => ({
      query: "",
      selectedIndex: -1,
      navigation: current.navigation + 1,
    }));
  }, []);

  return (
    <main className={`app-shell ${dark ? "theme-dark" : "theme-light"}`}>
      <Toolbar
        fileName={fileName}
        filePath={document?.path}
        dirty={dirty}
        mode={mode}
        hasDocument={Boolean(document)}
        dark={dark}
        busy={busy}
        onOpen={() => void openFile()}
        onSave={() => void saveCurrent()}
        onModeChange={handleModeChange}
        onSearch={() => setSearchOpen(true)}
        onThemeChange={() => setDark((current) => !current)}
        showContentsMenu={mode === "read" && !wideContentsLayout && outline.length > 0}
        onOpenContents={() => setContentsMenuOpen(true)}
      />

      {searchOpen && (
        <SearchStrip
          value={search}
          count={searchMatches.length}
          currentIndex={currentSearchIndex}
          onChange={changeSearch}
          onPrevious={() => moveSearch(-1)}
          onNext={() => moveSearch(1)}
          onClose={closeSearch}
        />
      )}

      {(error || status) && (
        <Notice
          message={error ?? status ?? ""}
          error={Boolean(error)}
          onDismiss={() => { setError(null); setStatus(null); }}
        />
      )}

      {pending && (
        <PendingChanges
          action={pending}
          onContinue={(discard) => void continuePending(discard)}
          onCancel={() => setPending(null)}
        />
      )}

      <section className="workspace">
        {mode === "read" && (
          <div className="surface reader-surface" ref={viewerRef}>
            {document ? (
              <MarkdownViewer
                content={renderedContent}
                documentPath={document.path}
                dark={dark}
                onError={setError}
                search={search}
                searchOffset={activeSearchOffset}
                searchNavigation={searchNavigation}
                restoreOffset={mode === "read" ? scrollRestore?.sourceOffset ?? null : null}
                restoreProgress={mode === "read" ? scrollRestore?.progress ?? null : null}
                onScrollRestored={handleScrollRestored}
                targetFragment={targetFragment}
                onFragmentNavigated={handleFragmentNavigated}
                onNavigateFragment={handleNavigateFragment}
                onOutlineChange={handleOutlineChange}
                onActiveHeadingChange={handleActiveHeadingChange}
              />
            ) : (
              <EmptyState onOpen={() => void openFile()} />
            )}
          </div>
        )}
        {mode === "edit" && (
          <div className="surface editor-surface">
            <div className="editor-frame">
              <CodeMirror
                key={document?.path ?? "empty-document"}
                value={content}
                height="100%"
                minHeight="100%"
                maxHeight="100%"
                width="100%"
                theme={dark ? "dark" : "light"}
                extensions={editorExtensions}
                onCreateEditor={(view) => {
                  editorViewRef.current = view;
                  restoreEditorPosition(view);
                }}
                onChange={(value) => { setContent(normalizeNewlines(value)); setStatus(null); }}
                placeholder="Escreva em Markdown…"
                basicSetup={{
                  lineNumbers: true,
                  foldGutter: true,
                  highlightActiveLine: true,
                  highlightActiveLineGutter: true,
                  indentOnInput: true,
                  bracketMatching: true,
                  closeBrackets: true,
                  tabSize: 2,
                }}
              />
            </div>
            {!document && <div className="editor-hint">O conteúdo novo só pode ser salvo depois de abrir um arquivo existente.</div>}
          </div>
        )}
        {document && outline.length > 0 && (
          <>
            {mode === "read" && wideContentsLayout && (
              <TableOfContents
                variant="rail"
                headings={outline}
                activeHeadingId={activeHeadingId}
                onNavigate={handleNavigateFragment}
              />
            )}
            <TableOfContents
              variant="dialog"
              open={mode === "read" && !wideContentsLayout && contentsMenuOpen}
              headings={outline}
              activeHeadingId={activeHeadingId}
              onNavigate={handleNavigateFragment}
              onClose={() => setContentsMenuOpen(false)}
            />
          </>
        )}
        {loadingMessage && <LoadingOverlay message={loadingMessage} />}
      </section>
      <StatusBar mode={mode} hasDocument={Boolean(document)} characterCount={content.length} />
    </main>
  );
}

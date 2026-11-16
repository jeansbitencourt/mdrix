import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import type { EditorView } from "@codemirror/view";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import EmptyState from "../components/EmptyState";
import { Notice, PendingChanges } from "../components/Feedback";
import SearchStrip from "../components/SearchStrip";
import StatusBar from "../components/StatusBar";
import Toolbar from "../components/Toolbar";
import MarkdownViewer from "../markdown/MarkdownViewer";
import { countOccurrences, normalizeNewlines } from "./text";
import type { LoadedDocument, Mode, PendingAction } from "./types";

export default function App() {
  const [document, setDocument] = useState<LoadedDocument | null>(null);
  const [content, setContent] = useState("");
  const [renderedContent, setRenderedContent] = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [mode, setMode] = useState<Mode>("read");
  const [dark, setDark] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [scrollProgress, setScrollProgress] = useState(0);
  const dirty = content !== savedContent;

  const viewerRef = useRef<HTMLDivElement>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const dirtyRef = useRef(dirty);
  const contentRef = useRef(content);
  const documentRef = useRef(document);
  const pendingRef = useRef(pending);
  dirtyRef.current = dirty;
  contentRef.current = content;
  documentRef.current = document;
  pendingRef.current = pending;

  const handleModeChange = useCallback(() => {
    if (!documentRef.current) {
      setError("Abra um arquivo Markdown para alternar o modo.");
      return;
    }
    if (mode === "edit") setRenderedContent(contentRef.current);
    const source = mode === "read" ? viewerRef.current : editorViewRef.current?.scrollDOM;
    if (source) {
      const max = source.scrollHeight - source.clientHeight;
      setScrollProgress(max > 0 ? source.scrollTop / max : 0);
    }
    setMode((current) => current === "read" ? "edit" : "read");
  }, [mode]);

  const loadPath = useCallback(async (path: string) => {
    try {
      const loaded = await invoke<LoadedDocument>("load_document", { path });
      const normalized = normalizeNewlines(loaded.content);
      setDocument({ ...loaded, content: normalized });
      setContent(normalized);
      setRenderedContent(normalized);
      setSavedContent(normalized);
      setError(null);
      setStatus(null);
      setPending(null);
      setScrollProgress(0);
    } catch (cause) {
      setError(String(cause));
    }
  }, []);

  const requestOpen = useCallback(async (path: string) => {
    if (dirtyRef.current) {
      setPending({ kind: "open", path });
    } else {
      await loadPath(path);
    }
  }, [loadPath]);

  const openFile = useCallback(async () => {
    try {
      const selected = await open({
        multiple: false,
        directory: false,
        filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
      });
      if (typeof selected === "string") await requestOpen(selected);
    } catch (cause) {
      setError(String(cause));
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
    void invoke<string | null>("take_launch_path").then((path) => {
      if (path) return loadPath(path);
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
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
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
        setSearchOpen((current) => !current);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [handleModeChange, openFile, saveCurrent]);

  useEffect(() => {
    const target = mode === "read" ? viewerRef.current : editorViewRef.current?.scrollDOM;
    if (!target) return;
    requestAnimationFrame(() => {
      target.scrollTop = scrollProgress * (target.scrollHeight - target.clientHeight);
    });
  }, [mode, scrollProgress, document?.path]);

  const editorExtensions = useMemo(() => [markdown()], []);
  const fileName = document?.path.split(/[\\/]/).at(-1) ?? "Sem documento";
  const occurrenceCount = countOccurrences(content, search);

  return (
    <main className={`app-shell ${dark ? "theme-dark" : "theme-light"}`}>
      <Toolbar
        fileName={fileName}
        filePath={document?.path}
        dirty={dirty}
        mode={mode}
        hasDocument={Boolean(document)}
        dark={dark}
        onOpen={() => void openFile()}
        onSave={() => void saveCurrent()}
        onModeChange={handleModeChange}
        onSearch={() => setSearchOpen((current) => !current)}
        onThemeChange={() => setDark((current) => !current)}
      />

      {searchOpen && (
        <SearchStrip
          value={search}
          count={occurrenceCount}
          onChange={setSearch}
          onClose={() => { setSearchOpen(false); setSearch(""); }}
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
        <div className={`surface reader-surface ${mode === "read" ? "" : "is-hidden"}`} ref={viewerRef}>
          {document ? (
            <MarkdownViewer content={renderedContent} documentPath={document.path} dark={dark} onError={setError} />
          ) : (
            <EmptyState onOpen={() => void openFile()} />
          )}
        </div>
        <div className={`surface editor-surface ${mode === "edit" ? "" : "is-hidden"}`}>
          <CodeMirror
            key={document?.path ?? "empty-document"}
            value={content}
            height="100%"
            theme={dark ? "dark" : "light"}
            extensions={editorExtensions}
            onCreateEditor={(view) => { editorViewRef.current = view; }}
            onChange={(value) => { setContent(normalizeNewlines(value)); setStatus(null); }}
            placeholder="Escreva em Markdown…"
            basicSetup={{ lineNumbers: true, foldGutter: false, highlightActiveLine: true }}
          />
          {!document && <div className="editor-hint">O conteúdo novo só pode ser salvo depois de abrir um arquivo existente.</div>}
        </div>
      </section>
      <StatusBar mode={mode} hasDocument={Boolean(document)} characterCount={content.length} />
    </main>
  );
}

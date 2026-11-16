import type { Mode } from "../app/types";

type ToolbarProps = {
  fileName: string;
  filePath?: string;
  dirty: boolean;
  mode: Mode;
  hasDocument: boolean;
  dark: boolean;
  busy: boolean;
  onOpen: () => void;
  onSave: () => void;
  onModeChange: () => void;
  onSearch: () => void;
  onThemeChange: () => void;
};

export default function Toolbar({
  fileName,
  filePath,
  dirty,
  mode,
  hasDocument,
  dark,
  busy,
  onOpen,
  onSave,
  onModeChange,
  onSearch,
  onThemeChange,
}: ToolbarProps) {
  return (
    <header className="topbar">
      <div className="brand-lockup">
        <span className="brand-mark" aria-hidden="true">m</span>
        <span className="file-title" title={filePath}>
          {fileName}{dirty ? <span className="dirty-dot" aria-label="alterações não salvas"> ·</span> : null}
        </span>
      </div>
      <nav className="toolbar" aria-label="Ações do documento">
        <button className="quiet-button" onClick={onOpen} title="Abrir (Ctrl+O)" disabled={busy}>Abrir</button>
        <button className="quiet-button" onClick={onSave} title="Salvar (Ctrl+S)" disabled={!hasDocument || busy}>Salvar</button>
        <span className="toolbar-divider" />
        <button className="quiet-button mode-button" onClick={onModeChange} title="Alternar modo (Ctrl+E)" disabled={!hasDocument || busy}>
          <span className="mode-indicator" />{mode === "read" ? "Editar" : "Ler"}
        </button>
        <button className="icon-button" onClick={onSearch} title="Buscar (Ctrl+F)" aria-label="Buscar">
          <SearchIcon />
        </button>
        <button className="icon-button" onClick={onThemeChange} title={dark ? "Tema claro" : "Tema escuro"} aria-label="Alternar tema">
          {dark ? <SunIcon /> : <MoonIcon />}
        </button>
      </nav>
    </header>
  );
}

function SearchIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.6" /><path d="m16 16 4.5 4.5" /></svg>;
}

function SunIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>;
}

function MoonIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.4 15.2A8.6 8.6 0 0 1 8.8 3.6a8.7 8.7 0 1 0 11.6 11.6Z" /></svg>;
}

import type { Mode } from "../app/types";

type StatusBarProps = { mode: Mode; hasDocument: boolean; characterCount: number };

export default function StatusBar({ mode, hasDocument, characterCount }: StatusBarProps) {
  return (
    <footer className="statusbar">
      <span>{mode === "read" ? "Leitura" : "Markdown"}</span>
      <span>{hasDocument ? `${characterCount.toLocaleString("pt-BR")} caracteres` : "Sem documento"}</span>
    </footer>
  );
}

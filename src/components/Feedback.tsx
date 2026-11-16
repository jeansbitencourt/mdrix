import type { PendingAction } from "../app/types";

type NoticeProps = {
  message: string;
  error: boolean;
  onDismiss: () => void;
};

export function Notice({ message, error, onDismiss }: NoticeProps) {
  return (
    <div className={`notice ${error ? "notice-error" : "notice-status"}`} role="status">
      <span>{message}</span>
      <button onClick={onDismiss} aria-label="Fechar aviso">×</button>
    </div>
  );
}

type PendingChangesProps = {
  action: PendingAction;
  onContinue: (discard: boolean) => void;
  onCancel: () => void;
};

export function PendingChanges({ action, onContinue, onCancel }: PendingChangesProps) {
  return (
    <div className="confirm-strip" role="alertdialog" aria-label="Alterações não salvas">
      <span>{action.kind === "close" ? "Salvar antes de fechar?" : "Salvar antes de abrir outro arquivo?"}</span>
      <div className="confirm-actions">
        <button className="quiet-button" onClick={() => onContinue(false)}>Salvar</button>
        <button className="quiet-button danger-button" onClick={() => onContinue(true)}>Descartar</button>
        <button className="quiet-button" onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  );
}

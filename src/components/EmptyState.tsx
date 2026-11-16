type EmptyStateProps = { onOpen: () => void };

export default function EmptyState({ onOpen }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <span className="empty-mark">m</span>
      <h1>Um lugar calmo para ler e escrever.</h1>
      <p>Abra um arquivo Markdown para começar.</p>
      <button className="primary-button" onClick={onOpen}>Abrir arquivo <kbd>Ctrl O</kbd></button>
    </div>
  );
}

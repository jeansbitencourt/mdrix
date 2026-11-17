type SearchStripProps = {
  value: string;
  count: number;
  currentIndex: number;
  onChange: (value: string) => void;
  onPrevious: () => void;
  onNext: () => void;
  onClose: () => void;
};

export default function SearchStrip({
  value,
  count,
  currentIndex,
  onChange,
  onPrevious,
  onNext,
  onClose,
}: SearchStripProps) {
  return (
    <div className="search-strip">
      <input
        autoFocus
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            if (event.shiftKey) onPrevious();
            else onNext();
          } else if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          }
        }}
        placeholder="Buscar no documento"
        aria-label="Buscar no documento"
      />
      <span aria-live="polite">
        {count > 0 && currentIndex >= 0
          ? `${currentIndex + 1} de ${count}`
          : `${count} ${count === 1 ? "ocorrência" : "ocorrências"}`}
      </span>
      <button
        className="icon-button search-navigation"
        type="button"
        onClick={onPrevious}
        disabled={count === 0}
        title="Resultado anterior (Shift+Enter)"
        aria-label="Resultado anterior"
      >
        ↑
      </button>
      <button
        className="icon-button search-navigation"
        type="button"
        onClick={onNext}
        disabled={count === 0}
        title="Próximo resultado (Enter)"
        aria-label="Próximo resultado"
      >
        ↓
      </button>
      <button className="icon-button" type="button" onClick={onClose} aria-label="Fechar busca">×</button>
    </div>
  );
}

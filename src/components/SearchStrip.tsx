type SearchStripProps = {
  value: string;
  count: number;
  onChange: (value: string) => void;
  onClose: () => void;
};

export default function SearchStrip({ value, count, onChange, onClose }: SearchStripProps) {
  return (
    <div className="search-strip">
      <input autoFocus value={value} onChange={(event) => onChange(event.target.value)} placeholder="Buscar no documento" />
      <span>{count} ocorrência(s)</span>
      <button className="icon-button" onClick={onClose} aria-label="Fechar busca">×</button>
    </div>
  );
}

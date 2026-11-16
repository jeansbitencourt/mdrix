import { useEffect, useId, useState } from "react";

export default function MermaidBlock({ chart, dark }: { chart: string; dark: boolean }) {
  const uniqueId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSvg(null);
    setError(null);
    void import("mermaid").then(async ({ default: mermaid }) => {
      mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: dark ? "dark" : "default" });
      const result = await mermaid.render(`mdrix-mermaid-${uniqueId}`, chart);
      if (!cancelled) setSvg(result.svg);
    }).catch((cause: unknown) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : "Diagrama inválido.");
    });
    return () => { cancelled = true; };
  }, [chart, dark, uniqueId]);

  if (error) return <pre className="diagram-error">Mermaid: {error}</pre>;
  if (!svg) return <div className="diagram-loading">Renderizando diagrama…</div>;
  return <div className="mermaid-diagram" role="img" aria-label="Diagrama Mermaid" dangerouslySetInnerHTML={{ __html: svg }} />;
}

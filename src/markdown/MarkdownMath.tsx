import katex from "katex";

type Props = { expression: string; display: boolean };

export default function MarkdownMath({ expression, display }: Props) {
  try {
    const html = katex.renderToString(expression, {
      displayMode: display,
      throwOnError: false,
      trust: false,
    });
    const content = <span dangerouslySetInnerHTML={{ __html: html }} />;
    return display ? <div className="markdown-math-block">{content}</div> : content;
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Expressão matemática inválida.";
    return <code className="math-error">{message}</code>;
  }
}

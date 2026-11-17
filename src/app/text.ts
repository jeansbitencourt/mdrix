export function normalizeNewlines(value: string): string {
  return value.replace(/\r\n?/g, "\n");
}

export function countOccurrences(text: string, search: string): number {
  return findOccurrences(text, search).length;
}

export function findOccurrences(text: string, search: string): number[] {
  if (!search) return [];

  const matcher = new RegExp(escapeRegExp(search), "giu");
  const offsets: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = matcher.exec(text)) !== null) offsets.push(match.index);
  return offsets;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

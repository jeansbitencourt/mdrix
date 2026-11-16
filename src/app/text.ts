export function normalizeNewlines(value: string): string {
  return value.replace(/\r\n?/g, "\n");
}

export function countOccurrences(text: string, search: string): number {
  if (!search) return 0;
  return text.toLocaleLowerCase().split(search.toLocaleLowerCase()).length - 1;
}

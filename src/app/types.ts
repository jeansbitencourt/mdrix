export type Mode = "read" | "edit";
export type LineEnding = "\n" | "\r\n";
export type LoadedDocument = {
  path: string;
  content: string;
  fingerprint: string;
  lineEnding: LineEnding;
};
export type LaunchTarget = { path: string; fragment: string | null };
export type PendingAction = { kind: "open"; path: string } | { kind: "close" };

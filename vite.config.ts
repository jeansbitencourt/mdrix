import { defineConfig } from "vite";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const workerEntityDecoder = fileURLToPath(
  new URL("./node_modules/decode-named-character-reference/index.js", import.meta.url),
);

function markdownWorkerPlugin(): Plugin {
  return {
    name: "mdrix-worker-markdown-entity-decoder",
    enforce: "pre",
    resolveId(source) {
      if (source === "decode-named-character-reference") return workerEntityDecoder;
      return null;
    },
  };
}

export default defineConfig({
  plugins: [react()],
  // Vite's dev dependency optimizer prefers the package's `browser` export,
  // which initializes a DOM element at module scope. Web Workers have no DOM.
  // Alias the decoder globally so both dev and production use its pure JS map.
  resolve: {
    alias: [{ find: /^decode-named-character-reference$/, replacement: workerEntityDecoder }],
  },
  worker: { plugins: () => [markdownWorkerPlugin()] },
  clearScreen: false,
  server: { strictPort: true },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  build: { target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari13" },
});

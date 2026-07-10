import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite-plus";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@vois/webview-bridge": path.resolve(rootDir, "../src/index.ts"),
    },
  },
  server: {
    // Portless injects --host / --port; allow LAN hostnames.
    allowedHosts: true,
  },
  preview: {
    allowedHosts: true,
  },
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {},
});

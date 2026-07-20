import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { copyBasisTranscoder } from "./vite.basis.plugin";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [copyBasisTranscoder()],
  server: {
    host: "127.0.0.1",
    port: 4173,
    watch: {
      // Windows-mounted WSL paths do not reliably emit file change events.
      usePolling: true,
      interval: 250,
    },
  },
  build: {
    emptyOutDir: false,
    rollupOptions: {
      input: {
        capture: `${projectRoot}capture.html`,
      },
      output: {
        manualChunks(id) {
          if (id.includes("three/examples/jsm/")) {
            return "three-extras";
          }
          if (id.includes("node_modules/three/")) {
            return "three-core";
          }
          return undefined;
        },
      },
    },
  },
});

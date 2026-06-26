import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  server: {
    host: "0.0.0.0",
    port: 4173,
    watch: {
      // Windows-mounted WSL paths do not reliably emit file change events.
      usePolling: true,
      interval: 250,
    },
  },
  build: {
    emptyOutDir: false,
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      input: {
        capture: `${projectRoot}capture.html`,
      },
      output: {
        manualChunks(id) {
          const normalized = id.replace(/\\/g, "/");
          if (
            normalized.includes("/node_modules/three/examples/jsm/controls/OrbitControls.js") ||
            normalized.includes("/node_modules/three/examples/jsm/loaders/GLTFLoader.js")
          ) {
            return "three-extras";
          }
          if (normalized.includes("/node_modules/three/")) {
            return "three-core";
          }
          return undefined;
        },
      },
    },
  },
});

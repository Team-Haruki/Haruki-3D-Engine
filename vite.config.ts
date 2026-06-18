import { defineConfig } from "vite";

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
    rollupOptions: {
      output: {
        manualChunks: {
          "three-core": ["three"],
          "three-extras": [
            "three/examples/jsm/controls/OrbitControls.js",
            "three/examples/jsm/loaders/GLTFLoader.js",
          ],
        },
      },
    },
  },
});

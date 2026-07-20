import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { copyBasisTranscoder } from "./vite.basis.plugin";

export default defineConfig({
  plugins: [copyBasisTranscoder()],
  build: {
    lib: {
      entry: {
        index: fileURLToPath(new URL("./src/index.ts", import.meta.url)),
        internal: fileURLToPath(new URL("./src/internal.ts", import.meta.url)),
      },
      formats: ["es"],
      fileName: (_format, entryName) => entryName === "index"
        ? "haruki-3d-engine.js"
        : "haruki-3d-engine-internal.js",
    },
    rollupOptions: {
      external: ["three", "@pixiv/three-vrm"],
      output: {
        globals: {
          three: "THREE",
          "@pixiv/three-vrm": "THREE_VRM",
        },
      },
    },
  },
});

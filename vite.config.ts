import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { copyBasisTranscoder, externalizeBrotliWasm } from "./vite.basis.plugin";

export default defineConfig({
  base: "./",
  plugins: [externalizeBrotliWasm(), copyBasisTranscoder()],
  worker: {
    plugins: () => [externalizeBrotliWasm()],
  },
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
        assetFileNames: "assets/[name]-[hash][extname]",
        globals: {
          three: "THREE",
          "@pixiv/three-vrm": "THREE_VRM",
        },
      },
    },
  },
});

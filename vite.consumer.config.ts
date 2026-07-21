import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { copyBasisTranscoder } from "./vite.basis.plugin";

export default defineConfig({
  base: "./",
  plugins: [copyBasisTranscoder("dist-consumer/basis")],
  root: fileURLToPath(new URL("./examples/minimal", import.meta.url)),
  build: {
    outDir: fileURLToPath(new URL("./dist-consumer", import.meta.url)),
    emptyOutDir: true,
  },
});

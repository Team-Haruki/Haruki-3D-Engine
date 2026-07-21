import init, { decompress } from "../../node_modules/brotli-wasm/pkg.web/brotli_wasm.js";

let runtime: Promise<{ decompress: typeof decompress }> | null = null;

export function loadBrotliWasm(wasmUrl: string) {
  runtime ??= init(wasmUrl).then(() => ({ decompress }));
  return runtime;
}

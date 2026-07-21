import init, { decompress } from "../../node_modules/brotli-wasm/pkg.web/brotli_wasm.js";
import wasmUrl from "../../node_modules/brotli-wasm/pkg.web/brotli_wasm_bg.wasm?url&no-inline";

export default init(wasmUrl).then(() => ({ decompress }));

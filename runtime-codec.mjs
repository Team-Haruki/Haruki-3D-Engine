import { brotliDecompressSync } from "node:zlib";

import { decode } from "@msgpack/msgpack";

export function decodeMsgpackBrotliAsJSON(compressed) {
  return JSON.stringify(decode(brotliDecompressSync(compressed)));
}

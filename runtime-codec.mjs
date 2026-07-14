import { brotliDecompressSync } from "node:zlib";

import { decodeRuntimeMessagePack } from "./runtime-binary-codec.mjs";

export function decodeMsgpackBrotliAsJSON(compressed) {
  return JSON.stringify(
    decodeRuntimeMessagePack(brotliDecompressSync(compressed)),
    (_key, value) => ArrayBuffer.isView(value) ? Array.from(value) : value
  );
}

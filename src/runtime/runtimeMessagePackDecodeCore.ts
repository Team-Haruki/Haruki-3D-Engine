import { loadBrotliWasm } from "./brotliWasmRuntime";
import { decodeRuntimeMessagePack } from "../../runtime-binary-codec.mjs";

export async function decodeRuntimeMessagePackBrotliDirect(
  bytes: ArrayBuffer,
  wasmUrl: string
) {
  const brotli = await loadBrotliWasm(wasmUrl);
  return decodeRuntimeMessagePack(brotli.decompress(new Uint8Array(bytes)));
}

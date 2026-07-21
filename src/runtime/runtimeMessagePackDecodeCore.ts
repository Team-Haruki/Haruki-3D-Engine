import brotliWasm from "./brotliWasmRuntime";
import { decodeRuntimeMessagePack } from "../../runtime-binary-codec.mjs";

export async function decodeRuntimeMessagePackBrotliDirect(bytes: ArrayBuffer) {
  const brotli = await brotliWasm;
  return decodeRuntimeMessagePack(brotli.decompress(new Uint8Array(bytes)));
}

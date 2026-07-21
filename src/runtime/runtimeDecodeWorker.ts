import { decodeRuntimeMessagePackBrotliDirect } from "./runtimeMessagePackDecodeCore";

type DecodeRequest = { id: number; bytes: ArrayBuffer; wasmUrl: string };

globalThis.onmessage = async (event: MessageEvent<DecodeRequest>) => {
  const { id, bytes, wasmUrl } = event.data;
  try {
    const value = await decodeRuntimeMessagePackBrotliDirect(bytes, wasmUrl);
    globalThis.postMessage({ id, value }, { transfer: collectArrayBuffers(value) });
  } catch (error) {
    globalThis.postMessage({
      id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

function collectArrayBuffers(value: unknown) {
  const buffers = new Set<ArrayBuffer>();
  const seen = new Set<object>();
  const visit = (item: unknown) => {
    if (!item || typeof item !== "object") return;
    if (ArrayBuffer.isView(item)) {
      if (item.buffer instanceof ArrayBuffer) buffers.add(item.buffer);
      return;
    }
    if (item instanceof ArrayBuffer) {
      buffers.add(item);
      return;
    }
    if (seen.has(item)) return;
    seen.add(item);
    if (Array.isArray(item)) {
      item.forEach(visit);
      return;
    }
    Object.values(item as Record<string, unknown>).forEach(visit);
  };
  visit(value);
  return [...buffers];
}

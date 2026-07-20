const workerThresholdBytes = 64 * 1024;

type PendingDecode = {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
};

let decodeWorker: Worker | null = null;
let nextDecodeId = 1;
const pendingDecodes = new Map<number, PendingDecode>();

export async function decodeRuntimeMessagePackBrotli(bytes: ArrayBuffer) {
  if (bytes.byteLength < workerThresholdBytes || typeof Worker === "undefined") {
    return decodeDirect(bytes);
  }
  const worker = getDecodeWorker();
  if (!worker) {
    return decodeDirect(bytes);
  }
  const id = nextDecodeId++;
  return new Promise<unknown>((resolve, reject) => {
    pendingDecodes.set(id, { resolve, reject });
    worker.postMessage({ id, bytes }, [bytes]);
  });
}

async function decodeDirect(bytes: ArrayBuffer) {
  const { decodeRuntimeMessagePackBrotliDirect } = await import("./runtimeMessagePackDecodeCore");
  return decodeRuntimeMessagePackBrotliDirect(bytes);
}

function getDecodeWorker() {
  if (decodeWorker) return decodeWorker;
  try {
    decodeWorker = new Worker(new URL("./runtimeDecodeWorker.ts", import.meta.url), {
      type: "module",
      name: "haruki-runtime-decoder",
    });
    decodeWorker.onmessage = ({ data }: MessageEvent<{ id: number; value?: unknown; error?: string }>) => {
      const pending = pendingDecodes.get(data.id);
      if (!pending) return;
      pendingDecodes.delete(data.id);
      if (data.error) pending.reject(new Error(data.error));
      else pending.resolve(data.value);
    };
    decodeWorker.onerror = () => resetDecodeWorker("Runtime decode worker failed.");
    return decodeWorker;
  } catch {
    decodeWorker = null;
    return null;
  }
}

function resetDecodeWorker(message: string) {
  decodeWorker?.terminate();
  decodeWorker = null;
  for (const pending of pendingDecodes.values()) {
    pending.reject(new Error(message));
  }
  pendingDecodes.clear();
}

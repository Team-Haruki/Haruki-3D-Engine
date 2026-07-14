import { decode, ExtensionCodec } from "@msgpack/msgpack";

export const runtimeBinaryArrayExtensionType = 42;

const runtimeExtensionCodec = new ExtensionCodec();
runtimeExtensionCodec.register({
  type: runtimeBinaryArrayExtensionType,
  encode() {
    return null;
  },
  decode(payload) {
    if (payload.length < 1) {
      throw new Error("Runtime binary array payload is empty.");
    }
    const type = payload[0];
    const bytes = payload.subarray(1);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (type === 1 && bytes.byteLength % Float32Array.BYTES_PER_ELEMENT === 0) {
      const values = new Float32Array(bytes.byteLength / Float32Array.BYTES_PER_ELEMENT);
      for (let index = 0; index < values.length; index += 1) {
        values[index] = view.getFloat32(index * Float32Array.BYTES_PER_ELEMENT, true);
      }
      return values;
    }
    if (type === 2 && bytes.byteLength % Uint16Array.BYTES_PER_ELEMENT === 0) {
      const values = new Uint16Array(bytes.byteLength / Uint16Array.BYTES_PER_ELEMENT);
      for (let index = 0; index < values.length; index += 1) {
        values[index] = view.getUint16(index * Uint16Array.BYTES_PER_ELEMENT, true);
      }
      return values;
    }
    if (type === 3 && bytes.byteLength % Uint32Array.BYTES_PER_ELEMENT === 0) {
      const values = new Uint32Array(bytes.byteLength / Uint32Array.BYTES_PER_ELEMENT);
      for (let index = 0; index < values.length; index += 1) {
        values[index] = view.getUint32(index * Uint32Array.BYTES_PER_ELEMENT, true);
      }
      return values;
    }
    throw new Error(`Invalid runtime binary array type ${type} with ${bytes.byteLength} byte(s).`);
  },
});

export function decodeRuntimeMessagePack(bytes) {
  return decode(bytes, { extensionCodec: runtimeExtensionCodec });
}

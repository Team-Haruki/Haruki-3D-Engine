import assert from "node:assert/strict";
import test from "node:test";
import { brotliCompressSync } from "node:zlib";

import { encode, ExtensionCodec } from "@msgpack/msgpack";

import {
  decodeRuntimeMessagePack,
  runtimeBinaryArrayExtensionType,
} from "../runtime-binary-codec.mjs";
import { decodeMsgpackBrotliAsJSON } from "../runtime-codec.mjs";

class RuntimeBinaryPayload {
  constructor(bytes) {
    this.bytes = bytes;
  }
}

function encodePayload(payload) {
  const codec = new ExtensionCodec();
  codec.register({
    type: runtimeBinaryArrayExtensionType,
    encode(value) {
      return value instanceof RuntimeBinaryPayload ? value.bytes : null;
    },
    decode() {
      throw new Error("test encoder must not decode");
    },
  });
  return encode(payload, { extensionCodec: codec });
}

test("decodes runtime float and index extensions as typed arrays", () => {
  const floats = new Uint8Array(1 + 3 * Float32Array.BYTES_PER_ELEMENT);
  floats[0] = 1;
  const floatView = new DataView(floats.buffer);
  floatView.setFloat32(1, 0.25, true);
  floatView.setFloat32(5, -2.5, true);
  floatView.setFloat32(9, 7.75, true);

  const indexes = new Uint8Array(1 + 3 * Uint16Array.BYTES_PER_ELEMENT);
  indexes[0] = 2;
  const indexView = new DataView(indexes.buffer);
  indexView.setUint16(1, 2, true);
  indexView.setUint16(3, 500, true);
  indexView.setUint16(5, 65535, true);

  const wideIndexes = new Uint8Array(1 + 2 * Uint32Array.BYTES_PER_ELEMENT);
  wideIndexes[0] = 3;
  const wideIndexView = new DataView(wideIndexes.buffer);
  wideIndexView.setUint32(1, 70000, true);
  wideIndexView.setUint32(5, 4294967295, true);

  const decoded = decodeRuntimeMessagePack(encodePayload({
    positions: new RuntimeBinaryPayload(floats),
    indices: new RuntimeBinaryPayload(indexes),
    wideIndices: new RuntimeBinaryPayload(wideIndexes),
    gravityDir: [0, -1, 0],
  }));

  assert.ok(decoded.positions instanceof Float32Array);
  assert.deepEqual(Array.from(decoded.positions), [0.25, -2.5, 7.75]);
  assert.ok(decoded.indices instanceof Uint16Array);
  assert.deepEqual(Array.from(decoded.indices), [2, 500, 65535]);
  assert.ok(decoded.wideIndices instanceof Uint32Array);
  assert.deepEqual(Array.from(decoded.wideIndices), [70000, 4294967295]);
  assert.deepEqual(decoded.gravityDir, [0, -1, 0]);

  const json = JSON.parse(decodeMsgpackBrotliAsJSON(brotliCompressSync(encodePayload({
    positions: new RuntimeBinaryPayload(floats),
  }))));
  assert.deepEqual(json.positions, [0.25, -2.5, 7.75]);
});

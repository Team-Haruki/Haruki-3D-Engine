import assert from "node:assert/strict";
import test from "node:test";
import { brotliCompressSync } from "node:zlib";

import { encode } from "@msgpack/msgpack";
import { decodeMsgpackBrotliAsJSON } from "../runtime-codec.mjs";

test("compressed MessagePack registries can be served as JSON", () => {
  const source = { entries: [{ character3dId: 5, unit: "light_sound" }] };
  const compressed = brotliCompressSync(Buffer.from(encode(source)));
  assert.deepEqual(JSON.parse(decodeMsgpackBrotliAsJSON(compressed)), source);
});

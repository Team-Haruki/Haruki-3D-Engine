import assert from "node:assert/strict";
import test from "node:test";

import { mergePartRuntimeCore } from "../part-runtime-core.mjs";

test("part runtime delta restores shared heavy core fields", () => {
  const core = {
    version: "0415-part-core-1",
    nativeMeshes: { meshes: [{ positions: new Float32Array([1, 2, 3]) }] },
    springBone: { bones: [{ pathId: 7 }] },
    morphChannelBindings: [{ name: "eye" }],
    warnings: ["core"],
  };
  const delta = {
    version: "0415-part-delta-1",
    corePath: "parts/_cores/base/part-runtime-core.json",
    part: { costume3dId: 2 },
    materialSlots: [{ mainTex: "/_texture_store/a.png" }],
    warnings: ["delta"],
  };

  const merged = mergePartRuntimeCore(delta, core);
  assert.equal(merged.part.costume3dId, 2);
  assert.equal(merged.nativeMeshes, core.nativeMeshes);
  assert.equal(merged.springBone, core.springBone);
  assert.deepEqual(merged.warnings, ["core", "delta"]);
  assert.equal("corePath" in merged, false);
});

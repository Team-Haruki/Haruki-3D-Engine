import assert from "node:assert/strict";
import test from "node:test";

import * as publicKernel from "../dist/haruki-3d-engine.js";

test("default package entry exposes only the browser rendering kernel", () => {
  assert.deepEqual(Object.keys(publicKernel).sort(), [
    "createHaruki3DKernel",
    "previewLightDefaults",
  ]);
});

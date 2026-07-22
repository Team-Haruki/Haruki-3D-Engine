import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateSekaiOutlineFovFactor,
  sekaiCostumeShopOutlineSettings,
} from "../dist/haruki-3d-engine-internal.js";

test("costume shop outline globals match the captured 6.6.2 runtime", () => {
  assert.deepEqual(sekaiCostumeShopOutlineSettings, {
    widthMin: 0.0004,
    widthMax: 0.0095,
    distanceNear: 0.45,
    distanceFar: 20,
  });
  assert.ok(
    Math.abs(evaluateSekaiOutlineFovFactor(25) - 1.027823567390442) < 1e-7
  );
});

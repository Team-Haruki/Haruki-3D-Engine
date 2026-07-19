import assert from "node:assert/strict";
import test from "node:test";

import { normalizeHarukiRenderRecipe } from "../dist/haruki-3d-engine-internal.js";

test("render recipe normalizes optional sources without changing exact part ids", () => {
  assert.deepEqual(normalizeHarukiRenderRecipe({
    roleId: "5:light_sound",
    bodyCostume3dId: 797001,
    headCostume3dId: 105,
    headPackagePath: "  parts/_sources/head/105  ",
    hairCostume3dId: 205,
  }), {
    roleId: "5:light_sound",
    bodyCostume3dId: 797001,
    headCostume3dId: 105,
    headPackagePath: "parts/_sources/head/105",
    hairCostume3dId: 205,
    headOptionalCostume3dId: null,
  });
});

test("render recipe rejects invalid roles and part ids at the kernel seam", () => {
  assert.throws(
    () => normalizeHarukiRenderRecipe({
      roleId: "../jp",
      bodyCostume3dId: 1,
      headCostume3dId: 2,
      hairCostume3dId: 3,
    }),
    /roleId/
  );
  assert.throws(
    () => normalizeHarukiRenderRecipe({
      roleId: "5:light_sound",
      bodyCostume3dId: 0,
      headCostume3dId: 2,
      hairCostume3dId: 3,
    }),
    /bodyCostume3dId/
  );
});

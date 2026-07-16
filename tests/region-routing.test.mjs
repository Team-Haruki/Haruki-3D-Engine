import assert from "node:assert/strict";
import test from "node:test";

import { applyRouteRegion, resolveRegionRoute } from "../region-routing.mjs";

test("regional routes select a runtime subdirectory", () => {
  assert.deepEqual(
    resolveRegionRoute("/regions/jp/runtime/character3d-index.msgpack.br", "/data/runtime"),
    {
      region: "jp",
      pathname: "/runtime/character3d-index.msgpack.br",
      runtimeRoot: "/data/runtime/jp",
    }
  );
  assert.deepEqual(resolveRegionRoute("/runtime/character3d-index.msgpack.br", "/data/runtime"), {
    region: null,
    pathname: "/runtime/character3d-index.msgpack.br",
    runtimeRoot: "/data/runtime",
  });
});

test("regional routes reject malformed regions and path escapes", () => {
  for (const pathname of [
    "/regions/../runtime/file",
    "/regions/jp%2Fen/runtime/file",
    "/regions//runtime/file",
    "/regions/jp",
  ]) {
    assert.equal(resolveRegionRoute(pathname, "/data/runtime"), null);
  }
});

test("regional capture routes inject and validate region", () => {
  assert.deepEqual(applyRouteRegion({ imageId: "x" }, "tw"), { imageId: "x", region: "tw" });
  assert.deepEqual(applyRouteRegion({ imageId: "x", region: "tw" }, "tw"), {
    imageId: "x",
    region: "tw",
  });
  assert.throws(() => applyRouteRegion({ region: "jp" }, "tw"), /does not match/i);
});

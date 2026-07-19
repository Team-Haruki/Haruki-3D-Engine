import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readSource = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), "utf8");

test("the browser kernel does not statically depend on OrbitControls", () => {
  const engineSource = readSource("src/engine/Haruki3DEngine.ts");

  assert.doesNotMatch(engineSource, /OrbitControls/);
  assert.match(engineSource, /controlsFactory/);
});

test("caller-owned canvases keep their CSS size", () => {
  const engineSource = readSource("src/engine/Haruki3DEngine.ts");

  assert.match(engineSource, /this\.renderer\.setSize\([^;]+this\.ownsCanvas\)/s);
  assert.match(engineSource, /this\.ownsCanvas \? 320 : 1/);
});

test("the internal compatibility engine retains capture methods", () => {
  const facadeSource = readSource("src/capture/Haruki3DCaptureEngine.ts");

  assert.match(facadeSource, /captureRoleParts\(/);
  assert.match(facadeSource, /prepareCaptureFrame\(/);
  assert.match(facadeSource, /new HarukiCaptureAdapter\(this\)/);
});

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readSource = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), "utf8");

test("camera policy is isolated from the engine orchestrator", () => {
  const engineSource = readSource("src/engine/Haruki3DEngine.ts");
  const cameraSource = readSource("src/engine/cameraRuntime.ts");

  assert.match(engineSource, /from "\.\/cameraRuntime"/);
  assert.doesNotMatch(engineSource, /function calculateCostumeShopCameraPose/);
  assert.match(cameraSource, /export function getCostumeShopCameraPose/);
  assert.match(cameraSource, /export function getDefaultCameraPose/);
});

test("capture background generation is isolated from rendering", () => {
  const engineSource = readSource("src/engine/Haruki3DEngine.ts");
  const backgroundSource = readSource("src/engine/captureBackground.ts");

  assert.doesNotMatch(engineSource, /function drawCaptureTriangleBackground/);
  assert.match(backgroundSource, /export function createCaptureBackgroundTexture/);
});

test("projected shadow state is owned by one module", () => {
  const engineSource = readSource("src/engine/Haruki3DEngine.ts");
  const shadowSource = readSource("src/engine/projectedShadow.ts");

  assert.doesNotMatch(engineSource, /class CharacterProjectedShadowController/);
  assert.match(shadowSource, /export class CharacterProjectedShadowController/);
  assert.match(shadowSource, /export const defaultProjectedShadowSettings/);
});

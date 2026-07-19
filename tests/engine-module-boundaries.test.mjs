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

test("motion decoding and retargeting are isolated from playback state", () => {
  const engineSource = readSource("src/engine/Haruki3DEngine.ts");
  const motionSource = readSource("src/engine/runtimeMotion.ts");

  assert.doesNotMatch(engineSource, /function readUnityMotionRuntime0414/);
  assert.doesNotMatch(engineSource, /function retargetUnityPrefabAnimationClip/);
  assert.match(motionSource, /export function decodeUnityMotionClips/);
  assert.match(motionSource, /export function retargetUnityPrefabAnimationClip/);
  assert.match(engineSource, /private async refreshAnimationPlayback/);
});

test("prefab graph assembly and native mesh import are isolated from engine state", () => {
  const engineSource = readSource("src/engine/Haruki3DEngine.ts");
  const prefabSource = readSource("src/engine/unityPrefabRuntime.ts");

  assert.doesNotMatch(engineSource, /function applyOfficialModelCombineSetup/);
  assert.doesNotMatch(engineSource, /function buildUnityRuntimeNativeGeometry/);
  assert.match(prefabSource, /export function buildUnityPrefabSourceGraph/);
  assert.match(prefabSource, /export function installUnityRuntimeNativeMeshes/);
  assert.match(engineSource, /private async loadCombinedCharacterAsset/);
});

test("body material binding is isolated while head layer orchestration stays staged", () => {
  const engineSource = readSource("src/engine/Haruki3DEngine.ts");
  const materialSource = readSource("src/engine/characterMaterialRuntime.ts");

  assert.doesNotMatch(engineSource, /Body mesh '\$\{mesh\.name\}' material key/);
  assert.match(materialSource, /export async function bindBodyRuntimeMaterials/);
  assert.match(materialSource, /original\.userData\.pjskMaterialKey/);
  assert.match(materialSource, /THREE\.NoColorSpace/);
  assert.match(
    engineSource,
    /this\.runtimeDebug\.body = \[\];\s+await bindBodyRuntimeMaterials/
  );
  assert.match(engineSource, /private async overrideHeadMaterials/);
});

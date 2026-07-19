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
});

test("animation playback state is isolated from the engine orchestrator", () => {
  const engineSource = readSource("src/engine/Haruki3DEngine.ts");
  const playbackSource = readSource("src/engine/animationPlaybackRuntime.ts");

  assert.match(playbackSource, /export class AnimationPlaybackRuntime/);
  assert.match(engineSource, /private readonly animationPlayback/);
  assert.doesNotMatch(engineSource, /private currentAnimationMixer/);
  assert.doesNotMatch(engineSource, /private currentAnimationAction/);
  assert.doesNotMatch(engineSource, /private async refreshAnimationPlayback/);
});

test("face motion state and morph binding are isolated from the engine orchestrator", () => {
  const engineSource = readSource("src/engine/Haruki3DEngine.ts");
  const faceMotionSource = readSource("src/engine/faceMotionRuntime.ts");

  assert.match(faceMotionSource, /export class FaceMotionRuntime/);
  assert.match(engineSource, /private readonly faceMotion/);
  assert.doesNotMatch(engineSource, /private currentFaceMotionClip/);
  assert.doesNotMatch(engineSource, /private sampleFaceCurve/);
  assert.doesNotMatch(engineSource, /private bindHeadMorphTargets/);
});

test("prefab graph assembly and native mesh import are isolated from engine state", () => {
  const engineSource = readSource("src/engine/Haruki3DEngine.ts");
  const prefabSource = readSource("src/engine/unityPrefabRuntime.ts");

  assert.doesNotMatch(engineSource, /function applyOfficialModelCombineSetup/);
  assert.doesNotMatch(engineSource, /function buildUnityRuntimeNativeGeometry/);
  assert.match(prefabSource, /export function buildUnityPrefabSourceGraph/);
  assert.match(prefabSource, /export function installUnityRuntimeNativeMeshes/);
  assert.match(prefabSource, /export function createUnityPrefabConstraintRuntime/);
  assert.doesNotMatch(engineSource, /function readRuntimeUnitySetup0414/);
  assert.match(engineSource, /private async loadCombinedCharacterAsset/);
});

test("body and head material binding are isolated from engine state", () => {
  const engineSource = readSource("src/engine/Haruki3DEngine.ts");
  const materialSource = readSource("src/engine/characterMaterialRuntime.ts");
  const headMaterialSource = readSource("src/engine/headMaterialRuntime.ts");

  assert.doesNotMatch(engineSource, /Body mesh '\$\{mesh\.name\}' material key/);
  assert.match(materialSource, /export async function bindBodyRuntimeMaterials/);
  assert.match(materialSource, /original\.userData\.pjskMaterialKey/);
  assert.match(materialSource, /THREE\.NoColorSpace/);
  assert.match(engineSource, /this\.runtimeDebug\.body = \[\]/);
  assert.match(engineSource, /await bindBodyRuntimeMaterials/);
  assert.doesNotMatch(engineSource, /Head mesh '\$\{mesh\.name\}' material key/);
  assert.match(headMaterialSource, /export async function bindHeadRuntimeMaterials/);
  assert.match(engineSource, /await bindHeadRuntimeMaterials\(/);
});

test("character lighting and material view state are isolated from the engine orchestrator", () => {
  const engineSource = readSource("src/engine/Haruki3DEngine.ts");
  const lightingSource = readSource("src/engine/characterLightingRuntime.ts");

  assert.match(lightingSource, /export class CharacterLightingRuntime/);
  assert.match(engineSource, /private readonly characterLighting/);
  assert.doesNotMatch(engineSource, /private faceSdfEnabled/);
  assert.doesNotMatch(engineSource, /private hairShadowMode/);
  assert.doesNotMatch(engineSource, /private applyRenderIsolationMode/);
  assert.doesNotMatch(engineSource, /private updateLoadedMaterialLight/);
});

test("through-hair pass policy and submesh cloning are isolated from engine state", () => {
  const engineSource = readSource("src/engine/Haruki3DEngine.ts");
  const materialSource = readSource("src/engine/characterMaterialRuntime.ts");
  const headMaterialSource = readSource("src/engine/headMaterialRuntime.ts");

  assert.doesNotMatch(engineSource, /function configureFaceLayerOverlayStencil/);
  assert.doesNotMatch(engineSource, /function createGroupedOverlayMesh/);
  assert.doesNotMatch(engineSource, /function getHeadLayerRenderOrder/);
  assert.match(materialSource, /export function configureSekaiEyelashPass/);
  assert.match(materialSource, /material\.depthFunc = THREE\.AlwaysDepth/);
  assert.match(materialSource, /export function createSekaiThroughHairOverlayMesh/);
  assert.match(headMaterialSource, /const CHARACTER_STENCIL_BIT = 0x01/);
});

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { parseArgs } from "../capture-runtime.mjs";
import {
  loadEngineConfig,
  resolveCaptureRuntimeOptions,
  resolveCaptureServerOptions,
} from "../config/haruki-3d-engine-config.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");

test("loads engine config JSON and applies capture runtime CLI overrides", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "haruki-engine-config-test-"));
  const configPath = path.join(dir, "engine.config.json");
  fs.writeFileSync(configPath, JSON.stringify({
    capture: {
      runtimeRoot: "/data/runtime-from-config",
      outputDir: "/data/captures-from-config",
      width: 700,
      height: 500,
      scale: 2,
      timeoutMs: 12000,
      phase: 0.25,
      clip: "motion_loop",
      springRuntimeMode: "unity-prefab",
      cameraPreset: "capture",
      tempTtl: "30m",
      gcInterval: "15m",
      idleShutdown: "45m"
    },
    chromium: {
      executable: "/usr/bin/chromium"
    },
    server: {
      port: 18080
    }
  }));

  const config = loadEngineConfig(configPath);
  const runtime = resolveCaptureRuntimeOptions(config, {
    input: "/tmp/input",
    out: "/tmp/out.png",
    width: 900,
  });
  const server = resolveCaptureServerOptions(config, {});

  assert.equal(runtime.width, 900);
  assert.equal(runtime.height, 500);
  assert.equal(runtime.scale, 2);
  assert.equal(runtime.phase, 0.25);
  assert.equal(runtime.chromium, "/usr/bin/chromium");
  assert.equal(server.runtimeRoot, "/data/runtime-from-config");
  assert.equal(server.captureOutputDir, "/data/captures-from-config");
  assert.equal(server.port, 18080);
  assert.equal(server.defaultWidth, 700);
  assert.equal(server.defaultHeight, 500);
  assert.equal(server.defaultScale, 2);
  assert.equal(server.defaultTimeoutMs, 12000);
  assert.equal(server.defaultPhase, 0.25);
  assert.equal(server.defaultClip, "motion_loop");
  assert.equal(server.defaultSpringRuntimeMode, "unity-prefab");
  assert.equal(server.defaultCameraPreset, "capture");
  assert.equal(server.tempCaptureTtlMs, 30 * 60 * 1000);
  assert.equal(server.captureGCIntervalMs, 15 * 60 * 1000);
  assert.equal(server.idleShutdownMs, 45 * 60 * 1000);
});

test("capture server accepts documented HARUKI_CAPTURE camera and spring env names", () => {
  const server = resolveCaptureServerOptions({}, {
    HARUKI_CAPTURE_SPRING_RUNTIME_MODE: "off",
    HARUKI_SPRING_RUNTIME_MODE: "unity-prefab",
    HARUKI_CAPTURE_CAMERA_PRESET: "default",
    HARUKI_CAMERA_PRESET: "capture",
  });

  assert.equal(server.defaultSpringRuntimeMode, "off");
  assert.equal(server.defaultCameraPreset, "default");
});

test("capture server accepts idle shutdown duration env", () => {
  const server = resolveCaptureServerOptions({}, {
    HARUKI_CAPTURE_IDLE_SHUTDOWN: "30m",
  });

  assert.equal(server.idleShutdownMs, 30 * 60 * 1000);
});

test("capture server idle shutdown can be disabled", () => {
  const server = resolveCaptureServerOptions({}, {
    HARUKI_CAPTURE_IDLE_SHUTDOWN: "0",
  });

  assert.equal(server.idleShutdownMs, 0);
});

test("runtime package loader prefers gzip JSON packages with plain JSON fallback", () => {
  const loaderSource = fs.readFileSync(
    path.join(repoRoot, "src/runtime/runtimePackageLoader.ts"),
    "utf8"
  );

  assert.ok(loaderSource.includes("const gzipUrl = `${url}.gz`;"));
  assert.ok(loaderSource.includes('new DecompressionStream("gzip")'));
  assert.ok(loaderSource.includes("JSON.parse(await readGzipRuntimeJson"));
  assert.ok(loaderSource.includes('const response = await fetch(url, { cache: "no-store" })'));
});

test("runtime package loader supports role-scoped registries and lazy compatibility", () => {
  const loaderSource = fs.readFileSync(
    path.join(repoRoot, "src/runtime/runtimePackageLoader.ts"),
    "utf8"
  );
  const wardrobeSource = fs.readFileSync(
    path.join(repoRoot, "src/parts/customWardrobeController.ts"),
    "utf8"
  );
  const captureHarnessSource = fs.readFileSync(
    path.join(repoRoot, "src/captureHarness.ts"),
    "utf8"
  );

  assert.ok(loaderSource.includes("parts/by-role/${role.characterId}/${runtimePathUnitSegment(role.unit)}"));
  assert.ok(loaderSource.includes("parts/compat/by-unit/${runtimePathUnitSegment(unit)}/head-hair-compatibility.json"));
  assert.ok(loaderSource.includes("ensureCompatibilityForSelection"));
  assert.ok(wardrobeSource.includes("ensureCompatibility?: (selection: CustomPartSelection) => Promise<void>;"));
  assert.ok(captureHarnessSource.includes("captureRuntimePackageRoleId"));
  assert.ok(captureHarnessSource.includes("roleId,"));
});

test("capture runtime accepts part-registry role capture options", () => {
  const options = parseArgs([
    "--input", "/tmp/input",
    "--out", "/tmp/out.png",
    "--role-id", "5:light_sound",
    "--body-costume3d-id", "2",
    "--head-costume3d-id", "3",
    "--hair-costume3d-id", "4",
    "--head-optional-costume3d-id", "9",
  ]);

  assert.equal(options.partCapture, true);
  assert.equal(options.roleId, "5:light_sound");
  assert.equal(options.bodyCostume3dId, 2);
  assert.equal(options.headCostume3dId, 3);
  assert.equal(options.hairCostume3dId, 4);
  assert.equal(options.headOptionalCostume3dId, 9);
});

test("capture runtime rejects incomplete part-registry capture options", () => {
  assert.throws(
    () => parseArgs([
      "--input", "/tmp/input",
      "--out", "/tmp/out.png",
      "--role-id", "5:light_sound",
      "--body-costume3d-id", "2",
      "--head-costume3d-id", "3",
    ]),
    /Missing or invalid --hair-costume3d-id/
  );
});

test("persistent capture server propagates config defaults into role parts capture", () => {
  const serverSource = fs.readFileSync(
    path.join(repoRoot, "capture-server.mjs"),
    "utf8"
  );
  const harnessSource = fs.readFileSync(
    path.join(repoRoot, "src/captureHarness.ts"),
    "utf8"
  );
  const engineSource = fs.readFileSync(
    path.join(repoRoot, "src/engine/Haruki3DEngine.ts"),
    "utf8"
  );

  assert.match(serverSource, /defaultPhase/);
  assert.match(serverSource, /defaultCameraPreset/);
  assert.match(serverSource, /new URLSearchParams\(\{/);
  assert.match(serverSource, /normalizeCharacterYawMode\(input\.characterYawMode, null\)/);
  assert.doesNotMatch(serverSource, /characterYawMode: "face-camera"/);
  assert.doesNotMatch(serverSource, /capturePhase=0\.5&captureClip=motion_loop&springRuntimeMode=unity-prefab&cameraPreset=id5-debug/);
  assert.match(harnessSource, /phase: request\.phase \?\? config\.phase/);
  assert.match(harnessSource, /cameraPreset: request\.cameraPreset \?\? config\.cameraPreset/);
  assert.match(harnessSource, /characterYawMode: request\.characterYawMode \?\? config\.characterYawMode \?\? undefined/);
  assert.match(harnessSource, /faceSdfEnabled: request\.faceSdfEnabled \?\? config\.faceSdfEnabled/);
  assert.match(harnessSource, /faceSdfDebugMode: request\.faceSdfDebugMode \?\? config\.faceSdfDebugMode/);
  assert.match(serverSource, /faceSdfEnabled: readBoolean\(input\.faceSdfEnabled\)/);
  assert.match(serverSource, /faceSdfDebugMode: normalizeFaceSdfDebugMode\(input\.faceSdfDebugMode\)/);
  assert.match(engineSource, /cameraPreset\?: PjskCameraPreset/);
  assert.match(engineSource, /faceSdfEnabled\?: boolean/);
  assert.match(engineSource, /faceSdfDebugMode\?: FaceSdfDebugMode/);
  assert.match(engineSource, /characterYawMode\?: "0" \| "45" \| "-45" \| "90" \| "-90" \| "180" \| "face-camera"/);
  assert.match(engineSource, /this\.applyCameraPreset\(request\.cameraPreset \?\? "capture"\)/);
  assert.match(engineSource, /this\.applyCaptureCharacterYawMode\(request\.characterYawMode\)/);
});

test("docker runtime image includes capture server support modules", () => {
  const dockerfile = fs.readFileSync(path.join(repoRoot, "Dockerfile"), "utf8");

  assert.match(dockerfile, /COPY capture-server\.mjs \.\/capture-server\.mjs/);
  assert.match(dockerfile, /COPY png-rgba\.mjs \.\/png-rgba\.mjs/);
  assert.match(dockerfile, /HARUKI_CAPTURE_WIDTH=1400/);
  assert.match(dockerfile, /HARUKI_CAPTURE_HEIGHT=1000/);
  assert.match(dockerfile, /HARUKI_CAPTURE_SCALE=2/);
  assert.match(dockerfile, /HARUKI_CAPTURE_WARMUP_FRAMES=60/);
  assert.match(dockerfile, /HARUKI_CAPTURE_SPRING_RUNTIME_MODE=unity-prefab/);
  assert.match(dockerfile, /HARUKI_CAPTURE_CAMERA_PRESET=capture/);
});

test("role parts capture supports warmup frames for spring runtime settling", () => {
  const serverSource = fs.readFileSync(
    path.join(repoRoot, "capture-server.mjs"),
    "utf8"
  );
  const harnessSource = fs.readFileSync(
    path.join(repoRoot, "src/captureHarness.ts"),
    "utf8"
  );
  const engineSource = fs.readFileSync(
    path.join(repoRoot, "src/engine/Haruki3DEngine.ts"),
    "utf8"
  );

  assert.match(serverSource, /warmupFrames:\s*Math\.max\(Math\.trunc\(Number\(input\.warmupFrames\)/);
  assert.match(serverSource, /warmupMode:\s*input\.warmupMode === "runtime" \? "runtime" : defaultWarmupMode === "runtime" \? "runtime" : "animation"/);
  assert.match(harnessSource, /warmupFrames:\s*request\.warmupFrames \?\? config\.warmupFrames/);
  assert.match(harnessSource, /warmupMode:\s*request\.warmupMode \?\? config\.warmupMode/);
  assert.match(engineSource, /warmupFrames\?: number/);
  assert.match(engineSource, /warmupMode\?: "animation" \| "runtime"/);
  assert.match(engineSource, /for \(let index = 0; index < warmupFrames; index \+= 1\)/);
  assert.match(engineSource, /this\.stepCaptureFrame\(1 \/ 60, advanceWarmupAnimation\)/);
});

test("capture server supports temporary cache mode and GC configuration", () => {
  const server = resolveCaptureServerOptions({}, {
    HARUKI_CAPTURE_TEMP_TTL: "6h",
    HARUKI_CAPTURE_TEMP_MAX_BYTES: "512MB",
    HARUKI_CAPTURE_GC_INTERVAL: "1h",
  });
  const serverSource = fs.readFileSync(
    path.join(repoRoot, "capture-server.mjs"),
    "utf8"
  );

  assert.equal(server.tempCaptureTtlMs, 6 * 60 * 60 * 1000);
  assert.equal(server.tempCaptureMaxBytes, 512 * 1000 * 1000);
  assert.equal(server.captureGCIntervalMs, 60 * 60 * 1000);
  assert.match(serverSource, /cacheMode = input\.cacheMode === "temporary" \? "temporary" : "persistent"/);
  assert.match(serverSource, /if \(imageId === ""\)/);
  assert.match(serverSource, /if \(cacheMode === "temporary" && !imageId\.startsWith\("tmp_"\)\)/);
  assert.match(serverSource, /const expiresAt = Date\.now\(\) \+ request\.ttlMs/);
  assert.match(serverSource, /fs\.utimesSync\(outputPath, gcRelativeMtime, gcRelativeMtime\)/);
  assert.match(serverSource, /cleanupExpiredTemporaryCaptures\(Date\.now\(\)\)/);
  assert.match(serverSource, /total <= tempCaptureMaxBytes/);
  assert.match(serverSource, /createdMs: Number\.isFinite\(stat\.birthtimeMs\) \? stat\.birthtimeMs : stat\.ctimeMs/);
  assert.match(serverSource, /files\.sort\(\(a, b\) => a\.createdMs - b\.createdMs\)/);
  assert.ok(serverSource.includes('/^tmp_[A-Za-z0-9._-]+\\.png$/'));
});

test("role parts capture reuses full runtime capture frame preparation", () => {
  const harnessSource = fs.readFileSync(
    path.join(repoRoot, "src/captureHarness.ts"),
    "utf8"
  );
  const engineSource = fs.readFileSync(
    path.join(repoRoot, "src/engine/Haruki3DEngine.ts"),
    "utf8"
  );
  const captureRolePartsBody = engineSource.match(
    /async captureRoleParts\([^]*?return \{\s+selection,\s+combinedCharacter,\s+snapshots: this\.getSnapshots\([^]*?\),\s+\};\s+\}/
  )?.[0] ?? "";
  const prepareCaptureFrameBody = engineSource.match(
    /prepareCaptureFrame\([^]*?this\.renderFrame\(\);\s+\}/
  )?.[0] ?? "";

  assert.match(harnessSource, /await engine\.prepareCaptureFrame\(/);
  assert.match(captureRolePartsBody, /await this\.prepareCaptureFrame\(/);
  assert.doesNotMatch(captureRolePartsBody, /this\.seekAnimationLoopPhase/);
  assert.match(prepareCaptureFrameBody, /const startPhase = advanceWarmupAnimation && warmupFrames > 0 && duration > 0/);
  assert.match(prepareCaptureFrameBody, /seekTargetPhase\(startPhase\);/);
  assert.match(prepareCaptureFrameBody, /for \(let index = 0; index < warmupFrames; index \+= 1\)/);
  assert.equal(prepareCaptureFrameBody.match(/seekTargetPhase\(/g)?.length, 1);
});

test("capture camera preset uses official CostumeShop camera parameters and keeps id5-debug as a legacy alias", () => {
  const runtimeOptions = parseArgs([
    "--input", "/tmp/input",
    "--out", "/tmp/out.png",
    "--camera-preset", "id5-debug",
  ]);
  const configOptions = resolveCaptureRuntimeOptions({ capture: { cameraPreset: "id5-debug" } }, {});
  const harnessSource = fs.readFileSync(
    path.join(repoRoot, "src/captureHarness.ts"),
    "utf8"
  );
  const engineSource = fs.readFileSync(
    path.join(repoRoot, "src/engine/Haruki3DEngine.ts"),
    "utf8"
  );

  assert.equal(runtimeOptions.cameraPreset, "capture");
  assert.equal(configOptions.cameraPreset, "capture");
  assert.match(engineSource, /export type PjskCameraPreset = "default" \| "capture";/);
  assert.match(engineSource, /const COSTUME_SHOP_CAMERA = \{/);
  assert.match(engineSource, /zoomDuration: 0\.35/);
  assert.match(engineSource, /bottomLowerLimitPosition: 0\.4/);
  assert.match(engineSource, /bottomUpperLimitPosition: 0\.85/);
  assert.match(engineSource, /topLowerLimitPosition: 1\.25/);
  assert.match(engineSource, /topUpperLimitPosition: 0\.85/);
  assert.match(engineSource, /nearZ: 2\.3/);
  assert.match(engineSource, /farZ: 4\.5/);
  assert.match(engineSource, /fov: 25/);
  assert.match(engineSource, /const COSTUME_SHOP_CAMERA_CAPTURE_STATE = \{/);
  assert.match(engineSource, /zoomValue: 0/);
  assert.match(engineSource, /zoomMoveValue: 0/);
  assert.match(engineSource, /calculateCostumeShopCameraPose/);
  assert.doesNotMatch(engineSource, /ID5_DEBUG_CAMERA_/);
  assert.doesNotMatch(engineSource, /CAPTURE_CAMERA_TARGET_SCALE/);
  assert.doesNotMatch(engineSource, /CAPTURE_CAMERA_OFFSET_SCALE/);
  assert.match(
    engineSource,
    /this\.controls\.target\.copy\(pose\.target\);\s+this\.camera\.position\.copy\(pose\.position\);\s+this\.camera\.fov = COSTUME_SHOP_CAMERA\.fov;/s
  );
  assert.match(
    engineSource,
    /this\.camera\.fov = DEFAULT_CAMERA_FOV;/
  );
  assert.match(harnessSource, /cameraPreset: "capture"/);
  assert.match(harnessSource, /return normalizeCameraPreset\(params\.get\("cameraPreset"\)\);/);
});

test("combined runtime imports apply character height before capture camera framing", () => {
  const engineSource = fs.readFileSync(
    path.join(repoRoot, "src/engine/Haruki3DEngine.ts"),
    "utf8"
  );

  assert.match(
    engineSource,
    /this\.currentBodyAsset = characterAsset\.bodyAsset;\s+this\.currentHeadAsset = characterAsset\.headAsset;\s+this\.currentImportIsCombined = true;\s+this\.applyCharacterHeight\(characterAsset\.bodyAsset\.characterHeightMeters \?\? this\.characterHeight\);/s
  );
});

test("body shader does not carry pseudo neck contact shadow projection", () => {
  const engineSource = fs.readFileSync(
    path.join(repoRoot, "src/engine/Haruki3DEngine.ts"),
    "utf8"
  );
  const shaderSource = fs.readFileSync(
    path.join(repoRoot, "src/materials/sekaiCharacterShader.ts"),
    "utf8"
  );

  assert.doesNotMatch(engineSource, /NECK_CONTACT|neckContact|BodyNeckContact|shaderNeckContact/);
  assert.doesNotMatch(shaderSource, /uNeckContact|neckContact|staticSkinContactShadow/);
});

test("face sdf is default-off and only enabled for explicit capable face materials", () => {
  const engineSource = fs.readFileSync(
    path.join(repoRoot, "src/engine/Haruki3DEngine.ts"),
    "utf8"
  );
  const shaderSource = fs.readFileSync(
    path.join(repoRoot, "src/materials/sekaiCharacterShader.ts"),
    "utf8"
  );

  assert.match(engineSource, /private faceSdfEnabled = false;/);
  assert.match(engineSource, /setFaceSdfEnabled\(enabled: boolean\)/);
  assert.match(engineSource, /shouldEnableFaceSdfForCurrentView\(\)/);
  assert.match(engineSource, /hasFaceSdfUv1Attribute\(mesh: THREE\.Mesh\)/);
  assert.doesNotMatch(engineSource, /ensureFaceSdfUv1Attribute/);
  assert.match(engineSource, /resolvedEntry\.materialKind === "face_sdf" &&\s+Boolean\(resolvedEntry\.faceShadowTex\) &&\s+faceSdfUv1Available/s);
  assert.match(engineSource, /shaderUniforms\.uFaceSdfEnabled\.value =\s+this\.shouldEnableFaceSdfForCurrentView\(\) && faceSdfCapable \? 1\.0 : 0\.0/s);
  assert.match(engineSource, /faceSdfCapable/);
  assert.match(engineSource, /faceSdfUv1Available/);
  assert.match(shaderSource, /uFaceShadowTex:\s*\{\s*value: initial\.faceShadowTex \?\? null\s*\}/);
  assert.match(shaderSource, /uUseFaceShadowTex:\s*\{\s*value: initial\.faceShadowTex \? 1\.0 : 0\.0\s*\}/);
  assert.match(shaderSource, /uFaceSdfEnabled:\s*\{\s*value: initial\.faceSdfEnabled && initial\.faceShadowTex \? 1\.0 : 0\.0\s*\}/);
  assert.match(shaderSource, /material\.uniforms\.uFaceSdfEnabled\.value = next\.faceSdfEnabled && next\.faceShadowTex \? 1\.0 : 0\.0/);
  assert.match(
    shaderSource,
    /if \(\(uFaceSdfEnabled > 0\.5 \|\| uFaceDebugMode > 0\.5\) && uUseShadowTex > 0\.5 && uUseFaceShadowTex > 0\.5\)/
  );
  assert.doesNotMatch(shaderSource, /staticShadowMask/);
});

test("body shader does not consume face sdf range controls for neck or collar shading", () => {
  const engineSource = fs.readFileSync(
    path.join(repoRoot, "src/engine/Haruki3DEngine.ts"),
    "utf8"
  );
  const shaderSource = fs.readFileSync(
    path.join(repoRoot, "src/materials/sekaiCharacterShader.ts"),
    "utf8"
  );

  assert.doesNotMatch(shaderSource, /uFaceShadowRangeLimit/);
  assert.doesNotMatch(shaderSource, /uHeadDotDirectionalLight/);
  assert.doesNotMatch(shaderSource, /headDotShadow|headYawShadow|rangeLimit \* uShadowWeight/);
  assert.match(shaderSource, /shadowValue = mix\(shadowValue, texture2D\(uShadowTex, vUv\)\.rgb, clamp\(uShadowTexWeight, 0\.0, 1\.0\)\)/);
  assert.match(shaderSource, /float hShadowOffset = \(uUseValueTex > 0\.5\) \? \(hMask \* 2\.0 - 1\.0\) : 0\.0;/);
  assert.match(engineSource, /if \(material\.uniforms\.uHeadPosition\) \{\s+material\.uniforms\.uHeadPosition\.value\.copy\(this\.hairHeadPosition\);\s+\}/s);
  assert.doesNotMatch(engineSource, /uniforms\.uHeadDotDirectionalLight\.value\.copy\(this\.headDotDirectionalLight\)/);
});

test("head material binding normalizes old runtime hair and accessory kinds before FaceSDF fallback", () => {
  const engineSource = fs.readFileSync(
    path.join(repoRoot, "src/engine/Haruki3DEngine.ts"),
    "utf8"
  );

  assert.match(engineSource, /normalizeHeadRuntimeMaterialKind/);
  assert.match(engineSource, /materialNameLower\.includes\("_hair_"\)/);
  assert.match(engineSource, /meshNameLower\.includes\("hair"\)/);
  assert.match(engineSource, /return "hair";/);
  assert.match(engineSource, /materialNameLower\.includes\("_acc_"\)/);
  assert.match(engineSource, /meshNameLower === "acc"/);
  assert.match(engineSource, /return "accessory";/);
  assert.match(engineSource, /const kind = normalizeHeadRuntimeMaterialKind\(slot\.materialKind \?\? "face", slot\.meshName, slot\.materialName\);/);
});

test("skin colors drive face skin tint while body and face shadow controls stay separate", () => {
  const engineSource = fs.readFileSync(
    path.join(repoRoot, "src/engine/Haruki3DEngine.ts"),
    "utf8"
  );
  const shaderSource = fs.readFileSync(
    path.join(repoRoot, "src/materials/sekaiCharacterShader.ts"),
    "utf8"
  );

  assert.match(shaderSource, /faceSkinLit = mix\(uSkinColor1, uSkinColorDefault, faceSkinRamp\)/);
  assert.match(shaderSource, /faceSkinShadow = mix\(uSkinColor2, uSkinColor1, faceSkinRamp\)/);
  assert.match(shaderSource, /color = mix\(color, faceSkinLit, faceSkinMask \* 0\.58\)/);
  assert.match(engineSource, /shaderSkinColorDefault/);
  assert.match(engineSource, /shaderSkinColor1/);
  assert.match(engineSource, /shaderSkinColor2/);
  assert.match(engineSource, /bodyDebugMode\?: BodyDebugMode/);
  assert.match(engineSource, /faceSdfDebugMode\?: FaceSdfDebugMode/);
});

test("native prefab meshes bind with exported Unity inverse bind matrices before fallback", () => {
  const engineSource = fs.readFileSync(
    path.join(repoRoot, "src/engine/Haruki3DEngine.ts"),
    "utf8"
  );

  assert.match(engineSource, /buildUnityRuntimeBoneInverseBindMatrices/);
  assert.match(
    engineSource,
    /const inverseBindMatrices = buildUnityRuntimeBoneInverseBindMatrices\(\s+source,\s+skeletonBones\.length,\s+warnings\s+\);/s
  );
  assert.match(
    engineSource,
    /new THREE\.Skeleton\(\s+skeletonBones as unknown as THREE\.Bone\[\],\s+inverseBindMatrices\.length > 0 \? inverseBindMatrices : undefined\s+\)/s
  );
  assert.match(
    engineSource,
    /if \(inverseBindMatrices\.length === 0\) \{\s+skeleton\.calculateInverses\(\);\s+\}/s
  );
});

test("engine rejects GLB model fallbacks for prefab-native runtime packages", () => {
  const engineSource = fs.readFileSync(
    path.join(repoRoot, "src/engine/Haruki3DEngine.ts"),
    "utf8"
  );

  assert.match(engineSource, /Legacy body GLB import is disabled/);
  assert.match(engineSource, /Legacy head GLB import is disabled/);
  assert.match(engineSource, /combined GLB fallback is disabled/);
  assert.match(engineSource, /export type BodyAnimationKind = "unity-json";/);
  assert.match(engineSource, /GLTF animation fallback is disabled/);
  assert.doesNotMatch(engineSource, /const loaded = await loadGltfPart\(bodyAsset\.source\.meshUrl/);
  assert.doesNotMatch(engineSource, /const loaded = await loadGltfPart\(headAsset\.source\.meshUrl/);
  assert.doesNotMatch(engineSource, /const loaded = await loadGltfPart\(\s+meshUrl,\s+characterAsset\.id\s+\)/s);
  assert.doesNotMatch(engineSource, /loadGltfAnimations/);
  assert.doesNotMatch(engineSource, /"gltf"/);
});

test("character shader keeps sssekai-verified C/S/H and vertex color channel semantics", () => {
  const shaderSource = fs.readFileSync(
    path.join(repoRoot, "src/materials/sekaiCharacterShader.ts"),
    "utf8"
  );

  assert.match(shaderSource, /shadowValue = mix\(shadowValue, texture2D\(uShadowTex, vUv\)\.rgb, clamp\(uShadowTexWeight, 0\.0, 1\.0\)\)/);
  assert.match(shaderSource, /float skinMask = \(uSkinTintEnabled > 0\.5 && uUseValueTex > 0\.5\) \? step\(0\.5, valueSample\.r\) : 0\.0;/);
  assert.match(shaderSource, /float hShadowOffset = \(uUseValueTex > 0\.5\) \? \(hMask \* 2\.0 - 1\.0\) : 0\.0;/);
  assert.match(shaderSource, /vertexOutlineIntensity = clamp\(vColor\.r, 0\.0, 1\.0\);/);
  assert.match(shaderSource, /vertexRimIntensity = clamp\(vColor\.g, 0\.0, 1\.0\);/);
  assert.match(shaderSource, /vFaceShadowUv = uv1;/);
  assert.match(shaderSource, /texture2D\(uFaceShadowTex, sdfUv\)/);
});

test("projected character shadows are separate scene objects", () => {
  const engineSource = fs.readFileSync(
    path.join(repoRoot, "src/engine/Haruki3DEngine.ts"),
    "utf8"
  );

  assert.match(engineSource, /class CharacterProjectedShadowController/);
  assert.match(engineSource, /CharacterDirectionalShadow/);
  assert.match(engineSource, /CharacterCrossShadow/);
  assert.match(engineSource, /this\.scene\.add\(this\.projectedShadow\.group\)/);
  assert.match(engineSource, /distanceToFloor = DIRECTIONAL_SHADOW_HEIGHT \* heightRatio/);
});

test("capture runtime parser allows config to replace built-in defaults", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "haruki-engine-cli-config-test-"));
  const configPath = path.join(dir, "engine.config.json");
  fs.writeFileSync(configPath, JSON.stringify({
    capture: {
      width: 640,
      height: 480,
      scale: 2,
      timeoutMs: 12000
    },
    chromium: {
      executable: "/usr/bin/chromium-from-config"
    }
  }));

  const options = parseArgs([
    "--config", configPath,
    "--input", dir,
    "--out", path.join(dir, "capture.png"),
  ]);

  assert.equal(options.width, 640);
  assert.equal(options.height, 480);
  assert.equal(options.scale, 2);
  assert.equal(options.timeoutMs, 12000);
  assert.equal(options.chromium, "/usr/bin/chromium-from-config");
});

test("part registry runtime path keeps role motion separate from part packages", () => {
  const composerSource = fs.readFileSync(
    path.join(repoRoot, "src/parts/runtimePartComposer.ts"),
    "utf8"
  );
  const loaderSource = fs.readFileSync(
    path.join(repoRoot, "src/runtime/runtimePackageLoader.ts"),
    "utf8"
  );
  const engineSource = fs.readFileSync(
    path.join(repoRoot, "src/engine/Haruki3DEngine.ts"),
    "utf8"
  );

  assert.match(composerSource, /type RoleRuntimePackage =/);
  assert.match(composerSource, /resolveHeadOptionalAttachPath/);
  assert.match(composerSource, /sourceRendererTransformPath/);
  assert.match(loaderSource, /roleRuntimePath/);
  assert.match(loaderSource, /loadRoleRuntimePackages/);
  assert.match(engineSource, /applyCustomRoleDefaultMotion/);
  assert.match(engineSource, /nativeMeshes: this\.lastNativeMeshInstallDiagnostics/);
});

test("custom composer filters complete-head hair packages instead of stacking duplicate face roots", () => {
  const composerSource = fs.readFileSync(
    path.join(repoRoot, "src/parts/runtimePartComposer.ts"),
    "utf8"
  );

  assert.match(composerSource, /resolveHeadHairComposition/);
  assert.match(composerSource, /filterRuntimeContributors/);
  assert.match(composerSource, /isRuntimeContributor/);
  assert.match(composerSource, /const contributingRuntimes = filterRuntimeContributors/);
  assert.match(composerSource, /normalizeHeadManifestFromParts\(\s+filterRuntimeContributors/);
  assert.match(composerSource, /composeRuntimeExtension\(\s+contributingRuntimes/);
  assert.match(composerSource, /mergeRuntimeSetup\(contributorRuntimes\)/);
  assert.match(composerSource, /mergeNativeMeshes\(contributorRuntimes/);
  assert.doesNotMatch(composerSource, /runtimes\.flatMap\(\(runtime\) => runtime\.materialSlots \?\? \[\]\)/);
});

test("custom composer emits preset-shaped grouped material slots", () => {
  const composerSource = fs.readFileSync(
    path.join(repoRoot, "src/parts/runtimePartComposer.ts"),
    "utf8"
  );

  assert.match(composerSource, /materialSlots:\s*\{/);
  assert.match(composerSource, /body:\s*bodyAsset\.bodyMaterials/);
  assert.match(composerSource, /head:\s*headAsset\.faceMaterials/);
  assert.doesNotMatch(composerSource, /materialSlots:\s*contributorRuntimes\.flatMap/);
});

test("custom selection mutations are serialized and skip exact resolved reimports", () => {
  const engineSource = fs.readFileSync(
    path.join(repoRoot, "src/engine/Haruki3DEngine.ts"),
    "utf8"
  );

  assert.match(engineSource, /private customSelectionQueue: Promise<unknown> = Promise\.resolve\(\)/);
  assert.match(engineSource, /private enqueueCustomSelectionMutation<T>/);
  assert.match(engineSource, /this\.customSelectionQueue\.then\(operation, operation\)/);
  assert.match(engineSource, /private async applyCustomSelection/);
  assert.match(engineSource, /previousCombinedId === combined\.id/);
  assert.match(engineSource, /!sameResolvedSelection[\s\S]*await this\.importCombinedCharacter\(combined\)/);
  assert.match(engineSource, /sameResolvedSelection[\s\S]*this\.resetAndSettleCurrentSpringRuntime\(\)/);
  assert.match(engineSource, /private async captureRolePartsInternal/);
  assert.doesNotMatch(engineSource, /await this\.setCustomSelection\(selection\)/);
});

test("custom composer rejects stale part packages without material proxy metadata", () => {
  const composerSource = fs.readFileSync(
    path.join(repoRoot, "src/parts/runtimePartComposer.ts"),
    "utf8"
  );

  assert.match(composerSource, /assertPartRuntimeProxyMetadata/);
  assert.match(composerSource, /missing manifest\.proxy material metadata/);
  assert.match(composerSource, /Haruki-3D-Exporter/);
});

test("custom composer narrows SpringBone records to the active root for each part", () => {
  const composerSource = fs.readFileSync(
    path.join(repoRoot, "src/parts/runtimePartComposer.ts"),
    "utf8"
  );

  assert.match(composerSource, /selectRuntimePartActiveRoots/);
  assert.match(composerSource, /filterRuntimeRecordsByActiveRoots/);
  assert.match(composerSource, /filterColliderBindingsByActiveBones/);
  assert.match(composerSource, /filterManagerColliderCachesByActiveManagers/);
  assert.match(composerSource, /partType === "body" && activeRoots\.includes\("body"\)/);
  assert.match(composerSource, /partType === "head" \|\| partType === "hair"/);
  assert.match(composerSource, /activeRoots\.includes\("face"\)/);
  assert.match(composerSource, /selectedActiveRoots/);
  assert.match(composerSource, /activeRoots: selectedActiveRoots/);
});

test("custom composer rebinds head colliderFlag springs to active body colliders", () => {
  const composerSource = fs.readFileSync(
    path.join(repoRoot, "src/parts/runtimePartComposer.ts"),
    "utf8"
  );

  assert.match(composerSource, /rebuildDeferredColliderFlagBinding/);
  assert.match(composerSource, /selectBodyCollidersForColliderFlag/);
  assert.match(composerSource, /matchesColliderFlagPrefix/);
  assert.match(composerSource, /rebuildHeadManagerColliderCache/);
  assert.match(composerSource, /matchedPrefixes/);
  assert.match(composerSource, /deferred_body_colliderFlag/);
  assert.match(composerSource, /viewer_composed_head_body_collider_cache/);
});

test("custom capture exposes SpringBone trace and named offset diagnostics", () => {
  const serverSource = fs.readFileSync(path.join(repoRoot, "capture-server.mjs"), "utf8");
  const harnessSource = fs.readFileSync(path.join(repoRoot, "src/captureHarness.ts"), "utf8");
  const engineSource = fs.readFileSync(path.join(repoRoot, "src/engine/Haruki3DEngine.ts"), "utf8");
  const springSource = fs.readFileSync(
    path.join(repoRoot, "src/engine/unityPrefabSpringRuntimeAdapter.ts"),
    "utf8"
  );

  assert.match(serverSource, /traceUtjBones/);
  assert.match(serverSource, /springDebugBones/);
  assert.match(harnessSource, /utjSpringBoneTrace: engine\.getUtjSpringBoneTraceSnapshot\(\)/);
  assert.match(harnessSource, /await ensureCaptureRuntimePackage\(config\);\s+engine\.setUtjSpringBoneTraceFilters/s);
  assert.match(engineSource, /traceUtjBones\?: string\[\]/);
  assert.match(engineSource, /springDebugBones\?: string\[\]/);
  assert.match(engineSource, /getSnapshots\(\{\s+springDebugBones: request\.springDebugBones/s);
  assert.match(springSource, /debugOffsets/);
  assert.match(springSource, /springDebugAllOffsets/);
});

test("docker runtime image includes capture server config module", () => {
  const dockerfile = fs.readFileSync(path.join(repoRoot, "Dockerfile"), "utf8");

  assert.match(dockerfile, /COPY\s+config\s+\.\/config/);
});

test("capture server uses container-safe SwiftShader WebGL flags", () => {
  const serverSource = fs.readFileSync(
    path.join(repoRoot, "capture-server.mjs"),
    "utf8"
  );
  const runtimeSource = fs.readFileSync(
    path.join(repoRoot, "capture-runtime.mjs"),
    "utf8"
  );

  assert.doesNotMatch(serverSource, /"--disable-gpu"/);
  assert.match(serverSource, /"--use-gl=angle"/);
  assert.match(serverSource, /"--use-angle=swiftshader"/);
  assert.match(serverSource, /"--enable-unsafe-swiftshader"/);
  assert.doesNotMatch(runtimeSource, /"--disable-gpu"/);
  assert.match(runtimeSource, /"--use-gl=angle"/);
  assert.match(runtimeSource, /"--use-angle=swiftshader"/);
  assert.match(runtimeSource, /"--enable-unsafe-swiftshader"/);
});

test("capture server readiness waits for request API, not default wardrobe bootstrap", () => {
  const serverSource = fs.readFileSync(
    path.join(repoRoot, "capture-server.mjs"),
    "utf8"
  );

  assert.match(
    serverSource,
    /typeof window\.__HARUKI_CAPTURE_REQUEST__ === "function"/
  );
  assert.doesNotMatch(
    serverSource,
    /ready:\s*typeof window\.__HARUKI_CAPTURE_REQUEST__ === "function" &&\s*window\.__PJSK_CAPTURE_READY__ === true/
  );
});

test("part runtime manifests preserve exporter proxy colors before fallback defaults", () => {
  const composerSource = fs.readFileSync(
    path.join(repoRoot, "src/parts/runtimePartComposer.ts"),
    "utf8"
  );
  const loaderSource = fs.readFileSync(
    path.join(repoRoot, "src/runtime/runtimePackageLoader.ts"),
    "utf8"
  );

  assert.match(composerSource, /manifest\.proxy \|\|=/);
  assert.match(composerSource, /bodyColor:\s*manifest\.proxy\.bodyColor \?\? "#f2d0c3"/);
  assert.match(composerSource, /shadowColor:\s*manifest\.proxy\.shadowColor \?\? "#bf958a"/);
  assert.match(composerSource, /faceColor:\s*manifest\.proxy\.faceColor \?\? "#fde2d9"/);
  assert.match(composerSource, /skinColorDefault:\s*manifest\.proxy\.skinColorDefault \?\? manifest\.proxy\.faceColor \?\? "#fde2d9"/);
  assert.match(composerSource, /hairColor:\s*manifest\.proxy\.hairColor \?\? "#7b5b4a"/);
  assert.match(loaderSource, /const proxy = asRecord\(record\.proxy \?\? record\.Proxy\)/);
  assert.match(loaderSource, /bodyColor:\s*readString\(proxy\.bodyColor \?\? proxy\.BodyColor, "#f2d0c3"\)/);
  assert.match(loaderSource, /shadowColor:\s*readString\(proxy\.shadowColor \?\? proxy\.ShadowColor, "#bf958a"\)/);
  assert.match(loaderSource, /faceColor:\s*readString\(proxy\.faceColor \?\? proxy\.FaceColor, "#fde2d9"\)/);
  assert.match(loaderSource, /skinColor2:\s*readString\(proxy\.skinColor2 \?\? proxy\.SkinColor2, readString\(proxy\.faceShadeColor \?\? proxy\.FaceShadeColor, "#f7cdbf"\)\)/);
});

test("legacy custom part manifests infer character height before capture framing", () => {
  const composerSource = fs.readFileSync(
    path.join(repoRoot, "src/parts/runtimePartComposer.ts"),
    "utf8"
  );

  assert.match(composerSource, /characterHeightMetersById/);
  assert.match(composerSource, /function resolveRuntimePartCharacterHeightMeters/);
  assert.match(
    composerSource,
    /manifest\.characterHeightMeters\s*\?\?=\s*resolveRuntimePartCharacterHeightMeters\(runtime\.part\.characterId\)/
  );
  assert.match(
    composerSource,
    /manifest\.characterHeightMeters\s*\?\?=\s*resolveRuntimePartCharacterHeightMeters\(selection\.characterId\)/
  );
});

test("unity prefab source graph keeps legacy runtime mount behind model-combine mode", () => {
  const engineSource = fs.readFileSync(
    path.join(repoRoot, "src/engine/Haruki3DEngine.ts"),
    "utf8"
  );

  assert.match(engineSource, /const runtimeMountPath = assembly\?\.runtimeMountPath \?\? "PJSK_RuntimeMount_face"/);
  assert.match(engineSource, /if \(!useModelCombineSetup && bodyAttach && headRoot\)/);
  assert.match(engineSource, /usesModelCombineSetup: useModelCombineSetup/);
  assert.doesNotMatch(engineSource, /if \(bodyAttach && headRoot && assembly\?\.runtimeMountPath\)/);
});

test("unity prefab source graph mounts every duplicate composed face root", () => {
  const engineSource = fs.readFileSync(
    path.join(repoRoot, "src/engine/Haruki3DEngine.ts"),
    "utf8"
  );

  assert.match(engineSource, /const headRoots = collectUnityPrefabHeadRoots/);
  assert.match(engineSource, /const headRootMounts = headRoots\.map/);
  assert.match(engineSource, /resolveUnityPrefabMountedHeadOrigin/);
  assert.match(engineSource, /originRestLocalToRoot/);
  assert.doesNotMatch(engineSource, /findUnityPrefabChildByName\(mountedHeadRoot, "Position"\)/);
});

test("unity prefab source graph applies official ModelCombineSetup graft instead of per-frame face head sync", () => {
  const engineSource = fs.readFileSync(
    path.join(repoRoot, "src/engine/Haruki3DEngine.ts"),
    "utf8"
  );

  assert.match(engineSource, /function applyOfficialModelCombineSetup/);
  assert.match(engineSource, /assembly\?\.faceRendererName \?\? "Face"/);
  assert.match(engineSource, /new Set\(\[faceRendererName, "Face", "Hair", "Acc"\]\)/);
  assert.match(engineSource, /drainChildrenKeepingLocal\(bodyNodeB\.node, faceNodeB\.node\)/);
  assert.match(engineSource, /child\.name\.endsWith\(childMoveSuffix\)/);
  assert.match(engineSource, /nodeByPath\.set\(bodyNodeA\.path, faceNodeA\.node\)/);
  assert.match(engineSource, /nodeByPath\.set\(bodyNodeB\.path, faceNodeB\.node\)/);
  assert.match(engineSource, /detachNode\(bodyNodeB\.node\)/);
  assert.match(engineSource, /detachNode\(bodyNodeA\.node\)/);
  assert.match(engineSource, /!graph\.usesModelCombineSetup/);
});

test("Sekai ExtraBone runtime follows official rotation order and coefficient direction", () => {
  const extraBoneSource = fs.readFileSync(
    path.join(repoRoot, "src/engine/sekaiExtraBoneRuntime.ts"),
    "utf8"
  );

  assert.match(extraBoneSource, /"XYZ",\s+"XZY",\s+"YXZ",\s+"YZX",\s+"ZXY",\s+"ZYX"/s);
  assert.match(extraBoneSource, /const sign = entry\.coefficient > 0 \? -1 : entry\.coefficient < 0 \? 1 : 0/);
  assert.match(extraBoneSource, /entry\.node\.quaternion\.copy\(entry\.defaultQuaternion\)\.slerp/);
  assert.match(extraBoneSource, /Math\.abs\(entry\.coefficient\)/);
});

test("part runtime loader preserves registry package path on loaded packages", () => {
  const loaderSource = fs.readFileSync(
    path.join(repoRoot, "src/runtime/runtimePackageLoader.ts"),
    "utf8"
  );

  assert.match(loaderSource, /withPartRuntimePackagePath/);
  assert.match(loaderSource, /packagePath:\s*entry\.packagePath/);
  assert.match(loaderSource, /const key = entry\.packagePath/);
});

test("part runtime loader skips empty head optional registry packages", () => {
  const loaderSource = fs.readFileSync(
    path.join(repoRoot, "src/runtime/runtimePackageLoader.ts"),
    "utf8"
  );

  assert.match(loaderSource, /isLoadableRegistryEntry/);
  assert.match(loaderSource, /entry\.status !== "empty"/);
  assert.match(loaderSource, /if \(!entry \|\| !isLoadableRegistryEntry\(entry\)\)/);
});

test("part composer applies registry identity over shared source packages", () => {
  const composerSource = fs.readFileSync(
    path.join(repoRoot, "src/parts/runtimePartComposer.ts"),
    "utf8"
  );

  assert.match(composerSource, /withRegistryEntryRuntimeMetadata/);
  assert.match(composerSource, /costume3dId:\s*entry\.costume3dId/);
  assert.match(composerSource, /characterId:\s*entry\.characterId/);
  assert.match(composerSource, /manifest\.characterHeightMeters\s*=\s*resolveRuntimePartCharacterHeightMeters\(entry\.characterId\)/);
  assert.match(composerSource, /expectedSkeletonId:\s*String\(entry\.characterId\)\.padStart/);
});

test("part composer treats empty head optional slots as no-op selections", () => {
  const composerSource = fs.readFileSync(
    path.join(repoRoot, "src/parts/runtimePartComposer.ts"),
    "utf8"
  );

  assert.match(composerSource, /resolveOptionalHeadRuntime/);
  assert.match(composerSource, /isEmptyHeadOptionalEntry\(entry\)/);
  assert.match(composerSource, /return null/);
});

test("part composer mounts head optional accessories on body attach nodes and applies face-specific adjustments", () => {
  const composerSource = fs.readFileSync(
    path.join(repoRoot, "src/parts/runtimePartComposer.ts"),
    "utf8"
  );

  assert.match(composerSource, /resolveHeadOptionalFaceId/);
  assert.match(composerSource, /extractFaceIdFromBundlePath/);
  assert.match(composerSource, /accessoryTransformAdjustments/);
  assert.match(composerSource, /applyAccessoryTransformAdjustment/);
  assert.match(composerSource, /transformVectorArray\(positions, matrix, scale, position, true\)/);
  assert.match(composerSource, /transformVectorArray\(normals, matrix, inverseScale\(scale\), \{ x: 0, y: 0, z: 0 \}, false\)/);
  assert.match(composerSource, /root === "body" \|\| root === "sit_body" \|\| root === "guitar_body"/);
});

test("part composer resolves material textures relative to each source package", () => {
  const composerSource = fs.readFileSync(
    path.join(repoRoot, "src/parts/runtimePartComposer.ts"),
    "utf8"
  );

  assert.match(composerSource, /resolveMaterialSlotTextureUrls/);
  assert.match(composerSource, /mainTex:\s*resolveMaybeUrl\(slot\.mainTex/);
  assert.match(composerSource, /shadowTex:\s*resolveMaybeUrl\(slot\.shadowTex/);
  assert.match(composerSource, /valueTex:\s*resolveMaybeUrl\(slot\.valueTex/);
  assert.match(composerSource, /faceShadowTex:\s*resolveMaybeUrl\(slot\.faceShadowTex/);
  assert.match(composerSource, /runtime\.materialSlots \?\? \[\]/);
  assert.match(composerSource, /resolveMaterialSlotTextureUrls\(slot, resolvePartUrl\)/);
});

test("composed part runtime declares body-head assembly for motion retarget suppression", () => {
  const composerSource = fs.readFileSync(
    path.join(repoRoot, "src/parts/runtimePartComposer.ts"),
    "utf8"
  );
  const engineSource = fs.readFileSync(
    path.join(repoRoot, "src/engine/Haruki3DEngine.ts"),
    "utf8"
  );

  assert.match(composerSource, /bodyHeadAssembly:.*resolveComposedBodyHeadAssembly/s);
  assert.match(composerSource, /const parentAttachPath = resolveComposedBodyAttachPath/);
  assert.match(composerSource, /const childOriginPath = resolveComposedHeadOriginPath/);
  assert.match(composerSource, /childRootPath:\s*"face"/);
  assert.match(composerSource, /childOriginPath,/);
  assert.match(composerSource, /"face\/Position\/Hip\/Waist\/Spine\/Chest\/Neck"/);
  assert.match(composerSource, /runtimeMountPath:\s*null/);
  assert.match(composerSource, /parentingMode:\s*"model_combine_setup"/);
  assert.match(composerSource, /faceRendererName:\s*"Face"/);
  assert.match(composerSource, /combineNodeAName:\s*"Neck"/);
  assert.match(composerSource, /combineNodeBName:\s*"Head"/);
  assert.match(composerSource, /childMoveSuffix:\s*"_target"/);
  assert.match(composerSource, /coordinateSpace:\s*"unity-left-handed"/);
  assert.match(engineSource, /hasUnityBodyHeadAssembly\(extension\)/);
  assert.match(engineSource, /isFaceAssemblyBridgeMotionTarget/);
});

test("unity prefab spring runtime is created from prefab source graph on initial load", () => {
  const engineSource = fs.readFileSync(
    path.join(repoRoot, "src/engine/Haruki3DEngine.ts"),
    "utf8"
  );

  assert.match(
    engineSource,
    /this\.currentSpringRuntime = this\.createSpringRuntime\(\s*this\.currentPrefabSourceGraph\?\.root \?\? runtimeRoot\s*\)/
  );
});

test("part composer infers missing spring manager bone references from part-local paths", () => {
  const composerSource = fs.readFileSync(
    path.join(repoRoot, "src/parts/runtimePartComposer.ts"),
    "utf8"
  );

  assert.match(composerSource, /withInferredSpringManagerBoneRefs/);
  assert.match(composerSource, /isSameOrDescendantRuntimePath/);
  assert.match(composerSource, /manager\.bonePathIds = inferredBonePathIds/);
  assert.match(composerSource, /cache\.springBonePathIds = inferredBonePathIds/);
});

test("composed spring setup keeps duplicate head and hair prefab paths part scoped", () => {
  const composerSource = fs.readFileSync(
    path.join(repoRoot, "src/parts/runtimePartComposer.ts"),
    "utf8"
  );
  const engineSource = fs.readFileSync(
    path.join(repoRoot, "src/engine/Haruki3DEngine.ts"),
    "utf8"
  );
  const springSource = fs.readFileSync(
    path.join(repoRoot, "src/engine/unityPrefabSpringRuntimeAdapter.ts"),
    "utf8"
  );

  assert.match(composerSource, /function remapPrefabGraph/);
  assert.match(composerSource, /runtimePartIndex:\s*partIndex/);
  assert.match(composerSource, /cloned\.runtimePartType = partType/);
  assert.match(composerSource, /graph\.transforms = readRecordArray\(value\.transforms\)/);
  assert.match(composerSource, /cloned\.pathId = remapNumericId\(cloned\.pathId, partIndex\)/);
  assert.match(composerSource, /cloned\.parentPathId = remapNumericId\(cloned\.parentPathId, partIndex\)/);
  assert.match(composerSource, /cloned\.childPathIds = cloned\.childPathIds\.map/);
  assert.match(composerSource, /\.map\(\(part\) => part\.prefabGraph\)/);
  assert.match(composerSource, /cloned\.runtimePartIndex = partIndex/);

  assert.match(engineSource, /node\.userData\.pjskRuntimePartIndex = transform\.runtimePartIndex/);

  assert.match(springSource, /nodeByPartPath: Map<string, THREE\.Object3D>/);
  assert.match(springSource, /transformByPartPath: Map<string, RuntimePrefabTransform>/);
  assert.match(springSource, /runtimePartType\?: string/);
  assert.match(springSource, /buildControlledPartDiagnostics/);
  assert.match(springSource, /controlledPartCounts: controlledPartDiagnostics\.counts/);
  assert.match(springSource, /controlledHairSamples: controlledPartDiagnostics\.hairSamples/);
  assert.match(springSource, /resolveNodeForPart\(resolution, sourceBone\.nodePath, sourceBone\.runtimePartIndex\)/);
  assert.match(springSource, /resolveNodeForPart\(resolution, sourceBone\.pivotNodePath, sourceBone\.runtimePartIndex\)/);
  assert.match(springSource, /resolveNodeForPart\(resolution, source\.nodePath, source\.runtimePartIndex\)/);
  assert.match(springSource, /resolvePrefabTransformForPart\(graphIndex, bone\.nodePath, bone\.runtimePartIndex\)/);
  assert.match(springSource, /target\.runtimePartIndex \?\? bone\.runtimePartIndex/);
  assert.match(springSource, /partPathKey\(runtimePartIndex, sourcePath\)/);
});

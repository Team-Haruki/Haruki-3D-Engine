import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import * as THREE from "three";
import ts from "typescript";

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
      faceSdfEnabled: true,
      projectedShadow: {
        width: 0.88,
        height: 1.22,
        opacity: 0.33,
        crossSize: 0.5,
        crossOpacity: 0.2,
        floorY: -0.02,
        adjustShadow: true,
        adjustAlpha: false,
        invisibleHeight: 1.8,
        directionalShadow: true
      },
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
  assert.equal(server.defaultFaceSdfEnabled, true);
  assert.deepEqual(server.defaultProjectedShadow, {
    width: 0.88,
    height: 1.22,
    opacity: 0.33,
    crossSize: 0.5,
    crossOpacity: 0.2,
    floorY: -0.02,
    adjustShadow: true,
    adjustAlpha: false,
    invisibleHeight: 1.8,
    directionalShadow: true,
  });
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

test("capture server accepts projected shadow env overrides", () => {
  const server = resolveCaptureServerOptions({}, {
    HARUKI_CAPTURE_PROJECTED_SHADOW_WIDTH: "0.9",
    HARUKI_CAPTURE_PROJECTED_SHADOW_HEIGHT: "1.2",
    HARUKI_CAPTURE_PROJECTED_SHADOW_OPACITY: "0.35",
    HARUKI_CAPTURE_CROSS_SHADOW_SIZE: "0.52",
    HARUKI_CAPTURE_CROSS_SHADOW_OPACITY: "0.18",
    HARUKI_CAPTURE_PROJECTED_SHADOW_FLOOR_Y: "-0.01",
    HARUKI_CAPTURE_PROJECTED_SHADOW_ADJUST: "true",
    HARUKI_CAPTURE_PROJECTED_SHADOW_ADJUST_ALPHA: "false",
    HARUKI_CAPTURE_PROJECTED_SHADOW_INVISIBLE_HEIGHT: "2.1",
    HARUKI_CAPTURE_PROJECTED_SHADOW_DIRECTIONAL: "true",
  });

  assert.deepEqual(server.defaultProjectedShadow, {
    width: 0.9,
    height: 1.2,
    opacity: 0.35,
    crossSize: 0.52,
    crossOpacity: 0.18,
    floorY: -0.01,
    adjustShadow: true,
    adjustAlpha: false,
    invisibleHeight: 2.1,
    directionalShadow: true,
  });
});

test("capture server accepts idle shutdown duration env", () => {
  const server = resolveCaptureServerOptions({}, {
    HARUKI_CAPTURE_IDLE_SHUTDOWN: "30m",
  });

  assert.equal(server.idleShutdownMs, 30 * 60 * 1000);
});

test("capture server keeps FaceSDF off by default but allows explicit overrides", () => {
  assert.equal(resolveCaptureServerOptions({}, {}).defaultFaceSdfEnabled, false);
  assert.equal(resolveCaptureServerOptions({
    capture: { faceSdfEnabled: true },
  }, {}).defaultFaceSdfEnabled, true);
  assert.equal(resolveCaptureServerOptions({
    capture: { faceSdfEnabled: true },
  }, {
    HARUKI_CAPTURE_FACE_SDF_ENABLED: "false",
  }).defaultFaceSdfEnabled, false);
});

test("capture server idle shutdown can be disabled", () => {
  const server = resolveCaptureServerOptions({}, {
    HARUKI_CAPTURE_IDLE_SHUTDOWN: "0",
  });

  assert.equal(server.idleShutdownMs, 0);
});

test("engine recognizes compressed Unity motion URLs", () => {
  const engineSource = fs.readFileSync(
    path.join(repoRoot, "src/engine/Haruki3DEngine.ts"),
    "utf8"
  );

  assert.match(engineSource, /unity-motion\\\.msgpack\\\.br/);
  assert.match(engineSource, /value\.every\(\(entry\) => typeof entry === "number" && Number\.isFinite\(entry\)\)/);
  assert.match(engineSource, /return value as number\[\]/);
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
  assert.ok(loaderSource.includes("parts/compat/by-unit/${runtimePathUnitSegment(unit)}/head-hair-compatibility.msgpack.br"));
  assert.ok(loaderSource.includes("ensureCompatibilityForSelection"));
  assert.ok(loaderSource.includes('addEntry(findRegistryEntry(entry.characterId, "head", entry.headCostume3dId, entry.unit))'));
  assert.ok(loaderSource.includes('addEntry(findRegistryEntry(entry.characterId, "head_optional", entry.headCostume3dId, entry.unit))'));
  assert.ok(wardrobeSource.includes("ensureCompatibility?: (selection: CustomPartSelection) => Promise<void>;"));
  assert.ok(captureHarnessSource.includes("captureRuntimePackageKey"));
  assert.ok(captureHarnessSource.includes("const packageKey = `${baseUrl}|${roleId}`;"));
  assert.ok(captureHarnessSource.includes("roleId,"));
});

test("runtime part composer treats head_optional rows as official preset heads", () => {
  const composerSource = fs.readFileSync(
    path.join(repoRoot, "src/parts/runtimePartComposer.ts"),
    "utf8"
  );
  const loaderSource = fs.readFileSync(
    path.join(repoRoot, "src/runtime/runtimePackageLoader.ts"),
    "utf8"
  );

  assert.ok(composerSource.includes("function hasLoadedHeadPart"));
  assert.ok(composerSource.includes('hasLoadedPart(partSet, characterId, unit, "head_optional", costume3dId)'));
  assert.ok(composerSource.includes("export function runtimePartSlot"));
  assert.ok(composerSource.includes("isCompleteHeadCostumeType(part.headCostume3dAssetbundleType)"));
  assert.ok(composerSource.includes("const partType = runtimePartSlot(runtime.part);"));
  assert.ok(composerSource.includes("partRegistryDiagnostic(entry)"));
  assert.ok(composerSource.includes("bundlePath ${entry.bundlePath}"));
  assert.ok(loaderSource.includes("tryRuntimePartSlot(entry) === partType"));
  assert.ok(loaderSource.includes(".filter((entry) => packages.has(entry.packagePath))"));
  assert.ok(loaderSource.includes('(!loadedTypes.has("head") && !loadedTypes.has("head_optional"))'));
  assert.match(loaderSource, /tryRuntimePartSlot\(head\) !== "head"\s+&&\s+deniedHeadHairKeys\.has/);
});

test("engine outline shell follows the documented SekaiOutline render state", () => {
  const engineSource = fs.readFileSync(
    path.join(repoRoot, "src/engine/Haruki3DEngine.ts"),
    "utf8"
  );

  assert.ok(engineSource.includes("function shouldSkipOutlineMaterialKinds"));
  assert.ok(engineSource.includes("function getOutlineSourceMaterialKinds"));
  assert.ok(engineSource.includes("function chooseOutlineSourceMaterialKind"));
  assert.ok(!engineSource.includes('return kind === "accessory" || isFaceLayerMaterialKind(kind);'));
  assert.ok(!engineSource.includes("function getSekaiOutlineProfile"));
  assert.match(engineSource, /return kinds\.length > 0 && kinds\.every\(isFaceLayerMaterialKind\);/);
  assert.match(engineSource, /return kinds\.find\(\(kind\) => !isFaceLayerMaterialKind\(kind\)\) \?\? kinds\[0\] \?\? null;/);
  assert.ok(engineSource.includes('material.name = "pjsk_shell_outline";'));
  assert.ok(engineSource.includes("transparent: false"));
  assert.ok(engineSource.includes("depthWrite: true"));
  assert.ok(engineSource.includes("blending: THREE.NoBlending"));
  assert.ok(engineSource.includes("shader.uniforms.uSekaiOutlineWidth = {"));
  assert.ok(engineSource.includes("shader.uniforms.uSekaiOutlineFactor = {"));
  assert.ok(engineSource.includes("float distanceFovFactor = clamp((outlineFovDistance - uSekaiOutlineFactor.x) * uSekaiOutlineFactor.y, 0.0, 1.0);"));
  assert.ok(engineSource.includes("float outlineWidth = mix(uSekaiOutlineWidth.x, uSekaiOutlineWidth.y, distanceFovFactor);"));
  assert.ok(engineSource.includes("float outlineScale = outlineMask;"));
  assert.ok(!engineSource.includes("if (vOutlineMask <= 0.01) discard;"));
});

test("engine head material render order follows documented Sekai render queues", () => {
  const engineSource = fs.readFileSync(
    path.join(repoRoot, "src/engine/Haruki3DEngine.ts"),
    "utf8"
  );

  assert.match(engineSource, /case "face_sdf":\s+case "face":\s+case "accessory":\s+case "body":\s+case "eyelight":\s+return 2000;/s);
  assert.match(engineSource, /case "eyelash":\s+case "eyebrow":\s+return 2001;/s);
  assert.match(engineSource, /case "eye":\s+return 2002;/);
  assert.match(engineSource, /case "hair":\s+return 2451;/);
  assert.match(engineSource, /case "eye_through_hair":\s+return 2452;/);
  assert.match(engineSource, /case "eyelight_through_hair":\s+return 2455;/);
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
  assert.match(serverSource, /defaultCameraProfile/);
  assert.match(serverSource, /new URLSearchParams\(\{/);
  assert.match(serverSource, /normalizeCharacterYawMode\(input\.characterYawMode, null\)/);
  assert.match(serverSource, /normalizeCameraProfile\(input\.cameraProfile, defaultCameraProfile\)/);
  assert.doesNotMatch(serverSource, /characterYawMode: "face-camera"/);
  assert.doesNotMatch(serverSource, /capturePhase=0\.5&captureClip=motion_loop&springRuntimeMode=unity-prefab&cameraPreset=id5-debug/);
  assert.match(harnessSource, /phase: request\.phase \?\? config\.phase/);
  assert.match(harnessSource, /cameraPreset: request\.cameraPreset \?\? config\.cameraPreset/);
  assert.match(harnessSource, /cameraProfile: request\.cameraProfile \?\? config\.cameraProfile/);
  assert.match(harnessSource, /characterYawMode: request\.characterYawMode \?\? config\.characterYawMode \?\? undefined/);
  assert.match(harnessSource, /faceSdfEnabled: request\.faceSdfEnabled \?\? config\.faceSdfEnabled/);
  assert.match(harnessSource, /faceSdfDebugMode: request\.faceSdfDebugMode \?\? config\.faceSdfDebugMode/);
  assert.match(serverSource, /faceSdfEnabled: input\.faceSdfEnabled === undefined\s+\? defaultFaceSdfEnabled\s+: readBoolean\(input\.faceSdfEnabled\)/);
  assert.match(serverSource, /faceSdfDebugMode: normalizeFaceSdfDebugMode\(input\.faceSdfDebugMode\)/);
  assert.match(engineSource, /cameraPreset\?: PjskCameraPreset/);
  assert.match(engineSource, /cameraProfile\?: PjskCameraProfile/);
  assert.match(engineSource, /faceSdfEnabled\?: boolean/);
  assert.match(engineSource, /faceSdfDebugMode\?: FaceSdfDebugMode/);
  assert.match(engineSource, /characterYawMode\?: "0" \| "45" \| "-45" \| "90" \| "-90" \| "180" \| "face-camera"/);
  assert.match(engineSource, /this\.applyCameraPreset\(request\.cameraPreset \?\? "capture", request\.cameraProfile\)/);
  assert.match(engineSource, /this\.applyCaptureCharacterYawMode\(request\.characterYawMode\)/);
});

test("docker runtime image includes capture server support modules", () => {
  const dockerfile = fs.readFileSync(path.join(repoRoot, "Dockerfile"), "utf8");

  assert.match(dockerfile, /ARG CHROMIUM_DEBIAN_VERSION=150\.0\.7871\.100-1~deb12u1/);
  assert.match(dockerfile, /chromium=\$\{CHROMIUM_DEBIAN_VERSION\}/);
  assert.match(dockerfile, /chromium-common=\$\{CHROMIUM_DEBIAN_VERSION\}/);
  assert.match(dockerfile, /COPY capture-server\.mjs \.\/capture-server\.mjs/);
  assert.match(dockerfile, /COPY png-rgba\.mjs \.\/png-rgba\.mjs/);
  assert.match(dockerfile, /runtime-binary-codec\.mjs/);
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

  assert.match(serverSource, /warmupFrames:\s*readIntInRange\(\s*input\.warmupFrames/);
  assert.match(serverSource, /warmupMs:\s*readIntInRange\(input\.warmupMs/);
  assert.match(serverSource, /warmupMode:\s*input\.warmupMode === "runtime" \? "runtime" : defaultWarmupMode === "runtime" \? "runtime" : "animation"/);
  assert.match(harnessSource, /const requestedWarmupFrames = request\.warmupFrames \?\? config\.warmupFrames/);
  assert.match(harnessSource, /warmupMs:\s*request\.warmupMs \?\? config\.warmupMs/);
  assert.match(harnessSource, /warmupFrames,\s*warmupMode:\s*request\.warmupMode \?\? config\.warmupMode/);
  assert.match(harnessSource, /warmupMode:\s*request\.warmupMode \?\? config\.warmupMode/);
  assert.match(engineSource, /warmupFrames\?: number/);
  assert.match(engineSource, /warmupMode\?: "animation" \| "runtime"/);
  assert.match(engineSource, /for \(let index = 0; index < warmupFrames; index \+= 1\)/);
  assert.match(engineSource, /this\.stepCharacterDynamics\(1 \/ 60, advanceWarmupAnimation\)/);
  assert.match(engineSource, /this\.stepCharacterDynamics\(1 \/ 60, advanceWarmupAnimation\);\s*this\.updateProjectedShadows\(\)/);
  const dynamicsBody = engineSource.match(
    /private stepCharacterDynamics\([^]*?\n  \}\n\n  stepCaptureFrame/
  )?.[0] ?? "";
  const captureStepBody = engineSource.match(
    /stepCaptureFrame\([^]*?\n  \}\n\n  getCharacterRoot/
  )?.[0] ?? "";
  assert.match(dynamicsBody, /currentAnimationMixer\?\.update/);
  assert.match(dynamicsBody, /updateFaceMotion/);
  assert.match(dynamicsBody, /syncOfficialModelCombineSetup/);
  assert.match(dynamicsBody, /currentExtraBoneRuntime\?\.update/);
  assert.match(dynamicsBody, /currentSpringRuntime\?\.update/);
  assert.doesNotMatch(dynamicsBody, /updateShaderCameraPositions|updateShaderFaceBasis/);
  assert.match(captureStepBody, /this\.stepCharacterDynamics\(delta, advanceAnimation\)/);
  assert.match(captureStepBody, /updateProjectedShadows/);
  assert.match(captureStepBody, /updateShaderCameraPositions/);
  assert.match(captureStepBody, /updateShaderFaceBasis/);
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

test("capture camera preset uses official CostumeShop camera parameters and keeps id5-debug as a legacy alias", () => {
  const configOptions = resolveCaptureRuntimeOptions({
    capture: {
      cameraPreset: "id5-debug",
      cameraProfile: "official-default",
    },
  }, {});
  const harnessSource = fs.readFileSync(
    path.join(repoRoot, "src/captureHarness.ts"),
    "utf8"
  );
  const engineSource = fs.readFileSync(
    path.join(repoRoot, "src/engine/Haruki3DEngine.ts"),
    "utf8"
  );

  assert.equal(configOptions.cameraPreset, "capture");
  assert.equal(configOptions.cameraProfile, "official-default");
  assert.match(engineSource, /export type PjskCameraPreset = "default" \| "capture";/);
  assert.match(engineSource, /export type PjskCameraProfile = "official-default" \| "full-body";/);
  assert.match(engineSource, /const COSTUME_SHOP_CAMERA = \{/);
  assert.match(engineSource, /zoomDuration: 0\.35/);
  assert.match(engineSource, /bottomLowerLimitPosition: 0\.4/);
  assert.match(engineSource, /bottomUpperLimitPosition: 0\.85/);
  assert.match(engineSource, /topLowerLimitPosition: 1\.25/);
  assert.match(engineSource, /topUpperLimitPosition: 0\.85/);
  assert.match(engineSource, /nearZ: 2\.3/);
  assert.match(engineSource, /farZ: 4\.5/);
  assert.match(engineSource, /fov: 25/);
  assert.match(engineSource, /const COSTUME_SHOP_CAMERA_OFFICIAL_DEFAULT_STATE = \{/);
  assert.match(engineSource, /const COSTUME_SHOP_CAMERA_FULL_BODY_STATE = \{/);
  assert.match(
    engineSource,
    /const COSTUME_SHOP_CAMERA_OFFICIAL_DEFAULT_STATE = \{\s+cameraRootYawDegrees: 0,\s+zoomValue: 0,\s+zoomMoveValue: 1,/s
  );
  assert.match(engineSource, /zoomValue: COSTUME_SHOP_CAMERA\.zoomDuration/);
  assert.match(engineSource, /zoomMoveValue: 0/);
  assert.match(engineSource, /localCameraRotationYDegrees: 180/);
  assert.match(engineSource, /costumeShopState:/);
  assert.match(engineSource, /getCostumeShopCameraState/);
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
  assert.match(harnessSource, /return normalizeCameraProfile\(params\.get\("cameraProfile"\)\);/);
});

test("combined runtime imports apply character height before capture camera framing", () => {
  const engineSource = fs.readFileSync(
    path.join(repoRoot, "src/engine/Haruki3DEngine.ts"),
    "utf8"
  );

  assert.match(
    engineSource,
    /this\.currentBodyAsset = characterAsset\.bodyAsset;\s+this\.currentHeadAsset = characterAsset\.headAsset;\s+(?:this\.lastConstraintSetupDiagnostics = null;\s+)?this\.applyCharacterHeight\(characterAsset\.bodyAsset\.characterHeightMeters \?\? this\.characterHeight\);/s
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
  assert.doesNotMatch(engineSource, /ensureFaceSdfUv1Attribute/);
  assert.match(engineSource, /resolvedEntry\.materialKind === "face_sdf" &&\s+Boolean\(resolvedEntry\.faceShadowTex\) &&\s+faceLighting\?\.useFaceSdf !== false/s);
  assert.match(engineSource, /shaderUniforms\.uFaceSdfEnabled\.value =\s+this\.shouldEnableFaceSdfForCurrentView\(\) && faceSdfCapable \? 1\.0 : 0\.0/s);
  assert.match(engineSource, /faceSdfCapable/);
  assert.match(engineSource, /faceSdfUv1Available/);
  assert.match(shaderSource, /uFaceShadowTex:\s*\{\s*value: initial\.faceShadowTex \?\? null\s*\}/);
  assert.match(shaderSource, /uUseFaceShadowTex:\s*\{\s*value: initial\.faceShadowTex \? 1\.0 : 0\.0\s*\}/);
  assert.match(shaderSource, /uFaceSdfEnabled:\s*\{\s*value: initial\.faceSdfEnabled && initial\.faceShadowTex \? 1\.0 : 0\.0\s*\}/);
  assert.match(shaderSource, /material\.uniforms\.uFaceSdfEnabled\.value = next\.faceSdfEnabled && next\.faceShadowTex \? 1\.0 : 0\.0/);
  assert.match(
    shaderSource,
    /if \(\(uFaceSdfEnabled > 0\.5 \|\| uFaceDebugMode > 0\.5\) && uUseFaceShadowTex > 0\.5\)/
  );
  assert.match(shaderSource, /vFaceShadowUv = abs\(uv1\.x\) \+ abs\(uv1\.y\) > 0\.000001 \? uv1 : uv;/);
  assert.match(
    engineSource,
    /loadTexture\(\s*slot\.faceShadowTex,\s*THREE\.NoColorSpace\s*\)/
  );
  assert.doesNotMatch(shaderSource, /staticShadowMask/);
});

test("face sdf uses official face-only head light parameters", () => {
  const engineSource = fs.readFileSync(
    path.join(repoRoot, "src/engine/Haruki3DEngine.ts"),
    "utf8"
  );
  const shaderSource = fs.readFileSync(
    path.join(repoRoot, "src/materials/sekaiCharacterShader.ts"),
    "utf8"
  );

  assert.match(engineSource, /sekaiCostumeShopDirectionalLightRotationDegrees/);
  assert.match(engineSource, /sekaiCostumeShopDirectionalLightDirection/);
  assert.match(shaderSource, /uniform vec2 uHeadDotDirectionalLight;/);
  assert.match(shaderSource, /uniform float uUseFaceShadowLimiter;/);
  assert.match(shaderSource, /uniform float uFaceShadowLimitRange;/);
  assert.match(shaderSource, /sdfValue = uFaceSdfMirror \* uHeadDotDirectionalLight\.x <= 0\.0 \? sdf1 : sdf0;/);
  assert.match(shaderSource, /faceThreshold = min\(/);
  assert.match(shaderSource, /faceShadow = sekaiFaceShadow\(sdfValue, faceThreshold, uShadowWidth, uFadeMode\);/);
  assert.match(shaderSource, /shadowBand = max\(shadowBand, faceShadow\);/);
  assert.doesNotMatch(shaderSource, /acos\(|sideGate|rangeGate/);
  assert.doesNotMatch(shaderSource, /uFaceSdfUseLightDirection|uFaceSoftness|uFaceRight|uFaceUp|uFaceForward|uFaceDebugLightMode/);
  assert.doesNotMatch(engineSource, /Math\.acos\(|updateSekaiFaceBasis|faceSdfDebugLightModeToUniform/);
  assert.match(engineSource, /export type FaceSdfDebugMode = "off" \| "sdf" \| "mask" \| "limit" \| "basis" \| "range";/);
  assert.match(engineSource, /-this\.faceUpWorld\.x,\s+-this\.faceUpWorld\.z/s);
  assert.match(engineSource, /updateSekaiFaceShadowParameters\(\s+material,\s+faceShadowLightDirection,\s+this\.headDotDirectionalLight/s);
  assert.doesNotMatch(shaderSource, /rangeLimit \* uShadowWeight/);
  assert.match(shaderSource, /shadowValue = mix\(shadowValue, texture2D\(uShadowTex, vUv\)\.rgb, clamp\(uShadowTexWeight, 0\.0, 1\.0\)\)/);
  assert.match(shaderSource, /float officialShadowBand = sekaiBaseShadow\(/);
  assert.match(shaderSource, /uniform float uFadeMode;/);
  assert.match(shaderSource, /uniform float uHueSinAngle;/);
  assert.match(shaderSource, /uniform float uHueCosAngle;/);
  assert.match(shaderSource, /uniform float uValue;/);
  assert.match(shaderSource, /uniform float uContrast;/);
  assert.match(shaderSource, /vec3 applyMaterialHsvc\(vec3 color\)/);
  assert.match(engineSource, /if \(material\.uniforms\.uHeadPosition\) \{\s+material\.uniforms\.uHeadPosition\.value\.copy\(this\.hairHeadPosition\);\s+\}/s);
});

test("head material binding requires exporter material kinds", () => {
  const engineSource = fs.readFileSync(
    path.join(repoRoot, "src/engine/Haruki3DEngine.ts"),
    "utf8"
  );

  assert.doesNotMatch(engineSource, /normalizeHeadRuntimeMaterialKind|materialNameLower\.includes\("_hair_"\)|meshNameLower\.includes\("hair"\)/);
  assert.match(engineSource, /Head material \$\{slot\.materialName \?\? slot\.materialKey\} is missing materialKind/);
  assert.match(engineSource, /const kind = slot\.materialKind/);
});

test("head hair compatibility uses not-available patterns as a blacklist", () => {
  const composerSource = fs.readFileSync(
    path.join(repoRoot, "src/parts/runtimePartComposer.ts"),
    "utf8"
  );

  assert.match(composerSource, /getDeniedHeadHairCompatibilityKeys/);
  assert.match(composerSource, /entry\.state === "not_available"/);
  assert.doesNotMatch(composerSource, /availableHeadKeys/);
  assert.doesNotMatch(composerSource, /not in the available pattern list/);
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
  assert.match(shaderSource, /mainColor = mix\(mainColor, faceSkinLit, faceSkinMask \* 0\.58\)/);
  assert.match(engineSource, /shaderSkinColorDefault/);
  assert.match(engineSource, /shaderSkinColor1/);
  assert.match(engineSource, /shaderSkinColor2/);
  assert.match(engineSource, /bodyDebugMode\?: BodyDebugMode/);
  assert.match(engineSource, /faceSdfDebugMode\?: FaceSdfDebugMode/);
  assert.match(engineSource, /const COSTUME_SHOP_BODY_VALUE_SHADOW_INFLUENCE = 1\.0/);
  assert.match(engineSource, /private toonValueShadowInfluence = COSTUME_SHOP_BODY_VALUE_SHADOW_INFLUENCE/);
  assert.match(shaderSource, /float officialShadowBand = sekaiBaseShadow\(/);
  assert.match(shaderSource, /float valueShadowInfluence = clamp\(uValueShadowInfluence, 0\.0, 1\.0\);/);
  assert.match(shaderSource, /float shadowBand = mix\(geometricShadowBand, officialShadowBand, valueShadowInfluence\) \* uShadowWeight;/);
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

test("engine exposes only prefab-native runtime imports", () => {
  const engineSource = fs.readFileSync(
    path.join(repoRoot, "src/engine/Haruki3DEngine.ts"),
    "utf8"
  );

  assert.match(engineSource, /Final runtime package must provide container\.unityRuntimeJson/);
  assert.match(engineSource, /Final runtime package must provide runtimeUnitySetup version 0414/);
  assert.doesNotMatch(engineSource, /importCharacterParts|loadBodyAsset|loadHeadAsset|applyBodyAsset|applyHeadAsset/);
  assert.doesNotMatch(engineSource, /"glb" \| "proxy"|combined_glb|separate_parts|bone_linked|node_attached/);
  assert.match(engineSource, /export type BodyAnimationKind = "unity-json";/);
  assert.match(engineSource, /Unity motion \.msgpack\.br is required/);
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
  assert.match(shaderSource, /float skinMask = \(uSkinTintEnabled > 0\.5 && uHasValueTex > 0\.5\) \? step\(0\.5, valueSample\.r\) : 0\.0;/);
  assert.match(shaderSource, /float officialShadowBand = sekaiBaseShadow\(/);
  assert.match(shaderSource, /vertexOutlineIntensity = clamp\(vColor\.r, 0\.0, 1\.0\);/);
  assert.match(shaderSource, /vertexRimMask = clamp\(vColor\.g, 0\.0, 1\.0\);/);
  assert.match(shaderSource, /float rimMask = vertexRimMask;/);
  assert.match(shaderSource, /vFaceShadowUv = abs\(uv1\.x\) \+ abs\(uv1\.y\) > 0\.000001 \? uv1 : uv;/);
  assert.match(shaderSource, /texture2D\(uFaceShadowTex, vFaceShadowUv\)/);
  assert.match(shaderSource, /texture2D\(uFaceShadowTex, vec2\(-vFaceShadowUv\.x, vFaceShadowUv\.y\)\)/);
});

test("projected character shadows are separate scene objects", () => {
  const engineSource = fs.readFileSync(
    path.join(repoRoot, "src/engine/Haruki3DEngine.ts"),
    "utf8"
  );

  assert.match(engineSource, /class CharacterProjectedShadowController/);
  assert.match(engineSource, /CharacterDirectionalShadow/);
  assert.match(engineSource, /CharacterCrossShadow/);
  assert.match(engineSource, /PROJECTED_SHADOW_BONE_NAMES = \["Left_Toe", "Right_Toe"\] as const/);
  assert.match(engineSource, /PROJECTED_CROSS_SHADOW_OFFSET_FLOOR = 0\.015/);
  assert.match(engineSource, /PROJECTED_DIRECTIONAL_SHADOW_OFFSET_FLOOR = 0\.01/);
  assert.match(engineSource, /PROJECTED_SHADOW_INVISIBLE_HEIGHT = 0\.2/);
  assert.match(engineSource, /directionalShadow: false/);
  assert.match(engineSource, /for \(const boneName of PROJECTED_SHADOW_BONE_NAMES\)/);
  assert.match(engineSource, /pair\.directionalAnchor\.visible = this\.settings\.directionalShadow/);
  assert.match(engineSource, /pair\.crossAnchor\.visible = !this\.settings\.directionalShadow/);
  assert.match(engineSource, /this\.scene\.add\(this\.projectedShadow\.group\)/);
  assert.match(engineSource, /distanceToFloor = this\.settings\.height \* heightRatio/);
  assert.match(engineSource, /setProjectedShadowSettings\(settings: ProjectedShadowSettingsInput/);
});

test("runtime accessory material slots carry the official accessory shader flag", () => {
  const engineSource = fs.readFileSync(
    path.join(repoRoot, "src/engine/Haruki3DEngine.ts"),
    "utf8"
  );

  assert.match(engineSource, /const isAccessory = Boolean\(slot\.isAccessory\) \|\| kind === "accessory"/);
  assert.match(engineSource, /material\.userData\.pjskIsAccessory = isAccessory/);
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
  const constraintRuntimeSource = fs.readFileSync(
    path.join(repoRoot, "src/engine/unityConstraintRuntime.ts"),
    "utf8"
  );

  assert.match(composerSource, /type RoleRuntimePackage =/);
  assert.match(composerSource, /findHeadOptionalAttachTransform/);
  assert.match(composerSource, /sourceRendererTransformPath/);
  assert.match(composerSource, /constraintSetup:\s*\{/);
  assert.match(composerSource, /repair constraints after composition/);
  assert.match(composerSource, /source path may therefore point at the source prefab's/);
  assert.match(loaderSource, /roleRuntimePath/);
  assert.match(loaderSource, /loadRoleRuntimePackages/);
  assert.match(engineSource, /applyCustomRoleDefaultMotion/);
  assert.match(engineSource, /nativeMeshes: this\.lastNativeMeshInstallDiagnostics/);
  assert.match(engineSource, /constraints: this\.lastConstraintSetupDiagnostics/);
  assert.match(engineSource, /UnityConstraintRuntime/);
  assert.match(composerSource, /sourcePathId = remapNumericId/);
  assert.match(constraintRuntimeSource, /export function applyUnityRuntimeConstraints/);
  assert.match(constraintRuntimeSource, /constraint\.sources/);
  assert.match(constraintRuntimeSource, /resolveReboundConstraintSourceNode/);
  assert.match(constraintRuntimeSource, /graph\.root\.traverse/);
  assert.match(constraintRuntimeSource, /transform name \$\{name\} matched \$\{candidates\.length\} nodes/);
  assert.match(constraintRuntimeSource, /parent constraint applied with height-scaled translation offsets/);
  assert.match(constraintRuntimeSource, /rotation constraint applied with weighted source rotations/);
  assert.match(constraintRuntimeSource, /aim constraint applied with exported aim\/up vectors/);
  assert.match(constraintRuntimeSource, /applyAimConstraint/);
  assert.match(constraintRuntimeSource, /worldUpObject/);
  assert.match(constraintRuntimeSource, /multiplyScalar\(characterHeight\)/);
  assert.match(constraintRuntimeSource, /export class UnityConstraintRuntime/);
  assert.match(constraintRuntimeSource, /update\(\): RuntimeConstraintDebug/);
  assert.match(constraintRuntimeSource, /applyConstraintRotationOffset/);
  assert.match(constraintRuntimeSource, /constraint\.translationAxis/);
  assert.match(constraintRuntimeSource, /constraint\.rotationAxis/);
  assert.match(constraintRuntimeSource, /constraint\.worldUpType/);
  assert.match(engineSource, /currentConstraintRuntime/);
  assert.match(engineSource, /this\.currentConstraintRuntime\?\.update\(\)/);
  assert.match(
    engineSource,
    /this\.syncOfficialModelCombineSetup\(\);\s*this\.currentExtraBoneRuntime\?\.update\(\);\s*if \(this\.isSpringRuntimeEnabled\(\)\)/
  );
});

test("unified prefab spring runtime retains force providers and official timeline controls", () => {
  const springSource = fs.readFileSync(
    path.join(repoRoot, "src/engine/unityPrefabSpringRuntimeAdapter.ts"),
    "utf8"
  );
  const composerSource = fs.readFileSync(
    path.join(repoRoot, "src/parts/runtimePartComposer.ts"),
    "utf8"
  );
  const engineSource = fs.readFileSync(
    path.join(repoRoot, "src/engine/Haruki3DEngine.ts"),
    "utf8"
  );

  assert.match(springSource, /forceProviders\?: RuntimeForceProviderSource\[\]/);
  assert.match(springSource, /resolveForceProviders/);
  assert.match(springSource, /computeWindVolumeOneSelfForce/);
  assert.match(springSource, /-Math\.cos\(THREE\.MathUtils\.degToRad\(provider\.additionalWindAngle\)\)/);
  assert.match(springSource, /bone\.windInfluence/);
  assert.match(springSource, /setTimelineControl/);
  assert.match(springSource, /clearTimelineControl/);
  assert.doesNotMatch(springSource, /forceProviderCount:\s*0/);
  assert.match(composerSource, /remapRuntimeForceProviders/);
  assert.match(engineSource, /setSpringTimelineControl/);
});

test("runtime shadow debug exposes projected and hair-shadow layers", () => {
  const engineSource = fs.readFileSync(
    path.join(repoRoot, "src/engine/Haruki3DEngine.ts"),
    "utf8"
  );

  assert.match(engineSource, /export type RuntimeProjectedShadowDebug =/);
  assert.match(engineSource, /projectedShadow\?: RuntimeProjectedShadowDebug/);
  assert.match(engineSource, /projectedShadow: this\.projectedShadow\.getDebugSnapshot/);
  assert.match(engineSource, /export type HairShadowMode = "off" \| "sekai_head_position" \| "head_proximity";/);
  assert.match(engineSource, /private hairShadowMode: HairShadowMode = "sekai_head_position";/);
  assert.match(engineSource, /hairShadowMode: this\.hairShadowMode/);
  assert.match(engineSource, /hairShadowWorldPosition: vectorDebugSnapshot\(this\.hairHeadPosition\)/);
  assert.match(engineSource, /hairShadowEnabled:\s*this\.isHeadProximityHairShadowEnabled\(\) &&\s*Boolean\(options\.hairController\) &&\s*lighting\?\.faceSphereShadowEdge != null/s);
  assert.match(engineSource, /useLambert: options\.hairController \? true : \(lighting\?\.useLambert \?\? true\)/);
  assert.match(
    engineSource,
    /useLambert:\s*params\.useLambert \?\?\s*params\.lighting\?\.useLambert/
  );
  assert.doesNotMatch(engineSource, /lighting\?\.hairShadow === true/);
  assert.match(engineSource, /CharacterDirectionalShadow/);
  assert.match(engineSource, /CharacterCrossShadow/);
});

test("face shadow updates preserve exported limiter parameters", () => {
  const engineSource = fs.readFileSync(
    path.join(repoRoot, "src/engine/Haruki3DEngine.ts"),
    "utf8"
  );

  assert.match(
    engineSource,
    /material\.uniforms\.uUseFaceShadowLimiter\?\.value \?\? 1\.0/
  );
  assert.match(
    engineSource,
    /material\.uniforms\.uFaceShadowLimitRange\?\.value \?\? 0\.0/
  );
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
  assert.match(composerSource, /characterControllers: composeCharacterControllers\(contributorRuntimes\)/);
  assert.match(composerSource, /return head\?\.characterControllers \?\? \{\}/);
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

test("custom selection mutations use the official full-character update path", () => {
  const engineSource = fs.readFileSync(
    path.join(repoRoot, "src/engine/Haruki3DEngine.ts"),
    "utf8"
  );

  assert.match(engineSource, /private customSelectionQueue: Promise<unknown> = Promise\.resolve\(\)/);
  assert.match(engineSource, /private enqueueCustomSelectionMutation<T>/);
  assert.match(engineSource, /this\.customSelectionQueue\.then\(operation, operation\)/);
  assert.match(engineSource, /private async applyCustomSelection/);
  assert.match(engineSource, /previousCombinedId === combined\.id/);
  assert.match(engineSource, /!sameResolvedSelection[\s\S]*await this\.importCombinedCharacter\(combined,\s*\{/);
  assert.match(engineSource, /const previousSelection = wardrobe\.getCustomSelection\(\)/);
  assert.match(engineSource, /const nextAnimationUrl = combined\.bodyAsset\.source\.animationUrls\?\.\[0\] \?\? null/);
  assert.match(engineSource, /const preserveAnimation = previousCombinedId !== null &&\s+previousSelection !== null &&\s+runtimeRoleId\(previousSelection\.characterId, previousSelection\.unit\) ===\s+runtimeRoleId\(selection\.characterId, selection\.unit\) &&\s+this\.currentAnimationUrl === nextAnimationUrl &&\s+this\.currentAnimationLoopUrl === nextLoopUrl/);
  assert.match(engineSource, /preserveAnimation,\s+disposeBeforeLoad:\s*true/);
  assert.match(engineSource, /clearAnimationCache:\s*false/);
  assert.match(engineSource, /applyCustomRoleDefaultMotion\(combined, !preserveAnimation\)/);
  assert.match(engineSource, /await this\.refreshAnimationPlayback\(\{\s+resetSpring: preservedAnimation === null,\s+\}\);\s+if \(preservedAnimation\)/);
  assert.match(engineSource, /this\.currentAnimationAction\.time = duration > 0/);
  const sameSelectionBranch = engineSource.slice(
    engineSource.indexOf("const sameResolvedSelection"),
    engineSource.indexOf("await this.applyCustomRoleDefaultMotion(combined, !preserveAnimation)")
  );
  assert.doesNotMatch(sameSelectionBranch, /resetCurrentSpringRuntimeState/);
  assert.match(engineSource, /if \(isEnabled && !wasEnabled\) \{\s*this\.resetAndSettleCurrentSpringRuntime\(60\);/);
  assert.doesNotMatch(engineSource, /settleCurrentPose\(\)/);
  assert.match(engineSource, /private async captureRolePartsInternal/);
  assert.match(engineSource, /activeRoleId !== nextRoleId[\s\S]*wardrobe\.selectRole/);
  assert.doesNotMatch(engineSource, /partSet\?\.packages\.clear\(\)/);
  assert.doesNotMatch(engineSource, /partSet\?\.roleRuntimes\.clear\(\)/);
  assert.doesNotMatch(engineSource, /await this\.setCustomSelection\(selection\)/);
});

test("engine releases old role WebGL resources before cross-role capture growth", () => {
  const engineSource = fs.readFileSync(
    path.join(repoRoot, "src/engine/Haruki3DEngine.ts"),
    "utf8"
  );

  assert.match(engineSource, /function collectMaterialTextures/);
  assert.match(engineSource, /disposeObjectResources/);
  assert.match(engineSource, /disposeMaterial\(mesh\.material,\s*true,\s*preservedMaterials,\s*disposedTextures\)/);
  assert.match(engineSource, /private releaseCurrentCharacterResources/);
  assert.match(engineSource, /this\.renderer\.renderLists\.dispose\(\)/);
  assert.match(engineSource, /this\.renderer\.info\.reset\(\)/);
});

test("capture harness forces spring entry warmup once per runtime region and role", () => {
  const captureHarnessSource = fs.readFileSync(
    path.join(repoRoot, "src/captureHarness.ts"),
    "utf8"
  );

  assert.match(captureHarnessSource, /const ROLE_ENTRY_WARMUP_FRAMES = 60;/);
  assert.match(captureHarnessSource, /let settledCapturePackageKey: string \| null = null;/);
  assert.match(captureHarnessSource, /const packageKey = `\$\{baseUrl\}\|\$\{request\.roleId\}`;/);
  assert.match(captureHarnessSource, /const requestedWarmupFrames = request\.warmupFrames \?\? config\.warmupFrames;/);
  assert.match(captureHarnessSource, /settledCapturePackageKey === packageKey\s+\?\s+requestedWarmupFrames\s+:\s+Math\.max\(requestedWarmupFrames, ROLE_ENTRY_WARMUP_FRAMES\)/);
  assert.match(captureHarnessSource, /settledCapturePackageKey = packageKey;/);
});

test("runtime debug reports FUnit metadata without mixing it into UTJ spring runtime", () => {
  const engineSource = fs.readFileSync(
    path.join(repoRoot, "src/engine/Haruki3DEngine.ts"),
    "utf8"
  );
  const composerSource = fs.readFileSync(
    path.join(repoRoot, "src/parts/runtimePartComposer.ts"),
    "utf8"
  );

  assert.match(engineSource, /export type RuntimeFUnitDebug = \{/);
  assert.match(engineSource, /funit: RuntimeFUnitDebug/);
  assert.match(engineSource, /function readRuntimeFUnitDebug/);
  assert.match(engineSource, /setup\.funit \?\? setup\.FUnit/);
  assert.match(engineSource, /metadata_only; do not merge with UTJ\/Sekai SpringBone runtime/);
  assert.match(composerSource, /function mergeRuntimeFUnitSummaries/);
  assert.match(composerSource, /funit: mergeRuntimeFUnitSummaries\(runtimes\)/);
  assert.doesNotMatch(composerSource, /FUnit\.SpringBone/);
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
  assert.match(composerSource, /extraBones: springBone\.extraBones as RuntimeExtraBone\[\] \| undefined/);
  assert.match(composerSource, /remapRuntimeExtraBones/);
  assert.match(composerSource, /raw: mergeRuntimeRawSpringBone\(remappedParts\)/);
  assert.match(composerSource, /pjskSpringBone:\s*\{\s*raw: runtimeSetup\.raw,\s*runtimeUnitySetup: runtimeSetup,/);
  assert.match(composerSource, /extraBones,\s+colliders,/);
  assert.match(composerSource, /filterColliderBindingsByActiveBones/);
  assert.match(composerSource, /filterManagerColliderCachesByActiveManagers/);
  assert.match(composerSource, /partType === "body" && activeRoots\.includes\("body"\)/);
  assert.match(composerSource, /partType === "head" \|\| partType === "hair"/);
  assert.match(composerSource, /activeRoots\.includes\("face"\)/);
  assert.match(composerSource, /selectedActiveRoots/);
  assert.match(composerSource, /activeRoots: selectedActiveRoots/);
  assert.match(composerSource, /manager\.bonePathIds = inferredBonePathIds/);
  assert.doesNotMatch(composerSource, /manager\.bonePathIds\.length === 0/);
  assert.match(composerSource, /cache\.springBonePathIds = inferredBonePathIds/);
  assert.match(composerSource, /rebuild SpringManager ownership from composed hierarchy/);
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
  assert.match(harnessSource, /engine\.setUtjSpringBoneTraceFilters\(/);
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

  assert.doesNotMatch(serverSource, /"--disable-gpu"/);
  assert.match(serverSource, /"--use-gl=angle"/);
  assert.match(serverSource, /"--use-angle=swiftshader"/);
  assert.match(serverSource, /"--enable-unsafe-swiftshader"/);
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
  assert.match(composerSource, /manifest\.proxy \|\|=/);
  assert.match(composerSource, /bodyColor:\s*manifest\.proxy\.bodyColor \?\? "#f2d0c3"/);
  assert.match(composerSource, /shadowColor:\s*manifest\.proxy\.shadowColor \?\? "#bf958a"/);
  assert.match(composerSource, /faceColor:\s*manifest\.proxy\.faceColor \?\? "#fde2d9"/);
  assert.match(composerSource, /skinColorDefault:\s*manifest\.proxy\.skinColorDefault \?\? manifest\.proxy\.faceColor \?\? "#fde2d9"/);
  assert.match(composerSource, /hairColor:\s*manifest\.proxy\.hairColor \?\? "#7b5b4a"/);
});

test("final part manifests require exported character height", () => {
  const composerSource = fs.readFileSync(
    path.join(repoRoot, "src/parts/runtimePartComposer.ts"),
    "utf8"
  );

  assert.doesNotMatch(composerSource, /characterHeightMetersById|resolveRuntimePartCharacterHeightMeters/);
  assert.match(composerSource, /Body part runtime \$\{runtime\.packagePath\} is missing characterHeightMeters/);
  assert.match(composerSource, /Head part runtime \$\{head\.packagePath\} is missing characterHeightMeters/);
});

test("unity prefab source graph requires the official model-combine setup", () => {
  const engineSource = fs.readFileSync(
    path.join(repoRoot, "src/engine/Haruki3DEngine.ts"),
    "utf8"
  );

  assert.match(engineSource, /Runtime package must provide the official model_combine_setup body\/head assembly/);
  assert.doesNotMatch(engineSource, /PJSK_RuntimeMount_face/);
  assert.doesNotMatch(engineSource, /runtimeMountPath/);
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
  assert.match(engineSource, /assembly\.faceRendererName \?\? "Face"/);
  assert.match(engineSource, /Official model_combine_setup paths were not fully resolved/);
  assert.match(engineSource, /new Set\(\[faceRendererName, "Face", "Hair", "Acc"\]\)/);
  assert.match(engineSource, /drainChildrenKeepingLocal\(bodyNodeB\.node, faceNodeB\.node\)/);
  assert.match(engineSource, /child\.name\.endsWith\(childMoveSuffix\)/);
  assert.match(engineSource, /nodeByPath\.set\(bodyNodeA\.path, faceNodeA\.node\)/);
  assert.match(engineSource, /nodeByPath\.set\(bodyNodeB\.path, faceNodeB\.node\)/);
  assert.match(engineSource, /detachNode\(bodyNodeB\.node\)/);
  assert.match(engineSource, /detachNode\(bodyNodeA\.node\)/);
  assert.match(engineSource, /Runtime package must provide the official model_combine_setup body\/head assembly/);
  assert.doesNotMatch(engineSource, /usesModelCombineSetup/);
});

test("Sekai ExtraBone runtime follows official rotation order and coefficient direction", () => {
  const extraBoneSource = fs.readFileSync(
    path.join(repoRoot, "src/engine/sekaiExtraBoneRuntime.ts"),
    "utf8"
  );

  assert.match(extraBoneSource, /"XYZ",\s+"XZY",\s+"YXZ",\s+"YZX",\s+"ZXY",\s+"ZYX"/s);
  assert.match(extraBoneSource, /const sign = entry\.coefficient > 0 \? -1 : entry\.coefficient < 0 \? 1 : 0/);
  assert.match(extraBoneSource, /function lerpQuaternion/);
  assert.match(extraBoneSource, /const sign = from\.dot\(to\) < 0 \? -1 : 1/);
  assert.match(extraBoneSource, /THREE\.MathUtils\.clamp\(alpha, 0, 1\)/);
  assert.doesNotMatch(extraBoneSource, /\.slerp\(/);
  assert.match(extraBoneSource, /Math\.abs\(entry\.coefficient\)/);
  assert.match(extraBoneSource, /function readExtraBoneEntries/);
  assert.match(extraBoneSource, /partRecord\?\.extraBones \?\? partRecord\?\.ExtraBones/);
  assert.doesNotMatch(extraBoneSource, /EX_/);

  const helperSource = extraBoneSource.match(
    /function lerpQuaternion\([\s\S]*?\n\}/
  )?.[0];
  assert.ok(helperSource);
  const helperJavaScript = ts.transpileModule(helperSource, {
    compilerOptions: {
      module: ts.ModuleKind.None,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const lerpQuaternion = new Function(
    "THREE",
    `${helperJavaScript}\nreturn lerpQuaternion;`
  )(THREE);

  const identity = new THREE.Quaternion();
  const halfTurnY = new THREE.Quaternion(0, 1, 0, 0);
  const half = lerpQuaternion(
    new THREE.Quaternion(),
    identity,
    halfTurnY,
    0.5
  );
  const quarterTurnY = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    Math.PI / 2
  );
  assert.ok(half.angleTo(quarterTurnY) < 1e-7);
  assert.ok(Math.abs(half.length() - 1) < 1e-12);

  const sixtyPercent = lerpQuaternion(
    new THREE.Quaternion(),
    identity,
    halfTurnY,
    0.6
  );
  const sixtyPercentLength = Math.hypot(0.6, 0.4);
  assert.ok(Math.abs(sixtyPercent.y - 0.6 / sixtyPercentLength) < 1e-12);
  assert.ok(Math.abs(sixtyPercent.w - 0.4 / sixtyPercentLength) < 1e-12);

  const from = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(0.3, -0.8, 1.2, "ZYX")
  );
  const to = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(-1.1, 0.4, 0.7, "XZY")
  );
  const normal = lerpQuaternion(new THREE.Quaternion(), from, to, 0.6);
  const antipodal = lerpQuaternion(
    new THREE.Quaternion(),
    from,
    new THREE.Quaternion(-to.x, -to.y, -to.z, -to.w),
    0.6
  );
  assert.ok(1 - Math.abs(normal.dot(antipodal)) < 1e-12);
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
  assert.match(composerSource, /Part runtime \$\{entry\.packagePath\} is missing characterHeightMeters/);
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

test("part composer instantiates head optional prefabs with the official accessory mounting flow", () => {
  const composerSource = fs.readFileSync(
    path.join(repoRoot, "src/parts/runtimePartComposer.ts"),
    "utf8"
  );

  assert.match(composerSource, /resolveHeadOptionalFaceId/);
  assert.match(composerSource, /mountHeadOptionalPrefabGraphs/);
  assert.match(composerSource, /findHeadOptionalAttachTransform/);
  assert.match(composerSource, /headOptionalPrefabRootPath/);
  assert.match(composerSource, /headOptionalControllerPath/);
  assert.match(composerSource, /retainHeadOptionalPrefabSubtree/);
  assert.match(composerSource, /partType === "head_optional" && activeRoots\.includes\("optional"\)/);
  assert.match(composerSource, /sourceRendererTransformPath\.startsWith\(`\$\{prefabRootPath\}\/`\)/);
  assert.match(composerSource, /extractFaceIdFromBundlePath/);
  assert.match(composerSource, /accessoryTransformAdjustments/);
  assert.match(composerSource, /applyAccessoryControllerTransform/);
  assert.match(composerSource, /localScale = \{ X: Math\.abs\(scale\.x\), Y: Math\.abs\(scale\.y\), Z: Math\.abs\(scale\.z\) \}/);
  assert.doesNotMatch(composerSource, /applyAccessoryTransformAdjustment/);
  assert.doesNotMatch(composerSource, /transformVectorArray/);
  assert.doesNotMatch(composerSource, /attachPathPriority/);
});

test("accessory controller Euler conversion matches Unity's default ZXY rotation order", () => {
  const composerSource = fs.readFileSync(
    path.join(repoRoot, "src/parts/runtimePartComposer.ts"),
    "utf8"
  );
  const helperSource = composerSource.match(
    /function unityQuaternionFromEulerDegrees\([\s\S]*?\n\}/
  )?.[0];
  assert.ok(helperSource);
  const helperJavaScript = ts.transpileModule(helperSource, {
    compilerOptions: {
      module: ts.ModuleKind.None,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const unityQuaternionFromEulerDegrees = new Function(
    `${helperJavaScript}\nreturn unityQuaternionFromEulerDegrees;`
  )();

  const actual = unityQuaternionFromEulerDegrees({ x: 17, y: -31, z: 43 });
  const expected = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(
      THREE.MathUtils.degToRad(17),
      THREE.MathUtils.degToRad(-31),
      THREE.MathUtils.degToRad(43),
      "ZXY"
    )
  );
  assert.ok(new THREE.Quaternion(actual.x, actual.y, actual.z, actual.w).angleTo(expected) < 1e-7);
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

  assert.match(composerSource, /const bodyHeadAssembly = resolveComposedBodyHeadAssembly\(prefabGraphs\)/);
  assert.match(composerSource, /Composed parts do not provide the official model_combine_setup body\/head paths/);
  assert.match(composerSource, /const parentAttachPath = resolveComposedBodyAttachPath/);
  assert.match(composerSource, /const childOriginPath = resolveComposedHeadOriginPath/);
  assert.match(composerSource, /childRootPath:\s*"face"/);
  assert.match(composerSource, /childOriginPath,/);
  assert.match(composerSource, /"face\/Position\/Hip\/Waist\/Spine\/Chest\/Neck"/);
  assert.doesNotMatch(composerSource, /runtimeMountPath/);
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
    /this\.currentSpringRuntime = this\.createSpringRuntime\(loaded\.prefabSourceGraph\.root\)/
  );
  assert.match(engineSource, /runtimePresent: boolean/);
  assert.match(engineSource, /active: boolean/);
  assert.match(engineSource, /const runtimePresent = Boolean\(utjRuntime\)/);
  assert.match(engineSource, /const active = Boolean\(utjRuntime\?\.enabled\)/);
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

test("capture returns the rendered canvas directly instead of racing a page screenshot", () => {
  const harnessSource = fs.readFileSync(
    path.join(repoRoot, "src/captureHarness.ts"),
    "utf8"
  );
  const serverSource = fs.readFileSync(
    path.join(repoRoot, "capture-server.mjs"),
    "utf8"
  );

  assert.match(harnessSource, /engine\.getCanvas\(\)\.toDataURL\("image\/png"\)/);
  assert.match(serverSource, /data:image\/png;base64,/);
  assert.doesNotMatch(serverSource, /Page\.captureScreenshot/);
});

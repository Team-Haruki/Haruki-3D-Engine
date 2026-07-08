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
  assert.ok(loaderSource.includes("findRegistryEntry(entry.characterId, \"head_optional\", entry.headCostume3dId, entry.unit)"));
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

  assert.match(dockerfile, /ARG CHROMIUM_DEBIAN_VERSION=147\.0\.7727\.137-1~deb12u1/);
  assert.match(dockerfile, /chromium=\$\{CHROMIUM_DEBIAN_VERSION\}/);
  assert.match(dockerfile, /chromium-common=\$\{CHROMIUM_DEBIAN_VERSION\}/);
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
  assert.match(harnessSource, /const requestedWarmupFrames = request\.warmupFrames \?\? config\.warmupFrames/);
  assert.match(harnessSource, /warmupFrames,\s*warmupMode:\s*request\.warmupMode \?\? config\.warmupMode/);
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

  assert.equal(runtimeOptions.cameraPreset, "capture");
  assert.equal(runtimeOptions.cameraProfile, "full-body");
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
    /this\.currentBodyAsset = characterAsset\.bodyAsset;\s+this\.currentHeadAsset = characterAsset\.headAsset;\s+this\.currentImportIsCombined = true;\s+(?:this\.lastConstraintSetupDiagnostics = null;\s+)?this\.applyCharacterHeight\(characterAsset\.bodyAsset\.characterHeightMeters \?\? this\.characterHeight\);/s
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

test("face sdf uses official face-only head light parameters", () => {
  const engineSource = fs.readFileSync(
    path.join(repoRoot, "src/engine/Haruki3DEngine.ts"),
    "utf8"
  );
  const shaderSource = fs.readFileSync(
    path.join(repoRoot, "src/materials/sekaiCharacterShader.ts"),
    "utf8"
  );

  assert.match(engineSource, /COSTUME_SHOP_DIRECTIONAL_LIGHT_ROTATION_DEGREES = new THREE\.Vector3\(-15, 50, 0\)/);
  assert.match(engineSource, /COSTUME_SHOP_FACE_SHADOW_LIGHT_DIRECTION = convertUnityDirectionToThree/);
  assert.match(shaderSource, /uniform vec2 uHeadDotDirectionalLight;/);
  assert.match(shaderSource, /uniform float uUseFaceShadowLimiter;/);
  assert.match(shaderSource, /uniform float uFaceShadowLimitRange;/);
  assert.match(shaderSource, /float officialSide = clamp\(uHeadDotDirectionalLight\.x, -1\.0, 1\.0\);/);
  assert.match(shaderSource, /float officialRange = clamp\(uHeadDotDirectionalLight\.y, 0\.0, 1\.0\);/);
  assert.match(engineSource, /export type FaceSdfDebugMode = "off" \| "sdf" \| "mask" \| "limit" \| "basis" \| "range";/);
  assert.match(engineSource, /-this\.faceUpWorld\.x,\s+-this\.faceUpWorld\.z/s);
  assert.match(engineSource, /updateSekaiFaceShadowParameters\(\s+material,\s+COSTUME_SHOP_FACE_SHADOW_LIGHT_DIRECTION,\s+this\.headDotDirectionalLight/s);
  assert.doesNotMatch(shaderSource, /rangeLimit \* uShadowWeight/);
  assert.match(shaderSource, /shadowValue = mix\(shadowValue, texture2D\(uShadowTex, vUv\)\.rgb, clamp\(uShadowTexWeight, 0\.0, 1\.0\)\)/);
  assert.match(shaderSource, /float hShadowOffset = \(uUseValueTex > 0\.5\) \? \(hMask \* 2\.0 - 1\.0\) : 0\.0;/);
  assert.match(shaderSource, /uniform float uFadeMode;/);
  assert.match(shaderSource, /uniform float uHueSinAngle;/);
  assert.match(shaderSource, /uniform float uHueCosAngle;/);
  assert.match(shaderSource, /uniform float uValue;/);
  assert.match(shaderSource, /uniform float uContrast;/);
  assert.match(shaderSource, /vec3 applyMaterialHsvc\(vec3 color\)/);
  assert.match(engineSource, /if \(material\.uniforms\.uHeadPosition\) \{\s+material\.uniforms\.uHeadPosition\.value\.copy\(this\.hairHeadPosition\);\s+\}/s);
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

test("head hair compatibility uses not-available patterns as a blacklist", () => {
  const composerSource = fs.readFileSync(
    path.join(repoRoot, "src/parts/runtimePartComposer.ts"),
    "utf8"
  );

  assert.match(composerSource, /buildDeniedCompatibilityKeys/);
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
  assert.match(shaderSource, /color = mix\(color, faceSkinLit, faceSkinMask \* 0\.58\)/);
  assert.match(engineSource, /shaderSkinColorDefault/);
  assert.match(engineSource, /shaderSkinColor1/);
  assert.match(engineSource, /shaderSkinColor2/);
  assert.match(engineSource, /bodyDebugMode\?: BodyDebugMode/);
  assert.match(engineSource, /faceSdfDebugMode\?: FaceSdfDebugMode/);
  assert.match(engineSource, /const COSTUME_SHOP_BODY_VALUE_SHADOW_INFLUENCE = 1\.0/);
  assert.match(engineSource, /private toonValueShadowInfluence = COSTUME_SHOP_BODY_VALUE_SHADOW_INFLUENCE/);
  assert.match(shaderSource, /float hShadowOffset = \(uUseValueTex > 0\.5\) \? \(hMask \* 2\.0 - 1\.0\) : 0\.0;/);
  assert.match(shaderSource, /float valueShadowInfluence = clamp\(uValueShadowInfluence, 0\.0, 1\.0\);/);
  assert.match(shaderSource, /float shadowBand = mix\(geometricShadowBand, hAdjustedShadowBand, valueShadowInfluence\);/);
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
  assert.match(shaderSource, /vertexRimMask = clamp\(vColor\.g, 0\.0, 1\.0\);/);
  assert.match(shaderSource, /float rimMask = vertexRimMask;/);
  assert.match(shaderSource, /vFaceShadowUv = uv1;/);
  assert.match(shaderSource, /texture2D\(uFaceShadowTex, sdfUv\)/);
  assert.match(shaderSource, /sdfMask \*= sideGate \* rangeGate;/);
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
  const runtimeLoaderSource = fs.readFileSync(
    path.join(repoRoot, "src/runtime/runtimePackageLoader.ts"),
    "utf8"
  );
  const engineSource = fs.readFileSync(
    path.join(repoRoot, "src/engine/Haruki3DEngine.ts"),
    "utf8"
  );

  assert.match(runtimeLoaderSource, /isAccessory: readBoolean\(slot\.isAccessory \?\? slot\.IsAccessory\)/);
  assert.match(runtimeLoaderSource, /fallbackMaterialKind === "accessory"/);
  assert.match(engineSource, /const isAccessory = Boolean\(slot\.isAccessory\) \|\| kind === "accessory"/);
  assert.match(engineSource, /material\.userData\.pjskIsAccessory = isAccessory/);
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
  const constraintRuntimeSource = fs.readFileSync(
    path.join(repoRoot, "src/engine/unityConstraintRuntime.ts"),
    "utf8"
  );

  assert.match(composerSource, /type RoleRuntimePackage =/);
  assert.match(composerSource, /resolveHeadOptionalAttachPath/);
  assert.match(composerSource, /sourceRendererTransformPath/);
  assert.match(composerSource, /constraintSetup:\s*\{/);
  assert.match(composerSource, /repair constraints after composition/);
  assert.match(loaderSource, /roleRuntimePath/);
  assert.match(loaderSource, /loadRoleRuntimePackages/);
  assert.match(engineSource, /applyCustomRoleDefaultMotion/);
  assert.match(engineSource, /nativeMeshes: this\.lastNativeMeshInstallDiagnostics/);
  assert.match(engineSource, /constraints: this\.lastConstraintSetupDiagnostics/);
  assert.match(engineSource, /applyUnityRuntimeConstraints/);
  assert.match(composerSource, /sourcePathId = remapNumericId/);
  assert.match(constraintRuntimeSource, /export function applyUnityRuntimeConstraints/);
  assert.match(constraintRuntimeSource, /constraint\.sources/);
  assert.match(constraintRuntimeSource, /transform name \$\{name\} matched \$\{candidates\.length\} nodes/);
  assert.match(constraintRuntimeSource, /parent constraint applied with height-scaled translation offsets/);
  assert.match(constraintRuntimeSource, /rotation constraint applied with weighted source rotations/);
  assert.match(constraintRuntimeSource, /aim constraint applied with exported aim\/up vectors/);
  assert.match(constraintRuntimeSource, /applyAimConstraint/);
  assert.match(constraintRuntimeSource, /worldUpObject/);
  assert.match(constraintRuntimeSource, /multiplyScalar\(characterHeight\)/);
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
  assert.match(engineSource, /CharacterDirectionalShadow/);
  assert.match(engineSource, /CharacterCrossShadow/);
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
  assert.match(engineSource, /!sameResolvedSelection[\s\S]*await this\.importCombinedCharacter\(combined,\s*\{/);
  assert.match(engineSource, /preserveAnimation:\s*!roleChanged/);
  assert.match(engineSource, /clearAnimationCache:\s*roleChanged/);
  assert.match(engineSource, /sameResolvedSelection[\s\S]*this\.resetCurrentSpringRuntimeState\(\)/);
  assert.match(engineSource, /if \(isEnabled && !wasEnabled\) \{\s*this\.resetAndSettleCurrentSpringRuntime\(60\);/);
  assert.doesNotMatch(engineSource, /settleCurrentPose\(\)/);
  assert.match(engineSource, /private async captureRolePartsInternal/);
  assert.match(engineSource, /activeRoleId !== nextRoleId[\s\S]*this\.releaseCurrentCharacterResources\(\{/);
  assert.match(engineSource, /partSet\?\.packages\.clear\(\)/);
  assert.match(engineSource, /partSet\?\.roleRuntimes\.clear\(\)/);
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

test("capture harness only forces spring entry warmup for the first image in a role sequence", () => {
  const captureHarnessSource = fs.readFileSync(
    path.join(repoRoot, "src/captureHarness.ts"),
    "utf8"
  );

  assert.match(captureHarnessSource, /const ROLE_ENTRY_WARMUP_FRAMES = 60;/);
  assert.match(captureHarnessSource, /let settledCaptureRoleId: string \| null = null;/);
  assert.match(captureHarnessSource, /const requestedWarmupFrames = request\.warmupFrames \?\? config\.warmupFrames;/);
  assert.match(captureHarnessSource, /settledCaptureRoleId === request\.roleId\s+\?\s+requestedWarmupFrames\s+:\s+Math\.max\(requestedWarmupFrames, ROLE_ENTRY_WARMUP_FRAMES\)/);
  assert.match(captureHarnessSource, /settledCaptureRoleId = request\.roleId;/);
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
  assert.match(harnessSource, /await ensureCaptureRuntimePackage\(config\);\s+engine\.setUtjSpringBoneTraceFilters/s);
  assert.match(engineSource, /traceUtjBones\?: string\[\]/);
  assert.match(engineSource, /springDebugBones\?: string\[\]/);
  assert.match(engineSource, /getSnapshots\(\{\s+springDebugBones: request\.springDebugBones/s);
  assert.match(springSource, /debugOffsets/);
  assert.match(springSource, /springDebugAllOffsets/);
});

test("unity-prefab SpringBone keeps direct serialized colliders out of manager-cache filtering", () => {
  const prefabSpringSource = fs.readFileSync(
    path.join(repoRoot, "src/engine/unityPrefabSpringRuntimeAdapter.ts"),
    "utf8"
  );
  const utjSpringSource = fs.readFileSync(
    path.join(repoRoot, "src/engine/utjSpringBoneRuntimeAdapter.ts"),
    "utf8"
  );

  assert.match(prefabSpringSource, /bindingKind === "colliderFlag" && candidateRoots\.size > 0/);
  assert.doesNotMatch(prefabSpringSource, /filterCollidersByManagerCache\(directColliders/);
  assert.match(prefabSpringSource, /direct serialized collider references \/ pose root preference/);
  assert.doesNotMatch(utjSpringSource, /filterCollidersByManagerCache\(group\.colliders/);
  assert.match(utjSpringSource, /direct serialized collider references \/ pose root preference/);
});

test("utj SpringBone runtime includes official force provider variants", () => {
  const utjSpringSource = fs.readFileSync(
    path.join(repoRoot, "src/engine/utjSpringBoneRuntimeAdapter.ts"),
    "utf8"
  );

  assert.match(utjSpringSource, /type RuntimeForceProvider = RuntimeForceVolume \| RuntimeWindVolume \| RuntimeWindVolumeOneSelf/);
  assert.match(utjSpringSource, /kind: "ForceVolume"/);
  assert.match(utjSpringSource, /kind: "WindVolume"/);
  assert.match(utjSpringSource, /computeForceVolume/);
  assert.match(utjSpringSource, /computeWindVolume/);
  assert.match(utjSpringSource, /positionalMultiplier/);
  assert.match(utjSpringSource, /offsetVector/);
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
  assert.match(extraBoneSource, /function readExtraBoneEntries/);
  assert.match(extraBoneSource, /partRecord\?\.extraBones \?\? partRecord\?\.ExtraBones/);
  assert.doesNotMatch(extraBoneSource, /EX_/);
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

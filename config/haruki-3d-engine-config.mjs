import fs from "node:fs";
import path from "node:path";

export const defaultEngineConfigPath = path.resolve("haruki-3d-engine.config.json");
export const defaultProjectedShadowSettings = {
  width: 0.72,
  height: 1.06,
  opacity: 0.28,
  crossSize: 0.46,
  crossOpacity: 0.22,
  floorY: 0,
  adjustShadow: false,
  adjustAlpha: true,
  invisibleHeight: 0.2,
  directionalShadow: false,
};

export function loadEngineConfig(configPath = defaultEngineConfigPath) {
  const resolved = path.resolve(configPath);
  if (!fs.existsSync(resolved)) {
    return {};
  }
  const parsed = JSON.parse(fs.readFileSync(resolved, "utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Engine config must be a JSON object: ${resolved}`);
  }
  return parsed;
}

export function resolveCaptureRuntimeOptions(config, cliOptions) {
  const capture = object(config.capture);
  const chromium = object(config.chromium);
  const projectedShadow = projectedShadowSettings(capture, {}, cliOptions.projectedShadow);
  return {
    ...cliOptions,
    phase: numberValue(cliOptions.phase, capture.phase, 0.5),
    clip: stringValue(cliOptions.clip, capture.clip, "motion_loop"),
    width: intAtLeast(cliOptions.width, capture.width, 1400, 320),
    height: intAtLeast(cliOptions.height, capture.height, 1000, 320),
    scale: clampNumber(cliOptions.scale, capture.scale, 1, 1, 2),
    timeoutMs: intAtLeast(cliOptions.timeoutMs, capture.timeoutMs, 45000, 5000),
    warmupMs: intAtLeast(cliOptions.warmupMs, capture.warmupMs, 0, 0),
    warmupFrames: intAtLeast(cliOptions.warmupFrames, capture.warmupFrames, 0, 0),
    warmupMode: stringValue(cliOptions.warmupMode, capture.warmupMode, "animation"),
    bodyDebugMode: stringValue(cliOptions.bodyDebugMode, capture.bodyDebugMode, "off"),
    renderIsolation: stringValue(cliOptions.renderIsolation, capture.renderIsolation, "normal"),
    springRuntimeMode: springRuntimeMode(cliOptions.springRuntimeMode, capture.springRuntimeMode),
    cameraPreset: cameraPreset(cliOptions.cameraPreset, capture.cameraPreset),
    cameraProfile: cameraProfile(cliOptions.cameraProfile, capture.cameraProfile),
    projectedShadow,
    chromium: stringValue(cliOptions.chromium, process.env.CHROMIUM, chromium.executable, "chromium"),
  };
}

export function resolveCaptureServerOptions(config, env = process.env) {
  const capture = object(config.capture);
  const chromium = object(config.chromium);
  const server = object(config.server);
  const projectedShadow = projectedShadowSettings(capture, env);
  return {
    runtimeRoot: path.resolve(stringValue(env.HARUKI_RUNTIME_ROOT, capture.runtimeRoot, "/data/runtime")),
    captureOutputDir: path.resolve(stringValue(env.HARUKI_CAPTURE_OUTPUT_DIR, capture.outputDir, "/data/captures")),
    chromiumPath: stringValue(env.CHROMIUM, chromium.executable, "chromium"),
    port: intAtLeast(env.PORT, server.port, 8080, 1),
    defaultWidth: intAtLeast(env.HARUKI_CAPTURE_WIDTH, capture.width, 1400, 320),
    defaultHeight: intAtLeast(env.HARUKI_CAPTURE_HEIGHT, capture.height, 1000, 320),
    defaultScale: clampNumber(env.HARUKI_CAPTURE_SCALE, capture.scale, 1, 1, 2),
    defaultTimeoutMs: intAtLeast(env.HARUKI_CAPTURE_TIMEOUT_MS, capture.timeoutMs, 45000, 5000),
    defaultPhase: numberValue(env.HARUKI_CAPTURE_PHASE, capture.phase, 0.5),
    defaultClip: stringValue(env.HARUKI_CAPTURE_CLIP, capture.clip, "motion_loop"),
    defaultWarmupMs: intAtLeast(env.HARUKI_CAPTURE_WARMUP_MS, capture.warmupMs, 0, 0),
    defaultWarmupFrames: intAtLeast(env.HARUKI_CAPTURE_WARMUP_FRAMES, capture.warmupFrames, 0, 0),
    defaultWarmupMode: stringValue(env.HARUKI_CAPTURE_WARMUP_MODE, capture.warmupMode, "animation"),
    defaultSpringRuntimeMode: springRuntimeMode(
      env.HARUKI_CAPTURE_SPRING_RUNTIME_MODE,
      env.HARUKI_SPRING_RUNTIME_MODE,
      capture.springRuntimeMode
    ),
    defaultCameraPreset: cameraPreset(
      env.HARUKI_CAPTURE_CAMERA_PRESET,
      env.HARUKI_CAMERA_PRESET,
      capture.cameraPreset
    ),
    defaultCameraProfile: cameraProfile(
      env.HARUKI_CAPTURE_CAMERA_PROFILE,
      env.HARUKI_CAMERA_PROFILE,
      capture.cameraProfile
    ),
    defaultFaceSdfEnabled: boolValue(
      env.HARUKI_CAPTURE_FACE_SDF_ENABLED,
      env.HARUKI_FACE_SDF_ENABLED,
      capture.faceSdfEnabled
    ) ?? false,
    defaultProjectedShadow: projectedShadow,
    tempCaptureTtlMs: durationMsAtLeast(env.HARUKI_CAPTURE_TEMP_TTL, capture.tempTtl, "6h", 0),
    tempCaptureMaxBytes: sizeBytesAtLeast(env.HARUKI_CAPTURE_TEMP_MAX_BYTES, capture.tempMaxBytes, "2.5GB", 0),
    captureGCIntervalMs: durationMsAtLeast(env.HARUKI_CAPTURE_GC_INTERVAL, capture.gcInterval, "1h", 0),
    idleShutdownMs: durationMsAtLeast(env.HARUKI_CAPTURE_IDLE_SHUTDOWN, capture.idleShutdown, "1h", 0),
  };
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function stringValue(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return "";
}

function numberValue(...values) {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return 0;
}

function intAtLeast(primary, secondary, fallback, min) {
  return Math.max(Math.trunc(numberValue(primary, secondary, fallback)) || fallback, min);
}

function clampNumber(primary, secondary, fallback, min, max) {
  return Math.min(Math.max(numberValue(primary, secondary, fallback) || fallback, min), max);
}

function boolValue(...values) {
  for (const value of values) {
    if (typeof value === "boolean") {
      return value;
    }
    if (typeof value === "string" && value.trim()) {
      const normalized = value.trim().toLowerCase();
      if (["1", "true", "yes", "on"].includes(normalized)) {
        return true;
      }
      if (["0", "false", "no", "off"].includes(normalized)) {
        return false;
      }
    }
  }
  return undefined;
}

function optionalNumber(...values) {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function projectedShadowSettings(capture, env = {}, override = undefined) {
  const config = object(capture.projectedShadow);
  const input = object(override);
  return {
    width: Math.max(
      optionalNumber(input.width, env.HARUKI_CAPTURE_PROJECTED_SHADOW_WIDTH, config.width, defaultProjectedShadowSettings.width),
      0.001
    ),
    height: Math.max(
      optionalNumber(input.height, env.HARUKI_CAPTURE_PROJECTED_SHADOW_HEIGHT, config.height, defaultProjectedShadowSettings.height),
      0.001
    ),
    opacity: Math.min(Math.max(
      optionalNumber(input.opacity, env.HARUKI_CAPTURE_PROJECTED_SHADOW_OPACITY, config.opacity, defaultProjectedShadowSettings.opacity),
      0
    ), 1),
    crossSize: Math.max(
      optionalNumber(input.crossSize, env.HARUKI_CAPTURE_CROSS_SHADOW_SIZE, config.crossSize, defaultProjectedShadowSettings.crossSize),
      0.001
    ),
    crossOpacity: Math.min(Math.max(
      optionalNumber(input.crossOpacity, env.HARUKI_CAPTURE_CROSS_SHADOW_OPACITY, config.crossOpacity, defaultProjectedShadowSettings.crossOpacity),
      0
    ), 1),
    floorY: optionalNumber(input.floorY, env.HARUKI_CAPTURE_PROJECTED_SHADOW_FLOOR_Y, config.floorY, defaultProjectedShadowSettings.floorY),
    adjustShadow: boolValue(input.adjustShadow, env.HARUKI_CAPTURE_PROJECTED_SHADOW_ADJUST, config.adjustShadow) ??
      defaultProjectedShadowSettings.adjustShadow,
    adjustAlpha: boolValue(input.adjustAlpha, env.HARUKI_CAPTURE_PROJECTED_SHADOW_ADJUST_ALPHA, config.adjustAlpha) ??
      defaultProjectedShadowSettings.adjustAlpha,
    invisibleHeight: Math.max(
      optionalNumber(input.invisibleHeight, env.HARUKI_CAPTURE_PROJECTED_SHADOW_INVISIBLE_HEIGHT, config.invisibleHeight, defaultProjectedShadowSettings.invisibleHeight),
      0.001
    ),
    directionalShadow: boolValue(input.directionalShadow, env.HARUKI_CAPTURE_PROJECTED_SHADOW_DIRECTIONAL, config.directionalShadow) ??
      defaultProjectedShadowSettings.directionalShadow,
  };
}

function durationMsAtLeast(primary, secondary, fallback, min) {
  const value = durationMsValue(primary, secondary, fallback);
  return Math.max(Math.trunc(value), min);
}

function sizeBytesAtLeast(primary, secondary, fallback, min) {
  const value = sizeBytesValue(primary, secondary, fallback);
  return Math.max(Math.trunc(value), min);
}

function durationMsValue(...values) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value !== "string" || !value.trim()) {
      continue;
    }
    const trimmed = value.trim();
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
    const match = trimmed.match(/^(\d+(?:\.\d+)?)(ms|s|m|h)$/i);
    if (!match) {
      continue;
    }
    const amount = Number(match[1]);
    const unit = match[2].toLowerCase();
    const multiplier = unit === "h" ? 3600000 : unit === "m" ? 60000 : unit === "s" ? 1000 : 1;
    return amount * multiplier;
  }
  return 0;
}

function sizeBytesValue(...values) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value !== "string" || !value.trim()) {
      continue;
    }
    const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*([kmgt]?i?b?)?$/i);
    if (!match) {
      continue;
    }
    const amount = Number(match[1]);
    if (!Number.isFinite(amount)) {
      continue;
    }
    const unit = (match[2] || "b").toLowerCase();
    const multipliers = {
      b: 1,
      kb: 1000,
      mb: 1000 ** 2,
      gb: 1000 ** 3,
      tb: 1000 ** 4,
      kib: 1024,
      mib: 1024 ** 2,
      gib: 1024 ** 3,
      tib: 1024 ** 4,
      k: 1000,
      m: 1000 ** 2,
      g: 1000 ** 3,
      t: 1000 ** 4,
    };
    return amount * (multipliers[unit] ?? 1);
  }
  return 0;
}

function springRuntimeMode(primary, secondary) {
  const value = stringValue(primary, secondary, "unity-prefab");
  return value === "off" ? "off" : "unity-prefab";
}

function cameraPreset(primary, secondary) {
  const value = stringValue(primary, secondary, "capture");
  return normalizeCameraPreset(value);
}

function normalizeCameraPreset(value) {
  return value === "default" ? "default" : "capture";
}

function cameraProfile(primary, secondary, tertiary) {
  const value = stringValue(primary, secondary, tertiary, "full-body");
  return normalizeCameraProfile(value);
}

function normalizeCameraProfile(value) {
  return value === "official-default" ? "official-default" : "full-body";
}

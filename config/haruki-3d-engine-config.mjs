import fs from "node:fs";
import path from "node:path";

export const defaultEngineConfigPath = path.resolve("haruki-3d-engine.config.json");

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
    chromium: stringValue(cliOptions.chromium, process.env.CHROMIUM, chromium.executable, "chromium"),
  };
}

export function resolveCaptureServerOptions(config, env = process.env) {
  const capture = object(config.capture);
  const chromium = object(config.chromium);
  const server = object(config.server);
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
    defaultSpringRuntimeMode: springRuntimeMode(
      env.HARUKI_SPRING_RUNTIME_MODE,
      capture.springRuntimeMode
    ),
    defaultCameraPreset: cameraPreset(env.HARUKI_CAMERA_PRESET, capture.cameraPreset),
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

function springRuntimeMode(primary, secondary) {
  const value = stringValue(primary, secondary, "unity-prefab");
  return value === "off" ? "off" : "unity-prefab";
}

function cameraPreset(primary, secondary) {
  const value = stringValue(primary, secondary, "id5-debug");
  return value === "default" ? "default" : "id5-debug";
}

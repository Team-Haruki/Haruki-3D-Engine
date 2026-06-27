import {
  Haruki3DEngine,
  previewLightDefaults,
  type BodyDebugMode,
  type HarukiCaptureRolePartsRequest,
  type HarukiCaptureRolePartsResult,
  type PjskCameraPreset,
  type RenderIsolationMode,
} from "./index";
import {
  characterYawDegreesByMode,
  type CharacterYawMode,
  type SpringRuntimeMode,
} from "./config/viewerConfig";

type CaptureWindow = Window & {
  __PJSK_CAPTURE_READY__?: boolean;
  __PJSK_CAPTURE_ERROR__?: string;
  __PJSK_CAPTURE_SNAPSHOT__?: unknown;
  __HARUKI_CAPTURE_REQUEST__?: (
    request: HarukiCaptureRolePartsRequest
  ) => Promise<HarukiCaptureRolePartsResult>;
};

type CaptureConfig = {
  baseUrl: string;
  fullRuntimeOnly: boolean;
  phase: number;
  clip: "motion" | "motion_loop";
  warmupMs: number;
  warmupFrames: number;
  warmupMode: "animation" | "runtime";
  bodyDebugMode: BodyDebugMode;
  renderIsolation: RenderIsolationMode;
  springRuntimeMode: SpringRuntimeMode;
  cameraPreset: PjskCameraPreset;
  characterYawMode: CharacterYawMode | null;
  utjTraceBones: string[];
  utjTraceMaxEvents: number;
};

const root = document.querySelector<HTMLElement>("#capture-root");

if (!root) {
  throw new Error("Missing #capture-root");
}

const engine = new Haruki3DEngine({
  container: root,
  initialLight: { ...previewLightDefaults },
  presentationMode: "capture",
  cameraPreset: "id5-debug",
  autoRender: false,
  manageResize: false,
});

let captureRuntimePackagePromise: Promise<void> | null = null;

function getCaptureWindow() {
  return window as CaptureWindow;
}

function readCaptureConfig(): CaptureConfig | null {
  const params = new URLSearchParams(window.location.search);
  const baseUrl = params.get("captureBase");
  if (!baseUrl) {
    return null;
  }
  const phase = Number(params.get("capturePhase") ?? "0.5");
  const clipParam = params.get("captureClip");
  const warmupMs = Number(params.get("captureWarmupMs") ?? "0");
  const warmupFrames = Number(params.get("captureWarmupFrames") ?? "0");
  const warmupModeParam = params.get("captureWarmupMode");
  const traceMaxEvents = Number(params.get("utjTraceMaxEvents") ?? "240");
  const yawMode = params.get("characterYawMode");
  return {
    baseUrl,
    fullRuntimeOnly: params.get("captureFullRuntimeOnly") === "true",
    phase: clamp01(Number.isFinite(phase) ? phase : 0.5),
    clip: clipParam === "motion" ? "motion" : "motion_loop",
    warmupMs: Math.max(Math.trunc(Number.isFinite(warmupMs) ? warmupMs : 0), 0),
    warmupFrames: Math.max(Math.trunc(Number.isFinite(warmupFrames) ? warmupFrames : 0), 0),
    warmupMode: warmupModeParam === "runtime" ? "runtime" : "animation",
    bodyDebugMode: readBodyDebugMode(params),
    renderIsolation: readRenderIsolationMode(params),
    springRuntimeMode: readSpringRuntimeMode(params),
    cameraPreset: readCameraPreset(params),
    characterYawMode: isCharacterYawMode(yawMode) ? yawMode : null,
    utjTraceBones: params
      .getAll("utjTraceBone")
      .flatMap((value) => value.split(","))
      .map((value) => value.trim())
      .filter(Boolean),
    utjTraceMaxEvents: Math.max(Math.trunc(Number.isFinite(traceMaxEvents) ? traceMaxEvents : 240), 1),
  };
}

function clamp01(value: number) {
  return Math.min(Math.max(value, 0), 1);
}

function readBodyDebugMode(params: URLSearchParams): BodyDebugMode {
  const mode = params.get("bodyDebugMode");
  switch (mode) {
    case "skin":
    case "neck":
    case "contact":
    case "h_r":
    case "h_g":
    case "h_b":
    case "h_a":
    case "vertex_r":
    case "vertex_g":
    case "base_shadow":
    case "ndotl_raw":
    case "h_b_adjusted_shadow":
    case "ambient_target":
    case "ambient_weight":
    case "ambient_tint":
    case "specular":
    case "specular_mask":
    case "specular_add":
    case "rim_raw":
    case "rim_add":
    case "rim_gate":
    case "rim_color":
    case "rim_scalar":
    case "toon_luma":
    case "shadow_mask":
    case "shadow_target":
      return mode;
    default:
      return "off";
  }
}

function readRenderIsolationMode(params: URLSearchParams): RenderIsolationMode {
  const mode = params.get("renderIsolation");
  switch (mode) {
    case "face_sdf":
    case "no_face_sdf":
    case "no_face_layers":
    case "no_eye_through_hair":
    case "eye_through_hair_only":
    case "eye_through_hair_eye_only":
    case "eye_through_hair_eyebrow_only":
    case "eye_through_hair_eyelash_only":
    case "no_eye_through_hair_eye":
    case "no_eye_through_hair_eyebrow":
    case "no_eye_through_hair_eyelash":
    case "no_eye_through_hair_eyelash_overlay":
    case "no_eye_through_hair_eyelash_prepass":
    case "eyelight_only":
    case "no_eyelight":
    case "outline_only":
    case "no_outline":
    case "no_body_outline":
    case "no_hair_outline":
    case "no_face_outline":
      return mode;
    default:
      return "normal";
  }
}

function readSpringRuntimeMode(params: URLSearchParams): SpringRuntimeMode {
  const mode = params.get("springRuntimeMode");
  if (mode === "off" || mode === "unity-prefab") {
    return mode;
  }
  if (mode === "webgl-utj" || params.get("utjSpringBoneEnabled") === "true") {
    return "unity-prefab";
  }
  return "unity-prefab";
}

function readCameraPreset(params: URLSearchParams): PjskCameraPreset {
  return params.get("cameraPreset") === "default" ? "default" : "id5-debug";
}

function isCharacterYawMode(value: string | null): value is CharacterYawMode {
  return value === "0" ||
    value === "45" ||
    value === "-45" ||
    value === "90" ||
    value === "-90" ||
    value === "180";
}

function setCaptureError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  document.body.dataset.captureError = message;
  getCaptureWindow().__PJSK_CAPTURE_ERROR__ = message;
}

async function ensureCaptureRuntimePackage(config: CaptureConfig) {
  if (!captureRuntimePackagePromise) {
    captureRuntimePackagePromise = engine.loadRuntimePackage({
      baseUrl: config.baseUrl,
      fullRuntimeOnly: config.fullRuntimeOnly,
      deferDefaultSelection: !config.fullRuntimeOnly,
      applyDefaultAnimation: config.fullRuntimeOnly,
      applyFaceMotion: config.fullRuntimeOnly,
    }).then(() => undefined, (error) => {
      captureRuntimePackagePromise = null;
      throw error;
    });
  }
  await captureRuntimePackagePromise;
}

getCaptureWindow().__HARUKI_CAPTURE_REQUEST__ = async (
  request: HarukiCaptureRolePartsRequest
) => {
  try {
    const config = readCaptureConfig();
    if (!config) {
      throw new Error("Missing captureBase for role parts capture.");
    }
    getCaptureWindow().__PJSK_CAPTURE_READY__ = false;
    getCaptureWindow().__PJSK_CAPTURE_ERROR__ = "";
    document.body.dataset.captureReady = "false";
    document.body.dataset.captureError = "";
    await ensureCaptureRuntimePackage(config);
    engine.setViewportSize(root.clientWidth, root.clientHeight);
    const result = await engine.captureRoleParts({
      ...request,
      phase: request.phase ?? config.phase,
      cameraPreset: request.cameraPreset ?? config.cameraPreset,
    });
    await waitForAnimationFrames(2);
    getCaptureWindow().__PJSK_CAPTURE_SNAPSHOT__ = result.snapshots;
    getCaptureWindow().__PJSK_CAPTURE_READY__ = true;
    document.body.dataset.captureReady = "true";
    return result;
  } catch (error) {
    setCaptureError(error);
    throw error;
  }
};

function waitForAnimationFrames(count: number) {
  return new Promise<void>((resolve) => {
    const step = (remaining: number) => {
      if (remaining <= 0) {
        resolve();
        return;
      }
      requestAnimationFrame(() => step(remaining - 1));
    };
    step(count);
  });
}

async function prepareCaptureFrame(config: CaptureConfig) {
  engine.setAnimationPaused(true);
  const seekTargetPhase = () => config.clip === "motion"
    ? engine.seekAnimationPhase(config.phase)
    : engine.seekAnimationLoopPhase(config.phase);

  seekTargetPhase();

  if (config.warmupFrames > 0) {
    const advanceAnimation = config.warmupMode === "animation";
    engine.setAnimationPaused(!advanceAnimation);
    for (let index = 0; index < config.warmupFrames; index += 1) {
      engine.stepCaptureFrame(1 / 60, advanceAnimation);
    }
    engine.setAnimationPaused(true);
  } else if (config.warmupMs > 0) {
    engine.setAnimationPaused(config.warmupMode === "runtime");
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, config.warmupMs);
    });
    engine.setAnimationPaused(true);
  }

  seekTargetPhase();
  engine.stepCaptureFrame(0, false);
  engine.frameCurrentCharacterForCapture();
  engine.applyCameraPreset(config.cameraPreset);
  engine.shiftCameraRight(1);
  engine.renderFrame();
  await waitForAnimationFrames(3);
  const snapshots = engine.getSnapshots();
  getCaptureWindow().__PJSK_CAPTURE_SNAPSHOT__ = {
    phase: config.phase,
    requestedClip: config.clip,
    springRuntimeMode: config.springRuntimeMode,
    bodyDebugMode: config.bodyDebugMode,
    renderIsolation: config.renderIsolation,
    cameraPreset: config.cameraPreset,
    animation: snapshots.animation,
    faceMotion: snapshots.faceMotion,
    springBone: snapshots.springBone,
    materialDebug: snapshots.runtimeDebug,
    utjSpringBoneTrace: engine.getUtjSpringBoneTraceSnapshot(),
  };
  getCaptureWindow().__PJSK_CAPTURE_READY__ = true;
  document.body.dataset.captureReady = "true";
}

async function bootstrapCapture() {
  const config = readCaptureConfig();
  if (!config) {
    return;
  }
  try {
    getCaptureWindow().__PJSK_CAPTURE_READY__ = false;
    document.body.dataset.captureReady = "false";
    engine.setPresentationMode("capture");
    engine.setSpringRuntimeMode(config.springRuntimeMode);
    engine.setBodyDebugMode(config.bodyDebugMode);
    engine.setRenderIsolationMode(config.renderIsolation);
    engine.applyCameraPreset(config.cameraPreset);
    if (config.characterYawMode) {
      engine.setCharacterYawDegrees(characterYawDegreesByMode[config.characterYawMode]);
    }
    engine.setUtjSpringBoneTraceFilters(
      config.utjTraceBones,
      config.utjTraceMaxEvents
    );
    await ensureCaptureRuntimePackage(config);
    if (config.fullRuntimeOnly) {
      await prepareCaptureFrame(config);
    } else {
      getCaptureWindow().__PJSK_CAPTURE_READY__ = true;
      document.body.dataset.captureReady = "true";
    }
  } catch (error) {
    setCaptureError(error);
  }
}

void bootstrapCapture();

window.addEventListener("beforeunload", () => engine.destroy());

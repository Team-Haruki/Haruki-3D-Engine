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

type CaptureCharacterYawMode = CharacterYawMode | "face-camera";

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
  characterYawMode: CaptureCharacterYawMode | null;
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
  cameraPreset: "capture",
  autoRender: false,
  manageResize: false,
});

let captureRuntimePackagePromise: Promise<void> | null = null;
let captureRuntimePackageRoleId: string | null = null;

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
    characterYawMode: isCaptureCharacterYawMode(yawMode) ? yawMode : null,
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
  return normalizeCameraPreset(params.get("cameraPreset"));
}

function normalizeCameraPreset(value: string | null): PjskCameraPreset {
  return value === "default" ? "default" : "capture";
}

function isCharacterYawMode(value: string | null): value is CharacterYawMode {
  return value === "0" ||
    value === "45" ||
    value === "-45" ||
    value === "90" ||
    value === "-90" ||
    value === "180";
}

function isCaptureCharacterYawMode(value: string | null): value is CaptureCharacterYawMode {
  return value === "face-camera" || isCharacterYawMode(value);
}

function setCaptureError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  document.body.dataset.captureError = message;
  getCaptureWindow().__PJSK_CAPTURE_ERROR__ = message;
}

async function ensureCaptureRuntimePackage(config: CaptureConfig, roleId: string) {
  if (captureRuntimePackagePromise && captureRuntimePackageRoleId !== roleId) {
    captureRuntimePackagePromise = null;
    captureRuntimePackageRoleId = null;
  }
  if (!captureRuntimePackagePromise) {
    captureRuntimePackageRoleId = roleId;
    captureRuntimePackagePromise = engine.loadRuntimePackage({
      baseUrl: config.baseUrl,
      fullRuntimeOnly: config.fullRuntimeOnly,
      deferDefaultSelection: !config.fullRuntimeOnly,
      roleId,
      applyDefaultAnimation: config.fullRuntimeOnly,
      applyFaceMotion: config.fullRuntimeOnly,
    }).then(() => undefined, (error) => {
      captureRuntimePackagePromise = null;
      captureRuntimePackageRoleId = null;
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
    await ensureCaptureRuntimePackage(config, request.roleId);
    engine.setViewportSize(root.clientWidth, root.clientHeight);
    const result = await engine.captureRoleParts({
      ...request,
      phase: request.phase ?? config.phase,
      warmupFrames: request.warmupFrames ?? config.warmupFrames,
      warmupMode: request.warmupMode ?? config.warmupMode,
      cameraPreset: request.cameraPreset ?? config.cameraPreset,
      characterYawMode: request.characterYawMode ?? config.characterYawMode ?? undefined,
    });
    const snapshots = {
      ...result.snapshots,
      utjSpringBoneTrace: engine.getUtjSpringBoneTraceSnapshot(),
    };
    const resultWithTrace = {
      ...result,
      snapshots,
    };
    await waitForAnimationFrames(2);
    getCaptureWindow().__PJSK_CAPTURE_SNAPSHOT__ = snapshots;
    getCaptureWindow().__PJSK_CAPTURE_READY__ = true;
    document.body.dataset.captureReady = "true";
    return resultWithTrace;
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
  await engine.prepareCaptureFrame({
    phase: config.phase,
    clip: config.clip,
    warmupMs: config.warmupMs,
    warmupFrames: config.warmupFrames,
    warmupMode: config.warmupMode,
    cameraPreset: config.cameraPreset,
    characterYawMode: config.characterYawMode ?? undefined,
    traceUtjBones: config.utjTraceBones,
    traceUtjMaxEvents: config.utjTraceMaxEvents,
  });
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
    if (config.characterYawMode && config.characterYawMode !== "face-camera") {
      engine.setCharacterYawDegrees(characterYawDegreesByMode[config.characterYawMode]);
    }
    await ensureCaptureRuntimePackage(config);
    engine.setUtjSpringBoneTraceFilters(
      config.utjTraceBones,
      config.utjTraceMaxEvents
    );
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

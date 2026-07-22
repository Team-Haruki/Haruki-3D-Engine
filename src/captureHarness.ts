import {
  Haruki3DEngine,
  previewLightDefaults,
  type BodyDebugMode,
  type PjskCameraProfile,
  type PjskCameraPreset,
  type ProjectedShadowSettingsInput,
  type RenderIsolationMode,
} from "./internal";
import { HarukiCaptureAdapter } from "./capture/captureAdapter";
import type {
  HarukiCaptureRolePartsRequest,
  HarukiCaptureRolePartsResult,
} from "./capture/captureTypes";
import {
  type FaceSdfDebugLightMode,
  type FaceSdfDebugMode,
} from "./engine/Haruki3DEngine";
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
  ) => Promise<{ snapshots: HarukiCaptureRolePartsResult["snapshots"] }>;
};

type CaptureCharacterYawMode = CharacterYawMode | "face-camera";

type CaptureConfig = {
  baseUrl: string;
  phase: number;
  clip: "motion" | "motion_loop";
  warmupMs: number;
  warmupFrames: number;
  warmupMode: "animation" | "runtime";
  bodyDebugMode: BodyDebugMode;
  faceSdfEnabled: boolean;
  faceSdfDebugMode: FaceSdfDebugMode;
  faceSdfDebugLightMode: FaceSdfDebugLightMode;
  renderIsolation: RenderIsolationMode;
  springRuntimeMode: SpringRuntimeMode;
  cameraPreset: PjskCameraPreset;
  cameraProfile: PjskCameraProfile;
  characterYawMode: CaptureCharacterYawMode | null;
  projectedShadow: ProjectedShadowSettingsInput;
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
  enableControls: false,
});
const captureAdapter = new HarukiCaptureAdapter(engine);

const ROLE_ENTRY_WARMUP_FRAMES = 60;
let settledCapturePackageKey: string | null = null;

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
    phase: clamp01(Number.isFinite(phase) ? phase : 0.5),
    clip: clipParam === "motion" ? "motion" : "motion_loop",
    warmupMs: Math.max(Math.trunc(Number.isFinite(warmupMs) ? warmupMs : 0), 0),
    warmupFrames: Math.max(Math.trunc(Number.isFinite(warmupFrames) ? warmupFrames : 0), 0),
    warmupMode: warmupModeParam === "runtime" ? "runtime" : "animation",
    bodyDebugMode: readBodyDebugMode(params),
    faceSdfEnabled: readBoolean(params.get("faceSdfEnabled")),
    faceSdfDebugMode: readFaceSdfDebugMode(params),
    faceSdfDebugLightMode: readFaceSdfDebugLightMode(params),
    renderIsolation: readRenderIsolationMode(params),
    springRuntimeMode: readSpringRuntimeMode(params),
    cameraPreset: readCameraPreset(params),
    cameraProfile: readCameraProfile(params),
    characterYawMode: isCaptureCharacterYawMode(yawMode) ? yawMode : null,
    projectedShadow: readProjectedShadowSettings(params),
    utjTraceBones: params
      .getAll("utjTraceBone")
      .flatMap((value) => value.split(","))
      .map((value) => value.trim())
      .filter(Boolean),
    utjTraceMaxEvents: Math.max(Math.trunc(Number.isFinite(traceMaxEvents) ? traceMaxEvents : 240), 1),
  };
}

function readOptionalNumber(value: string | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function readOptionalBoolean(value: string | null) {
  if (value === "true" || value === "1") {
    return true;
  }
  if (value === "false" || value === "0") {
    return false;
  }
  return undefined;
}

function readProjectedShadowSettings(params: URLSearchParams): ProjectedShadowSettingsInput {
  return {
    width: readOptionalNumber(params.get("projectedShadowWidth")),
    height: readOptionalNumber(params.get("projectedShadowHeight")),
    opacity: readOptionalNumber(params.get("projectedShadowOpacity")),
    crossSize: readOptionalNumber(params.get("crossShadowSize")),
    crossOpacity: readOptionalNumber(params.get("crossShadowOpacity")),
    floorY: readOptionalNumber(params.get("projectedShadowFloorY")),
    adjustShadow: readOptionalBoolean(params.get("projectedShadowAdjust")),
    adjustAlpha: readOptionalBoolean(params.get("projectedShadowAdjustAlpha")),
    invisibleHeight: readOptionalNumber(params.get("projectedShadowInvisibleHeight")),
    directionalShadow: readOptionalBoolean(params.get("projectedShadowDirectional")),
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

function readBoolean(value: string | null) {
  return value === "true" || value === "1";
}

function readFaceSdfDebugMode(params: URLSearchParams): FaceSdfDebugMode {
  const mode = params.get("faceSdfDebugMode");
  switch (mode) {
    case "sdf":
    case "mask":
    case "limit":
    case "basis":
    case "range":
      return mode;
    default:
      return "off";
  }
}

function readFaceSdfDebugLightMode(params: URLSearchParams): FaceSdfDebugLightMode {
  const mode = params.get("faceSdfDebugLightMode");
  switch (mode) {
    case "front":
    case "left":
    case "right":
    case "back":
      return mode;
    default:
      return "scene";
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
  return "unity-prefab";
}

function readCameraPreset(params: URLSearchParams): PjskCameraPreset {
  return normalizeCameraPreset(params.get("cameraPreset"));
}

function normalizeCameraPreset(value: string | null): PjskCameraPreset {
  return value === "default" ? "default" : "capture";
}

function readCameraProfile(params: URLSearchParams): PjskCameraProfile {
  return normalizeCameraProfile(params.get("cameraProfile"));
}

function normalizeCameraProfile(value: string | null): PjskCameraProfile {
  return value === "official-default" ? "official-default" : "full-body";
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

function waitForPresentedFrame() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}

getCaptureWindow().__HARUKI_CAPTURE_REQUEST__ = async (
  request: HarukiCaptureRolePartsRequest
) => {
  try {
    await engine.waitForPostProcessorReady();
    const config = readCaptureConfig();
    if (!config) {
      throw new Error("Missing captureBase for role parts capture.");
    }
    getCaptureWindow().__PJSK_CAPTURE_READY__ = false;
    getCaptureWindow().__PJSK_CAPTURE_ERROR__ = "";
    document.body.dataset.captureReady = "false";
    document.body.dataset.captureError = "";
    const baseUrl = request.runtimeBaseUrl ?? config.baseUrl;
    const packageKey = `${baseUrl}|${request.roleId}`;
    engine.setViewportSize(root.clientWidth, root.clientHeight);
    const requestedWarmupFrames = request.warmupFrames ?? config.warmupFrames;
    const warmupFrames = settledCapturePackageKey === packageKey
      ? requestedWarmupFrames
      : Math.max(requestedWarmupFrames, ROLE_ENTRY_WARMUP_FRAMES);
    const result = await captureAdapter.captureRoleParts({
      ...request,
      runtimeBaseUrl: baseUrl,
      phase: request.phase ?? config.phase,
      warmupMs: request.warmupMs ?? config.warmupMs,
      warmupFrames,
      warmupMode: request.warmupMode ?? config.warmupMode,
      cameraPreset: request.cameraPreset ?? config.cameraPreset,
      cameraProfile: request.cameraProfile ?? config.cameraProfile,
      characterYawMode: request.characterYawMode ?? config.characterYawMode ?? undefined,
      bodyDebugMode: request.bodyDebugMode ?? config.bodyDebugMode,
      faceSdfEnabled: request.faceSdfEnabled ?? config.faceSdfEnabled,
      faceSdfDebugMode: request.faceSdfDebugMode ?? config.faceSdfDebugMode,
      faceSdfDebugLightMode: request.faceSdfDebugLightMode ?? config.faceSdfDebugLightMode,
      projectedShadow: request.projectedShadow ?? config.projectedShadow,
    });
    await waitForPresentedFrame();
    settledCapturePackageKey = packageKey;
    const snapshots = request.includeDebugSnapshots && result.snapshots
      ? {
        ...result.snapshots,
        utjSpringBoneTrace: engine.getUtjSpringBoneTraceSnapshot(),
      }
      : null;
    getCaptureWindow().__PJSK_CAPTURE_SNAPSHOT__ = snapshots;
    getCaptureWindow().__PJSK_CAPTURE_READY__ = true;
    document.body.dataset.captureReady = "true";
    return { snapshots };
  } catch (error) {
    setCaptureError(error);
    throw error;
  }
};

async function bootstrapCapture() {
  const config = readCaptureConfig();
  if (!config) {
    return;
  }
  try {
    await engine.waitForPostProcessorReady();
    getCaptureWindow().__PJSK_CAPTURE_READY__ = false;
    document.body.dataset.captureReady = "false";
    engine.setPresentationMode("capture");
    engine.setSpringRuntimeMode(config.springRuntimeMode);
    engine.setBodyDebugMode(config.bodyDebugMode);
    engine.setFaceSdfEnabled(config.faceSdfEnabled);
    engine.setFaceSdfDebugMode(config.faceSdfDebugMode);
    engine.setFaceSdfDebugLightMode(config.faceSdfDebugLightMode);
    engine.setRenderIsolationMode(config.renderIsolation);
    engine.applyCameraPreset(config.cameraPreset, config.cameraProfile);
    if (config.characterYawMode && config.characterYawMode !== "face-camera") {
      engine.setCharacterYawDegrees(characterYawDegreesByMode[config.characterYawMode]);
    }
    engine.setUtjSpringBoneTraceFilters(
      config.utjTraceBones,
      config.utjTraceMaxEvents
    );
    engine.renderFrame();
    getCaptureWindow().__PJSK_CAPTURE_READY__ = true;
    document.body.dataset.captureReady = "true";
  } catch (error) {
    setCaptureError(error);
  }
}

void bootstrapCapture();

window.addEventListener("beforeunload", () => {
  void engine.destroy();
});

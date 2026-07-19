import * as THREE from "three";
import type { Haruki3DEngine } from "../engine/Haruki3DEngine";
import type {
  HarukiCaptureRolePartsRequest,
  HarukiCaptureRolePartsResult,
  HarukiPrepareCaptureFrameRequest,
} from "./captureTypes";

export class HarukiCaptureAdapter {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly engine: Haruki3DEngine) {
  }

  captureRoleParts(
    request: HarukiCaptureRolePartsRequest
  ): Promise<HarukiCaptureRolePartsResult> {
    const capture = () => this.captureRolePartsInternal(request);
    const queued = this.queue.then(capture, capture);
    this.queue = queued.catch(() => undefined);
    return queued;
  }

  private async captureRolePartsInternal(
    request: HarukiCaptureRolePartsRequest
  ): Promise<HarukiCaptureRolePartsResult> {
    if (!request.runtimeBaseUrl) {
      throw new Error("runtimeBaseUrl is required before role parts capture.");
    }
    const { selection, combinedCharacter } = await this.engine.loadRenderRecipe({
      baseUrl: request.runtimeBaseUrl,
      roleId: request.roleId,
      bodyCostume3dId: request.bodyCostume3dId,
      headCostume3dId: request.headCostume3dId,
      headPackagePath: request.headPackagePath,
      hairCostume3dId: request.hairCostume3dId,
      headOptionalCostume3dId: request.headOptionalCostume3dId,
    });
    await this.prepareCaptureFrame({
      phase: request.phase,
      clip: "motion_loop",
      warmupMs: request.warmupMs,
      warmupFrames: request.warmupFrames,
      warmupMode: request.warmupMode,
      cameraPreset: request.cameraPreset,
      cameraProfile: request.cameraProfile,
      characterYawMode: request.characterYawMode,
      bodyDebugMode: request.bodyDebugMode,
      faceSdfEnabled: request.faceSdfEnabled,
      faceSdfDebugMode: request.faceSdfDebugMode,
      faceSdfDebugLightMode: request.faceSdfDebugLightMode,
      projectedShadow: request.projectedShadow,
      traceUtjBones: request.traceUtjBones,
      traceUtjMaxEvents: request.traceUtjMaxEvents,
      springDebugBones: request.springDebugBones,
      springDebugAllOffsets: request.springDebugAllOffsets,
    });
    return {
      selection,
      combinedCharacter,
      snapshots: this.engine.getSnapshots({
        springDebugBones: request.springDebugBones,
        springDebugAllOffsets: request.springDebugAllOffsets,
      }),
    };
  }

  async prepareCaptureFrame(request: HarukiPrepareCaptureFrameRequest = {}) {
    this.engine.setPresentationMode("capture");
    this.engine.setSpringRuntimeMode("unity-prefab");
    if (request.bodyDebugMode !== undefined) {
      this.engine.setBodyDebugMode(request.bodyDebugMode);
    }
    if (request.faceSdfEnabled !== undefined) {
      this.engine.setFaceSdfEnabled(request.faceSdfEnabled);
    }
    if (request.faceSdfDebugMode !== undefined) {
      this.engine.setFaceSdfDebugMode(request.faceSdfDebugMode);
    }
    if (request.faceSdfDebugLightMode !== undefined) {
      this.engine.setFaceSdfDebugLightMode(request.faceSdfDebugLightMode);
    }
    if (request.projectedShadow !== undefined) {
      this.engine.setProjectedShadowSettings(request.projectedShadow);
    }
    this.engine.setUtjSpringBoneTraceFilters(
      request.traceUtjBones ?? [],
      request.traceUtjMaxEvents
    );
    this.engine.setAnimationPaused(true);

    const phase = THREE.MathUtils.clamp(
      Number.isFinite(request.phase) ? request.phase! : 0.5,
      0,
      1
    );
    const clip = request.clip ?? "motion_loop";
    const warmupFrames = Math.max(Math.trunc(request.warmupFrames ?? 0), 0);
    const warmupMs = Math.max(Math.trunc(request.warmupMs ?? 0), 0);
    const warmupMode = request.warmupMode ?? "animation";
    const advanceWarmupAnimation = warmupMode === "animation";
    const duration = Math.max(this.engine.getAnimationSnapshot().duration, 0);
    const seekTargetPhase = (targetPhase: number) => clip === "motion"
      ? this.engine.seekAnimationPhase(targetPhase)
      : this.engine.seekAnimationLoopPhase(targetPhase);
    const startPhase = advanceWarmupAnimation && warmupFrames > 0 && duration > 0
      ? THREE.MathUtils.euclideanModulo(
        phase - warmupFrames / (60 * duration),
        1
      )
      : phase;

    seekTargetPhase(startPhase);

    if (warmupFrames > 0) {
      this.engine.setAnimationPaused(!advanceWarmupAnimation);
      for (let index = 0; index < warmupFrames; index += 1) {
        this.engine.stepRuntimeFrame(1 / 60, { advanceAnimation: advanceWarmupAnimation });
      }
      this.engine.setAnimationPaused(true);
    } else if (warmupMs > 0) {
      this.engine.setAnimationPaused(warmupMode === "runtime");
      await new Promise<void>((resolve) => window.setTimeout(resolve, warmupMs));
      this.engine.setAnimationPaused(true);
    }

    this.engine.applyCameraPreset(request.cameraPreset ?? "capture", request.cameraProfile);
    switch (request.characterYawMode) {
      case "45":
      case "-45":
      case "90":
      case "-90":
      case "180":
      case "0":
        this.engine.setCharacterYawDegrees(Number(request.characterYawMode));
        break;
      case "face-camera":
        this.engine.faceCharacterTowardCamera();
        break;
      default:
        break;
    }
    this.engine.stepRuntimeFrame(0, { advanceAnimation: false });
    this.engine.renderFrame();
  }
}

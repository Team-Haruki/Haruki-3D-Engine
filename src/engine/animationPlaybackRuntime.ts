import * as THREE from "three";
import { fetchRuntimeMessagePack } from "../runtime/runtimePackageLoader";
import {
  animationClipCacheKey,
  createSmoothedLoopClip,
  decodeUnityMotionClips,
  inferBodyAnimationKind,
  isLoopClipName,
  makeAnimationTrackDebug,
  prepareRuntimeAnimationClip,
  retargetUnityPrefabAnimationClip,
  type AnimationTrackDebug,
  type BodyAnimationKind,
  type RuntimeMotionRetargetDebug,
} from "./runtimeMotion";
import type {
  PrefabHeadFollowDebug,
} from "./unityPrefabRuntime";

export type BodyAnimationSelection = {
  motionUrl: string | null;
  motionKind?: BodyAnimationKind | null;
  loopUrl: string | null;
  loopKind?: BodyAnimationKind | null;
};

export type AnimationRetargetDebug = RuntimeMotionRetargetDebug & {
  prefabHeadFollow?: PrefabHeadFollowDebug;
};

export type AnimationPlaybackSnapshot = {
  selectedUrl: string | null;
  selectedLoopUrl: string | null;
  activeClipName: string | null;
  queuedLoopClipName: string | null;
  currentTime: number;
  duration: number;
  paused: boolean;
  speed: number;
  faceMotionEnabled: boolean;
  bodyHeadTracksEnabled: boolean;
  bodyTrackDebug: AnimationTrackDebug | null;
  bodyLoopTrackDebug: AnimationTrackDebug | null;
  bodyRetargetDebug: AnimationRetargetDebug | null;
  error: string | null;
};

export type AnimationPlaybackContext = {
  root: THREE.Object3D | null;
  retargetWithUnityPrefab: boolean;
  runtimeExtension: unknown;
  prefabHeadFollow: PrefabHeadFollowDebug;
};

export type AnimationPlaybackPosition = {
  activeClipName: string | null;
  currentTime: number;
};

type AnimationClipLoader = (
  url: string,
  kind: BodyAnimationKind | null
) => Promise<THREE.AnimationClip[]>;

type AnimationPlaybackRuntimeOptions = {
  loadClips?: AnimationClipLoader;
  onLoopPromoted?: () => void;
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function loadRuntimeAnimationClips(
  url: string
) {
  return decodeUnityMotionClips(await fetchRuntimeMessagePack(url));
}

export class AnimationPlaybackRuntime {
  private readonly loadClips: AnimationClipLoader;
  private readonly onLoopPromoted: () => void;
  private readonly clipCache = new Map<string, THREE.AnimationClip[]>();
  private readonly smoothedLoopClipCache = new WeakMap<
    THREE.AnimationClip,
    THREE.AnimationClip
  >();
  private context: AnimationPlaybackContext | null = null;
  private motionUrl: string | null = null;
  private motionKind: BodyAnimationKind | null = null;
  private loopUrl: string | null = null;
  private loopKind: BodyAnimationKind | null = null;
  private activeClipName: string | null = null;
  private duration = 0;
  private action: THREE.AnimationAction | null = null;
  private loopAction: THREE.AnimationAction | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private finishedHandler: THREE.EventListener<any, any, any> | null = null;
  private error: string | null = null;
  private retargetDebug: AnimationRetargetDebug | null = null;
  private queuedLoopClipName: string | null = null;
  private speed = 1;
  private paused = false;
  private bodyHeadTracksEnabled = true;
  private revision = 0;

  constructor(options: AnimationPlaybackRuntimeOptions = {}) {
    this.loadClips = options.loadClips ?? loadRuntimeAnimationClips;
    this.onLoopPromoted = options.onLoopPromoted ?? (() => undefined);
  }

  setSelection(selection: BodyAnimationSelection | null) {
    this.motionUrl = selection?.motionUrl ?? null;
    this.motionKind = inferBodyAnimationKind(
      this.motionUrl,
      selection?.motionKind
    );
    this.loopUrl = selection?.loopUrl ?? null;
    this.loopKind = inferBodyAnimationKind(
      this.loopUrl,
      selection?.loopKind
    );
  }

  hasSelection() {
    return this.motionUrl !== null;
  }

  matchesSelection(motionUrl: string | null, loopUrl: string | null) {
    return this.motionUrl === motionUrl && this.loopUrl === loopUrl;
  }

  capturePosition(): AnimationPlaybackPosition {
    return {
      activeClipName: this.activeClipName,
      currentTime: this.action?.time ?? 0,
    };
  }

  setPaused(paused: boolean) {
    this.paused = paused;
    this.applySettings();
  }

  setSpeed(speed: number) {
    this.speed = speed;
    this.applySettings();
  }

  getSpeed() {
    return this.speed;
  }

  isPaused() {
    return this.paused;
  }

  setBodyHeadTracksEnabled(enabled: boolean) {
    if (this.bodyHeadTracksEnabled === enabled) {
      return false;
    }
    this.bodyHeadTracksEnabled = enabled;
    return true;
  }

  step(delta: number) {
    this.mixer?.update(Math.max(0, delta));
  }

  seek(time: number) {
    const duration = Math.max(this.duration, 0);
    const nextTime = duration > 0
      ? THREE.MathUtils.clamp(time, 0, duration)
      : Math.max(time, 0);
    this.paused = true;
    this.applySettings();
    if (this.action) {
      this.action.paused = false;
      this.action.time = nextTime;
    }
    this.mixer?.update(0);
    this.applySettings();
    return nextTime;
  }

  seekPhase(phase: number) {
    const clampedPhase = THREE.MathUtils.clamp(
      Number.isFinite(phase) ? phase : 0,
      0,
      1
    );
    return this.seek(Math.max(this.duration, 0) * clampedPhase);
  }

  seekLoopPhase(phase: number) {
    this.promoteQueuedLoop();
    return this.seekPhase(phase);
  }

  restorePosition(position: AnimationPlaybackPosition) {
    if (!this.action) {
      return;
    }
    const restoreLoop = Boolean(
      this.loopUrl &&
      position.activeClipName &&
      (
        position.activeClipName === this.queuedLoopClipName ||
        isLoopClipName(position.activeClipName, this.loopUrl)
      )
    );
    if (restoreLoop) {
      this.promoteQueuedLoop();
    }
    const duration = Math.max(this.duration, 0);
    this.action.time = duration > 0
      ? restoreLoop
        ? THREE.MathUtils.euclideanModulo(position.currentTime, duration)
        : THREE.MathUtils.clamp(position.currentTime, 0, duration)
      : Math.max(position.currentTime, 0);
    this.mixer?.update(0);
  }

  async refresh(context: AnimationPlaybackContext) {
    const revision = ++this.revision;
    this.context = context;
    this.stopPlayback();
    this.error = null;

    if (!this.motionUrl || !context.root) {
      return { poseApplied: true };
    }

    const clips = await this.loadCachedClips(
      this.motionUrl,
      this.motionKind,
      false,
      revision
    );
    if (revision !== this.revision || !clips) {
      return { poseApplied: false };
    }
    if (!clips.length) {
      this.error = `No clips found in ${this.motionUrl}`;
      return { poseApplied: false };
    }

    const sourceClip = clips.find((candidate) =>
      !isLoopClipName(candidate.name, this.motionUrl)
    ) ?? clips[0];
    const clip = this.preparePlayableClip(sourceClip, context, true);
    if (!clip) {
      return { poseApplied: false };
    }

    let loopClip: THREE.AnimationClip | null = null;
    if (this.loopUrl === this.motionUrl) {
      const sourceLoopClip = clips.find((candidate) =>
        isLoopClipName(candidate.name, this.loopUrl)
      ) ?? clips.find((candidate) => candidate !== sourceClip) ?? null;
      loopClip = sourceLoopClip
        ? this.preparePlayableClip(sourceLoopClip, context, false)
        : null;
    } else if (this.loopUrl) {
      const loopClips = await this.loadCachedClips(
        this.loopUrl,
        this.loopKind,
        true,
        revision
      );
      if (revision !== this.revision) {
        return { poseApplied: false };
      }
      const sourceLoopClip = loopClips?.[0] ?? null;
      loopClip = sourceLoopClip
        ? this.preparePlayableClip(sourceLoopClip, context, false)
        : null;
    }

    if (revision !== this.revision) {
      return { poseApplied: false };
    }
    this.installPlayback(context.root, clip, loopClip);
    return { poseApplied: true };
  }

  release(options: { preserveSelection?: boolean; clearCache?: boolean } = {}) {
    this.revision += 1;
    this.stopPlayback();
    this.context = null;
    if (!options.preserveSelection) {
      this.setSelection(null);
    }
    if (options.clearCache) {
      this.clipCache.clear();
    }
  }

  getSnapshot(options: {
    faceMotionEnabled?: boolean;
    utjControlledNodeNames?: ReadonlySet<string>;
  } = {}): AnimationPlaybackSnapshot {
    const utjControlledNodeNames = options.utjControlledNodeNames ?? new Set<string>();
    const prefabHeadFollow = this.context?.prefabHeadFollow;
    const bodyRetargetDebug = this.retargetDebug
      ? { ...this.retargetDebug, prefabHeadFollow }
      : this.context?.retargetWithUnityPrefab
        ? {
            mode: "unity-prefab" as const,
            bindingCount: 0,
            sourceTrackCount: 0,
            emittedTrackCount: 0,
            resolvedTargetCount: 0,
            resolvedBodyTargetCount: 0,
            resolvedFaceTargetCount: 0,
            unresolvedTrackCount: 0,
            duplicateTargetTrackCount: 0,
            sampleUnresolvedTracks: [],
            sampleResolvedHeadTargets: [],
            prefabHeadFollow,
          }
        : null;
    return {
      selectedUrl: this.motionUrl,
      selectedLoopUrl: this.loopUrl,
      activeClipName: this.activeClipName,
      queuedLoopClipName: this.queuedLoopClipName,
      currentTime: this.action?.time ?? 0,
      duration: this.duration,
      paused: this.paused,
      speed: this.speed,
      faceMotionEnabled: options.faceMotionEnabled ?? false,
      bodyHeadTracksEnabled: this.bodyHeadTracksEnabled,
      bodyTrackDebug: makeAnimationTrackDebug(
        this.action?.getClip() ?? null,
        utjControlledNodeNames
      ),
      bodyLoopTrackDebug: makeAnimationTrackDebug(
        this.loopAction?.getClip() ?? null,
        utjControlledNodeNames
      ),
      bodyRetargetDebug,
      error: this.error,
    };
  }

  private async loadCachedClips(
    url: string,
    kind: BodyAnimationKind | null,
    ignoreErrors: boolean,
    revision: number
  ) {
    const key = animationClipCacheKey(url, kind);
    const cached = this.clipCache.get(key);
    if (cached) {
      return cached;
    }
    if (kind !== "unity-json") {
      if (!ignoreErrors) {
        this.error = `Unity motion .msgpack.br is required for ${url}.`;
      }
      return null;
    }
    try {
      const clips = await this.loadClips(url, kind);
      this.clipCache.set(key, clips);
      return clips;
    } catch (error) {
      if (!ignoreErrors && revision === this.revision) {
        this.error = getErrorMessage(error);
      }
      return null;
    }
  }

  private preparePlayableClip(
    sourceClip: THREE.AnimationClip,
    context: AnimationPlaybackContext,
    updateRetargetDebug: boolean
  ) {
    const clip = prepareRuntimeAnimationClip(
      sourceClip,
      this.bodyHeadTracksEnabled
    );
    if (!context.retargetWithUnityPrefab) {
      if (updateRetargetDebug) {
        this.retargetDebug = {
          mode: "none",
          bindingCount: 0,
          sourceTrackCount: clip.tracks.length,
          emittedTrackCount: clip.tracks.length,
          resolvedTargetCount: clip.tracks.length,
          resolvedBodyTargetCount: 0,
          resolvedFaceTargetCount: 0,
          unresolvedTrackCount: 0,
          duplicateTargetTrackCount: 0,
          sampleUnresolvedTracks: [],
          sampleResolvedHeadTargets: [],
          prefabHeadFollow: context.prefabHeadFollow,
        };
      }
      return clip;
    }
    if (!context.root) {
      this.error = "Unity Prefab animation requires a loaded prefab root.";
      return null;
    }
    const retargeted = retargetUnityPrefabAnimationClip(
      clip,
      context.root,
      context.runtimeExtension
    );
    if (updateRetargetDebug) {
      this.retargetDebug = {
        ...retargeted.debug,
        prefabHeadFollow: context.prefabHeadFollow,
      };
    }
    if (retargeted.error) {
      this.error = retargeted.error;
      return null;
    }
    return retargeted.clip;
  }

  private installPlayback(
    root: THREE.Object3D,
    clip: THREE.AnimationClip,
    loopClip: THREE.AnimationClip | null
  ) {
    this.mixer = new THREE.AnimationMixer(root);
    const clipName = clip.name || this.motionUrl!;
    this.activeClipName = clipName;
    this.duration = clip.duration;
    this.action = this.mixer.clipAction(clip, root);
    this.configureAction(this.action);
    this.action.reset();

    if (loopClip) {
      const playableLoopClip = this.getSmoothedLoopClip(loopClip);
      this.loopAction = this.mixer.clipAction(playableLoopClip, root);
      this.configureAction(this.loopAction);
      this.loopAction.reset();
      this.loopAction.enabled = false;
      this.loopAction.loop = THREE.LoopRepeat;
      this.loopAction.clampWhenFinished = false;
      this.action.loop = THREE.LoopOnce;
      this.action.clampWhenFinished = true;
      this.queuedLoopClipName =
        playableLoopClip.name || this.loopUrl || `${clipName}_loop`;
      this.finishedHandler = (event) => {
        if (event.action === this.action) {
          this.promoteQueuedLoop();
        }
      };
      this.mixer.addEventListener("finished", this.finishedHandler);
    } else {
      this.action.loop = THREE.LoopRepeat;
      this.action.clampWhenFinished = false;
      this.queuedLoopClipName = null;
    }
    this.action.play();
    this.applySettings();
    this.mixer.update(0);
  }

  private promoteQueuedLoop() {
    if (!this.loopAction || !this.mixer || !this.action) {
      return;
    }
    this.removeFinishedHandler();
    this.action.stop();
    this.loopAction.enabled = true;
    this.loopAction.reset();
    this.loopAction.play();
    this.action = this.loopAction;
    this.loopAction = null;
    this.activeClipName = this.queuedLoopClipName ?? this.action.getClip().name;
    this.duration = this.action.getClip().duration;
    this.queuedLoopClipName = null;
    this.onLoopPromoted();
    this.applySettings();
  }

  private applySettings() {
    for (const action of [this.action, this.loopAction]) {
      if (!action) {
        continue;
      }
      action.paused = this.paused;
      action.enabled = true;
      action.setEffectiveTimeScale(this.paused ? 0 : this.speed);
    }
  }

  private configureAction(action: THREE.AnimationAction) {
    action.zeroSlopeAtStart = false;
    action.zeroSlopeAtEnd = false;
  }

  private getSmoothedLoopClip(clip: THREE.AnimationClip) {
    const cached = this.smoothedLoopClipCache.get(clip);
    if (cached) {
      return cached;
    }
    const smoothed = createSmoothedLoopClip(clip, 60);
    if (smoothed !== clip) {
      this.smoothedLoopClipCache.set(clip, smoothed);
    }
    return smoothed;
  }

  private removeFinishedHandler() {
    if (this.mixer && this.finishedHandler) {
      this.mixer.removeEventListener("finished", this.finishedHandler);
      this.finishedHandler = null;
    }
  }

  private stopPlayback() {
    this.removeFinishedHandler();
    this.action?.stop();
    this.loopAction?.stop();
    this.mixer?.stopAllAction();
    this.action = null;
    this.loopAction = null;
    this.mixer = null;
    this.activeClipName = null;
    this.duration = 0;
    this.retargetDebug = null;
    this.queuedLoopClipName = null;
  }
}

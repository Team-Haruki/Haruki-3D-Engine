import * as THREE from "three";
import type { RuntimeNumericArray } from "../runtime/runtimeTypes";
import { buildPrefabNodePathLookup } from "./prefabNodeLookup";

export type BodyAnimationKind = "unity-json";

export type AnimationTrackDebug = {
  trackCount: number;
  transformTrackCount: number;
  hairTrackCount: number;
  headTrackCount: number;
  neckTrackCount: number;
  upperBodyTrackCount: number;
  utjControlledTrackCount: number;
  sampleHairTracks: string[];
  sampleHeadTracks: string[];
  sampleUtjControlledTracks: string[];
};

export type RuntimeMotionRetargetDebug = {
  mode: "none" | "unity-prefab";
  bindingCount: number;
  sourceTrackCount: number;
  emittedTrackCount: number;
  resolvedTargetCount: number;
  resolvedBodyTargetCount: number;
  resolvedFaceTargetCount: number;
  unresolvedTrackCount: number;
  duplicateTargetTrackCount: number;
  sampleUnresolvedTracks: string[];
  sampleResolvedHeadTargets: string[];
};

type BodyMotionBindingSet = {
  version: string;
  bindingMode: string;
  bindings: BodyMotionBinding[];
  warnings?: string[];
};

type BodyMotionBinding = {
  pathCrc: number;
  nodeKey: string;
  leafName: string;
  importedPath?: string | null;
  sourceRest?: BodyMotionRestTransform | null;
  targetCount: number;
  targets: BodyMotionTarget[];
};

type BodyMotionTarget = {
  poseRoot: string;
  transformPath: string;
  pathId: number;
  rest?: BodyMotionRestTransform | null;
};

type BodyMotionRestTransform = {
  position: THREE.Vector3;
  rotation: THREE.Quaternion;
  scale: THREE.Vector3;
};

type UnityMotionRuntime0414 = {
  version: string;
  clips: UnityMotionClip0414[];
};

type UnityMotionClip0414 = {
  name: string;
  tracks: UnityMotionTrack0414[];
};

type UnityMotionTrack0414 = {
  nodeKey: string;
  property: string;
  componentCount: number;
  times: RuntimeNumericArray;
  values: RuntimeNumericArray;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

export function isLoopClipName(name: string | undefined, url: string | null) {
  return /(?:^|[_-])loop$/i.test(name ?? "") ||
    /(?:^|[_-])loop(?:\.json)?$/i.test(url?.split("/").pop() ?? "");
}

function valuesClose(
  values: ArrayLike<number>,
  stride: number,
  leftIndex: number,
  rightIndex: number,
  epsilon = 1e-4
) {
  const left = leftIndex * stride;
  const right = rightIndex * stride;
  for (let i = 0; i < stride; i += 1) {
    if (Math.abs(values[left + i] - values[right + i]) > epsilon) {
      return false;
    }
  }
  return true;
}

function normalizeQuaternionValue(values: number[], offset: number) {
  const x = values[offset];
  const y = values[offset + 1];
  const z = values[offset + 2];
  const w = values[offset + 3];
  const length = Math.hypot(x, y, z, w);
  if (length < 1e-8) {
    values[offset] = 0;
    values[offset + 1] = 0;
    values[offset + 2] = 0;
    values[offset + 3] = 1;
    return;
  }
  values[offset] = x / length;
  values[offset + 1] = y / length;
  values[offset + 2] = z / length;
  values[offset + 3] = w / length;
}

function makeQuaternionValuesContinuous(values: number[], stride: number) {
  if (stride !== 4) {
    return;
  }
  for (let offset = stride; offset < values.length; offset += stride) {
    const prev = offset - stride;
    const dot =
      values[prev] * values[offset] +
      values[prev + 1] * values[offset + 1] +
      values[prev + 2] * values[offset + 2] +
      values[prev + 3] * values[offset + 3];
    if (dot < 0) {
      values[offset] *= -1;
      values[offset + 1] *= -1;
      values[offset + 2] *= -1;
      values[offset + 3] *= -1;
    }
  }
}

function smoothSampleComponent(
  p0: number,
  p1: number,
  p2: number,
  p3: number,
  t0: number,
  t1: number,
  t2: number,
  t3: number,
  t: number
) {
  const span = Math.max(t2 - t1, 1e-6);
  const p = THREE.MathUtils.clamp((t - t1) / span, 0, 1);
  const p2x = p * p;
  const p3x = p2x * p;
  const m1 = (p2 - p0) / Math.max(t2 - t0, 1e-6);
  const m2 = (p3 - p1) / Math.max(t3 - t1, 1e-6);
  const h00 = 2 * p3x - 3 * p2x + 1;
  const h10 = p3x - 2 * p2x + p;
  const h01 = -2 * p3x + 3 * p2x;
  const h11 = p3x - p2x;
  return h00 * p1 + h10 * span * m1 + h01 * p2 + h11 * span * m2;
}

function smoothLoopTrack(
  track: THREE.KeyframeTrack,
  duration: number,
  sampleRate: number
) {
  const isQuaternionTrack = track instanceof THREE.QuaternionKeyframeTrack;
  const isPositionTrack =
    track instanceof THREE.VectorKeyframeTrack &&
    track.name.endsWith(".position");
  if (!isQuaternionTrack && !isPositionTrack) {
    return track.clone();
  }

  const stride = track.getValueSize();
  const sourceTimes = Array.from(track.times);
  const sourceValues = Array.from(track.values);
  let sourceCount = sourceTimes.length;
  if (sourceCount < 3 || duration <= 0) {
    return track.clone();
  }

  if (
    Math.abs(sourceTimes[sourceCount - 1] - duration) < 1e-3 &&
    valuesClose(sourceValues, stride, 0, sourceCount - 1)
  ) {
    sourceCount -= 1;
  }
  if (sourceCount < 3) {
    return track.clone();
  }

  const times = sourceTimes.slice(0, sourceCount);
  const values = sourceValues.slice(0, sourceCount * stride);
  if (isQuaternionTrack) {
    makeQuaternionValuesContinuous(values, stride);
  }

  const sampleCount = Math.max(2, Math.round(duration * sampleRate));
  const targetTimes = new Float32Array(sampleCount + 1);
  const targetValues = new Float32Array((sampleCount + 1) * stride);
  let segment = 0;

  for (let sample = 0; sample <= sampleCount; sample += 1) {
    const targetOffset = sample * stride;
    const t = sample === sampleCount ? duration : (duration * sample) / sampleCount;
    targetTimes[sample] = t;
    if (sample === sampleCount) {
      for (let i = 0; i < stride; i += 1) {
        targetValues[targetOffset + i] = targetValues[i];
      }
      continue;
    }

    while (
      segment < sourceCount - 1 &&
      t > times[segment + 1]
    ) {
      segment += 1;
    }

    const i1 = segment;
    const i2 = segment + 1 < sourceCount ? segment + 1 : 0;
    const i0 = (i1 - 1 + sourceCount) % sourceCount;
    const i3 = (i2 + 1) % sourceCount;
    let t0 = times[i0];
    const t1 = times[i1];
    let t2 = times[i2];
    let t3 = times[i3];
    if (i0 >= i1) {
      t0 -= duration;
    }
    if (i2 <= i1) {
      t2 += duration;
    }
    if (i3 <= i1) {
      t3 += duration;
    }

    for (let i = 0; i < stride; i += 1) {
      targetValues[targetOffset + i] = smoothSampleComponent(
        values[i0 * stride + i],
        values[i1 * stride + i],
        values[i2 * stride + i],
        values[i3 * stride + i],
        t0,
        t1,
        t2,
        t3,
        t
      );
    }
    if (isQuaternionTrack) {
      normalizeQuaternionValue(
        targetValues as unknown as number[],
        targetOffset
      );
    }
  }

  return isQuaternionTrack
    ? new THREE.QuaternionKeyframeTrack(track.name, targetTimes, targetValues)
    : new THREE.VectorKeyframeTrack(track.name, targetTimes, targetValues);
}

function shouldSmoothLoopClip(clip: THREE.AnimationClip) {
  const animatedTracks = clip.tracks.filter((track) => track.times.length > 2);
  if (!animatedTracks.length) {
    return false;
  }
  return animatedTracks.some((track) => track.times.length < Math.max(12, clip.duration * 24));
}

export function createSmoothedLoopClip(
  clip: THREE.AnimationClip,
  sampleRate = 60
) {
  if (!shouldSmoothLoopClip(clip)) {
    return clip;
  }
  return new THREE.AnimationClip(
    clip.name,
    clip.duration,
    clip.tracks.map((track) => smoothLoopTrack(track, clip.duration, sampleRate))
  );
}

function isHeadMotionTrack(track: THREE.KeyframeTrack) {
  return /^(Head|Neck)\.(position|quaternion|scale)$/.test(track.name);
}

export function makeAnimationTrackDebug(
  clip: THREE.AnimationClip | null,
  utjControlledNodeNames: ReadonlySet<string> = new Set()
): AnimationTrackDebug | null {
  if (!clip) {
    return null;
  }
  const hairTracks = clip.tracks.filter((track) => /hair/i.test(track.name));
  const headTracks = clip.tracks.filter((track) => /^Head\./.test(track.name));
  const neckTracks = clip.tracks.filter((track) => /^Neck\./.test(track.name));
  const upperBodyTracks = clip.tracks.filter((track) =>
    /^(Position|Hip|Waist|Spine|Chest|Neck|Head)\./.test(track.name)
  );
  const transformTracks = clip.tracks.filter((track) =>
    /\.(position|quaternion|scale)$/.test(track.name)
  );
  const utjControlledTracks = clip.tracks.filter((track) =>
    isUtjControlledTrack(track, utjControlledNodeNames)
  );
  return {
    trackCount: clip.tracks.length,
    transformTrackCount: transformTracks.length,
    hairTrackCount: hairTracks.length,
    headTrackCount: headTracks.length,
    neckTrackCount: neckTracks.length,
    upperBodyTrackCount: upperBodyTracks.length,
    utjControlledTrackCount: utjControlledTracks.length,
    sampleHairTracks: hairTracks.slice(0, 12).map((track) => track.name),
    sampleHeadTracks: [...headTracks, ...neckTracks].slice(0, 12).map((track) => track.name),
    sampleUtjControlledTracks: utjControlledTracks.slice(0, 12).map((track) => track.name),
  };
}

function isUtjControlledTrack(
  track: THREE.KeyframeTrack,
  utjControlledNodeNames: ReadonlySet<string>
) {
  if (utjControlledNodeNames.size === 0) {
    return false;
  }
  const nodeName = track.name.split(".")[0];
  return utjControlledNodeNames.has(nodeName);
}

function filterBodyHeadMotionTracks(clip: THREE.AnimationClip) {
  if (!clip.tracks.some(isHeadMotionTrack)) {
    return clip;
  }
  return new THREE.AnimationClip(
    `${clip.name || "motion"}_no_head_tracks`,
    clip.duration,
    clip.tracks.filter((track) => !isHeadMotionTrack(track))
  );
}

export function prepareRuntimeAnimationClip(
  clip: THREE.AnimationClip,
  includeBodyHeadTracks: boolean
) {
  return includeBodyHeadTracks ? clip : filterBodyHeadMotionTracks(clip);
}

function isUnityMotionJsonUrl(url: string) {
  return /(?:^|\/)unity-motion\.msgpack\.br(?:$|[?#])/i.test(url);
}

export function inferBodyAnimationKind(
  url: string | null,
  explicitKind?: BodyAnimationKind | null
): BodyAnimationKind | null {
  if (!url) {
    return null;
  }
  return explicitKind ?? (isUnityMotionJsonUrl(url) ? "unity-json" : null);
}

export function animationClipCacheKey(url: string, kind: BodyAnimationKind | null) {
  return `${kind ?? "unknown"}:${url}`;
}

function readUnityMotionRuntime0414(value: unknown): UnityMotionRuntime0414 {
  const payload = asRecord(value);
  const version = String(payload.version ?? payload.Version ?? "");
  const rawClips = payload.clips ?? payload.Clips;
  if (version !== "0414" || !Array.isArray(rawClips)) {
    throw new Error("Unity motion runtime must be version 0414 and contain clips.");
  }

  const clips = rawClips.map(readUnityMotionClip0414);
  if (!clips.length) {
    throw new Error("Unity motion runtime contains no clips.");
  }
  return { version, clips };
}

function readUnityMotionClip0414(value: unknown): UnityMotionClip0414 {
  const item = asRecord(value);
  const name = String(item.name ?? item.Name ?? "motion");
  const rawTracks = item.tracks ?? item.Tracks;
  if (!Array.isArray(rawTracks)) {
    throw new Error(`Unity motion clip ${name} contains no tracks.`);
  }

  const tracks = rawTracks.map(readUnityMotionTrack0414);
  if (!tracks.length) {
    throw new Error(`Unity motion clip ${name} contains no valid tracks.`);
  }
  return { name, tracks };
}

function readUnityMotionTrack0414(value: unknown): UnityMotionTrack0414 {
  const item = asRecord(value);
  const nodeKey = String(item.nodeKey ?? item.NodeKey ?? "");
  const property = String(item.property ?? item.Property ?? "");
  const componentCount = Number(item.componentCount ?? item.ComponentCount);
  const times = readNumberArray(item.times ?? item.Times);
  const values = readNumberArray(item.values ?? item.Values);
  if (!nodeKey || !property || !Number.isInteger(componentCount)) {
    throw new Error("Unity motion track is missing nodeKey, property, or componentCount.");
  }
  if (!times.length || values.length !== times.length * componentCount) {
    throw new Error(`Unity motion track ${nodeKey}.${property} has inconsistent sample arrays.`);
  }
  return { nodeKey, property, componentCount, times, values };
}

function readNumberArray(value: unknown): RuntimeNumericArray {
  if (
    value instanceof Float32Array ||
    value instanceof Uint16Array ||
    value instanceof Uint32Array
  ) {
    return value;
  }
  if (!Array.isArray(value)) {
    return [];
  }
  if (value.every((entry) => typeof entry === "number" && Number.isFinite(entry))) {
    return value as number[];
  }
  const numbers = value.map(Number);
  if (!numbers.every(Number.isFinite)) {
    throw new Error("Unity motion numeric array contains non-finite values.");
  }
  return numbers;
}

function unityMotionTrackToThreeTrack(track: UnityMotionTrack0414): THREE.KeyframeTrack {
  const propertyPath = track.property === "translation"
    ? "position"
    : track.property === "rotation"
      ? "quaternion"
      : track.property;
  const name = `${track.nodeKey}.${propertyPath}`;
  if (propertyPath === "position" || propertyPath === "scale") {
    if (track.componentCount !== 3) {
      throw new Error(`Unity motion track ${name} must have 3 components.`);
    }
    return new THREE.VectorKeyframeTrack(name, track.times, track.values);
  }
  if (propertyPath === "quaternion") {
    if (track.componentCount !== 4) {
      throw new Error(`Unity motion track ${name} must have 4 components.`);
    }
    return new THREE.QuaternionKeyframeTrack(name, track.times, track.values);
  }
  throw new Error(`Unsupported Unity motion property: ${track.property}`);
}

export function decodeUnityMotionClips(value: unknown): THREE.AnimationClip[] {
  const runtime = readUnityMotionRuntime0414(value);
  return runtime.clips.map((clip) => {
    const tracks = clip.tracks.map(unityMotionTrackToThreeTrack);
    const duration = tracks
      .flatMap((track) => Array.from(track.times))
      .reduce((max, time) => Math.max(max, time), 0);
    return new THREE.AnimationClip(clip.name, duration, tracks);
  });
}

function readBodyMotionBindings(extension: unknown): BodyMotionBindingSet | null {
  const payload = asRecord(extension);
  const motionPackage = asRecord(payload.motionPackage ?? payload.MotionPackage);
  const bindingSet = asRecord(motionPackage.bodyMotionBindings ?? motionPackage.BodyMotionBindings);
  const bindings = bindingSet.bindings ?? bindingSet.Bindings;
  if (!Array.isArray(bindings)) {
    return null;
  }

  return {
    version: String(bindingSet.version ?? bindingSet.Version ?? ""),
    bindingMode: String(bindingSet.bindingMode ?? bindingSet.BindingMode ?? ""),
    warnings: readStringArray(bindingSet.warnings ?? bindingSet.Warnings),
    bindings: bindings
      .map(readBodyMotionBinding)
      .filter((binding): binding is BodyMotionBinding => Boolean(binding)),
  };
}

function readBodyMotionBinding(value: unknown): BodyMotionBinding | null {
  const item = asRecord(value);
  const pathCrc = Number(item.pathCrc ?? item.PathCrc);
  const nodeKey = String(item.nodeKey ?? item.NodeKey ?? "");
  const leafName = String(item.leafName ?? item.LeafName ?? "");
  const targets = item.targets ?? item.Targets;
  if (!Number.isFinite(pathCrc) || !nodeKey || !Array.isArray(targets)) {
    return null;
  }
  const parsedTargets = targets
    .map(readBodyMotionTarget)
    .filter((target): target is BodyMotionTarget => Boolean(target));
  return {
    pathCrc,
    nodeKey,
    leafName,
    importedPath: readNullableString(item.importedPath ?? item.ImportedPath),
    sourceRest: readBodyMotionRest(item.sourceRest ?? item.SourceRest),
    targetCount: Number(item.targetCount ?? item.TargetCount ?? parsedTargets.length),
    targets: parsedTargets,
  };
}

function readBodyMotionTarget(value: unknown): BodyMotionTarget | null {
  const item = asRecord(value);
  const poseRoot = String(item.poseRoot ?? item.PoseRoot ?? "");
  const transformPath = String(item.transformPath ?? item.TransformPath ?? "");
  const pathId = Number(item.pathId ?? item.PathId);
  if (!poseRoot || !transformPath || !Number.isFinite(pathId)) {
    return null;
  }
  return {
    poseRoot,
    transformPath,
    pathId,
    rest: readBodyMotionRest(item.rest ?? item.Rest),
  };
}

function readBodyMotionRest(value: unknown): BodyMotionRestTransform | null {
  const item = asRecord(value);
  const position = readMotionVector3(item.position ?? item.Position);
  const rotation = readMotionQuaternion(item.rotation ?? item.Rotation);
  const scale = readMotionVector3(item.scale ?? item.Scale);
  if (!position || !rotation || !scale) {
    return null;
  }
  return { position, rotation, scale };
}

function readMotionVector3(value: unknown): THREE.Vector3 | null {
  const item = asRecord(value);
  const x = Number(item.x ?? item.X);
  const y = Number(item.y ?? item.Y);
  const z = Number(item.z ?? item.Z);
  return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)
    ? new THREE.Vector3(x, y, z)
    : null;
}

function readMotionQuaternion(value: unknown): THREE.Quaternion | null {
  const item = asRecord(value);
  const x = Number(item.x ?? item.X);
  const y = Number(item.y ?? item.Y);
  const z = Number(item.z ?? item.Z);
  const w = Number(item.w ?? item.W);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z) || !Number.isFinite(w)) {
    return null;
  }
  return new THREE.Quaternion(x, y, z, w).normalize();
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function readNullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function cloneTrackWithName(track: THREE.KeyframeTrack, name: string): THREE.KeyframeTrack {
  const cloned = track.clone();
  cloned.name = name;
  return cloned;
}

function retargetTrackWithBindSpace(
  track: THREE.KeyframeTrack,
  name: string,
  propertyPath: string,
  binding: BodyMotionBinding,
  target: BodyMotionTarget
): THREE.KeyframeTrack | null {
  if (target.poseRoot !== "face") {
    return cloneTrackWithName(track, name);
  }
  if (!binding.sourceRest || !target.rest) {
    return null;
  }

  if (propertyPath === "position") {
    const values: number[] = [];
    for (let index = 0; index < track.values.length; index += 3) {
      const sourceValue = new THREE.Vector3(
        track.values[index],
        track.values[index + 1],
        track.values[index + 2]
      );
      const targetValue = target.rest.position.clone()
        .add(sourceValue.sub(binding.sourceRest.position));
      values.push(targetValue.x, targetValue.y, targetValue.z);
    }
    return new THREE.VectorKeyframeTrack(name, track.times, values);
  }

  if (propertyPath === "quaternion") {
    const values: number[] = [];
    const sourceRestInverse = binding.sourceRest.rotation.clone().invert();
    for (let index = 0; index < track.values.length; index += 4) {
      const sourceValue = new THREE.Quaternion(
        track.values[index],
        track.values[index + 1],
        track.values[index + 2],
        track.values[index + 3]
      ).normalize();
      const targetValue = target.rest.rotation.clone()
        .multiply(sourceRestInverse)
        .multiply(sourceValue)
        .normalize();
      values.push(targetValue.x, targetValue.y, targetValue.z, targetValue.w);
    }
    return new THREE.QuaternionKeyframeTrack(name, track.times, values);
  }

  if (propertyPath === "scale") {
    const values: number[] = [];
    const sourceRest = binding.sourceRest.scale;
    const targetRest = target.rest.scale;
    if (sourceRest.x === 0 || sourceRest.y === 0 || sourceRest.z === 0) {
      return null;
    }
    for (let index = 0; index < track.values.length; index += 3) {
      values.push(
        targetRest.x * (track.values[index] / sourceRest.x),
        targetRest.y * (track.values[index + 1] / sourceRest.y),
        targetRest.z * (track.values[index + 2] / sourceRest.z)
      );
    }
    return new THREE.VectorKeyframeTrack(name, track.times, values);
  }

  return cloneTrackWithName(track, name);
}

function isFaceAssemblyBridgeMotionTarget(target: BodyMotionTarget) {
  if (target.poseRoot !== "face") {
    return false;
  }
  return /^face\/Position(?:\/Hip(?:\/Waist(?:\/Spine(?:\/Chest(?:\/Neck(?:\/Head)?)?)?)?)?)?$/.test(
    target.transformPath
  );
}

function hasUnityBodyHeadAssembly(extension: unknown) {
  const payload = asRecord(extension);
  const springBone = asRecord(payload.pjskSpringBone ?? payload.PjskSpringBone);
  const setup = asRecord(
    payload.runtimeUnitySetup ?? payload.RuntimeUnitySetup ??
      springBone.runtimeUnitySetup ?? springBone.RuntimeUnitySetup
  );
  const version = setup.version;
  const bodyHeadAssembly = version === "0414" || version === 414
    ? asRecord(setup.bodyHeadAssembly)
    : {};
  return Boolean(
    bodyHeadAssembly.parentingMode === "model_combine_setup" &&
    bodyHeadAssembly.parentAttachPath &&
    bodyHeadAssembly.childRootPath &&
    bodyHeadAssembly.childOriginPath
  );
}

export function retargetUnityPrefabAnimationClip(
  clip: THREE.AnimationClip,
  root: THREE.Object3D,
  extension: unknown
): { clip: THREE.AnimationClip | null; debug: RuntimeMotionRetargetDebug; error: string | null } {
  const bindingSet = readBodyMotionBindings(extension);
  const baseDebug: RuntimeMotionRetargetDebug = {
    mode: "unity-prefab",
    bindingCount: bindingSet?.bindings.length ?? 0,
    sourceTrackCount: clip.tracks.length,
    emittedTrackCount: 0,
    resolvedTargetCount: 0,
    resolvedBodyTargetCount: 0,
    resolvedFaceTargetCount: 0,
    unresolvedTrackCount: 0,
    duplicateTargetTrackCount: 0,
    sampleUnresolvedTracks: [],
    sampleResolvedHeadTargets: [],
  };

  if (!bindingSet || bindingSet.version !== "0414" || bindingSet.bindings.length === 0) {
    return {
      clip: null,
      debug: baseDebug,
      error: "Unity Prefab animation requires motionPackage.bodyMotionBindings version 0414.",
    };
  }

  const bindingByNodeKey = new Map(
    bindingSet.bindings.map((binding) => [binding.nodeKey, binding])
  );
  const nodeByPath = buildPrefabNodePathLookup(root);
  const suppressFaceAssemblyBridgeTargets = hasUnityBodyHeadAssembly(extension);
  const tracks: THREE.KeyframeTrack[] = [];
  const emittedTargets = new Set<string>();
  const resolvedBodyTargetPaths = new Set<string>();
  const resolvedFaceTargetPaths = new Set<string>();
  const sampleResolvedHeadTargets = new Set<string>();

  for (const track of clip.tracks) {
    const separator = track.name.lastIndexOf(".");
    const nodeKey = separator > 0 ? track.name.slice(0, separator) : "";
    const propertyPath = separator > 0 ? track.name.slice(separator + 1) : "";
    const binding = bindingByNodeKey.get(nodeKey);
    if (!binding || !propertyPath) {
      baseDebug.unresolvedTrackCount += 1;
      if (baseDebug.sampleUnresolvedTracks.length < 16) {
        baseDebug.sampleUnresolvedTracks.push(track.name);
      }
      continue;
    }

    let resolvedForTrack = 0;
    for (const target of binding.targets) {
      if (
        suppressFaceAssemblyBridgeTargets &&
        isFaceAssemblyBridgeMotionTarget(target)
      ) {
        continue;
      }
      const node = nodeByPath.get(target.transformPath);
      if (!node) {
        continue;
      }
      const nextTrackName = `${node.uuid}.${propertyPath}`;
      if (emittedTargets.has(nextTrackName)) {
        baseDebug.duplicateTargetTrackCount += 1;
        continue;
      }
      const retargetedTrack = retargetTrackWithBindSpace(
        track,
        nextTrackName,
        propertyPath,
        binding,
        target
      );
      if (!retargetedTrack) {
        continue;
      }
      emittedTargets.add(nextTrackName);
      tracks.push(retargetedTrack);
      if (target.poseRoot === "body") {
        resolvedBodyTargetPaths.add(target.transformPath);
      } else if (target.poseRoot === "face") {
        resolvedFaceTargetPaths.add(target.transformPath);
      }
      if (
        sampleResolvedHeadTargets.size < 16 &&
        /(?:^|\/)(Position|Hip|Waist|Spine|Chest|Neck|Head)$/.test(target.transformPath)
      ) {
        sampleResolvedHeadTargets.add(target.transformPath);
      }
      resolvedForTrack += 1;
    }

    if (resolvedForTrack === 0) {
      baseDebug.unresolvedTrackCount += 1;
      if (baseDebug.sampleUnresolvedTracks.length < 16) {
        baseDebug.sampleUnresolvedTracks.push(track.name);
      }
    } else {
      baseDebug.resolvedTargetCount += resolvedForTrack;
    }
  }

  baseDebug.emittedTrackCount = tracks.length;
  baseDebug.resolvedBodyTargetCount = resolvedBodyTargetPaths.size;
  baseDebug.resolvedFaceTargetCount = resolvedFaceTargetPaths.size;
  baseDebug.sampleResolvedHeadTargets = [...sampleResolvedHeadTargets];
  if (tracks.length === 0 || baseDebug.unresolvedTrackCount > 0) {
    return {
      clip: null,
      debug: baseDebug,
      error: `Unity Prefab animation retarget failed: ${baseDebug.unresolvedTrackCount} unresolved tracks.`,
    };
  }

  return {
    clip: new THREE.AnimationClip(`${clip.name || "motion"}_unity_prefab`, clip.duration, tracks),
    debug: baseDebug,
    error: null,
  };
}

import * as THREE from "three";
import {
  convertUnityDirectionToThree,
  convertUnityPositionToThree,
  readUnityVector3,
} from "./unityCoordinateConversion";

export type UnityConstraintRuntimeGraph = {
  root: THREE.Object3D;
  nodeByPath: Map<string, THREE.Object3D>;
};

export type RuntimeConstraintSetupSource = {
  version?: string | number;
  sourceKind?: string;
  constraints?: RuntimeConstraintSource[];
  warnings?: string[];
};

type RuntimeConstraintSource = {
  type?: string;
  ownerPath?: string | null;
  ownerName?: string | null;
  enabled?: boolean | null;
  active?: boolean | null;
  rotationOffset?: UnityVectorLike | null;
  aimVector?: UnityVectorLike | null;
  upVector?: UnityVectorLike | null;
  worldUpVector?: UnityVectorLike | null;
  worldUpObjectName?: string | null;
  worldUpObjectPath?: string | null;
  sources?: RuntimeConstraintBindingSource[];
  status?: string;
  reason?: string;
};

type UnityVectorLike = {
  x?: number;
  y?: number;
  z?: number;
  X?: number;
  Y?: number;
  Z?: number;
};

type RuntimeConstraintBindingSource = {
  sourceName?: string | null;
  sourcePath?: string | null;
  weight?: number;
  translationOffset?: UnityVectorLike | null;
  rotationOffset?: UnityVectorLike | null;
};

export type RuntimeConstraintDebug = {
  version: string | number | null;
  sourceKind: string | null;
  constraintCount: number;
  resolvedCount: number;
  unresolvedCount: number;
  appliedCount: number;
  warnings: string[];
  constraints: Array<{
    type: string;
    status: string;
    reason: string;
    ownerPath: string | null;
    ownerName: string | null;
    resolvedOwner: boolean;
    applied: boolean;
    sources: Array<{
      sourcePath: string | null;
      sourceName: string | null;
      weight: number;
      resolvedSource: boolean;
      translationOffset: { x: number; y: number; z: number } | null;
      rotationOffset: { x: number; y: number; z: number } | null;
    }>;
  }>;
};

type ResolvedConstraintSource = {
  node: THREE.Object3D | null;
  weight: number;
  translationOffset: THREE.Vector3 | null;
  rotationOffset: THREE.Vector3 | null;
  debug: RuntimeConstraintDebug["constraints"][number]["sources"][number];
};

type AppliedConstraintSource = ResolvedConstraintSource & {
  node: THREE.Object3D;
};

const TEMP_SOURCE_POSITION = new THREE.Vector3();
const TEMP_SOURCE_QUATERNION = new THREE.Quaternion();
const TEMP_SOURCE_SCALE = new THREE.Vector3();
const TEMP_TARGET_POSITION = new THREE.Vector3();
const TEMP_TARGET_QUATERNION = new THREE.Quaternion();
const TEMP_PARENT_QUATERNION = new THREE.Quaternion();
const TEMP_AIM_DIRECTION = new THREE.Vector3();
const TEMP_UP_DIRECTION = new THREE.Vector3();
const WORLD_UP = new THREE.Vector3(0, 1, 0);

export function applyUnityRuntimeConstraints(
  graph: UnityConstraintRuntimeGraph,
  setup: RuntimeConstraintSetupSource | undefined,
  characterHeight: number
): RuntimeConstraintDebug | null {
  if (!setup) {
    return null;
  }

  const constraints = Array.isArray(setup.constraints) ? setup.constraints : [];
  graph.root.updateMatrixWorld(true);
  const entries = constraints.map((constraint) =>
    applyRuntimeConstraint(graph, constraint, characterHeight)
  );
  graph.root.updateMatrixWorld(true);

  const resolvedCount = entries.filter((entry) =>
    entry.resolvedOwner && entry.sources.length > 0 && entry.sources.every((source) => source.resolvedSource)
  ).length;
  return {
    version: setup.version ?? null,
    sourceKind: setup.sourceKind ?? null,
    constraintCount: entries.length,
    resolvedCount,
    unresolvedCount: entries.length - resolvedCount,
    appliedCount: entries.filter((entry) => entry.applied).length,
    warnings: Array.isArray(setup.warnings)
      ? setup.warnings.filter((entry): entry is string => typeof entry === "string")
      : [],
    constraints: entries,
  };
}

function applyRuntimeConstraint(
  graph: UnityConstraintRuntimeGraph,
  constraint: RuntimeConstraintSource,
  characterHeight: number
): RuntimeConstraintDebug["constraints"][number] {
  const type = readRuntimeString(constraint.type) ?? "unknown";
  const ownerPath = readRuntimeString(constraint.ownerPath);
  const ownerName = readRuntimeString(constraint.ownerName);
  const owner = resolveConstraintGraphNode(graph, ownerPath, ownerName);
  const sourceRows = Array.isArray(constraint.sources) ? constraint.sources : [];
  const sources = sourceRows.map((source) =>
    resolveConstraintSource(graph, source, characterHeight)
  );
  const sourceDebug = sources.map((source) => source.debug);

  const skipped = (
    status: string,
    reason: string
  ): RuntimeConstraintDebug["constraints"][number] => ({
    type,
    status,
    reason,
    ownerPath,
    ownerName,
    resolvedOwner: Boolean(owner.node),
    applied: false,
    sources: sourceDebug,
  });

  if (constraint.enabled === false || constraint.active === false) {
    return skipped("skipped", "constraint component is disabled");
  }
  if (!owner.node) {
    return skipped("unresolved", owner.reason);
  }
  if (sources.length === 0) {
    return skipped("unresolved", "constraint has no source transforms");
  }
  const unresolvedSource = sources.find((source) => !source.node);
  if (unresolvedSource) {
    return skipped("unresolved", unresolvedSource.debug.sourceName
      ? `source transform ${unresolvedSource.debug.sourceName} was not uniquely resolved`
      : "constraint source transform was not resolved");
  }

  const resolvedSources = sources.filter(hasResolvedConstraintSource);
  if (type === "parent") {
    const missingOffset = resolvedSources.find((source) => !source.translationOffset);
    if (missingOffset) {
      return skipped("skipped", "parent constraint is missing exported translationOffset");
    }
    if (!applyParentConstraint(owner.node, resolvedSources)) {
      return skipped("skipped", "parent constraint has no positive source weight");
    }
    return appliedEntry(type, ownerPath, ownerName, sourceDebug, "parent constraint applied with height-scaled translation offsets");
  }
  if (type === "rotation") {
    if (!applyRotationConstraint(owner.node, resolvedSources)) {
      return skipped("skipped", "rotation constraint has no positive source weight");
    }
    return appliedEntry(type, ownerPath, ownerName, sourceDebug, "rotation constraint applied with weighted source rotations");
  }
  if (type === "aim") {
    const aimVector = asUnityDirection(constraint.aimVector, new THREE.Vector3(0, 0, 1));
    const upVector = asUnityDirection(constraint.upVector, new THREE.Vector3(0, 1, 0));
    const worldUpObject = resolveConstraintGraphNode(
      graph,
      readRuntimeString(constraint.worldUpObjectPath),
      readRuntimeString(constraint.worldUpObjectName)
    ).node;
    const worldUpVector = worldUpObject
      ? readWorldDirection(worldUpObject, asUnityDirection(constraint.worldUpVector, new THREE.Vector3(0, 1, 0)))
      : asUnityDirection(constraint.worldUpVector, WORLD_UP);
    if (!applyAimConstraint(owner.node, resolvedSources, aimVector, upVector, worldUpVector)) {
      return skipped("skipped", "aim constraint target direction or source weight was invalid");
    }
    return appliedEntry(type, ownerPath, ownerName, sourceDebug, "aim constraint applied with exported aim/up vectors");
  }
  return skipped("skipped", `unsupported constraint type ${type}`);
}

function appliedEntry(
  type: string,
  ownerPath: string | null,
  ownerName: string | null,
  sources: RuntimeConstraintDebug["constraints"][number]["sources"],
  reason: string
): RuntimeConstraintDebug["constraints"][number] {
  return {
    type,
    status: "applied",
    reason,
    ownerPath,
    ownerName,
    resolvedOwner: true,
    applied: true,
    sources,
  };
}

function resolveConstraintSource(
  graph: UnityConstraintRuntimeGraph,
  source: RuntimeConstraintBindingSource,
  characterHeight: number
): ResolvedConstraintSource {
  const sourcePath = readRuntimeString(source.sourcePath);
  const sourceName = readRuntimeString(source.sourceName);
  const resolved = resolveConstraintGraphNode(graph, sourcePath, sourceName);
  const weight = readRuntimeNumber(source.weight) ?? 1;
  const translationOffset = asConstraintTranslationOffset(source.translationOffset, characterHeight);
  const rotationOffset = asConstraintRotationOffset(source.rotationOffset);
  return {
    node: resolved.node,
    weight,
    translationOffset,
    rotationOffset,
    debug: {
      sourcePath,
      sourceName,
      weight,
      resolvedSource: Boolean(resolved.node),
      translationOffset: translationOffset
        ? { x: translationOffset.x, y: translationOffset.y, z: translationOffset.z }
        : null,
      rotationOffset: rotationOffset
        ? { x: rotationOffset.x, y: rotationOffset.y, z: rotationOffset.z }
        : null,
    },
  };
}

function hasResolvedConstraintSource(
  source: ResolvedConstraintSource
): source is AppliedConstraintSource {
  return Boolean(source.node);
}

function resolveConstraintGraphNode(
  graph: UnityConstraintRuntimeGraph,
  path: string | null,
  name: string | null
): { node: THREE.Object3D | null; reason: string } {
  if (path) {
    const exact = graph.nodeByPath.get(path);
    if (exact) {
      return { node: exact, reason: "resolved by transform path" };
    }
  }
  if (!name) {
    return { node: null, reason: "constraint transform path and name are missing" };
  }
  const candidates: THREE.Object3D[] = [];
  for (const node of graph.nodeByPath.values()) {
    if (node.name === name) {
      candidates.push(node);
    }
  }
  if (candidates.length === 1) {
    return { node: candidates[0], reason: "resolved by exact transform name" };
  }
  if (candidates.length > 1) {
    return { node: null, reason: `transform name ${name} matched ${candidates.length} nodes` };
  }
  return { node: null, reason: `transform name ${name} was not found` };
}

function applyParentConstraint(owner: THREE.Object3D, sources: AppliedConstraintSource[]) {
  const totalWeight = sources.reduce((sum, source) => sum + Math.max(0, source.weight), 0);
  if (totalWeight <= 0) {
    return false;
  }

  TEMP_TARGET_POSITION.set(0, 0, 0);
  let blendedRotation: THREE.Quaternion | null = null;
  let accumulatedWeight = 0;
  for (const source of sources) {
    const weight = Math.max(0, source.weight);
    if (weight <= 0) {
      continue;
    }
    source.node.updateMatrixWorld(true);
    source.node.matrixWorld.decompose(TEMP_SOURCE_POSITION, TEMP_SOURCE_QUATERNION, TEMP_SOURCE_SCALE);
    const weightedPosition = TEMP_SOURCE_POSITION.clone().add(
      source.translationOffset!.clone().applyQuaternion(TEMP_SOURCE_QUATERNION)
    );
    TEMP_TARGET_POSITION.addScaledVector(weightedPosition, weight / totalWeight);
    blendedRotation = blendWeightedQuaternion(
      blendedRotation,
      TEMP_SOURCE_QUATERNION,
      accumulatedWeight,
      weight
    );
    accumulatedWeight += weight;
  }
  if (blendedRotation) {
    applyWorldPositionRotation(owner, TEMP_TARGET_POSITION, blendedRotation);
    return true;
  }
  return false;
}

function applyRotationConstraint(owner: THREE.Object3D, sources: AppliedConstraintSource[]) {
  const rotation = weightedSourceRotation(sources);
  if (!rotation) {
    return false;
  }
  owner.getWorldPosition(TEMP_TARGET_POSITION);
  applyWorldPositionRotation(owner, TEMP_TARGET_POSITION, rotation);
  return true;
}

function applyAimConstraint(
  owner: THREE.Object3D,
  sources: AppliedConstraintSource[],
  aimVector: THREE.Vector3,
  upVector: THREE.Vector3,
  worldUpVector: THREE.Vector3
) {
  const totalWeight = sources.reduce((sum, source) => sum + Math.max(0, source.weight), 0);
  if (totalWeight <= 0) {
    return false;
  }
  owner.updateMatrixWorld(true);
  owner.getWorldPosition(TEMP_TARGET_POSITION);
  TEMP_AIM_DIRECTION.set(0, 0, 0);
  for (const source of sources) {
    const weight = Math.max(0, source.weight);
    if (weight <= 0) {
      continue;
    }
    source.node.updateMatrixWorld(true);
    source.node.getWorldPosition(TEMP_SOURCE_POSITION);
    TEMP_AIM_DIRECTION.addScaledVector(TEMP_SOURCE_POSITION, weight / totalWeight);
  }
  TEMP_AIM_DIRECTION.sub(TEMP_TARGET_POSITION);
  if (TEMP_AIM_DIRECTION.lengthSq() < 0.000001) {
    return false;
  }
  TEMP_AIM_DIRECTION.normalize();
  const normalizedAim = normalizeOrFallback(aimVector, new THREE.Vector3(0, 0, 1));
  const normalizedUp = normalizeOrFallback(upVector, new THREE.Vector3(0, 1, 0));
  const normalizedWorldUp = normalizeOrFallback(worldUpVector, WORLD_UP);
  TEMP_TARGET_QUATERNION.setFromUnitVectors(normalizedAim, TEMP_AIM_DIRECTION);
  TEMP_UP_DIRECTION.copy(normalizedUp).applyQuaternion(TEMP_TARGET_QUATERNION);
  const projectedCurrentUp = projectOntoPlane(TEMP_UP_DIRECTION, TEMP_AIM_DIRECTION);
  const projectedDesiredUp = projectOntoPlane(normalizedWorldUp, TEMP_AIM_DIRECTION);
  if (projectedCurrentUp.lengthSq() > 0.000001 && projectedDesiredUp.lengthSq() > 0.000001) {
    projectedCurrentUp.normalize();
    projectedDesiredUp.normalize();
    const twistAngle = Math.atan2(
      TEMP_AIM_DIRECTION.dot(new THREE.Vector3().crossVectors(projectedCurrentUp, projectedDesiredUp)),
      THREE.MathUtils.clamp(projectedCurrentUp.dot(projectedDesiredUp), -1, 1)
    );
    TEMP_TARGET_QUATERNION.premultiply(
      new THREE.Quaternion().setFromAxisAngle(TEMP_AIM_DIRECTION, twistAngle)
    );
  }
  applyWorldPositionRotation(owner, TEMP_TARGET_POSITION, TEMP_TARGET_QUATERNION);
  return true;
}

function applyWorldPositionRotation(
  node: THREE.Object3D,
  worldPosition: THREE.Vector3,
  worldQuaternion: THREE.Quaternion
) {
  const localPosition = worldPosition.clone();
  const localQuaternion = worldQuaternion.clone();
  if (node.parent) {
    node.parent.updateMatrixWorld(true);
    node.parent.worldToLocal(localPosition);
    node.parent.getWorldQuaternion(TEMP_PARENT_QUATERNION);
    localQuaternion.premultiply(TEMP_PARENT_QUATERNION.invert());
  }
  node.position.copy(localPosition);
  node.quaternion.copy(localQuaternion.normalize());
  node.updateMatrix();
  node.updateMatrixWorld(true);
}

function blendWeightedQuaternion(
  current: THREE.Quaternion | null,
  next: THREE.Quaternion,
  currentWeight: number,
  nextWeight: number
) {
  if (!current) {
    return next.clone();
  }
  const normalizedNext = next.clone();
  if (current.dot(normalizedNext) < 0) {
    normalizedNext.set(
      -normalizedNext.x,
      -normalizedNext.y,
      -normalizedNext.z,
      -normalizedNext.w
    );
  }
  return current.slerp(normalizedNext, nextWeight / (currentWeight + nextWeight)).normalize();
}

function weightedSourceRotation(sources: AppliedConstraintSource[]) {
  let blendedRotation: THREE.Quaternion | null = null;
  let accumulatedWeight = 0;
  for (const source of sources) {
    const weight = Math.max(0, source.weight);
    if (weight <= 0) {
      continue;
    }
    source.node.updateMatrixWorld(true);
    source.node.getWorldQuaternion(TEMP_SOURCE_QUATERNION);
    blendedRotation = blendWeightedQuaternion(
      blendedRotation,
      TEMP_SOURCE_QUATERNION,
      accumulatedWeight,
      weight
    );
    accumulatedWeight += weight;
  }
  return blendedRotation;
}

function asConstraintTranslationOffset(
  value: RuntimeConstraintBindingSource["translationOffset"],
  characterHeight: number
): THREE.Vector3 | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  return convertUnityPositionToThree(
    readUnityVector3(value, new THREE.Vector3())
  ).multiplyScalar(characterHeight);
}

function asConstraintRotationOffset(
  value: RuntimeConstraintBindingSource["rotationOffset"]
): THREE.Vector3 | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  return convertUnityDirectionToThree(readUnityVector3(value, new THREE.Vector3()));
}

function asUnityDirection(value: UnityVectorLike | undefined | null, fallback: THREE.Vector3) {
  if (!value || typeof value !== "object") {
    return fallback.clone();
  }
  return convertUnityDirectionToThree(readUnityVector3(value, fallback));
}

function readWorldDirection(node: THREE.Object3D, localDirection: THREE.Vector3) {
  node.updateMatrixWorld(true);
  node.getWorldQuaternion(TEMP_TARGET_QUATERNION);
  return localDirection.clone().applyQuaternion(TEMP_TARGET_QUATERNION);
}

function normalizeOrFallback(value: THREE.Vector3, fallback: THREE.Vector3) {
  return value.lengthSq() > 0.000001
    ? value.clone().normalize()
    : fallback.clone().normalize();
}

function projectOntoPlane(value: THREE.Vector3, planeNormal: THREE.Vector3) {
  return value.clone().addScaledVector(planeNormal, -value.dot(planeNormal));
}

function readRuntimeString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function readRuntimeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

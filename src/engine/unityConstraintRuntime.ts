import * as THREE from "three";
import {
  convertUnityDirectionToThree,
  convertUnityPositionToThree,
  convertUnityQuaternionToThree,
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
  weight?: number | null;
  // Unity documents locked as an editor offset-maintenance switch; it has no
  // effect while the constraint runs in Play Mode, so runtime evaluation does
  // not branch on this serialized value.
  locked?: boolean | null;
  translationAxis?: number | null;
  rotationAxis?: number | null;
  translationAtRest?: UnityVectorLike | null;
  rotationAtRest?: UnityVectorLike | null;
  translationOffset?: UnityVectorLike | null;
  rotationOffset?: UnityVectorLike | null;
  aimVector?: UnityVectorLike | null;
  upVector?: UnityVectorLike | null;
  worldUpVector?: UnityVectorLike | null;
  worldUpType?: number | null;
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
const ALL_AXES = 1 | 2 | 4;

export class UnityConstraintRuntime {
  constructor(
    private readonly graph: UnityConstraintRuntimeGraph,
    private readonly setup: RuntimeConstraintSetupSource,
    private readonly characterHeight: number
  ) {}

  update(): RuntimeConstraintDebug {
    return applyUnityRuntimeConstraints(this.graph, this.setup, this.characterHeight)!;
  }
}

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
  const originalLocalPosition = owner.node.position.clone();
  const originalLocalRotation = owner.node.quaternion.clone();
  if (type === "parent") {
    if (!applyParentConstraint(owner.node, resolvedSources)) {
      return skipped("skipped", "parent constraint has no positive source weight");
    }
    applyConstraintWeightAndAxes(
      owner.node,
      constraint,
      characterHeight,
      originalLocalPosition,
      originalLocalRotation,
      true,
      true
    );
    return appliedEntry(type, ownerPath, ownerName, sourceDebug, "parent constraint applied with height-scaled translation offsets");
  }
  if (type === "rotation") {
    if (!applyRotationConstraint(owner.node, resolvedSources, constraint.rotationOffset)) {
      return skipped("skipped", "rotation constraint has no positive source weight");
    }
    applyConstraintWeightAndAxes(
      owner.node,
      constraint,
      characterHeight,
      originalLocalPosition,
      originalLocalRotation,
      false,
      true
    );
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
    const worldUpVector = resolveAimWorldUpVector(
      owner.node,
      worldUpObject,
      constraint.worldUpType,
      constraint.worldUpVector
    );
    if (!applyAimConstraint(owner.node, resolvedSources, aimVector, upVector, worldUpVector, constraint.rotationOffset)) {
      return skipped("skipped", "aim constraint target direction or source weight was invalid");
    }
    applyConstraintWeightAndAxes(
      owner.node,
      constraint,
      characterHeight,
      originalLocalPosition,
      originalLocalRotation,
      false,
      true
    );
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
  const resolved = resolveReboundConstraintSourceNode(graph, sourcePath, sourceName);
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

function resolveReboundConstraintSourceNode(
  graph: UnityConstraintRuntimeGraph,
  sourcePath: string | null,
  sourceName: string | null
): { node: THREE.Object3D | null; reason: string } {
  // ModelUtility.ConstraintSetup deliberately discards the source prefab
  // reference and finds the first transform with the same name under the
  // currently combined model. Traversing the live root also excludes detached
  // body/head skeleton branches that remain addressable by their old paths.
  if (sourceName) {
    let match: THREE.Object3D | null = null;
    graph.root.traverse((node) => {
      if (!match && node.name === sourceName) {
        match = node;
      }
    });
    if (match) {
      return { node: match, reason: "rebound by transform name in the combined model" };
    }
  }
  return resolveConstraintGraphNode(graph, sourcePath, sourceName);
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
      (source.translationOffset ?? new THREE.Vector3()).clone().applyQuaternion(TEMP_SOURCE_QUATERNION)
    );
    TEMP_TARGET_POSITION.addScaledVector(weightedPosition, weight / totalWeight);
    blendedRotation = blendWeightedQuaternion(
      blendedRotation,
      applyConstraintRotationOffset(TEMP_SOURCE_QUATERNION, source.rotationOffset),
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

function applyRotationConstraint(
  owner: THREE.Object3D,
  sources: AppliedConstraintSource[],
  rotationOffset?: UnityVectorLike | null
) {
  const rotation = weightedSourceRotation(sources);
  if (!rotation) {
    return false;
  }
  owner.getWorldPosition(TEMP_TARGET_POSITION);
  applyWorldPositionRotation(
    owner,
    TEMP_TARGET_POSITION,
    applyConstraintRotationOffset(rotation, asConstraintRotationOffset(rotationOffset))
  );
  return true;
}

function applyAimConstraint(
  owner: THREE.Object3D,
  sources: AppliedConstraintSource[],
  aimVector: THREE.Vector3,
  upVector: THREE.Vector3,
  worldUpVector: THREE.Vector3 | null,
  rotationOffset?: UnityVectorLike | null
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
  TEMP_TARGET_QUATERNION.setFromUnitVectors(normalizedAim, TEMP_AIM_DIRECTION);
  TEMP_UP_DIRECTION.copy(normalizedUp).applyQuaternion(TEMP_TARGET_QUATERNION);
  if (worldUpVector) {
    const normalizedWorldUp = normalizeOrFallback(worldUpVector, WORLD_UP);
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
  }
  applyWorldPositionRotation(
    owner,
    TEMP_TARGET_POSITION,
    applyConstraintRotationOffset(TEMP_TARGET_QUATERNION, asConstraintRotationOffset(rotationOffset))
  );
  return true;
}

function resolveAimWorldUpVector(
  owner: THREE.Object3D,
  worldUpObject: THREE.Object3D | null,
  worldUpType: number | null | undefined,
  worldUpVector: UnityVectorLike | null | undefined
): THREE.Vector3 | null {
  switch (readRuntimeNumber(worldUpType) ?? 0) {
    case 1: {
      if (!worldUpObject) {
        return WORLD_UP.clone();
      }
      owner.getWorldPosition(TEMP_TARGET_POSITION);
      worldUpObject.getWorldPosition(TEMP_SOURCE_POSITION);
      return TEMP_SOURCE_POSITION.clone().sub(TEMP_TARGET_POSITION);
    }
    case 2:
      return worldUpObject
        ? readWorldDirection(worldUpObject, asUnityDirection(worldUpVector, WORLD_UP))
        : asUnityDirection(worldUpVector, WORLD_UP);
    case 3:
      return asUnityDirection(worldUpVector, WORLD_UP);
    case 4:
      return null;
    default:
      return WORLD_UP.clone();
  }
}

function applyConstraintRotationOffset(
  rotation: THREE.Quaternion,
  offset: THREE.Vector3 | null
): THREE.Quaternion {
  if (!offset) {
    return rotation.clone();
  }
  return rotation.clone().multiply(unityEulerDegreesToThreeQuaternion(offset)).normalize();
}

function applyConstraintWeightAndAxes(
  owner: THREE.Object3D,
  constraint: RuntimeConstraintSource,
  characterHeight: number,
  originalPosition: THREE.Vector3,
  originalRotation: THREE.Quaternion,
  controlsTranslation: boolean,
  controlsRotation: boolean
): void {
  const weight = THREE.MathUtils.clamp(readRuntimeNumber(constraint.weight) ?? 1, 0, 1);
  const targetPosition = owner.position.clone();
  const targetRotation = owner.quaternion.clone();
  // ModelUtility only height-scales ParentConstraint per-source offsets. The
  // serialized at-rest pose remains in the owner's local prefab coordinates.
  const restPosition = asConstraintTranslationOffset(constraint.translationAtRest, 1) ?? originalPosition;
  const restRotation = constraint.rotationAtRest
    ? unityEulerDegreesToThreeQuaternion(asRawUnityVector(constraint.rotationAtRest))
    : originalRotation;

  if (controlsTranslation) {
    const axes = readRuntimeNumber(constraint.translationAxis) ?? ALL_AXES;
    const blended = restPosition.clone().lerp(targetPosition, weight);
    owner.position.set(
      axisEnabled(axes, 1) ? blended.x : restPosition.x,
      axisEnabled(axes, 2) ? blended.y : restPosition.y,
      axisEnabled(axes, 4) ? blended.z : restPosition.z
    );
  } else {
    owner.position.copy(originalPosition);
  }

  if (controlsRotation) {
    const axes = readRuntimeNumber(constraint.rotationAxis) ?? ALL_AXES;
    const restEuler = new THREE.Euler().setFromQuaternion(restRotation, "ZXY");
    const targetEuler = new THREE.Euler().setFromQuaternion(targetRotation, "ZXY");
    const axisTarget = new THREE.Euler(
      axisEnabled(axes, 1) ? targetEuler.x : restEuler.x,
      axisEnabled(axes, 2) ? targetEuler.y : restEuler.y,
      axisEnabled(axes, 4) ? targetEuler.z : restEuler.z,
      "ZXY"
    );
    owner.quaternion.copy(restRotation).slerp(
      new THREE.Quaternion().setFromEuler(axisTarget),
      weight
    ).normalize();
  } else {
    owner.quaternion.copy(originalRotation);
  }
  owner.updateMatrix();
  owner.updateMatrixWorld(true);
}

function axisEnabled(mask: number, axis: number): boolean {
  return (mask & axis) !== 0;
}

function asRawUnityVector(value: UnityVectorLike): THREE.Vector3 {
  return readUnityVector3(value, new THREE.Vector3());
}

function unityEulerDegreesToThreeQuaternion(value: THREE.Vector3): THREE.Quaternion {
  const unityRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(
    THREE.MathUtils.degToRad(value.x),
    THREE.MathUtils.degToRad(value.y),
    THREE.MathUtils.degToRad(value.z),
    "ZXY"
  ));
  return convertUnityQuaternionToThree(unityRotation);
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
  return readUnityVector3(value, new THREE.Vector3());
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

import * as THREE from "three";
import {
  applyUtjLengthLimits,
  cacheUtjSpringBonePosition,
  checkUtjGroundCollision,
  checkUtjCollisions,
  computeUtjLocalRotation,
  computeAnimatedTipPosition,
  constrainUtjAngleLimit,
  createUtjSpringBoneState,
  updateUtjSpring,
  type UtjAngleLimit,
  type UtjCollider,
  type UtjColliderCheckTrace,
  type UtjLengthLimitTarget,
  type UtjSpringBoneState,
} from "./utjSpringBoneRuntime";

type JsonRecord = Record<string, unknown>;

type Candidate = {
  vrmExtensionDraft?: {
    springBonePivots?: CandidateSpringBonePivot[];
    colliders?: CandidateCollider[];
    colliderGroups?: CandidateColliderGroup[];
    springs?: CandidateSpring[];
  };
};

type CandidateSpringBonePivot = {
  sourcePathId?: number;
  scriptName?: string;
  nodeName?: string | null;
  nodePath?: string | null;
};

type CandidateCollider = {
  index?: number;
  sourcePathId?: number;
  name?: string;
  poseRoot?: string | null;
  enabled?: boolean;
  linkedRenderer?: {
    fileId?: number;
    pathId?: number;
    name?: string | null;
    transformPath?: string | null;
  } | null;
  linkedRendererEnabled?: boolean | null;
  nodeName?: string | null;
  nodePath?: string | null;
  shape?: {
    sphere?: {
      offset?: number[];
      radius?: number;
    } | null;
    capsule?: {
      offset?: number[];
      radius?: number;
      tail?: number[];
    } | null;
    panel?: {
      width?: number;
      height?: number;
    } | null;
  };
};

type CandidateColliderGroup = {
  index?: number;
  colliders?: number[];
  sourceKind?: string | null;
  colliderFlag?: number | null;
  matchedPrefixes?: string[] | null;
  collidersByRoot?: Record<string, number[]> | null;
  defaultRoot?: string | null;
};

type RuntimeUnitySetup = {
  version?: number | string;
  rootSelectionProfile?: {
    defaultBodyRoot?: string;
    rootCandidates?: { root?: string; defaultPriority?: number }[];
  } | null;
  managerColliderCaches?: RuntimeManagerColliderCache[];
  bindingDecisions?: RuntimeBindingDecision[];
  activeRootProfile?: {
    defaultBodyRoot?: string;
    activeRoots?: string[];
    inactiveRoots?: string[];
  } | null;
};

type RuntimeManagerColliderCache = {
  managerPathId?: number;
  partKind?: string | null;
  sourcePoseRoot?: string | null;
  runtimeRoot?: string | null;
  managerNodeName?: string | null;
  managerNodePath?: string | null;
  springBonePathIds?: number[];
  sphereColliderIndexes?: number[];
  capsuleColliderIndexes?: number[];
  panelColliderIndexes?: number[];
};

type RuntimeBindingDecision = {
  sourceKind?: string | null;
  sourceSpringBonePathId?: number;
  colliderFlag?: number | null;
  candidateRoots?: Record<string, number[]> | null;
  defaultRoot?: string | null;
  selectedColliderIndexes?: number[];
};

type CandidateSpring = {
  name?: string;
  managerPathId?: number;
  enabled?: boolean;
  dynamicRatio?: number;
  automaticUpdates?: boolean;
  enableLengthLimits?: boolean;
  enableAngleLimits?: boolean;
  enableCollision?: boolean;
  collideWithGround?: boolean;
  groundHeight?: number;
  isSumOfForcesOnBone?: boolean;
  isPaused?: boolean;
  simulationFrameRate?: number;
  slowMotionScale?: number;
  bounce?: number;
  friction?: number;
  animatedBoneNames?: string[];
  rawGravity?: { X?: number; Y?: number; Z?: number } | null;
  forceProviders?: CandidateForceProvider[];
  joints?: CandidateJoint[];
  colliderGroups?: number[];
  jointColliderGroups?: Record<string, number[]>;
  jointColliderGroupsByNodePath?: Record<string, number[]>;
};

type CandidateForceProvider = {
  sourcePathId?: number;
  scriptName?: string;
  nodeName?: string | null;
  nodePath?: string | null;
  activeSelf?: boolean | null;
  activeInHierarchy?: boolean | null;
  springManagerPathId?: number | null;
  raw?: JsonRecord | null;
};

type CandidateJoint = {
  nodeName?: string | null;
  nodePath?: string | null;
  sourcePathId?: number;
  enabled?: boolean;
  pivotNodeName?: string | null;
  pivotNodePath?: string | null;
  hitRadius?: number;
  rawStiffnessForce?: number | null;
  rawDragForce?: number | null;
  rawAngularStiffness?: number | null;
  rawSpringConstant?: number | null;
  rawWindInfluence?: number | null;
  dragForce?: number;
  rawSpringForce?: { X?: number; Y?: number; Z?: number } | null;
  rawBoneAxis?: { X?: number; Y?: number; Z?: number; x?: number; y?: number; z?: number } | number[] | null;
  boneAxis?: { X?: number; Y?: number; Z?: number; x?: number; y?: number; z?: number } | number[] | null;
  lengthLimitTargets?: CandidateLengthLimitTarget[];
  rawAngleLimits?: {
    y?: CandidateAngleLimit | null;
    z?: CandidateAngleLimit | null;
  } | null;
};

type CandidateLengthLimitTarget = {
  nodeName?: string | null;
  nodePath?: string | null;
  sourcePathId?: number;
};

type CandidateAngleLimit = {
  active?: boolean;
  min?: number | null;
  max?: number | null;
};

type RuntimeCollider = {
  source: CandidateCollider;
  node: THREE.Object3D;
};

type RuntimeColliderGroup = {
  source: CandidateColliderGroup;
  colliders: RuntimeCollider[];
  collidersByRoot: Map<string, RuntimeCollider[]>;
};

type RuntimeColliderBinding = {
  colliders: RuntimeCollider[];
  diagnostics: RuntimeColliderBindingDiagnostic[];
};

type RuntimeColliderBindingDiagnostic = {
  sourceKind: string;
  colliderFlag: number | null;
  colliderGroupIndex: number | null;
  springName: string;
  boneName: string | null;
  bonePath: string | null;
  sourceSpringBonePathId: number | null;
  candidateRoots: {
    root: string;
    colliderCount: number;
    colliderSourcePathIds: number[];
  }[];
  defaultRoot: string | null;
  selectedRoot: string | null;
  selectedColliderCount: number;
  selectedColliderSourcePathIds: number[];
  selectionReason: string;
};

type RuntimeColliderRootSelection = {
  root: string | null;
  reason: string;
};

type RuntimeManagerColliderCacheBinding = {
  source: RuntimeManagerColliderCache;
  colliderIndexes: Set<number>;
};

type LastCollisionInfo = {
  kind: string;
  name: string | null;
  path: string | null;
  sourcePathId: number | null;
  hitNormal: THREE.Vector3;
};

type RuntimeBone = {
  managerPathId: number | null;
  springName: string;
  sourceBoneName: string | null;
  sourceBonePath: string | null;
  sourceBonePathId: number | null;
  pivotSourceName: string | null;
  pivotSourcePath: string | null;
  pivotResolvedPath: string | null;
  tailBinding: RuntimeTailBindingDiagnostic;
  automaticUpdates: boolean;
  enabled: boolean;
  enableLengthLimits: boolean;
  enableAngleLimits: boolean;
  enableCollision: boolean;
  collideWithGround: boolean;
  groundHeight: number;
  isSumOfForcesOnBone: boolean;
  isPaused: boolean;
  gravity: THREE.Vector3;
  forceProviders: RuntimeForceProvider[];
  node: THREE.Object3D;
  state: UtjSpringBoneState;
  initialLocalRotation: THREE.Quaternion;
  skinAnimationLocalRotation: THREE.Quaternion;
  lastAppliedLocalRotation: THREE.Quaternion;
  hasAppliedLocalRotation: boolean;
  boneAxis: THREE.Vector3;
  boneAxisSource: RuntimeBoneAxisSource;
  springLength: number;
  dynamicRatio: number;
  isAnimated: boolean;
  simulationFrameRate: number;
  slowMotionScale: number;
  bounce: number;
  friction: number;
  radius: number;
  stiffnessForce: number;
  dragForce: number;
  springForce: THREE.Vector3;
  windInfluence: number;
  springConstant: number;
  lengthLimitTargets: RuntimeLengthLimitTarget[];
  angularStiffness: number;
  pivotNode: THREE.Object3D | null;
  yAngleLimit: UtjAngleLimit | null;
  zAngleLimit: UtjAngleLimit | null;
  colliders: RuntimeCollider[];
  colliderBindingDiagnostics: RuntimeColliderBindingDiagnostic[];
  angleLimitForwardSign: number;
  lastCollisionStatus: number;
  lastCollisionInfo: LastCollisionInfo | null;
  lastAngleLimitApplied: boolean;
};

type RuntimeBoneAxisSource =
  | "raw-bone-axis"
  | "prefab-local-child"
  | "computed-local-tip"
  | "computed-rotation-tip"
  | "fallback-local-tip";

type RuntimeForceProvider = RuntimeForceVolume | RuntimeWindVolume | RuntimeWindVolumeOneSelf;

type RuntimeForceVolume = {
  kind: "ForceVolume";
  sourcePathId: number | null;
  node: THREE.Object3D;
  springManagerPathId: number | null;
  strength: number;
};

type RuntimeWindVolume = {
  kind: "WindVolume";
  sourcePathId: number | null;
  node: THREE.Object3D;
  springManagerPathId: number | null;
  weight: number;
  strength: number;
  period: number;
  positionalMultiplier: number;
  timeFactor: number;
  offsetVector: THREE.Vector3;
};

type RuntimeWindVolumeOneSelf = {
  kind: "WindVolumeOneSelf";
  sourcePathId: number | null;
  node: THREE.Object3D;
  springManagerPathId: number | null;
  isActive: boolean;
  dynamicRatio: number;
  simulationFrameRate: number;
  weight: number;
  strength: number;
  period: number;
  currentTime: number;
  spinPeriod: number;
  spinTime: number;
  amplitude: number;
  peakDistance: number;
  additionalWindAngle: number;
  additionalWindStrength: number;
};

type RuntimeLengthLimitTarget = {
  node: THREE.Object3D;
  initialLength: number;
};

type NodeResolution = {
  nodeByPath: Map<string, THREE.Object3D>;
  canonicalNodeByPath: Map<string, THREE.Object3D>;
  aliasNodeByPath: Map<string, THREE.Object3D>;
  nodeByName: Map<string, THREE.Object3D[]>;
};

type ManagerSettings = {
  dynamicRatio: number;
  animatedBoneNames: ReadonlySet<string>;
  simulationFrameRate: number;
  slowMotionScale: number;
  bounce: number;
  friction: number;
};

export type UtjSpringBoneRuntimeOptions = {
  childPositionMode?: "utj" | "unityPrefab";
  colliderBindingMode?: "utj" | "unityPrefab";
};

type VectorSnapshot = {
  x: number;
  y: number;
  z: number;
  length: number;
};

type RuntimeTailBindingDiagnostic = {
  mode: "fallback" | "singleChild" | "averageChildren";
  childCount: number;
  childNames: string[];
  childPaths: string[];
  tailPosition: THREE.Vector3;
};

type TailBindingSnapshot = Omit<RuntimeTailBindingDiagnostic, "tailPosition"> & {
  tailPosition: VectorSnapshot;
};

type QuaternionSnapshot = {
  x: number;
  y: number;
  z: number;
  w: number;
};

type UtjSpringBoneStateSnapshot = {
  currTipPos: VectorSnapshot;
  prevTipPos: VectorSnapshot;
  hitNormal: VectorSnapshot;
  cachedPosition: VectorSnapshot;
  cachedMovement: VectorSnapshot;
};

type UtjAngleLimitTrace = {
  enabled: boolean;
  hasPivot: boolean;
  pivotName: string | null;
  pivotPath: string | null;
  vectorBefore: VectorSnapshot | null;
  forward: VectorSnapshot | null;
  back: VectorSnapshot | null;
  down: VectorSnapshot | null;
  yApplied: boolean;
  zApplied: boolean;
  afterY: VectorSnapshot | null;
  afterZ: VectorSnapshot | null;
  vectorAfter: VectorSnapshot | null;
};

export type UtjSpringBoneTraceEvent = {
  sequence: number;
  springName: string;
  boneName: string;
  bonePath: string;
  sourceBoneName: string | null;
  sourceBonePath: string | null;
  sourceBonePathId: number | null;
  pivotSourceName: string | null;
  pivotSourcePath: string | null;
  pivotResolvedPath: string | null;
  tailBinding: TailBindingSnapshot;
  managerPathId: number | null;
  deltaTime: number;
  dynamicRatio: number;
  automaticUpdates: boolean;
  enabled: boolean;
  enableCollision: boolean;
  enableAngleLimits: boolean;
  enableLengthLimits: boolean;
  colliderCount: number;
  forceProviderCount: number;
  headPosition: VectorSnapshot;
  parentRotation: QuaternionSnapshot;
  initialLocalRotation: QuaternionSnapshot;
  skinAnimationLocalRotation: QuaternionSnapshot;
  boneAxis: VectorSnapshot;
  boneAxisSource: RuntimeBoneAxisSource;
  springLength: number;
  radius: number;
  tailRadius: number;
  stiffnessForce: number;
  dragForce: number;
  springForce: VectorSnapshot;
  gravity: VectorSnapshot;
  externalForce: VectorSnapshot;
  stateBefore: UtjSpringBoneStateSnapshot;
  stateAfterCache: UtjSpringBoneStateSnapshot;
  animatedTip: VectorSnapshot;
  stateAfterUpdateSpring: UtjSpringBoneStateSnapshot;
  stateAfterLengthLimits: UtjSpringBoneStateSnapshot;
  groundHit: boolean;
  stateAfterGround: UtjSpringBoneStateSnapshot;
  collisionStatus: number;
  collisionChecks: UtjColliderTraceSnapshot[];
  stateAfterCollisions: UtjSpringBoneStateSnapshot;
  angleLimit: UtjAngleLimitTrace;
  stateAfterAngleLimits: UtjSpringBoneStateSnapshot;
  finalLocalRotation: QuaternionSnapshot;
};

export type UtjColliderTraceSnapshot = {
  kind: string;
  name: string | null;
  path: string | null;
  sourcePathId: number | null;
  enabled: boolean;
  status: number;
  beforeTailPosition: VectorSnapshot;
  afterTailPosition: VectorSnapshot;
  hitNormal: VectorSnapshot;
  localHeadPosition: VectorSnapshot | null;
  localTailPositionBefore: VectorSnapshot | null;
  localTailPositionAfter: VectorSnapshot | null;
  localTailRadius: number | null;
  localSphereOrigin: VectorSnapshot | null;
  localSphereRadius: number | null;
  localCapsuleStart: VectorSnapshot | null;
  localCapsuleEnd: VectorSnapshot | null;
  capsuleRadius: number | null;
  panelWidth: number | null;
  panelHeight: number | null;
};

export type UtjSpringBoneTraceSnapshot = {
  filters: string[];
  eventCount: number;
  events: UtjSpringBoneTraceEvent[];
};

export type UtjSpringBoneDebugOptions = {
  springDebugBones?: readonly string[];
  springDebugAllOffsets?: boolean;
};

export type UtjSpringBoneRuntimeSnapshot = {
  runtimeMode?: "webgl-utj" | "unity-prefab";
  enabled: boolean;
  springCount: number;
  boneCount: number;
  colliderCount: number;
  missingNodeCount: number;
  missingNodeSamples: string[];
  setupDiagnostics?: {
    managerCount: number;
    boneSourceCount: number;
    colliderSourceCount: number;
    bindingDecisionCount: number;
    managerColliderCacheCount: number;
    activeRootCount: number;
    activeRoots: string[];
  };
  maxSleeveOffset: number;
  maxSkirtOffset: number;
  topOffsets: {
    name: string;
    path: string;
    springName: string;
    sourceBoneName: string | null;
    sourceBonePath: string | null;
    sourceBonePathId: number | null;
    resolvedIsSkinnedBone: boolean;
    pivotSourceName: string | null;
    pivotSourcePath: string | null;
    pivotResolvedPath: string | null;
    tailBinding: TailBindingSnapshot;
    offset: number;
    colliderCount: number;
    lastCollisionStatus: number;
    lastCollisionColliderName: string | null;
    lastCollisionColliderPath: string | null;
    lastCollisionColliderKind: string | null;
    lastCollisionColliderSourcePathId: number | null;
    lastAngleLimitApplied: boolean;
    hasSpringForce: boolean;
    forceProviderCount: number;
    stiffnessForce: number;
    managerDynamicRatio?: number;
    dynamicRatio: number;
    isAnimated?: boolean;
    automaticUpdates?: boolean;
    boneEnabled?: boolean;
    bonePaused?: boolean;
    isSumOfForcesOnBone?: boolean;
    simulationFrameRate?: number;
    slowMotionScale?: number;
    updateSkipReason?: string | null;
    animatedTipDelta: VectorSnapshot;
    velocity: VectorSnapshot;
    springForce: VectorSnapshot;
    colliderBindings: RuntimeColliderBindingDiagnostic[];
  }[];
  debugOffsets?: UtjSpringBoneRuntimeSnapshot["topOffsets"];
  controlledPartCounts?: {
    runtimePartIndex: number | null;
    runtimePartType: string | null;
    sourceRoot: string | null;
    count: number;
    sampleNames: string[];
    samplePaths: string[];
  }[];
  controlledHairSamples?: {
    name: string;
    path: string;
    sourceBonePath: string | null;
    runtimePartIndex: number | null;
    runtimePartType: string | null;
    resolvedIsSkinnedBone: boolean;
  }[];
  skirtOffsets: {
    name: string;
    path: string;
    springName: string;
    sourceBoneName: string | null;
    sourceBonePath: string | null;
    sourceBonePathId: number | null;
    resolvedIsSkinnedBone: boolean;
    pivotSourceName: string | null;
    pivotSourcePath: string | null;
    pivotResolvedPath: string | null;
    tailBinding: TailBindingSnapshot;
    offset: number;
    appliedRotationDegrees: number;
    colliderCount: number;
    lastCollisionStatus: number;
    lastCollisionColliderName: string | null;
    lastCollisionColliderPath: string | null;
    lastCollisionColliderKind: string | null;
    lastCollisionColliderSourcePathId: number | null;
    lastCollisionHitNormal: VectorSnapshot | null;
    lastAngleLimitApplied: boolean;
    hasSpringForce: boolean;
    forceProviderCount: number;
    stiffnessForce: number;
    dragForce: number;
    managerDynamicRatio?: number;
    dynamicRatio: number;
    isAnimated?: boolean;
    automaticUpdates?: boolean;
    boneEnabled?: boolean;
    bonePaused?: boolean;
    isSumOfForcesOnBone?: boolean;
    simulationFrameRate?: number;
    slowMotionScale?: number;
    updateSkipReason?: string | null;
    animatedTipDelta: VectorSnapshot;
    velocity: VectorSnapshot;
    headMovement: VectorSnapshot;
    gravity: VectorSnapshot;
    springForce: VectorSnapshot;
    colliderBindings: RuntimeColliderBindingDiagnostic[];
  }[];
  bindingDiagnostics: RuntimeColliderBindingDiagnostic[];
  skinnedBoneMatches: number;
  skinnedBoneMisses: number;
};

const UNITY_MATHF_EPSILON = 1.401298464324817e-45;

export class UtjSpringBoneRuntime {
  private readonly bones: RuntimeBone[];
  private readonly missingNodes: string[];
  private readonly skinnedBones: Set<THREE.Object3D>;
  private readonly externalForce = new THREE.Vector3(0, 0, 0);
  private readonly parentRotation = new THREE.Quaternion();
  private readonly headPosition = new THREE.Vector3();
  private readonly localRotation = new THREE.Quaternion();
  private readonly skinAnimationLocalRotation = new THREE.Quaternion();
  private readonly unitScale = new THREE.Vector3(1, 1, 1);
  private readonly colliderLocalToWorld = new THREE.Matrix4();
  private readonly colliderWorldToLocal = new THREE.Matrix4();
  private readonly frameColliderCache = new Map<RuntimeCollider, UtjCollider>();
  private readonly angleVector = new THREE.Vector3();
  private readonly constrainedAngleVector = new THREE.Vector3();
  private readonly pivotRotation = new THREE.Quaternion();
  private readonly pivotInverseRotation = new THREE.Quaternion();
  private readonly providerForce = new THREE.Vector3();
  private readonly waveAxis = new THREE.Vector3();
  private readonly localBonePosition = new THREE.Vector3();
  private readonly additionalDirection = new THREE.Vector3();
  private readonly debugAnimatedTip = new THREE.Vector3();
  private traceFilters: string[] = [];
  private traceMaxEvents = 240;
  private traceSequence = 0;
  private readonly traceEvents: UtjSpringBoneTraceEvent[] = [];

  private constructor(bones: RuntimeBone[], missingNodes: string[], skinnedBones: Set<THREE.Object3D>) {
    this.bones = bones;
    this.missingNodes = missingNodes;
    this.skinnedBones = skinnedBones;
  }

  static fromPjskRuntimeExtension(
    extension: unknown,
    root: THREE.Object3D,
    options: UtjSpringBoneRuntimeOptions = {}
  ): UtjSpringBoneRuntime | null {
    const payload = asRecord(extension);
    const springBone = asRecord(payload?.pjskSpringBone ?? payload?.PjskSpringBone);
    const runtimeUnitySetup = asRecord(
      springBone?.runtimeUnitySetup ?? springBone?.RuntimeUnitySetup
    ) as RuntimeUnitySetup | null;
    const candidate = asRecord(springBone?.vrmCandidate ?? springBone?.VrmCandidate) as
      | Candidate
      | null;
    const draft = candidate?.vrmExtensionDraft;
    if (!draft?.springs?.length) {
      return null;
    }

    root.updateMatrixWorld(true);
    const resolution = buildNodeResolution(root);
    const skinnedBones = collectSkinnedBones(root);
    const managerSettingsByPathId = buildManagerSettingsByPathId(springBone);
    const colliderByIndex = new Map<number, RuntimeCollider>();
    const bindingDecisionByBonePathId = buildRuntimeBindingDecisionMap(runtimeUnitySetup);
    const managerColliderCacheByPathId = buildRuntimeManagerColliderCacheMap(runtimeUnitySetup);
    const missingNodes: string[] = [];
    const usesUnityPrefabRoots =
      options.childPositionMode === "unityPrefab" ||
      options.colliderBindingMode === "unityPrefab";
    const activeRuntimeRoots = new Set(
      (usesUnityPrefabRoots
        ? runtimeUnitySetup?.activeRootProfile?.activeRoots ?? []
        : []
      )
        .map((rootName) => normalizeRootName(rootName))
        .filter((rootName): rootName is string => Boolean(rootName))
    );

    for (const collider of draft.colliders ?? []) {
      if (typeof collider.index !== "number") {
        continue;
      }
      const node = resolveNode(resolution, collider.nodePath, collider.nodeName, {
        allowNameFallback: false,
        allowSitBodyAlias: false,
      });
      if (!node) {
        missingNodes.push(collider.nodePath ?? collider.nodeName ?? `collider:${collider.index}`);
        continue;
      }
      colliderByIndex.set(collider.index, { source: collider, node });
    }

    const colliderGroupByIndex = new Map<number, RuntimeColliderGroup>();
    for (const group of draft.colliderGroups ?? []) {
      if (typeof group.index !== "number") {
        continue;
      }
      const colliders = (group.colliders ?? [])
        .map((index) => colliderByIndex.get(index))
        .filter((collider): collider is RuntimeCollider => Boolean(collider));
      const collidersByRoot = new Map<string, RuntimeCollider[]>();
      for (const [rootName, indexes] of Object.entries(group.collidersByRoot ?? {})) {
        const rootColliders = indexes
          .map((index) => colliderByIndex.get(index))
          .filter((collider): collider is RuntimeCollider => Boolean(collider));
        if (rootColliders.length > 0) {
          collidersByRoot.set(rootName, rootColliders);
        }
      }
      colliderGroupByIndex.set(group.index, {
        source: group,
        colliders,
        collidersByRoot,
      });
    }

    const bones: RuntimeBone[] = [];
    const childExclusionNodes = collectSpringBoneChildExclusionNodes(draft.springs, resolution);
    const pivotExclusionNodes = collectSpringBonePivotNodes(draft.springBonePivots, resolution);
    const controlledNodes = new Set<THREE.Object3D>();
    const forceProviderCache = new Map<string, RuntimeForceProvider>();
    for (const spring of draft.springs) {
      const joints = spring.joints ?? [];
      const jointNodes = joints.map((joint) =>
        resolveSpringJointNode(resolution, joint)
      );
      const forceProviders = resolveForceProviders(resolution, spring, forceProviderCache);

      for (let index = 0; index < joints.length; index += 1) {
        const joint = joints[index];
        if (!isRuntimeJointActive(joint, activeRuntimeRoots)) {
          continue;
        }
        const node = jointNodes[index];
        if (!node) {
          missingNodes.push(joint.nodePath ?? joint.nodeName ?? `${spring.name ?? "spring"}:${index}`);
          continue;
        }
        if (node.name.endsWith("_spring_tail") || controlledNodes.has(node)) {
          continue;
        }

        const pivotNode = resolveSpringBonePivotNode(resolution, joint);

        const colliderBinding = resolveJointColliderBinding(
          spring,
          joint,
          index,
          colliderGroupByIndex,
          runtimeUnitySetup,
          bindingDecisionByBonePathId,
          managerColliderCacheByPathId,
          colliderByIndex,
          options.colliderBindingMode ?? "utj"
        );

        const tailBinding = (options.childPositionMode ?? "utj") === "unityPrefab"
          ? computeUnityPrefabChildPosition(node, pivotExclusionNodes)
          : computeUtjChildPosition(node, childExclusionNodes);
        const runtimeBone = createRuntimeBone(
          spring,
          joint,
          node,
          tailBinding,
          pivotNode,
          resolveLengthLimitTargets(resolution, joint),
          forceProviders,
          colliderBinding,
          managerSettingsByPathId
        );
        if (runtimeBone) {
          bones.push(runtimeBone);
          controlledNodes.add(node);
        }
      }
    }

    bones.sort((a, b) => getUtjObjectDepth(a.node) - getUtjObjectDepth(b.node));

    return bones.length > 0
      ? new UtjSpringBoneRuntime(bones, missingNodes, skinnedBones)
      : null;
  }

  getControlledTrackNodeNames(): Set<string> {
    return new Set(this.bones.map((bone) => bone.node.name).filter(Boolean));
  }

  setTraceBoneFilters(filters: readonly string[], maxEvents = 240): void {
    this.traceFilters = filters
      .map((filter) => filter.trim().toLowerCase())
      .filter(Boolean);
    this.traceMaxEvents = Math.max(1, Math.trunc(maxEvents) || 240);
    this.traceSequence = 0;
    this.traceEvents.length = 0;
  }

  getTraceSnapshot(): UtjSpringBoneTraceSnapshot {
    return {
      filters: [...this.traceFilters],
      eventCount: this.traceEvents.length,
      events: this.traceEvents.map((event) => ({
        ...event,
        collisionChecks: event.collisionChecks.map((check) => ({ ...check })),
      })),
    };
  }

  // UTJ.SpringManager.UpdateDynamics RVA 0x0a59fe18
  update(deltaTime: number): void {
    if (this.bones.some((bone) => bone.automaticUpdates && !bone.isPaused)) {
      this.preUpdateColliders();
    }

    const windLateUpdateProviders = this.collectWindLateUpdateProviders();
    const windLateUpdateManagerIds = new Set(
      windLateUpdateProviders
        .filter((provider) => provider.isActive)
        .map((provider) => provider.springManagerPathId)
        .filter((managerPathId): managerPathId is number => managerPathId !== null)
    );
    const windSumEnabledManagerIds = new Set(
      windLateUpdateProviders
        .filter((provider) => !provider.isActive)
        .map((provider) => provider.springManagerPathId)
        .filter((managerPathId): managerPathId is number => managerPathId !== null)
    );

    for (const bone of this.bones) {
      const dt = calcUtjManagerTimeStep(deltaTime, bone.simulationFrameRate, bone.slowMotionScale);
      if (!bone.automaticUpdates) {
        continue;
      }
      if (!bone.enabled) {
        continue;
      }
      bone.node.parent?.getWorldQuaternion(this.parentRotation);
      bone.node.getWorldPosition(this.headPosition);
      if (bone.isPaused) {
        this.applyBoneRotation(bone);
        continue;
      }
      const windManagerControlsSum = bone.managerPathId !== null &&
        windSumEnabledManagerIds.has(bone.managerPathId);
      const managerSumsForces = windManagerControlsSum ? true : bone.isSumOfForcesOnBone;
      if (!managerSumsForces ||
        (bone.managerPathId !== null && windLateUpdateManagerIds.has(bone.managerPathId))) {
        continue;
      }
      this.updateBoneSpringAndRotation(
        bone,
        dt,
        this.computeExternalForce(bone, deltaTime),
        bone.dynamicRatio
      );
    }

    for (const provider of windLateUpdateProviders) {
      if (!provider.isActive) {
        continue;
      }
      this.updateWindVolumeOneSelfLateUpdate(provider, deltaTime);
    }
  }

  private collectWindLateUpdateProviders(): RuntimeWindVolumeOneSelf[] {
    const providers = new Map<string, RuntimeWindVolumeOneSelf>();
    for (const bone of this.bones) {
      for (const provider of bone.forceProviders) {
        if (provider.kind !== "WindVolumeOneSelf") {
          continue;
        }
        if (provider.springManagerPathId === null) {
          continue;
        }
        const key = provider.sourcePathId !== null
          ? `path:${provider.sourcePathId}`
          : `node:${provider.node.uuid}:${provider.springManagerPathId}`;
        if (!providers.has(key)) {
          providers.set(key, provider);
        }
      }
    }
    return [...providers.values()];
  }

  private updateWindVolumeOneSelfLateUpdate(
    provider: RuntimeWindVolumeOneSelf,
    deltaTime: number
  ): void {
    const managerPathId = provider.springManagerPathId;
    if (managerPathId === null) {
      return;
    }
    const dt = provider.simulationFrameRate > 0 ? 1.0 / provider.simulationFrameRate : deltaTime;
    for (const bone of this.bones) {
      if (bone.managerPathId !== managerPathId) {
        continue;
      }
      this.computeWindVolumeOneSelfForce(provider, bone, deltaTime);
      this.externalForce.copy(bone.gravity).add(this.providerForce);
      this.updateBoneSpringAndRotation(
        bone,
        dt,
        this.externalForce,
        bone.isAnimated ? provider.dynamicRatio : 1.0
      );
    }
  }

  // UTJ.SpringBone.SatisfyConstraintsAndComputeRotation RVA 0x0a59de74
  private updateBoneSpringAndRotation(
    bone: RuntimeBone,
    deltaTime: number,
    externalForce: THREE.Vector3,
    dynamicRatio: number
  ): void {
    bone.node.parent?.getWorldQuaternion(this.parentRotation);
    bone.node.getWorldPosition(this.headPosition);
    const shouldTrace = this.shouldTraceBone(bone);
    const traceEvent = shouldTrace
      ? this.createTraceEvent(bone, deltaTime, externalForce, dynamicRatio)
      : null;
    this.captureSkinAnimationLocalRotation(bone);
    if (traceEvent) {
      traceEvent.skinAnimationLocalRotation = quaternionSnapshot(bone.skinAnimationLocalRotation);
    }
    cacheUtjSpringBonePosition(bone.state, this.headPosition);
    if (traceEvent) {
      traceEvent.stateAfterCache = stateSnapshot(bone.state);
    }
    updateUtjSpring(bone.state, {
      headPosition: this.headPosition,
      parentRotation: this.parentRotation,
      initialLocalRotation: bone.initialLocalRotation,
      boneAxis: bone.boneAxis,
      lengthFallbackDirection: bone.boneAxis.clone().applyQuaternion(
        bone.node.getWorldQuaternion(new THREE.Quaternion())
      ),
      springLength: bone.springLength,
      stiffnessForce: bone.stiffnessForce,
      dragForce: bone.dragForce,
      springForce: bone.springForce,
      externalForce,
      deltaTime,
    });
    if (traceEvent) {
      traceEvent.stateAfterUpdateSpring = stateSnapshot(bone.state);
    }

    this.applyLengthLimits(bone, deltaTime);
    if (traceEvent) {
      traceEvent.stateAfterLengthLimits = stateSnapshot(bone.state);
    }
    const tailRadius = Math.abs(bone.radius);
    if (traceEvent) {
      traceEvent.tailRadius = tailRadius;
    }
    const groundHit = bone.collideWithGround
      ? checkUtjGroundCollision(bone.state, {
        headPosition: this.headPosition,
        springLength: bone.springLength,
        tailRadius,
        groundHeight: bone.groundHeight,
        lengthFallbackDirection: bone.boneAxis.clone().applyQuaternion(
          bone.node.getWorldQuaternion(new THREE.Quaternion())
        ),
        bounce: bone.bounce,
        friction: bone.friction,
      })
      : false;
    if (traceEvent) {
      traceEvent.groundHit = groundHit;
      traceEvent.stateAfterGround = stateSnapshot(bone.state);
    }
    bone.lastCollisionInfo = null;
    const collisionChecks: UtjColliderTraceSnapshot[] = [];
    const worldColliders = bone.enableCollision ? this.buildWorldColliders(bone.colliders) : [];
    bone.lastCollisionStatus = !groundHit && bone.enableCollision
      ? checkUtjCollisions(bone.state, {
        headPosition: this.headPosition,
        springLength: bone.springLength,
        tailRadius,
        colliders: worldColliders,
        bounce: bone.bounce,
        friction: bone.friction,
        onColliderCheck: traceEvent
          ? (collider, trace) => {
            collisionChecks.push(colliderTraceSnapshot(collider, trace));
          }
          : undefined,
        onCollision: (collider, result) => {
          bone.lastCollisionInfo = {
            kind: collider.kind,
            name: collider.debugName ?? null,
            path: collider.debugPath ?? null,
            sourcePathId: collider.debugSourcePathId ?? null,
            hitNormal: result.hitNormal.clone(),
          };
        },
      })
      : 0;
    if (traceEvent) {
      traceEvent.collisionChecks = collisionChecks;
      traceEvent.collisionStatus = bone.lastCollisionStatus;
      traceEvent.stateAfterCollisions = stateSnapshot(bone.state);
    }
    const angleLimitTrace = traceEvent ? createEmptyAngleLimitTrace(bone) : undefined;
    bone.lastAngleLimitApplied = bone.enableAngleLimits
      ? this.applyAngleLimits(bone, deltaTime, angleLimitTrace)
      : false;
    if (traceEvent && angleLimitTrace) {
      traceEvent.angleLimit = angleLimitTrace;
      traceEvent.stateAfterAngleLimits = stateSnapshot(bone.state);
    }
    this.resetInvalidTipPosition(bone);
    this.applyBoneRotation(bone, dynamicRatio);
    if (traceEvent) {
      traceEvent.finalLocalRotation = quaternionSnapshot(bone.node.quaternion);
      this.pushTraceEvent(traceEvent);
    }
  }

  settleCurrentPose(frameCount = 60, deltaTime = 1 / 60): void {
    const count = Math.max(0, Math.floor(frameCount));
    for (let frame = 0; frame < count; frame += 1) {
      this.update(deltaTime);
    }
  }

  private shouldTraceBone(bone: RuntimeBone): boolean {
    if (this.traceFilters.length === 0) {
      return false;
    }
    const name = bone.node.name.toLowerCase();
    const path = getObjectPath(bone.node).toLowerCase();
    const springName = bone.springName.toLowerCase();
    return this.traceFilters.some((filter) =>
      name.includes(filter) ||
      path.includes(filter) ||
      springName.includes(filter)
    );
  }

  private createTraceEvent(
    bone: RuntimeBone,
    deltaTime: number,
    externalForce: THREE.Vector3,
    dynamicRatio: number
  ): UtjSpringBoneTraceEvent {
    return {
      sequence: this.traceSequence,
      springName: bone.springName,
      boneName: bone.node.name,
      bonePath: getObjectPath(bone.node),
      sourceBoneName: bone.sourceBoneName,
      sourceBonePath: bone.sourceBonePath,
      sourceBonePathId: bone.sourceBonePathId,
      pivotSourceName: bone.pivotSourceName,
      pivotSourcePath: bone.pivotSourcePath,
      pivotResolvedPath: bone.pivotResolvedPath,
      tailBinding: tailBindingSnapshot(bone.tailBinding),
      managerPathId: bone.managerPathId,
      deltaTime,
      dynamicRatio,
      automaticUpdates: bone.automaticUpdates,
      enabled: bone.enabled,
      enableCollision: bone.enableCollision,
      enableAngleLimits: bone.enableAngleLimits,
      enableLengthLimits: bone.enableLengthLimits,
      colliderCount: bone.colliders.length,
      forceProviderCount: bone.forceProviders.length,
      headPosition: vectorSnapshot(this.headPosition),
      parentRotation: quaternionSnapshot(this.parentRotation),
      initialLocalRotation: quaternionSnapshot(bone.initialLocalRotation),
      skinAnimationLocalRotation: quaternionSnapshot(bone.skinAnimationLocalRotation),
      boneAxis: vectorSnapshot(bone.boneAxis),
      boneAxisSource: bone.boneAxisSource,
      springLength: bone.springLength,
      radius: bone.radius,
      tailRadius: 0,
      stiffnessForce: bone.stiffnessForce,
      dragForce: bone.dragForce,
      springForce: vectorSnapshot(bone.springForce),
      gravity: vectorSnapshot(bone.gravity),
      externalForce: vectorSnapshot(externalForce),
      stateBefore: stateSnapshot(bone.state),
      stateAfterCache: stateSnapshot(bone.state),
      animatedTip: vectorSnapshot(computeAnimatedTipPosition({
        headPosition: this.headPosition,
        parentRotation: this.parentRotation,
        initialLocalRotation: bone.initialLocalRotation,
        boneAxis: bone.boneAxis,
        springLength: bone.springLength,
      })),
      stateAfterUpdateSpring: stateSnapshot(bone.state),
      stateAfterLengthLimits: stateSnapshot(bone.state),
      groundHit: false,
      stateAfterGround: stateSnapshot(bone.state),
      collisionStatus: 0,
      collisionChecks: [],
      stateAfterCollisions: stateSnapshot(bone.state),
      angleLimit: createEmptyAngleLimitTrace(bone),
      stateAfterAngleLimits: stateSnapshot(bone.state),
      finalLocalRotation: quaternionSnapshot(bone.node.quaternion),
    };
  }

  private pushTraceEvent(event: UtjSpringBoneTraceEvent): void {
    this.traceSequence += 1;
    this.traceEvents.push({ ...event });
    while (this.traceEvents.length > this.traceMaxEvents) {
      this.traceEvents.shift();
    }
  }

  private resetInvalidTipPosition(bone: RuntimeBone): void {
    if (
      !Number.isNaN(bone.state.currTipPos.x) &&
      !Number.isNaN(bone.state.currTipPos.y) &&
      !Number.isNaN(bone.state.currTipPos.z)
    ) {
      return;
    }

    this.debugAnimatedTip.copy(computeAnimatedTipPosition({
      headPosition: this.headPosition,
      parentRotation: this.parentRotation,
      initialLocalRotation: bone.initialLocalRotation,
      boneAxis: bone.boneAxis,
      springLength: bone.springLength,
    }));
    bone.state.currTipPos.copy(this.debugAnimatedTip);
    bone.state.prevTipPos.copy(this.debugAnimatedTip);
  }

  private applyBoneRotation(bone: RuntimeBone, dynamicRatio = bone.dynamicRatio): void {
    this.resetInvalidTipPosition(bone);
    this.localRotation.copy(
      computeUtjLocalRotation(
        this.headPosition,
        bone.state.currTipPos,
        this.parentRotation,
        bone.initialLocalRotation,
        bone.boneAxis
      )
    );
    bone.node.quaternion.copy(lerpQuaternionNormalized(
      bone.skinAnimationLocalRotation,
      this.localRotation,
      dynamicRatio
    ));
    bone.lastAppliedLocalRotation.copy(bone.node.quaternion);
    bone.hasAppliedLocalRotation = true;
    bone.node.scale.copy(this.unitScale);
    bone.node.updateMatrix();
    bone.node.updateMatrixWorld(true);
  }

  private captureSkinAnimationLocalRotation(bone: RuntimeBone): void {
    this.skinAnimationLocalRotation.copy(bone.node.quaternion);
    if (
      bone.hasAppliedLocalRotation &&
      quaternionsAlmostEqual(this.skinAnimationLocalRotation, bone.lastAppliedLocalRotation)
    ) {
      return;
    }
    bone.skinAnimationLocalRotation.copy(this.skinAnimationLocalRotation);
  }

  resetPose(): void {
    for (const bone of this.bones) {
      bone.node.quaternion.copy(bone.initialLocalRotation);
      bone.skinAnimationLocalRotation.copy(bone.initialLocalRotation);
      bone.lastAppliedLocalRotation.copy(bone.initialLocalRotation);
      bone.hasAppliedLocalRotation = false;
      bone.node.scale.copy(this.unitScale);
      bone.node.updateMatrix();
      bone.node.updateMatrixWorld(true);
    }
  }

  resetStateToCurrentPose(): void {
    for (const bone of this.bones) {
      bone.node.parent?.getWorldQuaternion(this.parentRotation);
      bone.node.getWorldPosition(this.headPosition);
      bone.skinAnimationLocalRotation.copy(bone.node.quaternion);
      this.debugAnimatedTip.copy(computeAnimatedTipPosition({
        headPosition: this.headPosition,
        parentRotation: this.parentRotation,
        initialLocalRotation: bone.initialLocalRotation,
        boneAxis: bone.boneAxis,
        springLength: bone.springLength,
      }));
      bone.state.currTipPos.copy(this.debugAnimatedTip);
      bone.state.prevTipPos.copy(this.debugAnimatedTip);
      bone.state.cachedPosition.copy(this.headPosition);
      bone.state.cachedMovement.set(0, 0, 0);
      bone.state.hitNormal.set(0, 0, 0);
      bone.skinAnimationLocalRotation.copy(bone.node.quaternion);
      bone.lastAppliedLocalRotation.copy(bone.node.quaternion);
      bone.hasAppliedLocalRotation = false;
    }
  }

  private computeExternalForce(bone: RuntimeBone, deltaTime: number): THREE.Vector3 {
    this.externalForce.copy(bone.gravity);
    for (const provider of bone.forceProviders) {
      this.externalForce.add(this.computeForceProvider(provider, bone, deltaTime));
    }
    return this.externalForce;
  }

  private computeForceProvider(
    provider: RuntimeForceProvider,
    bone: RuntimeBone,
    deltaTime: number
  ): THREE.Vector3 {
    if (provider.kind === "ForceVolume") {
      return this.computeForceVolume(provider);
    }
    if (provider.kind === "WindVolume") {
      return this.computeWindVolume(provider, bone);
    }
    if (provider.kind === "WindVolumeOneSelf") {
      return this.computeWindVolumeOneSelfForce(provider, bone, deltaTime);
    }
    return this.providerForce.set(0, 0, 0);
  }

  private computeForceVolume(provider: RuntimeForceVolume): THREE.Vector3 {
    provider.node.updateMatrixWorld(true);
    return this.providerForce
      .set(0, 0, 1)
      .transformDirection(provider.node.matrixWorld)
      .multiplyScalar(provider.strength);
  }

  private computeWindVolume(provider: RuntimeWindVolume, bone: RuntimeBone): THREE.Vector3 {
    const baseStrength = provider.weight * provider.strength;
    if (baseStrength <= UNITY_MATHF_EPSILON || provider.period <= 0.001) {
      return this.providerForce.set(0, 0, 0);
    }

    provider.node.updateMatrixWorld(true);
    bone.node.getWorldPosition(this.localBonePosition).applyMatrix4(
      provider.node.matrixWorld.clone().invert()
    );
    const wave = Math.sin(
      provider.timeFactor +
      Math.sin(this.localBonePosition.x * provider.positionalMultiplier) +
      Math.cos(this.localBonePosition.z * provider.positionalMultiplier)
    );
    return this.providerForce
      .set(0, 0, 1)
      .transformDirection(provider.node.matrixWorld)
      .addScaledVector(provider.offsetVector, wave)
      .normalize()
      .multiplyScalar(baseStrength * bone.windInfluence);
  }

  private computeWindVolumeOneSelfForce(
    provider: RuntimeWindVolumeOneSelf,
    bone: RuntimeBone,
    deltaTime: number
  ): THREE.Vector3 {
    const baseStrength = provider.weight * provider.strength;
    if (baseStrength <= UNITY_MATHF_EPSILON || provider.period <= UNITY_MATHF_EPSILON) {
      return this.providerForce.set(0, 0, 0);
    }

    provider.currentTime = addPeriodically(provider.currentTime, deltaTime, provider.period);
    const phase = provider.currentTime * Math.PI * 2 / provider.period;
    provider.node.updateMatrixWorld(true);
    this.waveAxis.set(0, 1, 0).transformDirection(provider.node.matrixWorld);

    if (Math.abs(provider.spinPeriod) > 0.001) {
      provider.spinTime = addPeriodically(provider.spinTime, deltaTime, provider.spinPeriod);
      const spinPhase = provider.spinTime * Math.PI * 2 / provider.spinPeriod;
      const right = new THREE.Vector3(1, 0, 0).transformDirection(provider.node.matrixWorld);
      const up = new THREE.Vector3(0, 1, 0).transformDirection(provider.node.matrixWorld);
      this.waveAxis.copy(right.multiplyScalar(Math.cos(spinPhase))).addScaledVector(
        up,
        Math.sin(spinPhase)
      );
    }

    provider.peakDistance = Math.max(provider.peakDistance, UNITY_MATHF_EPSILON);
    bone.node.getWorldPosition(this.localBonePosition).applyMatrix4(
      provider.node.matrixWorld.clone().invert()
    );
    const k = Math.PI * 2 / provider.peakDistance;
    const wave = Math.sin(
      phase +
      Math.sin(k * this.localBonePosition.x) +
      Math.cos(k * this.localBonePosition.z)
    );
    const mainDirection = new THREE.Vector3(0, 0, 1)
      .transformDirection(provider.node.matrixWorld)
      .addScaledVector(this.waveAxis, provider.amplitude * wave)
      .normalize();
    this.additionalDirection
      .set(Math.sin(THREE.MathUtils.degToRad(provider.additionalWindAngle)), 0, Math.cos(THREE.MathUtils.degToRad(provider.additionalWindAngle)))
      .normalize();

    return this.providerForce
      .copy(mainDirection)
      .multiplyScalar(baseStrength)
      .addScaledVector(this.additionalDirection, provider.additionalWindStrength)
      .multiplyScalar(bone.windInfluence);
  }

  private applyLengthLimits(bone: RuntimeBone, deltaTime: number): void {
    if (!bone.enableLengthLimits || bone.lengthLimitTargets.length === 0) {
      return;
    }

    const targets: UtjLengthLimitTarget[] = bone.lengthLimitTargets.map((target) => ({
      position: target.node.getWorldPosition(new THREE.Vector3()),
      initialLength: target.initialLength,
    }));
    applyUtjLengthLimits({
      currTipPos: bone.state.currTipPos,
      springConstant: bone.springConstant,
      deltaTime,
      targets,
    });
  }

  private applyAngleLimits(
    bone: RuntimeBone,
    deltaTime: number,
    trace?: UtjAngleLimitTrace
  ): boolean {
    if (!bone.yAngleLimit && !bone.zAngleLimit) {
      return false;
    }

    const pivot = bone.pivotNode;
    if (!pivot) {
      return false;
    }

    pivot.updateMatrixWorld(true);
    this.angleVector.copy(bone.state.currTipPos).sub(bone.state.cachedPosition);

    const forward = new THREE.Vector3(bone.angleLimitForwardSign, 0, 0).transformDirection(pivot.matrixWorld);
    const back = new THREE.Vector3(0, 0, -1).transformDirection(pivot.matrixWorld);
    const down = new THREE.Vector3(0, -1, 0).transformDirection(pivot.matrixWorld);
    if (trace) {
      trace.enabled = true;
      trace.hasPivot = true;
      trace.pivotName = pivot.name || null;
      trace.pivotPath = getObjectPath(pivot) || null;
      trace.vectorBefore = vectorSnapshot(this.angleVector);
      trace.forward = vectorSnapshot(forward);
      trace.back = vectorSnapshot(back);
      trace.down = vectorSnapshot(down);
    }

    let constrained = false;
    if (bone.yAngleLimit) {
      const yConstrained = constrainUtjAngleLimit({
        basisSide: down,
        basisUp: back,
        basisForward: forward,
        springStrength: bone.angularStiffness,
        deltaTime,
        limit: bone.yAngleLimit,
        vector: this.angleVector,
      });
      if (trace) {
        trace.yApplied = yConstrained;
        trace.afterY = vectorSnapshot(this.angleVector);
      }
      constrained = yConstrained || constrained;
    }

    if (bone.zAngleLimit) {
      const zConstrained = constrainUtjAngleLimit({
        basisSide: back,
        basisUp: down,
        basisForward: forward,
        springStrength: bone.angularStiffness,
        deltaTime,
        limit: bone.zAngleLimit,
        vector: this.angleVector,
      });
      if (trace) {
        trace.zApplied = zConstrained;
        trace.afterZ = vectorSnapshot(this.angleVector);
      }
      constrained = zConstrained || constrained;
    }

    bone.state.currTipPos.copy(bone.state.cachedPosition).add(this.angleVector);
    if (trace) {
      trace.vectorAfter = vectorSnapshot(this.angleVector);
    }
    return constrained;
  }

  getSnapshot(
    enabled = true,
    debugOptions: UtjSpringBoneDebugOptions = {}
  ): UtjSpringBoneRuntimeSnapshot {
    const colliderIndexes = new Set<RuntimeCollider>();
    const topOffsets: UtjSpringBoneRuntimeSnapshot["topOffsets"] = [];
    const skirtOffsets: UtjSpringBoneRuntimeSnapshot["skirtOffsets"] = [];
    let maxSleeveOffset = 0;
    let maxSkirtOffset = 0;
    let skinnedBoneMatches = 0;
    let skinnedBoneMisses = 0;
    for (const bone of this.bones) {
      for (const collider of bone.colliders) {
        colliderIndexes.add(collider);
      }
      bone.node.parent?.getWorldQuaternion(this.parentRotation);
      bone.node.getWorldPosition(this.headPosition);
      this.debugAnimatedTip.copy(computeAnimatedTipPosition({
        headPosition: this.headPosition,
        parentRotation: this.parentRotation,
        initialLocalRotation: bone.initialLocalRotation,
        boneAxis: bone.boneAxis,
        springLength: bone.springLength,
      }));
      const offset = this.debugAnimatedTip.distanceTo(bone.state.currTipPos);
      const name = bone.node.name.toLowerCase();
      const animatedTipDelta = bone.state.currTipPos.clone().sub(this.debugAnimatedTip);
      const velocity = bone.state.currTipPos.clone().sub(bone.state.prevTipPos);
      if (name.includes("sleeve")) {
        maxSleeveOffset = Math.max(maxSleeveOffset, offset);
      }
      if (name.includes("skirt")) {
        maxSkirtOffset = Math.max(maxSkirtOffset, offset);
      }
      if (this.skinnedBones.has(bone.node)) {
        skinnedBoneMatches += 1;
      } else {
        skinnedBoneMisses += 1;
      }
      const resolvedIsSkinnedBone = this.skinnedBones.has(bone.node);
      topOffsets.push({
        name: bone.node.name,
        path: getObjectPath(bone.node),
        springName: bone.springName,
        sourceBoneName: bone.sourceBoneName,
        sourceBonePath: bone.sourceBonePath,
        sourceBonePathId: bone.sourceBonePathId,
        resolvedIsSkinnedBone,
        pivotSourceName: bone.pivotSourceName,
        pivotSourcePath: bone.pivotSourcePath,
        pivotResolvedPath: bone.pivotResolvedPath,
        tailBinding: tailBindingSnapshot(bone.tailBinding),
        offset,
        colliderCount: bone.colliders.length,
        lastCollisionStatus: bone.lastCollisionStatus,
        lastCollisionColliderName: bone.lastCollisionInfo?.name ?? null,
        lastCollisionColliderPath: bone.lastCollisionInfo?.path ?? null,
        lastCollisionColliderKind: bone.lastCollisionInfo?.kind ?? null,
        lastCollisionColliderSourcePathId: bone.lastCollisionInfo?.sourcePathId ?? null,
        lastAngleLimitApplied: bone.lastAngleLimitApplied,
        hasSpringForce: bone.springForce.lengthSq() > 0.00000001,
        forceProviderCount: bone.forceProviders.length,
        stiffnessForce: bone.stiffnessForce,
        dynamicRatio: bone.dynamicRatio,
        animatedTipDelta: vectorSnapshot(animatedTipDelta),
        velocity: vectorSnapshot(velocity),
        springForce: vectorSnapshot(bone.springForce),
        colliderBindings: bone.colliderBindingDiagnostics.map(cloneColliderBindingDiagnostic),
      });
      if (name.includes("skirt")) {
        skirtOffsets.push({
          name: bone.node.name,
          path: getObjectPath(bone.node),
          springName: bone.springName,
          sourceBoneName: bone.sourceBoneName,
          sourceBonePath: bone.sourceBonePath,
          sourceBonePathId: bone.sourceBonePathId,
          resolvedIsSkinnedBone,
          pivotSourceName: bone.pivotSourceName,
          pivotSourcePath: bone.pivotSourcePath,
          pivotResolvedPath: bone.pivotResolvedPath,
          tailBinding: tailBindingSnapshot(bone.tailBinding),
          offset,
          appliedRotationDegrees: THREE.MathUtils.radToDeg(
            bone.skinAnimationLocalRotation.angleTo(bone.node.quaternion)
          ),
          colliderCount: bone.colliders.length,
          lastCollisionStatus: bone.lastCollisionStatus,
          lastCollisionColliderName: bone.lastCollisionInfo?.name ?? null,
          lastCollisionColliderPath: bone.lastCollisionInfo?.path ?? null,
          lastCollisionColliderKind: bone.lastCollisionInfo?.kind ?? null,
          lastCollisionColliderSourcePathId: bone.lastCollisionInfo?.sourcePathId ?? null,
          lastCollisionHitNormal: bone.lastCollisionInfo
            ? vectorSnapshot(bone.lastCollisionInfo.hitNormal)
            : null,
          lastAngleLimitApplied: bone.lastAngleLimitApplied,
          hasSpringForce: bone.springForce.lengthSq() > 0.00000001,
          forceProviderCount: bone.forceProviders.length,
          stiffnessForce: bone.stiffnessForce,
          dragForce: bone.dragForce,
          dynamicRatio: bone.dynamicRatio,
          animatedTipDelta: vectorSnapshot(animatedTipDelta),
          velocity: vectorSnapshot(velocity),
          headMovement: vectorSnapshot(bone.state.cachedMovement),
          gravity: vectorSnapshot(bone.gravity),
          springForce: vectorSnapshot(bone.springForce),
          colliderBindings: bone.colliderBindingDiagnostics.map(cloneColliderBindingDiagnostic),
        });
      }
    }
    topOffsets.sort((a, b) => b.offset - a.offset);
    skirtOffsets.sort((a, b) => b.offset - a.offset);
    const debugOffsets = selectDebugOffsets(topOffsets, debugOptions);
    return {
      runtimeMode: "webgl-utj",
      enabled,
      springCount: new Set(this.bones.map((bone) => bone.springName)).size,
      boneCount: this.bones.length,
      colliderCount: colliderIndexes.size,
      missingNodeCount: this.missingNodes.length,
      missingNodeSamples: this.missingNodes.slice(0, 96),
      maxSleeveOffset,
      maxSkirtOffset,
      topOffsets: topOffsets.slice(0, 8),
      debugOffsets,
      skirtOffsets,
      bindingDiagnostics: this.bones
        .flatMap((bone) => bone.colliderBindingDiagnostics)
        .map(cloneColliderBindingDiagnostic),
      skinnedBoneMatches,
      skinnedBoneMisses,
    };
  }

  private buildWorldColliders(colliders: readonly RuntimeCollider[]): UtjCollider[] {
    const result: UtjCollider[] = [];
    for (const collider of colliders) {
      const worldCollider = this.frameColliderCache.get(collider) ?? this.createWorldCollider(collider);
      if (worldCollider) {
        result.push(worldCollider);
      }
    }
    return result;
  }

  // UTJ.SpringManager.PreUpdateCollider RVA 0x0a5a0010
  private preUpdateColliders(): void {
    this.frameColliderCache.clear();
    const uniqueColliders = new Set<RuntimeCollider>();
    for (const bone of this.bones) {
      for (const collider of bone.colliders) {
        uniqueColliders.add(collider);
      }
    }
    const orderedColliders = [...uniqueColliders].sort(
      (a, b) => sourceColliderOrder(a.source) - sourceColliderOrder(b.source)
    );
    for (const collider of orderedColliders) {
      const worldCollider = this.createWorldCollider(collider);
      if (worldCollider) {
        this.frameColliderCache.set(collider, worldCollider);
      }
    }
  }

  private createWorldCollider(collider: RuntimeCollider): UtjCollider | null {
    const shape = collider.source.shape;
    const componentEnabled = collider.source.enabled !== false;
    const rendererGatedEnabled = componentEnabled &&
      collider.source.linkedRendererEnabled !== false;

    if (shape?.sphere) {
      collider.node.updateMatrixWorld(true);
      this.colliderLocalToWorld.copy(collider.node.matrixWorld);
      this.colliderWorldToLocal.copy(collider.node.matrixWorld).invert();
      const worldToLocalDirection = makeNormalDirectionMatrix(this.colliderWorldToLocal);
      const localToWorldDirection = makeNormalDirectionMatrix(this.colliderLocalToWorld);
      return {
        kind: "sphere",
        enabled: componentEnabled,
        debugName: collider.source.name ?? collider.node.name,
        debugPath: collider.source.nodePath ?? getObjectPath(collider.node),
        debugSourcePathId: collider.source.sourcePathId,
        localOffset: new THREE.Vector3(0, 0, 0),
        radius: Math.max(0, shape.sphere.radius ?? 0.01),
        localToWorldMatrix: this.colliderLocalToWorld.clone(),
        worldToLocalMatrix: this.colliderWorldToLocal.clone(),
        worldToLocalRadiusScale: matrixXDirectionLength(this.colliderWorldToLocal),
        localToWorldNormalMatrix: localToWorldDirection,
        lossyScaleX: worldScaleX(collider.node),
      };
    }

    if (shape?.capsule) {
      collider.node.updateMatrixWorld(true);
      this.colliderLocalToWorld.copy(collider.node.matrixWorld);
      this.colliderWorldToLocal.copy(collider.node.matrixWorld).invert();
      return {
        kind: "capsuleLocal",
        enabled: rendererGatedEnabled,
        debugName: collider.source.name ?? collider.node.name,
        debugPath: collider.source.nodePath ?? getObjectPath(collider.node),
        debugSourcePathId: collider.source.sourcePathId,
        localStart: new THREE.Vector3(0, 0, 0),
        localEnd: vectorFromArray(shape.capsule.tail),
        radius: Math.max(0, shape.capsule.radius ?? 0.01),
        localToWorldMatrix: this.colliderLocalToWorld.clone(),
        worldToLocalMatrix: this.colliderWorldToLocal.clone(),
        worldToLocalRadiusScale: matrixXDirectionLength(this.colliderWorldToLocal),
        localToWorldNormalMatrix: makeNormalDirectionMatrix(this.colliderLocalToWorld),
        lossyScaleX: worldScaleX(collider.node),
      };
    }

    if (shape?.panel) {
      collider.node.updateMatrixWorld(true);
      this.colliderLocalToWorld.copy(collider.node.matrixWorld);
      this.colliderWorldToLocal.copy(collider.node.matrixWorld).invert();
      return {
        kind: "panel",
        enabled: rendererGatedEnabled,
        debugName: collider.source.name ?? collider.node.name,
        debugPath: collider.source.nodePath ?? getObjectPath(collider.node),
        debugSourcePathId: collider.source.sourcePathId,
        width: Math.max(0, shape.panel.width ?? 0),
        height: Math.max(0, shape.panel.height ?? 0),
        localToWorldMatrix: this.colliderLocalToWorld.clone(),
        worldToLocalMatrix: this.colliderWorldToLocal.clone(),
        worldToLocalRadiusScale: matrixXDirectionLength(this.colliderWorldToLocal),
        worldToLocalLengthScale: matrixXDirectionLength(this.colliderWorldToLocal),
        localToWorldNormalMatrix: makeNormalDirectionMatrix(this.colliderLocalToWorld),
      };
    }

    return null;
  }
}

function vectorSnapshot(vector: THREE.Vector3): VectorSnapshot {
  return {
    x: vector.x,
    y: vector.y,
    z: vector.z,
    length: vector.length(),
  };
}

function selectDebugOffsets(
  offsets: UtjSpringBoneRuntimeSnapshot["topOffsets"],
  debugOptions: UtjSpringBoneDebugOptions
) {
  if (debugOptions.springDebugAllOffsets) {
    return offsets;
  }
  const filters = (debugOptions.springDebugBones ?? [])
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (filters.length === 0) {
    return [];
  }
  return offsets.filter((offset) => {
    const haystack = [
      offset.name,
      offset.path,
      offset.springName,
      offset.sourceBoneName,
      offset.sourceBonePath,
      offset.pivotSourceName,
      offset.pivotSourcePath,
      offset.pivotResolvedPath,
    ]
      .filter((value): value is string => typeof value === "string")
      .join("\n")
      .toLowerCase();
    return filters.some((filter) => haystack.includes(filter));
  });
}

function nullableVectorSnapshot(vector?: THREE.Vector3): VectorSnapshot | null {
  return vector ? vectorSnapshot(vector) : null;
}

function quaternionSnapshot(quaternion: THREE.Quaternion): QuaternionSnapshot {
  return {
    x: quaternion.x,
    y: quaternion.y,
    z: quaternion.z,
    w: quaternion.w,
  };
}

function stateSnapshot(state: UtjSpringBoneState): UtjSpringBoneStateSnapshot {
  return {
    currTipPos: vectorSnapshot(state.currTipPos),
    prevTipPos: vectorSnapshot(state.prevTipPos),
    hitNormal: vectorSnapshot(state.hitNormal),
    cachedPosition: vectorSnapshot(state.cachedPosition),
    cachedMovement: vectorSnapshot(state.cachedMovement),
  };
}

function createEmptyAngleLimitTrace(bone: RuntimeBone): UtjAngleLimitTrace {
  return {
    enabled: bone.enableAngleLimits,
    hasPivot: Boolean(bone.pivotNode),
    pivotName: bone.pivotNode?.name || null,
    pivotPath: bone.pivotNode ? getObjectPath(bone.pivotNode) || null : null,
    vectorBefore: null,
    forward: null,
    back: null,
    down: null,
    yApplied: false,
    zApplied: false,
    afterY: null,
    afterZ: null,
    vectorAfter: null,
  };
}

function colliderTraceSnapshot(
  collider: UtjCollider,
  trace: UtjColliderCheckTrace
): UtjColliderTraceSnapshot {
  return {
    kind: collider.kind,
    name: collider.debugName ?? null,
    path: collider.debugPath ?? null,
    sourcePathId: collider.debugSourcePathId ?? null,
    enabled: collider.enabled !== false,
    status: trace.status,
    beforeTailPosition: vectorSnapshot(trace.beforeTailPosition),
    afterTailPosition: vectorSnapshot(trace.afterTailPosition),
    hitNormal: vectorSnapshot(trace.hitNormal),
    localHeadPosition: nullableVectorSnapshot(trace.details.localHeadPosition),
    localTailPositionBefore: nullableVectorSnapshot(trace.details.localTailPositionBefore),
    localTailPositionAfter: nullableVectorSnapshot(trace.details.localTailPositionAfter),
    localTailRadius: trace.details.localTailRadius ?? null,
    localSphereOrigin: nullableVectorSnapshot(trace.details.localSphereOrigin),
    localSphereRadius: trace.details.localSphereRadius ?? null,
    localCapsuleStart: nullableVectorSnapshot(trace.details.localCapsuleStart),
    localCapsuleEnd: nullableVectorSnapshot(trace.details.localCapsuleEnd),
    capsuleRadius: trace.details.capsuleRadius ?? null,
    panelWidth: trace.details.panelWidth ?? null,
    panelHeight: trace.details.panelHeight ?? null,
  };
}

function tailBindingSnapshot(binding: RuntimeTailBindingDiagnostic): TailBindingSnapshot {
  return {
    mode: binding.mode,
    childCount: binding.childCount,
    childNames: [...binding.childNames],
    childPaths: [...binding.childPaths],
    tailPosition: vectorSnapshot(binding.tailPosition),
  };
}

function createRuntimeBone(
  spring: CandidateSpring,
  joint: CandidateJoint,
  node: THREE.Object3D,
  tailBinding: RuntimeTailBindingDiagnostic,
  pivotNode: THREE.Object3D | null,
  lengthLimitTargetNodes: THREE.Object3D[],
  forceProviders: RuntimeForceProvider[],
  colliderBinding: RuntimeColliderBinding,
  managerSettingsByPathId: ReadonlyMap<number, ManagerSettings>
): RuntimeBone | null {
  const tailPosition = tailBinding.tailPosition;
  const headPosition = node.getWorldPosition(new THREE.Vector3());
  const direction = tailPosition.clone().sub(headPosition);
  const springLength = direction.length();

  const initialLocalRotation = node.quaternion.clone();
  const localTipPosition = node.worldToLocal(tailPosition.clone());
  const boneAxisResolution = resolveRuntimeBoneAxis(joint, localTipPosition);
  const lengthLimitTargets = lengthLimitTargetNodes.map((targetNode) => ({
    node: targetNode,
    initialLength: targetNode.getWorldPosition(new THREE.Vector3()).distanceTo(tailPosition),
  }));
  const managerSettings = resolveManagerSettings(spring, managerSettingsByPathId);
  const isAnimated = isBoneAnimated(joint, node, managerSettings);
  const angleLimitForwardSign = computeAngleLimitForwardSign(pivotNode, direction);

  return {
    managerPathId: typeof spring.managerPathId === "number" ? spring.managerPathId : null,
    springName: spring.name ?? "spring",
    sourceBoneName: joint.nodeName ?? null,
    sourceBonePath: joint.nodePath ?? null,
    sourceBonePathId: typeof joint.sourcePathId === "number" ? joint.sourcePathId : null,
    pivotSourceName: joint.pivotNodeName ?? null,
    pivotSourcePath: joint.pivotNodePath ?? null,
    pivotResolvedPath: pivotNode ? getObjectPath(pivotNode) : null,
    tailBinding,
    automaticUpdates: spring.automaticUpdates !== false,
    enabled: spring.enabled !== false && joint.enabled !== false,
    enableLengthLimits: spring.enableLengthLimits !== false,
    enableAngleLimits: spring.enableAngleLimits !== false,
    enableCollision: spring.enableCollision !== false,
    collideWithGround: spring.collideWithGround !== false,
    groundHeight: spring.groundHeight ?? 0,
    isSumOfForcesOnBone: spring.isSumOfForcesOnBone !== false,
    isPaused: spring.isPaused === true,
    gravity: vectorFromRaw(spring.rawGravity, new THREE.Vector3(0, -10, 0)),
    forceProviders,
    node,
    state: createUtjSpringBoneState(headPosition, tailPosition),
    initialLocalRotation,
    skinAnimationLocalRotation: initialLocalRotation.clone(),
    lastAppliedLocalRotation: initialLocalRotation.clone(),
    hasAppliedLocalRotation: false,
    boneAxis: boneAxisResolution.axis,
    boneAxisSource: boneAxisResolution.source,
    springLength,
    dynamicRatio: isAnimated ? managerSettings.dynamicRatio : 1.0,
    isAnimated,
    simulationFrameRate: managerSettings.simulationFrameRate,
    slowMotionScale: managerSettings.slowMotionScale,
    bounce: managerSettings.bounce,
    friction: managerSettings.friction,
    radius: Math.max(0, joint.hitRadius ?? 0.05),
    stiffnessForce: joint.rawStiffnessForce ?? 300,
    dragForce: joint.rawDragForce ?? joint.dragForce ?? 0.4,
    springForce: vectorFromRaw(joint.rawSpringForce),
    windInfluence: Math.max(0, joint.rawWindInfluence ?? 1),
    springConstant: joint.rawSpringConstant ?? 0.5,
    lengthLimitTargets,
    angularStiffness: Math.max(0, joint.rawAngularStiffness ?? 100),
    pivotNode,
    yAngleLimit: angleLimitFromCandidate(joint.rawAngleLimits?.y),
    zAngleLimit: angleLimitFromCandidate(joint.rawAngleLimits?.z),
    colliders: colliderBinding.colliders,
    colliderBindingDiagnostics: colliderBinding.diagnostics,
    angleLimitForwardSign,
    lastCollisionStatus: 0,
    lastCollisionInfo: null,
    lastAngleLimitApplied: false,
  };
}

function computeAngleLimitForwardSign(
  pivotNode: THREE.Object3D | null,
  worldDirection: THREE.Vector3
): number {
  if (!pivotNode || worldDirection.lengthSq() <= 0.00000001) {
    return -1;
  }
  pivotNode.updateMatrixWorld(true);
  const pivotRotation = pivotNode.getWorldQuaternion(new THREE.Quaternion()).invert();
  const pivotLocalDirection = worldDirection.clone().normalize().applyQuaternion(pivotRotation);
  return pivotLocalDirection.x >= 0 ? 1 : -1;
}

function resolveForceProviders(
  resolution: NodeResolution,
  spring: CandidateSpring,
  cache: Map<string, RuntimeForceProvider>
): RuntimeForceProvider[] {
  return (spring.forceProviders ?? [])
    .map((provider) => {
      const key = forceProviderCacheKey(provider);
      const cached = key ? cache.get(key) : undefined;
      if (cached) {
        return cached;
      }
      const runtimeProvider = createForceProvider(resolution, provider);
      if (runtimeProvider && key) {
        cache.set(key, runtimeProvider);
      }
      return runtimeProvider;
    })
    .filter((provider): provider is RuntimeForceProvider => Boolean(provider));
}

function forceProviderCacheKey(provider: CandidateForceProvider): string | null {
  if (typeof provider.sourcePathId === "number") {
    return `path:${provider.sourcePathId}`;
  }
  if (provider.nodePath) {
    return `nodePath:${provider.nodePath}`;
  }
  if (provider.nodeName) {
    return `nodeName:${provider.nodeName}`;
  }
  return null;
}

function createForceProvider(
  resolution: NodeResolution,
  provider: CandidateForceProvider
): RuntimeForceProvider | null {
  const scriptName = provider.scriptName ?? "";
  const isForceVolume = scriptName.endsWith("ForceVolume");
  const isWindVolume = scriptName.endsWith("WindVolume");
  const isWindVolumeOneSelf = scriptName.endsWith("WindVolumeOneSelf");
  if (!isForceVolume && !isWindVolume && !isWindVolumeOneSelf) {
    return null;
  }
  const node = resolveNode(resolution, provider.nodePath, provider.nodeName);
  if (!node) {
    return null;
  }
  const raw = provider.raw ?? {};
  if (!readRawBoolean(raw, "m_Enabled", true)) {
    return null;
  }
  if (provider.activeInHierarchy === false || provider.activeSelf === false) {
    return null;
  }
  const dynamicRatio = readFiniteNumber(raw.dynamicRatio ?? raw.DynamicRatio);
  const simulationFrameRate = readFiniteNumber(raw.simulationFrameRate ?? raw.SimulationFrameRate);
  const common = {
    sourcePathId: typeof provider.sourcePathId === "number" ? provider.sourcePathId : null,
    node,
    springManagerPathId: readFiniteNumber(provider.springManagerPathId) ??
      readRawObjectPathId(raw, "<SpringManager>k__BackingField") ??
      readRawObjectPathId(raw, "_SpringManager_k__BackingField") ??
      readRawObjectPathId(raw, "SpringManager") ??
      readRawObjectPathId(raw, "springManager"),
  };
  if (isForceVolume && !isWindVolume) {
    return {
      kind: "ForceVolume",
      ...common,
      strength: readRawNumber(raw, "strength", 0),
    };
  }
  if (isWindVolume && !isWindVolumeOneSelf) {
    return {
      kind: "WindVolume",
      ...common,
      weight: readRawNumber(raw, "weight", 0),
      strength: readRawNumber(raw, "strength", 0),
      period: readRawNumber(raw, "period", 0),
      positionalMultiplier: readRawNumber(raw, "positionalMultiplier", 0),
      timeFactor: readRawNumber(raw, "timeFactor", 0),
      offsetVector: readRawVector(raw, "offsetVector"),
    };
  }
  return {
    kind: "WindVolumeOneSelf",
    ...common,
    isActive: readRawBoolean(raw, "isActive", false),
    dynamicRatio: THREE.MathUtils.clamp(dynamicRatio ?? 0.5, 0, 1),
    simulationFrameRate: Math.max(0, simulationFrameRate ?? 60),
    weight: readRawNumber(raw, "weight", 0),
    strength: readRawNumber(raw, "strength", 0),
    period: readRawNumber(raw, "period", 0),
    currentTime: readRawNumber(raw, "currentTime", 0),
    spinPeriod: readRawNumber(raw, "spinPeriod", 0),
    spinTime: readRawNumber(raw, "spinTime", 0),
    amplitude: readRawNumber(raw, "amplitude", 0),
    peakDistance: readRawNumber(raw, "peakDistance", 0),
    additionalWindAngle: readRawNumber(raw, "additionalWindAngle", 0),
    additionalWindStrength: readRawNumber(raw, "additionalWindStrength", 0),
  };
}

function resolveLengthLimitTargets(
  resolution: NodeResolution,
  joint: CandidateJoint
): THREE.Object3D[] {
  return (joint.lengthLimitTargets ?? [])
    .map((target) => resolveNode(resolution, target.nodePath, target.nodeName, {
      allowNameFallback: false,
      allowSitBodyAlias: false,
    }))
    .filter((node): node is THREE.Object3D => Boolean(node));
}

function resolveSpringJointNode(
  resolution: NodeResolution,
  joint: CandidateJoint
): THREE.Object3D | null {
  return resolveNode(resolution, joint.nodePath, joint.nodeName, {
    allowNameFallback: false,
    allowSitBodyAlias: false,
  });
}

function isRuntimeJointActive(
  joint: CandidateJoint,
  activeRuntimeRoots: ReadonlySet<string>
): boolean {
  if (activeRuntimeRoots.size === 0) {
    return true;
  }
  const root = normalizeRootName(rootNameFromPath(joint.nodePath));
  return root !== null && activeRuntimeRoots.has(root);
}

function resolveSpringBonePivotNode(
  resolution: NodeResolution,
  joint: CandidateJoint
): THREE.Object3D | null {
  return resolveNode(resolution, joint.pivotNodePath, joint.pivotNodeName, {
    allowNameFallback: false,
    allowSitBodyAlias: false,
  });
}

function angleLimitFromCandidate(limit?: CandidateAngleLimit | null): UtjAngleLimit | null {
  if (!limit?.active) {
    return null;
  }

  return {
    active: true,
    min: limit.min ?? 0,
    max: limit.max ?? 0,
  };
}

function resolveJointColliderBinding(
  spring: CandidateSpring,
  joint: CandidateJoint,
  jointIndex: number,
  colliderGroupByIndex: ReadonlyMap<number, RuntimeColliderGroup>,
  runtimeUnitySetup: RuntimeUnitySetup | null,
  bindingDecisionByBonePathId: ReadonlyMap<number, RuntimeBindingDecision>,
  managerColliderCacheByPathId: ReadonlyMap<number, RuntimeManagerColliderCacheBinding>,
  colliderByIndex: ReadonlyMap<number, RuntimeCollider>,
  bindingMode: UtjSpringBoneRuntimeOptions["colliderBindingMode"]
): RuntimeColliderBinding {
  const nodePathGroups = joint.nodePath
    ? spring.jointColliderGroupsByNodePath?.[joint.nodePath]
    : undefined;
  const sourcePathId = typeof joint.sourcePathId === "number"
    ? String(joint.sourcePathId)
    : null;
  const jointGroups = sourcePathId
    ? spring.jointColliderGroups?.[sourcePathId]
    : undefined;
  const orderedJointGroups = resolveJointColliderGroupsByOrder(spring, jointIndex);
  const groupIndexes = nodePathGroups !== undefined
    ? nodePathGroups
    : jointGroups !== undefined
    ? jointGroups
    : orderedJointGroups !== undefined
    ? orderedJointGroups
    : spring.colliderGroups ?? [];
  const bindingDecision = typeof joint.sourcePathId === "number"
    ? bindingDecisionByBonePathId.get(joint.sourcePathId)
    : undefined;
  const diagnostics: RuntimeColliderBindingDiagnostic[] = [];
  const colliders = groupIndexes.flatMap((index) => {
    const group = colliderGroupByIndex.get(index);
    if (!group) {
      return [];
    }
    const resolved = resolveRuntimeColliderGroup(
        group,
        spring,
        joint,
        runtimeUnitySetup,
        bindingDecision,
        managerColliderCacheByPathId,
        colliderByIndex,
        bindingMode
      );
    diagnostics.push(resolved.diagnostic);
    return resolved.colliders;
  });
  return { colliders, diagnostics };
}

function resolveRuntimeColliderGroup(
  group: RuntimeColliderGroup,
  spring: CandidateSpring,
  joint: CandidateJoint,
  runtimeUnitySetup: RuntimeUnitySetup | null,
  bindingDecision: RuntimeBindingDecision | undefined,
  managerColliderCacheByPathId: ReadonlyMap<number, RuntimeManagerColliderCacheBinding>,
  colliderByIndex: ReadonlyMap<number, RuntimeCollider>,
  bindingMode: UtjSpringBoneRuntimeOptions["colliderBindingMode"]
): { colliders: RuntimeCollider[]; diagnostic: RuntimeColliderBindingDiagnostic } {
  const decisionCollidersByRoot = buildDecisionCollidersByRoot(bindingDecision, colliderByIndex);
  const managerCache = typeof spring.managerPathId === "number"
    ? managerColliderCacheByPathId.get(spring.managerPathId)
    : undefined;
  if (bindingDecision?.sourceKind === "colliderFlag" && decisionCollidersByRoot.size > 0) {
    return resolveRuntimeColliderFlagGroup(
      group,
      spring,
      joint,
      runtimeUnitySetup,
      bindingDecision,
      decisionCollidersByRoot,
      bindingDecision.defaultRoot,
      managerCache,
      "v2"
    );
  }
  if (group.source.sourceKind === "colliderFlag" && group.collidersByRoot.size > 0) {
    return resolveRuntimeColliderFlagGroup(
      group,
      spring,
      joint,
      runtimeUnitySetup,
      bindingDecision,
      group.collidersByRoot,
      group.source.defaultRoot,
      managerCache,
      "v1"
    );
  }
  const colliders = preferMatchingPoseColliders(group.colliders, spring, joint);
  return {
    colliders,
    diagnostic: buildColliderBindingDiagnostic(
      group,
      spring,
      joint,
      bindingDecision,
      null,
      null,
      null,
      bindingMode === "unityPrefab"
        ? `direct serialized collider references / pose root preference; ${managerCacheSummary(managerCache)}`
        : "direct collider group / pose root preference",
      colliders
    ),
  };
}

function resolveRuntimeColliderFlagGroup(
  group: RuntimeColliderGroup,
  spring: CandidateSpring,
  joint: CandidateJoint,
  runtimeUnitySetup: RuntimeUnitySetup | null,
  bindingDecision: RuntimeBindingDecision | undefined,
  candidateRoots: ReadonlyMap<string, RuntimeCollider[]>,
  defaultRoot: string | null | undefined,
  managerCache: RuntimeManagerColliderCacheBinding | undefined,
  sourceVersion: "v1" | "v2"
): { colliders: RuntimeCollider[]; diagnostic: RuntimeColliderBindingDiagnostic } {
  const constrainedRoots = constrainColliderRootsByManagerCache(candidateRoots, managerCache);
  if (constrainedRoots.size === 0) {
    return {
      colliders: [],
      diagnostic: buildColliderBindingDiagnostic(
        group,
        spring,
        joint,
        bindingDecision,
        candidateRoots,
        defaultRoot,
        null,
        `${sourceVersion} no collider after manager cache constraint; ${managerCacheSummary(managerCache)}`,
        []
      ),
    };
  }

  const selection = selectUnityColliderRoot(
    group,
    spring,
    joint,
    runtimeUnitySetup,
    bindingDecision,
    constrainedRoots
  );
  const colliders = selection.root
    ? constrainedRoots.get(selection.root) ?? []
    : [];
  if (colliders.length === 0) {
    return {
      colliders: [],
      diagnostic: buildColliderBindingDiagnostic(
        group,
        spring,
        joint,
        bindingDecision,
        candidateRoots,
        defaultRoot,
        selection.root,
        `${sourceVersion} no matching runtime root after manager cache constraint; ${selection.reason}; ${managerCacheSummary(managerCache)}`,
        []
      ),
    };
  }

  return {
    colliders,
    diagnostic: buildColliderBindingDiagnostic(
      group,
      spring,
      joint,
      bindingDecision,
      candidateRoots,
      defaultRoot,
      selection.root,
      `${sourceVersion} ${selection.reason}; manager cache constrained roots; ${managerCacheSummary(managerCache)}`,
      colliders
    ),
  };
}

function selectUnityColliderRoot(
  group: RuntimeColliderGroup,
  spring: CandidateSpring,
  joint: CandidateJoint,
  runtimeUnitySetup: RuntimeUnitySetup | null,
  bindingDecision: RuntimeBindingDecision | undefined,
  availableRoots: ReadonlyMap<string, RuntimeCollider[]>
): RuntimeColliderRootSelection {
  if (availableRoots.size === 1) {
    const root = availableRoots.keys().next().value as string;
    return { root, reason: "single manager-cache root" };
  }
  const jointRoot = normalizeRootName(rootNameFromPath(joint.nodePath));
  if (jointRoot && availableRoots.has(jointRoot)) {
    return { root: jointRoot, reason: "joint root matched candidate root" };
  }
  if (spring.name?.startsWith("Head:") || jointRoot === "face") {
    const defaultBodyRoot = normalizeRootName(
      runtimeUnitySetup?.rootSelectionProfile?.defaultBodyRoot ??
      runtimeUnitySetup?.activeRootProfile?.defaultBodyRoot
    );
    if (defaultBodyRoot && availableRoots.has(defaultBodyRoot)) {
      return { root: defaultBodyRoot, reason: "head/face uses runtime defaultBodyRoot" };
    }
    if (availableRoots.has("body")) {
      return { root: "body", reason: "head/face body fallback" };
    }
  }
  const decisionDefaultRoot = normalizeRootName(bindingDecision?.defaultRoot);
  if (decisionDefaultRoot && availableRoots.has(decisionDefaultRoot)) {
    return { root: decisionDefaultRoot, reason: "v2 bindingDecision.defaultRoot" };
  }
  const activeRoots = runtimeUnitySetup?.activeRootProfile?.activeRoots ?? [];
  for (const activeRoot of activeRoots) {
    const root = normalizeRootName(activeRoot);
    if (root && availableRoots.has(root)) {
      return { root, reason: "activeRootProfile active root" };
    }
  }
  const groupDefaultRoot = normalizeRootName(group.source.defaultRoot);
  if (groupDefaultRoot && availableRoots.has(groupDefaultRoot)) {
    return { root: groupDefaultRoot, reason: "group.defaultRoot" };
  }
  return {
    root: null,
    reason: groupDefaultRoot
      ? `group.defaultRoot ${groupDefaultRoot} not available after manager cache`
      : "no matching root",
  };
}

function buildColliderBindingDiagnostic(
  group: RuntimeColliderGroup,
  spring: CandidateSpring,
  joint: CandidateJoint,
  bindingDecision: RuntimeBindingDecision | undefined,
  candidateRoots: ReadonlyMap<string, RuntimeCollider[]> | null,
  defaultRoot: string | null | undefined,
  selectedRoot: string | null,
  selectionReason: string,
  selectedColliders: readonly RuntimeCollider[]
): RuntimeColliderBindingDiagnostic {
  return {
    sourceKind: bindingDecision?.sourceKind ?? group.source.sourceKind ?? "direct",
    colliderFlag: bindingDecision?.colliderFlag ?? group.source.colliderFlag ?? null,
    colliderGroupIndex: typeof group.source.index === "number" ? group.source.index : null,
    springName: spring.name ?? "spring",
    boneName: joint.nodeName ?? null,
    bonePath: joint.nodePath ?? null,
    sourceSpringBonePathId: typeof joint.sourcePathId === "number" ? joint.sourcePathId : null,
    candidateRoots: candidateRoots
      ? [...candidateRoots.entries()].map(([root, colliders]) => ({
        root,
        colliderCount: colliders.length,
        colliderSourcePathIds: colliders
          .map((collider) => collider.source.sourcePathId)
          .filter((pathId): pathId is number => typeof pathId === "number"),
      }))
      : [],
    defaultRoot: normalizeRootName(defaultRoot),
    selectedRoot,
    selectedColliderCount: selectedColliders.length,
    selectedColliderSourcePathIds: selectedColliders
      .map((collider) => collider.source.sourcePathId)
      .filter((pathId): pathId is number => typeof pathId === "number"),
    selectionReason,
  };
}

function cloneColliderBindingDiagnostic(
  diagnostic: RuntimeColliderBindingDiagnostic
): RuntimeColliderBindingDiagnostic {
  return {
    ...diagnostic,
    candidateRoots: diagnostic.candidateRoots.map((candidate) => ({
      ...candidate,
      colliderSourcePathIds: [...candidate.colliderSourcePathIds],
    })),
    selectedColliderSourcePathIds: [...diagnostic.selectedColliderSourcePathIds],
  };
}

function buildRuntimeBindingDecisionMap(
  runtimeUnitySetup: RuntimeUnitySetup | null
): Map<number, RuntimeBindingDecision> {
  const result = new Map<number, RuntimeBindingDecision>();
  for (const decision of runtimeUnitySetup?.bindingDecisions ?? []) {
    if (typeof decision.sourceSpringBonePathId === "number") {
      result.set(decision.sourceSpringBonePathId, decision);
    }
  }
  return result;
}

function buildRuntimeManagerColliderCacheMap(
  runtimeUnitySetup: RuntimeUnitySetup | null
): Map<number, RuntimeManagerColliderCacheBinding> {
  const result = new Map<number, RuntimeManagerColliderCacheBinding>();
  for (const cache of runtimeUnitySetup?.managerColliderCaches ?? []) {
    if (typeof cache.managerPathId !== "number") {
      continue;
    }
    const colliderIndexes = new Set<number>();
    for (const index of [
      ...(cache.sphereColliderIndexes ?? []),
      ...(cache.capsuleColliderIndexes ?? []),
      ...(cache.panelColliderIndexes ?? []),
    ]) {
      if (typeof index === "number") {
        colliderIndexes.add(index);
      }
    }
    result.set(cache.managerPathId, {
      source: cache,
      colliderIndexes,
    });
  }
  return result;
}

function buildDecisionCollidersByRoot(
  bindingDecision: RuntimeBindingDecision | undefined,
  colliderByIndex: ReadonlyMap<number, RuntimeCollider>
): Map<string, RuntimeCollider[]> {
  const result = new Map<string, RuntimeCollider[]>();
  for (const [rootName, indexes] of Object.entries(bindingDecision?.candidateRoots ?? {})) {
    const colliders = indexes
      .map((index) => colliderByIndex.get(index))
      .filter((collider): collider is RuntimeCollider => Boolean(collider));
    if (colliders.length > 0) {
      result.set(rootName, colliders);
    }
  }
  return result;
}

function filterCollidersByManagerCache(
  colliders: RuntimeCollider[],
  managerCache: RuntimeManagerColliderCacheBinding | undefined
): RuntimeCollider[] {
  if (!managerCache || managerCache.colliderIndexes.size === 0) {
    return colliders;
  }
  return colliders.filter((collider) =>
    typeof collider.source.index === "number" &&
    managerCache.colliderIndexes.has(collider.source.index)
  );
}

function constrainColliderRootsByManagerCache(
  candidateRoots: ReadonlyMap<string, RuntimeCollider[]>,
  managerCache: RuntimeManagerColliderCacheBinding | undefined
): Map<string, RuntimeCollider[]> {
  const result = new Map<string, RuntimeCollider[]>();
  for (const [root, colliders] of candidateRoots.entries()) {
    const filtered = filterCollidersByManagerCache(colliders, managerCache);
    if (filtered.length > 0) {
      result.set(root, filtered);
    }
  }
  return result;
}

function managerCacheSummary(
  managerCache: RuntimeManagerColliderCacheBinding | undefined
): string {
  if (!managerCache) {
    return "no manager cache available";
  }
  const managerName = managerCache.source.managerNodeName ?? "manager";
  const sphereCount = managerCache.source.sphereColliderIndexes?.length ?? 0;
  const capsuleCount = managerCache.source.capsuleColliderIndexes?.length ?? 0;
  const panelCount = managerCache.source.panelColliderIndexes?.length ?? 0;
  return `${managerName} manager cache (${sphereCount} sphere, ${capsuleCount} capsule, ${panelCount} panel)`;
}

function preferMatchingPoseColliders(
  colliders: RuntimeCollider[],
  spring: CandidateSpring,
  joint: CandidateJoint
): RuntimeCollider[] {
  const preferredRoot = preferredColliderRoot(spring, joint);
  if (!preferredRoot) {
    return colliders;
  }

  const collidersByName = new Map<string, RuntimeCollider[]>();
  for (const collider of colliders) {
    const name = collider.source.nodeName ?? collider.source.name ?? "";
    const items = collidersByName.get(name);
    if (items) {
      items.push(collider);
    } else {
      collidersByName.set(name, [collider]);
    }
  }

  return colliders.filter((collider) => {
    const name = collider.source.nodeName ?? collider.source.name ?? "";
    const sameNameColliders = collidersByName.get(name);
    if (!sameNameColliders || sameNameColliders.length <= 1) {
      return true;
    }
    const hasPreferredPose = sameNameColliders.some((item) =>
      item.source.nodePath?.startsWith(preferredRoot)
    );
    return !hasPreferredPose || collider.source.nodePath?.startsWith(preferredRoot);
  });
}

function preferredColliderRoot(spring: CandidateSpring, joint: CandidateJoint): "body/" | "sit_body/" | null {
  if (joint.nodePath?.startsWith("sit_body/")) {
    return "sit_body/";
  }
  if (joint.nodePath?.startsWith("body/")) {
    return "body/";
  }
  return spring.name?.startsWith("Head:") || joint.nodePath?.startsWith("face/")
    ? "body/"
    : null;
}

function rootNameFromPath(path?: string | null): string | null {
  if (!path) {
    return null;
  }
  const slashIndex = path.indexOf("/");
  return slashIndex < 0 ? path : path.slice(0, slashIndex);
}

function normalizeRootName(root?: string | null): string | null {
  if (!root) {
    return null;
  }
  return root.endsWith("/") ? root.slice(0, -1) : root;
}

function resolveJointColliderGroupsByOrder(
  spring: CandidateSpring,
  jointIndex: number
): number[] | undefined {
  const groupsByPathId = spring.jointColliderGroups;
  if (!groupsByPathId) {
    return undefined;
  }
  const orderedGroups = Object.values(groupsByPathId);
  return jointIndex >= 0 && jointIndex < orderedGroups.length
    ? orderedGroups[jointIndex]
    : undefined;
}

function worldScaleX(node: THREE.Object3D): number {
  const scale = node.getWorldScale(new THREE.Vector3());
  return scale.x;
}

function matrixXDirectionLength(matrix: THREE.Matrix4): number {
  const elements = matrix.elements;
  return Math.sqrt(
    elements[0] * elements[0] +
    elements[1] * elements[1] +
    elements[2] * elements[2]
  );
}

function lerpQuaternionNormalized(
  from: THREE.Quaternion,
  to: THREE.Quaternion,
  t: number
): THREE.Quaternion {
  const amount = THREE.MathUtils.clamp(t, 0, 1);
  let toX = to.x;
  let toY = to.y;
  let toZ = to.z;
  let toW = to.w;
  if (from.dot(to) < 0) {
    toX = -toX;
    toY = -toY;
    toZ = -toZ;
    toW = -toW;
  }
  return new THREE.Quaternion(
    from.x + (toX - from.x) * amount,
    from.y + (toY - from.y) * amount,
    from.z + (toZ - from.z) * amount,
    from.w + (toW - from.w) * amount
  ).normalize();
}

function makeNormalDirectionMatrix(matrix: THREE.Matrix4): THREE.Matrix4 {
  const normalMatrix = matrix.clone();
  normalMatrix.setPosition(0, 0, 0);
  return normalMatrix.invert().transpose();
}

function sourceColliderOrder(collider: CandidateCollider): number {
  if (collider.shape?.sphere) {
    return 0;
  }
  if (collider.shape?.capsule) {
    return 1;
  }
  return 2;
}

function getUtjObjectDepth(node: THREE.Object3D): number {
  let depth = 0;
  let current: THREE.Object3D | null = node;
  while (current) {
    depth += 1;
    current = current.parent;
  }
  return depth;
}

function collectSpringBoneChildExclusionNodes(
  springs: readonly CandidateSpring[] | undefined,
  resolution: NodeResolution
): Set<THREE.Object3D> {
  const nodes = new Set<THREE.Object3D>();
  for (const spring of springs ?? []) {
    for (const joint of spring.joints ?? []) {
      const jointNode = resolveSpringJointNode(resolution, joint);
      if (jointNode) {
        nodes.add(jointNode);
      }
    }
  }
  return nodes;
}

function collectSpringBonePivotNodes(
  pivots: readonly CandidateSpringBonePivot[] | undefined,
  resolution: NodeResolution
): Set<THREE.Object3D> {
  const nodes = new Set<THREE.Object3D>();
  for (const pivot of pivots ?? []) {
    if (pivot.scriptName && !pivot.scriptName.endsWith("SpringBonePivot")) {
      continue;
    }
    const node = resolveNode(resolution, pivot.nodePath, pivot.nodeName, {
      allowNameFallback: false,
      allowSitBodyAlias: false,
    });
    if (node) {
      nodes.add(node);
    }
  }
  return nodes;
}

function computeUtjChildPosition(
  node: THREE.Object3D,
  childExclusionNodes: ReadonlySet<THREE.Object3D>
): RuntimeTailBindingDiagnostic {
  return computeChildPosition(
    node,
    (child) => !childExclusionNodes.has(child) && !child.name.endsWith("_spring_tail")
  );
}

function computeUnityPrefabChildPosition(
  node: THREE.Object3D,
  pivotExclusionNodes: ReadonlySet<THREE.Object3D>
): RuntimeTailBindingDiagnostic {
  return computeChildPosition(
    node,
    (child) => !pivotExclusionNodes.has(child) && !child.name.endsWith("_spring_tail")
  );
}

function computeChildPosition(
  node: THREE.Object3D,
  isValidChild: (child: THREE.Object3D) => boolean
): RuntimeTailBindingDiagnostic {
  node.updateMatrixWorld(true);
  const headPosition = node.getWorldPosition(new THREE.Vector3());
  const right = new THREE.Vector3(1, 0, 0).transformDirection(node.matrixWorld);
  const fallback = headPosition.clone().addScaledVector(right, -0.1);
  const validChildren = node.children.filter(isValidChild);
  const childNames = validChildren.map((child) => child.name);
  const childPaths = validChildren.map((child) => getObjectPath(child));

  if (validChildren.length === 0) {
    return {
      mode: "fallback",
      childCount: 0,
      childNames,
      childPaths,
      tailPosition: fallback,
    };
  }

  if (validChildren.length === 1) {
    return {
      mode: "singleChild",
      childCount: 1,
      childNames,
      childPaths,
      tailPosition: validChildren[0].getWorldPosition(new THREE.Vector3()),
    };
  }

  const averagePosition = new THREE.Vector3();
  let averageDistance = 0;
  for (const child of validChildren) {
    const childPosition = child.getWorldPosition(new THREE.Vector3());
    averagePosition.add(childPosition);
    averageDistance += childPosition.distanceTo(headPosition);
  }
  averagePosition.multiplyScalar(1 / validChildren.length);
  averageDistance /= validChildren.length;

  const direction = averagePosition.sub(headPosition);
  if (direction.lengthSq() <= 0.00000001) {
    return {
      mode: "averageChildren",
      childCount: validChildren.length,
      childNames,
      childPaths,
      tailPosition: headPosition.clone(),
    };
  }
  return {
    mode: "averageChildren",
    childCount: validChildren.length,
    childNames,
    childPaths,
    tailPosition: headPosition.clone().addScaledVector(direction.normalize(), averageDistance),
  };
}

function buildNodeResolution(root: THREE.Object3D): NodeResolution {
  const nodeByPath = new Map<string, THREE.Object3D>();
  const canonicalNodeByPath = new Map<string, THREE.Object3D>();
  const aliasNodeByPath = new Map<string, THREE.Object3D>();
  const nodeByName = new Map<string, THREE.Object3D[]>();

  root.traverse((node) => {
    if (node !== root) {
      const byName = nodeByName.get(node.name) ?? [];
      byName.push(node);
      nodeByName.set(node.name, byName);
    }

    const path = getObjectPath(node, root);
    if (!path) {
      return;
    }
    nodeByPath.set(path, node);
    const canonicalPath = getCanonicalObjectPath(node, root);
    if (canonicalPath && canonicalPath !== path) {
      canonicalNodeByPath.set(canonicalPath, node);
    }
    if (path.startsWith("body/")) {
      aliasNodeByPath.set(`sit_body/${path.slice("body/".length)}`, node);
    }
    if (canonicalPath.startsWith("body/")) {
      aliasNodeByPath.set(`sit_body/${canonicalPath.slice("body/".length)}`, node);
    }
  });

  return { nodeByPath, canonicalNodeByPath, aliasNodeByPath, nodeByName };
}

function collectSkinnedBones(root: THREE.Object3D): Set<THREE.Object3D> {
  const bones = new Set<THREE.Object3D>();
  root.traverse((node) => {
    const mesh = node as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh) {
      return;
    }
    for (const bone of mesh.skeleton.bones) {
      bones.add(bone);
    }
  });
  return bones;
}

function getObjectPath(node: THREE.Object3D, stopAt?: THREE.Object3D): string {
  const names: string[] = [];
  let current: THREE.Object3D | null = node;
  while (current && current !== stopAt) {
    if (current.name && !current.name.startsWith("Loaded:")) {
      names.unshift(current.name);
    }
    current = current.parent;
  }
  return names.join("/");
}

function getCanonicalObjectPath(node: THREE.Object3D, stopAt?: THREE.Object3D): string {
  const names: string[] = [];
  let current: THREE.Object3D | null = node;
  while (current && current !== stopAt) {
    if (current.name && !current.name.startsWith("Loaded:")) {
      names.unshift(stripThreeUniqueNameSuffix(current.name));
    }
    current = current.parent;
  }
  return names.join("/");
}

function stripThreeUniqueNameSuffix(name: string): string {
  return name.replace(/_([1-9]\d*)$/, "");
}

function resolveNode(
  resolution: NodeResolution,
  sourcePath?: string | null,
  sourceName?: string | null,
  options: { allowNameFallback?: boolean; allowSitBodyAlias?: boolean } = {}
): THREE.Object3D | null {
  for (const candidate of enumeratePathCandidates(sourcePath, options)) {
    const node = resolution.nodeByPath.get(candidate) ??
      resolution.canonicalNodeByPath.get(candidate) ??
      (options.allowSitBodyAlias === false ? undefined : resolution.aliasNodeByPath.get(candidate));
    if (node) {
      return node;
    }
  }

  if (options.allowNameFallback !== false && sourceName) {
    return resolution.nodeByName.get(sourceName)?.[0] ?? null;
  }
  return null;
}

function enumeratePathCandidates(
  sourcePath?: string | null,
  options: { allowNameFallback?: boolean; allowSitBodyAlias?: boolean } = {}
): string[] {
  if (!sourcePath) {
    return [];
  }

  const paths = [sourcePath];
  if (options.allowSitBodyAlias !== false && sourcePath.startsWith("sit_body/")) {
    paths.push(`body/${sourcePath.slice("sit_body/".length)}`);
  }

  const faceHumanoidPrefix = "face/Position/Hip/Waist/Spine/Chest/Neck/Head";
  const bodyHumanoidPrefix = "body/Position/PositionOffset/Hip/Waist/Spine/Chest/Neck/Head";
  if (sourcePath.startsWith(faceHumanoidPrefix)) {
    paths.push(bodyHumanoidPrefix + sourcePath.slice(faceHumanoidPrefix.length));
  }

  const facePositionPrefix = "face/Position/Hip";
  const bodyPositionPrefix = "body/Position/PositionOffset/Hip";
  if (sourcePath.startsWith(facePositionPrefix)) {
    paths.push(bodyPositionPrefix + sourcePath.slice(facePositionPrefix.length));
  }
  return paths;
}

function vectorFromRaw(
  value?: { X?: number; Y?: number; Z?: number; x?: number; y?: number; z?: number } | number[] | null,
  fallback = new THREE.Vector3(0, 0, 0)
): THREE.Vector3 {
  if (Array.isArray(value)) {
    return new THREE.Vector3(value[0] ?? fallback.x, value[1] ?? fallback.y, value[2] ?? fallback.z);
  }
  return new THREE.Vector3(
    value?.X ?? value?.x ?? fallback.x,
    value?.Y ?? value?.y ?? fallback.y,
    value?.Z ?? value?.z ?? fallback.z
  );
}

function resolveRuntimeBoneAxis(
  joint: CandidateJoint,
  localTipPosition: THREE.Vector3
): { axis: THREE.Vector3; source: RuntimeBoneAxisSource } {
  const computedAxis = normalizeRuntimeAxis(localTipPosition);
  if (!computedAxis) {
    return { axis: new THREE.Vector3(0, 0, 0), source: "fallback-local-tip" };
  }
  return { axis: computedAxis, source: "computed-local-tip" };
}

function normalizeRuntimeAxis(axis: THREE.Vector3): THREE.Vector3 | null {
  return axis.lengthSq() <= 0.00001 * 0.00001 ? null : axis.clone().normalize();
}

function vectorFromArray(values?: number[]): THREE.Vector3 {
  return new THREE.Vector3(values?.[0] ?? 0, values?.[1] ?? 0, values?.[2] ?? 0);
}

function readRawNumber(raw: JsonRecord, key: string, fallback: number): number {
  const value = raw[key] ?? raw[key[0].toUpperCase() + key.slice(1)];
  return typeof value === "number" ? value : fallback;
}

function readRawVector(raw: JsonRecord, key: string): THREE.Vector3 {
  const value = raw[key] ?? raw[key[0].toUpperCase() + key.slice(1)];
  if (Array.isArray(value)) {
    return vectorFromRaw(value);
  }
  if (typeof value === "object" && value !== null) {
    return vectorFromRaw(value as { X?: number; Y?: number; Z?: number; x?: number; y?: number; z?: number });
  }
  return new THREE.Vector3(0, 0, 0);
}

function readRawBoolean(raw: JsonRecord, key: string, fallback: boolean): boolean {
  const value = raw[key] ?? raw[key[0].toUpperCase() + key.slice(1)];
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  return fallback;
}

function readRawObjectPathId(raw: JsonRecord, key: string): number | null {
  const value = asRecord(raw[key] ?? raw[key[0].toUpperCase() + key.slice(1)]);
  return readFiniteNumber(value?.m_PathID ?? value?.m_pathID ?? value?.pathId);
}

// UTJ.SpringManager.CalcTimeStep RVA 0x0a59ffac
function calcUtjManagerTimeStep(
  unityDeltaTime: number,
  simulationFrameRate: number,
  slowMotionScale: number
): number {
  const deltaTime = simulationFrameRate > 0 ? 1.0 / simulationFrameRate : unityDeltaTime;
  return slowMotionScale === 1.0 ? deltaTime : deltaTime * slowMotionScale;
}

function buildManagerSettingsByPathId(springBone: JsonRecord | null): Map<number, ManagerSettings> {
  const result = new Map<number, ManagerSettings>();
  const raw = asRecord(springBone?.raw ?? springBone?.Raw);
  addManagerSettingsFromPart(asRecord(raw?.Body ?? raw?.body), result);
  addManagerSettingsFromPart(asRecord(raw?.Head ?? raw?.head), result);
  return result;
}

function addManagerSettingsFromPart(part: JsonRecord | null, result: Map<number, ManagerSettings>): void {
  const managers = part?.Managers ?? part?.managers;
  if (!Array.isArray(managers)) {
    return;
  }

  for (const managerValue of managers) {
    const manager = asRecord(managerValue);
    const pathId = readPathId(manager);
    const raw = asRecord(manager?.Raw ?? manager?.raw);
    const dynamicRatio = readFiniteNumber(raw?.dynamicRatio ?? raw?.DynamicRatio);
    if (pathId === null) {
      continue;
    }
    result.set(pathId, {
      dynamicRatio: THREE.MathUtils.clamp(dynamicRatio ?? 0.5, 0, 1),
      // Sekai.Core.CharacterModel.SetupSpringBone overwrites this with an empty list.
      animatedBoneNames: new Set<string>(),
      simulationFrameRate: readFiniteNumber(raw?.simulationFrameRate ?? raw?.SimulationFrameRate) ?? 60,
      slowMotionScale: readFiniteNumber(raw?.slowMotionScale ?? raw?.SlowMotionScale) ?? 1,
      bounce: readFiniteNumber(raw?.bounce ?? raw?.Bounce) ?? 0,
      friction: readFiniteNumber(raw?.friction ?? raw?.Friction) ?? 1,
    });
  }
}

function readPathId(value: JsonRecord | null): number | null {
  return readFiniteNumber(value?.PathId ?? value?.pathId ?? value?.sourcePathId);
}

function readFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function resolveManagerSettings(
  spring: CandidateSpring,
  managerSettingsByPathId: ReadonlyMap<number, ManagerSettings>
): ManagerSettings {
  const settings = typeof spring.managerPathId === "number"
    ? managerSettingsByPathId.get(spring.managerPathId)
    : undefined;
  const dynamicRatio = settings?.dynamicRatio ?? 0.5;
  const simulationFrameRate = readFiniteNumber(spring.simulationFrameRate) ?? settings?.simulationFrameRate ?? 60;
  const slowMotionScale = readFiniteNumber(spring.slowMotionScale) ?? settings?.slowMotionScale ?? 1;
  const bounce = readFiniteNumber(spring.bounce) ?? settings?.bounce ?? 0;
  const friction = readFiniteNumber(spring.friction) ?? settings?.friction ?? 1;
  const animatedBoneNames = readStringSet(spring.animatedBoneNames);
  if (typeof spring.dynamicRatio === "number" && Number.isFinite(spring.dynamicRatio)) {
    return {
      dynamicRatio: THREE.MathUtils.clamp(spring.dynamicRatio, 0, 1),
      animatedBoneNames,
      simulationFrameRate,
      slowMotionScale,
      bounce,
      friction,
    };
  }
  return {
    dynamicRatio,
    animatedBoneNames,
    simulationFrameRate,
    slowMotionScale,
    bounce,
    friction,
  };
}

function isBoneAnimated(
  joint: CandidateJoint,
  node: THREE.Object3D,
  settings: ManagerSettings
): boolean {
  if (settings.animatedBoneNames.size === 0) {
    return false;
  }
  return containsAnimatedBoneName(node.name, settings.animatedBoneNames) ||
    (typeof joint.nodeName === "string" && containsAnimatedBoneName(joint.nodeName, settings.animatedBoneNames));
}

function containsAnimatedBoneName(
  nodeName: string,
  animatedBoneNames: ReadonlySet<string>
): boolean {
  if (animatedBoneNames.has(nodeName)) {
    return true;
  }
  for (const animatedBoneName of animatedBoneNames) {
    if (animatedBoneName.length > 0 && nodeName.includes(animatedBoneName)) {
      return true;
    }
  }
  return false;
}

function readStringSet(value: unknown): ReadonlySet<string> {
  if (!Array.isArray(value)) {
    return new Set<string>();
  }
  return new Set(value.filter((item): item is string => typeof item === "string"));
}

function constrainFUnitAxisLimit(
  limit: UtjAngleLimit,
  vector: THREE.Vector3,
  forwardAxis: "x" | "y" | "z",
  constrainedAxis: "x" | "y" | "z",
  orthogonalAxis: "x" | "y" | "z"
): boolean {
  if (!limit.active) {
    return false;
  }

  const x = vector[forwardAxis];
  const y = vector[constrainedAxis];
  const z = vector[orthogonalAxis];
  const planarLengthSq = x * x + y * y;
  if (planarLengthSq < 0.00000001) {
    return false;
  }

  const planarLength = Math.sqrt(planarLengthSq);
  const cosMin = Math.cos(THREE.MathUtils.degToRad(limit.min));
  const cosMax = Math.cos(THREE.MathUtils.degToRad(limit.max));
  const limitCos = y > 0 ? cosMin : cosMax;
  if (-x / planarLength >= limitCos) {
    return false;
  }

  if (limitCos <= 0.9999) {
    const ySignProbe = -y / planarLength;
    const sinLimit = Math.sqrt(Math.max(0, 1 - limitCos * limitCos));
    const signedSinLimit = ySignProbe >= 0 ? sinLimit : -sinLimit;
    vector[forwardAxis] = planarLength * -limitCos;
    vector[constrainedAxis] = planarLength * -signedSinLimit;
    normalizeAxisTriplet(vector, forwardAxis, constrainedAxis, orthogonalAxis);
    return true;
  }

  const bothLimitsAreZero =
    Math.abs(limit.min) <= 0.0001 &&
    Math.abs(limit.max) <= 0.0001;
  const remainingSq = 1 - z * z;
  let nextX = remainingSq <= 0.00000001 ? 0 : -Math.sqrt(Math.max(0, remainingSq));
  if (x > 0 && bothLimitsAreZero) {
    nextX = -nextX;
  }
  vector[forwardAxis] = nextX;
  vector[constrainedAxis] = 0;
  normalizeAxisTriplet(vector, forwardAxis, constrainedAxis, orthogonalAxis);
  return true;
}

function normalizeAxisTriplet(
  vector: THREE.Vector3,
  xAxis: "x" | "y" | "z",
  yAxis: "x" | "y" | "z",
  zAxis: "x" | "y" | "z"
): void {
  const x = vector[xAxis];
  const y = vector[yAxis];
  const z = vector[zAxis];
  const lengthSq = x * x + y * y + z * z;
  if (lengthSq <= 0.00000001) {
    vector[xAxis] = 1;
    vector[yAxis] = 0;
    vector[zAxis] = 0;
    return;
  }
  const inverseLength = 1 / Math.sqrt(lengthSq);
  vector[xAxis] = x * inverseLength;
  vector[yAxis] = y * inverseLength;
  vector[zAxis] = z * inverseLength;
}

function quaternionsAlmostEqual(a: THREE.Quaternion, b: THREE.Quaternion): boolean {
  return Math.abs(a.x - b.x) < 0.000001 &&
    Math.abs(a.y - b.y) < 0.000001 &&
    Math.abs(a.z - b.z) < 0.000001 &&
    Math.abs(a.w - b.w) < 0.000001;
}

function addPeriodically(currentValue: number, deltaValue: number, period: number): number {
  let value = currentValue + deltaValue;
  if (period <= 0) {
    return value;
  }
  while (value >= period) {
    value -= period;
  }
  return value;
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object"
    ? (value as JsonRecord)
    : null;
}

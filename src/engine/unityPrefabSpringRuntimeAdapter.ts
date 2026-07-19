import * as THREE from "three";
import {
  applyUtjLengthLimits,
  cacheUtjSpringBonePosition,
  checkUtjCollisions,
  checkUtjGroundCollision,
  computeAnimatedTipPosition,
  computeUtjLocalRotation,
  constrainUtjAngleLimit,
  createUtjSpringBoneState,
  updateUtjSpring,
  type UtjAngleLimit,
  type UtjCollider,
  type UtjColliderCheckTrace,
  type UtjLengthLimitTarget,
  type UtjSpringBoneState,
} from "./utjSpringBoneRuntime";
import type {
  UtjSpringBoneDebugOptions,
  UtjSpringBoneRuntimeSnapshot,
  UtjSpringBoneTraceSnapshot,
} from "./springRuntimeTypes";
import {
  convertUnityAxisToThree,
  type UnityVectorLike,
} from "./unityCoordinateConversion";

type UnknownRecord = Record<string, unknown>;
type VectorLike = UnityVectorLike;
type QuaternionLike = { x?: number; y?: number; z?: number; w?: number };
type RuntimeColliderBindingDiagnostic = UtjSpringBoneRuntimeSnapshot["bindingDiagnostics"][number];
type RuntimeTraceEvent = UtjSpringBoneTraceSnapshot["events"][number];
type RuntimeColliderTraceSnapshot = RuntimeTraceEvent["collisionChecks"][number];

type RuntimeUnitySetup0414 = {
  version?: string | number;
  prefabGraphs?: RuntimePrefabGraph[];
  rootSelectionProfile?: {
    defaultBodyRoot?: string;
  } | null;
  activeRootProfile?: {
    defaultBodyRoot?: string;
    activeRoots?: string[];
  } | null;
  managers?: RuntimeManagerSource[];
  bones?: RuntimeBoneSource[];
  colliders?: RuntimeColliderSource[];
  colliderBindings?: RuntimeColliderBindingSource[];
  bindingDecisions?: RuntimeBindingDecisionSource[];
  managerColliderCaches?: RuntimeManagerColliderCacheSource[];
};

type RuntimePrefabGraph = {
  transforms?: RuntimePrefabTransform[];
  monoBehaviours?: RuntimePrefabMonoBehaviour[];
};

type RuntimePrefabTransform = {
  pathId?: number;
  name?: string | null;
  transformPath?: string | null;
  parentPathId?: number | null;
  childPathIds?: number[];
  localPosition?: VectorLike | null;
  runtimePartIndex?: number;
};

type RuntimePrefabMonoBehaviour = {
  pathId?: number;
  scriptName?: string;
  name?: string | null;
  transformPath?: string | null;
  enabled?: boolean;
  runtimePartIndex?: number;
};

type RuntimeManagerSource = {
  partKind?: string;
  runtimePartIndex?: number;
  runtimePartType?: string;
  pathId?: number;
  nodeName?: string | null;
  nodePath?: string | null;
  poseRoot?: string | null;
  activeSelf?: boolean;
  activeInHierarchy?: boolean;
  enabled?: boolean;
  automaticUpdates?: boolean;
  enableLengthLimits?: boolean;
  enableAngleLimits?: boolean;
  enableCollision?: boolean;
  collideWithGround?: boolean;
  groundHeight?: number;
  isSumOfForcesOnBone?: boolean;
  isPaused?: boolean;
  dynamicRatio?: number;
  simulationFrameRate?: number;
  slowMotionScale?: number;
  bounce?: number;
  friction?: number;
  animatedBoneNames?: string[];
  rawGravity?: VectorLike | null;
  forceProviders?: RuntimeForceProviderSource[];
  bonePathIds?: number[];
};

type RuntimeForceProviderSource = {
  sourcePathId?: number;
  scriptName?: string;
  nodeName?: string | null;
  nodePath?: string | null;
  activeSelf?: boolean | null;
  activeInHierarchy?: boolean | null;
  springManagerPathId?: number | null;
  runtimePartIndex?: number;
  raw?: UnknownRecord | null;
};

type RuntimeBoneSource = {
  partKind?: string;
  runtimePartIndex?: number;
  runtimePartType?: string;
  pathId?: number;
  nodeName?: string | null;
  nodePath?: string | null;
  poseRoot?: string | null;
  activeSelf?: boolean;
  activeInHierarchy?: boolean;
  enabled?: boolean;
  pivotNodeName?: string | null;
  pivotNodePath?: string | null;
  pivotSourcePathId?: number | null;
  hitRadius?: number;
  dragForce?: number;
  rawStiffnessForce?: number | null;
  rawDragForce?: number | null;
  rawSpringForce?: VectorLike | null;
  rawWindInfluence?: number | null;
  rawAngularStiffness?: number | null;
  rawSpringConstant?: number | null;
  rawBoneAxis?: VectorLike | number[] | null;
  boneAxis?: VectorLike | number[] | null;
  lengthLimitTargets?: RuntimeLengthLimitTargetSource[];
  rawAngleLimits?: {
    y?: RuntimeAngleLimitSource | null;
    z?: RuntimeAngleLimitSource | null;
  } | null;
};

type RuntimeLengthLimitTargetSource = {
  nodeName?: string | null;
  nodePath?: string | null;
  sourcePathId?: number;
  runtimePartIndex?: number;
};

type RuntimeAngleLimitSource = {
  active?: boolean;
  min?: number | null;
  max?: number | null;
};

type RuntimeColliderSource = {
  index?: number;
  partKind?: string;
  runtimePartIndex?: number;
  runtimePartType?: string;
  pathId?: number;
  scriptName?: string;
  nodeName?: string | null;
  nodePath?: string | null;
  poseRoot?: string | null;
  enabled?: boolean;
  linkedRendererEnabled?: boolean | null;
  shape?: RuntimeColliderShape | null;
};

type RuntimeColliderShape = {
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

type RuntimeColliderBindingSource = {
  sourceKind?: string | null;
  partKind?: string;
  sourceSpringBonePathId?: number;
  colliderFlag?: number | null;
  collidersByRoot?: Record<string, number[]> | null;
  defaultRoot?: string | null;
  sourceColliderPathIds?: number[];
  colliders?: number[];
};

type RuntimeBindingDecisionSource = {
  sourceKind?: string | null;
  sourceSpringBonePathId?: number;
  colliderFlag?: number | null;
  candidateRoots?: Record<string, number[]> | null;
  defaultRoot?: string | null;
  selectedColliderIndexes?: number[];
};

type RuntimeManagerColliderCacheSource = {
  managerPathId?: number;
  managerNodeName?: string | null;
  managerNodePath?: string | null;
  sourcePoseRoot?: string | null;
  runtimeRoot?: string | null;
  sphereColliderIndexes?: number[];
  capsuleColliderIndexes?: number[];
  panelColliderIndexes?: number[];
};

type NodeResolution = {
  nodeByPath: Map<string, THREE.Object3D>;
  nodeByPartPath: Map<string, THREE.Object3D>;
  canonicalNodeByPath: Map<string, THREE.Object3D>;
};

type PrefabGraphIndex = {
  transformByPathId: Map<number, RuntimePrefabTransform>;
  transformByPath: Map<string, RuntimePrefabTransform>;
  transformByPartPath: Map<string, RuntimePrefabTransform>;
  pivotTransformPathIds: Set<number>;
  pivotTransformPaths: Set<string>;
};

type RuntimeManagerColliderCacheBinding = {
  source: RuntimeManagerColliderCacheSource;
  colliderIndexes: Set<number>;
};

type RuntimeCollider = {
  source: RuntimeColliderSource;
  node: THREE.Object3D;
};

type RuntimeColliderBinding = {
  colliders: RuntimeCollider[];
  diagnostics: RuntimeColliderBindingDiagnostic[];
};

type RuntimeSetupDiagnostics = NonNullable<UtjSpringBoneRuntimeSnapshot["setupDiagnostics"]>;

type RuntimeTailBindingDiagnostic = {
  mode: "fallback" | "singleChild" | "averageChildren";
  childCount: number;
  childNames: string[];
  childPaths: string[];
  childSources: RuntimePrefabTransform[];
  tailPosition: THREE.Vector3;
};

type RuntimeLengthLimitTarget = {
  node: THREE.Object3D;
  initialLength: number;
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
  runtimePartIndex: number | null;
  runtimePartType: string | null;
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
  windInfluence: number;
  originalStiffnessForce: number;
  originalDragForce: number;
  originalWindInfluence: number;
  springForce: THREE.Vector3;
  springConstant: number;
  lengthLimitTargets: RuntimeLengthLimitTarget[];
  angularStiffness: number;
  pivotNode: THREE.Object3D | null;
  yAngleLimit: UtjAngleLimit | null;
  zAngleLimit: UtjAngleLimit | null;
  colliders: RuntimeCollider[];
  colliderBindingDiagnostics: RuntimeColliderBindingDiagnostic[];
  lastCollisionStatus: number;
  lastCollisionInfo: LastCollisionInfo | null;
  lastAngleLimitApplied: boolean;
};

type RuntimeForceProvider = RuntimeForceVolume | RuntimeWindVolume | RuntimeWindVolumeOneSelf;

type RuntimeForceProviderBase = {
  sourcePathId: number | null;
  node: THREE.Object3D;
  springManagerPathId: number | null;
};

type RuntimeForceVolume = RuntimeForceProviderBase & {
  kind: "ForceVolume";
  strength: number;
};

type RuntimeWindVolume = RuntimeForceProviderBase & {
  kind: "WindVolume";
  weight: number;
  strength: number;
  period: number;
  positionalMultiplier: number;
  timeFactor: number;
  offsetVector: THREE.Vector3;
};

type RuntimeWindVolumeOneSelf = RuntimeForceProviderBase & {
  kind: "WindVolumeOneSelf";
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

export type SpringTimelineControl = {
  stiffnessForce?: number | null;
  dragForce?: number | null;
  windInfluence?: number | null;
  slowMotionScale?: number | null;
  paused?: boolean | null;
};

type RuntimeBoneAxisSource =
  | "computed-local-tip"
  | "fallback-local-tip";

const UNITY_MATHF_EPSILON = 1.401298464324817e-45;
const UTJ_PIVOT_FORWARD_LOCAL = convertUnityAxisToThree("left");
const UTJ_PIVOT_BACK_LOCAL = convertUnityAxisToThree("back");
const UTJ_PIVOT_DOWN_LOCAL = convertUnityAxisToThree("down");

export class UnityPrefabSpringRuntime {
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
  private readonly debugAnimatedTip = new THREE.Vector3();
  private readonly providerForce = new THREE.Vector3();
  private readonly providerWorldToLocal = new THREE.Matrix4();
  private readonly waveAxis = new THREE.Vector3();
  private readonly providerRight = new THREE.Vector3();
  private readonly providerUp = new THREE.Vector3();
  private readonly mainWindDirection = new THREE.Vector3();
  private readonly localBonePosition = new THREE.Vector3();
  private readonly additionalDirection = new THREE.Vector3();
  private traceFilters: string[] = [];
  private traceMaxEvents = 240;
  private traceSequence = 0;
  private readonly traceEvents: RuntimeTraceEvent[] = [];

  private constructor(
    private readonly bones: RuntimeBone[],
    private readonly missingNodes: string[],
    private readonly skinnedBones: Set<THREE.Object3D>,
    private readonly setupDiagnostics: RuntimeSetupDiagnostics
  ) {}

  static fromPjskRuntimeExtension(
    extension: unknown,
    root: THREE.Object3D
  ): UnityPrefabSpringRuntime | null {
    const setup = readRuntimeUnitySetup0414(extension);
    if (!setup) {
      return null;
    }

    root.updateMatrixWorld(true);
    const resolution = buildNodeResolution(root);
    const graphIndex = buildPrefabGraphIndex(setup);
    const skinnedBones = collectSkinnedBones(root);
    const missingNodes: string[] = [];
    const activeRoots = buildActiveRootSet(setup);
    const colliderByIndex = buildRuntimeColliders(setup, resolution, missingNodes, activeRoots);
    const bindingByBonePathId = buildColliderBindingMap(setup);
    const decisionByBonePathId = buildBindingDecisionMap(setup);
    const managerCacheByPathId = buildManagerColliderCacheMap(setup, colliderByIndex);
    const boneByPathId = buildBoneMap(setup);
    const setupDiagnostics = buildSetupDiagnostics(setup, activeRoots);
    const controlledNodes = new Set<THREE.Object3D>();
    const forceProviderCache = new Map<string, RuntimeForceProvider>();
    const bones: RuntimeBone[] = [];

    for (const manager of setup.managers ?? []) {
      if (!isSourceActive(manager) || !isRuntimePathActive(manager.nodePath ?? manager.poseRoot, activeRoots)) {
        continue;
      }
      const forceProviders = resolveForceProviders(resolution, manager, forceProviderCache);
      for (const bonePathId of manager.bonePathIds ?? []) {
        const sourceBone = boneByPathId.get(bonePathId);
        if (!sourceBone || !isSourceActive(sourceBone) || !isRuntimePathActive(sourceBone.nodePath, activeRoots)) {
          continue;
        }
        const node = resolveNodeForPart(resolution, sourceBone.nodePath, sourceBone.runtimePartIndex);
        if (!node) {
          missingNodes.push(sourceBone.nodePath ?? sourceBone.nodeName ?? `bone:${bonePathId}`);
          continue;
        }
        if (controlledNodes.has(node)) {
          continue;
        }
        const tailBinding = computeUnityPrefabChildPosition(sourceBone, node, graphIndex, resolution);
        const pivotNode = resolveNodeForPart(resolution, sourceBone.pivotNodePath, sourceBone.runtimePartIndex);
        const colliderBinding = resolveColliderBinding(
          setup,
          manager,
          sourceBone,
          bindingByBonePathId.get(bonePathId),
          decisionByBonePathId.get(bonePathId),
          manager.pathId !== undefined ? managerCacheByPathId.get(manager.pathId) : undefined,
          colliderByIndex
        );
        const runtimeBone = createRuntimeBone(
          manager,
          sourceBone,
          node,
          tailBinding,
          pivotNode,
          resolveLengthLimitTargets(resolution, sourceBone),
          forceProviders,
          colliderBinding
        );
        if (runtimeBone) {
          bones.push(runtimeBone);
          controlledNodes.add(node);
        }
      }
    }

    bones.sort((a, b) => getObjectDepth(a.node) - getObjectDepth(b.node));
    return bones.length > 0
      ? new UnityPrefabSpringRuntime(bones, missingNodes, skinnedBones, setupDiagnostics)
      : null;
  }

  getControlledTrackNodeNames(): Set<string> {
    return new Set(this.bones.map((bone) => bone.node.name).filter(Boolean));
  }

  setTraceBoneFilters(filters: readonly string[], maxEvents = 240): void {
    this.traceFilters = filters.map((filter) => filter.trim().toLowerCase()).filter(Boolean);
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

  // Mirrors the three official timeline paths: global SpringBoneControl,
  // manager SpringBoneSlow, and CharacterModel.PauseSpringBone.
  setTimelineControl(control: SpringTimelineControl): void {
    for (const bone of this.bones) {
      bone.stiffnessForce = finiteOverride(control.stiffnessForce, bone.originalStiffnessForce);
      bone.dragForce = finiteOverride(control.dragForce, bone.originalDragForce);
      bone.windInfluence = finiteOverride(control.windInfluence, bone.originalWindInfluence);
      bone.slowMotionScale = finiteOverride(control.slowMotionScale, 1);
      bone.isPaused = control.paused ?? false;
    }
  }

  clearTimelineControl(): void {
    this.setTimelineControl({});
  }

  // UTJ.SpringManager.UpdateDynamics RVA 0x0a59fe18
  update(deltaTime: number): void {
    if (this.bones.some((bone) => bone.automaticUpdates && bone.enabled && !bone.isPaused)) {
      this.preUpdateColliders();
    }

    const windProviders = this.collectWindVolumeOneSelfProviders();
    const lateUpdateManagerIds = new Set(
      windProviders
        .filter((provider) => provider.isActive && provider.springManagerPathId !== null)
        .map((provider) => provider.springManagerPathId as number)
    );
    const windManagedSumIds = new Set(
      windProviders
        .filter((provider) => !provider.isActive && provider.springManagerPathId !== null)
        .map((provider) => provider.springManagerPathId as number)
    );

    for (const bone of this.bones) {
      if (!bone.automaticUpdates || !bone.enabled) {
        continue;
      }
      bone.node.parent?.getWorldQuaternion(this.parentRotation);
      bone.node.getWorldPosition(this.headPosition);
      if (bone.isPaused) {
        this.applyBoneRotation(bone, getEffectiveDynamicRatio(bone));
        continue;
      }
      const managerSumsForces = bone.managerPathId !== null && windManagedSumIds.has(bone.managerPathId)
        ? true
        : bone.isSumOfForcesOnBone;
      if (!managerSumsForces || (bone.managerPathId !== null && lateUpdateManagerIds.has(bone.managerPathId))) {
        continue;
      }
      this.computeExternalForce(bone, deltaTime);
      this.updateBoneSpringAndRotation(
        bone,
        calcUtjManagerTimeStep(deltaTime, bone.simulationFrameRate, bone.slowMotionScale),
        this.externalForce,
        getEffectiveDynamicRatio(bone)
      );
    }

    for (const provider of windProviders) {
      if (provider.isActive) {
        this.updateWindVolumeOneSelfLateUpdate(provider, deltaTime);
      }
    }
  }

  private collectWindVolumeOneSelfProviders(): RuntimeWindVolumeOneSelf[] {
    const providers = new Set<RuntimeWindVolumeOneSelf>();
    for (const bone of this.bones) {
      for (const provider of bone.forceProviders) {
        if (provider.kind === "WindVolumeOneSelf") {
          providers.add(provider);
        }
      }
    }
    return [...providers];
  }

  private updateWindVolumeOneSelfLateUpdate(
    provider: RuntimeWindVolumeOneSelf,
    deltaTime: number
  ): void {
    if (provider.springManagerPathId === null) {
      return;
    }
    const dt = provider.simulationFrameRate > 0 ? 1 / provider.simulationFrameRate : deltaTime;
    for (const bone of this.bones) {
      if (bone.managerPathId !== provider.springManagerPathId || !bone.automaticUpdates || !bone.enabled || bone.isPaused) {
        continue;
      }
      this.computeWindVolumeOneSelfForce(provider, bone, deltaTime);
      this.externalForce.copy(bone.gravity).add(this.providerForce);
      this.updateBoneSpringAndRotation(
        bone,
        dt,
        this.externalForce,
        bone.isAnimated ? provider.dynamicRatio : 1
      );
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
      provider.node.updateMatrixWorld(true);
      return this.providerForce
        .set(0, 0, 1)
        .transformDirection(provider.node.matrixWorld)
        .multiplyScalar(provider.strength);
    }
    if (provider.kind === "WindVolume") {
      return this.computeWindVolume(provider, bone);
    }
    return this.computeWindVolumeOneSelfForce(provider, bone, deltaTime);
  }

  private computeWindVolume(provider: RuntimeWindVolume, bone: RuntimeBone): THREE.Vector3 {
    const baseStrength = provider.weight * provider.strength;
    if (baseStrength <= UNITY_MATHF_EPSILON || provider.period <= 0.001) {
      return this.providerForce.set(0, 0, 0);
    }
    provider.node.updateMatrixWorld(true);
    bone.node.getWorldPosition(this.localBonePosition).applyMatrix4(
      this.providerWorldToLocal.copy(provider.node.matrixWorld).invert()
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
      this.providerRight.set(1, 0, 0).transformDirection(provider.node.matrixWorld);
      this.providerUp.set(0, 1, 0).transformDirection(provider.node.matrixWorld);
      this.waveAxis.copy(this.providerRight).multiplyScalar(Math.cos(spinPhase)).addScaledVector(
        this.providerUp,
        Math.sin(spinPhase)
      );
    }
    const peakDistance = Math.max(provider.peakDistance, UNITY_MATHF_EPSILON);
    bone.node.getWorldPosition(this.localBonePosition).applyMatrix4(
      this.providerWorldToLocal.copy(provider.node.matrixWorld).invert()
    );
    const waveScale = Math.PI * 2 / peakDistance;
    const wave = Math.sin(
      phase +
      Math.sin(waveScale * this.localBonePosition.x) +
      Math.cos(waveScale * this.localBonePosition.z)
    );
    this.mainWindDirection.set(0, 0, 1)
      .transformDirection(provider.node.matrixWorld)
      .addScaledVector(this.waveAxis, provider.amplitude * wave)
      .normalize();
    // Official: Quaternion.Euler(0, angle, 0) * Vector3.right. Mirror Unity's
    // X axis when expressing that world-space direction in Three coordinates.
    this.additionalDirection
      .set(
        -Math.cos(THREE.MathUtils.degToRad(provider.additionalWindAngle)),
        0,
        -Math.sin(THREE.MathUtils.degToRad(provider.additionalWindAngle))
      )
      .normalize();
    return this.providerForce
      .copy(this.mainWindDirection)
      .multiplyScalar(baseStrength)
      .addScaledVector(this.additionalDirection, provider.additionalWindStrength)
      .multiplyScalar(bone.windInfluence);
  }

  settleCurrentPose(frameCount = 60, deltaTime = 1 / 60): void {
    const count = Math.max(0, Math.floor(frameCount));
    for (let frame = 0; frame < count; frame += 1) {
      this.update(deltaTime);
    }
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
      bone.lastAppliedLocalRotation.copy(bone.node.quaternion);
      bone.hasAppliedLocalRotation = false;
    }
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
      const resolvedIsSkinnedBone = this.skinnedBones.has(bone.node);
      if (name.includes("sleeve")) {
        maxSleeveOffset = Math.max(maxSleeveOffset, offset);
      }
      if (name.includes("skirt")) {
        maxSkirtOffset = Math.max(maxSkirtOffset, offset);
      }
      if (resolvedIsSkinnedBone) {
        skinnedBoneMatches += 1;
      } else {
        skinnedBoneMisses += 1;
      }
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
        managerDynamicRatio: bone.dynamicRatio,
        dynamicRatio: getEffectiveDynamicRatio(bone),
        isAnimated: bone.isAnimated,
        automaticUpdates: bone.automaticUpdates,
        boneEnabled: bone.enabled,
        bonePaused: bone.isPaused,
        isSumOfForcesOnBone: bone.isSumOfForcesOnBone,
        simulationFrameRate: bone.simulationFrameRate,
        slowMotionScale: bone.slowMotionScale,
        updateSkipReason: getUpdateSkipReason(bone),
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
          managerDynamicRatio: bone.dynamicRatio,
          dynamicRatio: getEffectiveDynamicRatio(bone),
          isAnimated: bone.isAnimated,
          automaticUpdates: bone.automaticUpdates,
          boneEnabled: bone.enabled,
          bonePaused: bone.isPaused,
          isSumOfForcesOnBone: bone.isSumOfForcesOnBone,
          simulationFrameRate: bone.simulationFrameRate,
          slowMotionScale: bone.slowMotionScale,
          updateSkipReason: getUpdateSkipReason(bone),
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
    const controlledPartDiagnostics = buildControlledPartDiagnostics(this.bones, this.skinnedBones);
    return {
      runtimeMode: "unity-prefab",
      enabled,
      springCount: new Set(this.bones.map((bone) => bone.springName)).size,
      boneCount: this.bones.length,
      colliderCount: colliderIndexes.size,
      missingNodeCount: this.missingNodes.length,
      missingNodeSamples: this.missingNodes.slice(0, 96),
      setupDiagnostics: {
        ...this.setupDiagnostics,
        activeRoots: [...this.setupDiagnostics.activeRoots],
      },
      maxSleeveOffset,
      maxSkirtOffset,
      topOffsets: topOffsets.slice(0, 8),
      debugOffsets,
      controlledPartCounts: controlledPartDiagnostics.counts,
      controlledHairSamples: controlledPartDiagnostics.hairSamples,
      skirtOffsets,
      bindingDiagnostics: this.bones
        .flatMap((bone) => bone.colliderBindingDiagnostics)
        .map(cloneColliderBindingDiagnostic),
      skinnedBoneMatches,
      skinnedBoneMisses,
    };
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
    const traceEvent = this.shouldTraceBone(bone)
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
    const collisionChecks: RuntimeColliderTraceSnapshot[] = [];
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
    trace?: RuntimeTraceEvent["angleLimit"]
  ): boolean {
    if (!bone.yAngleLimit && !bone.zAngleLimit) {
      return false;
    }
    const pivot = bone.pivotNode ?? bone.node.parent ?? bone.node;

    pivot.updateMatrixWorld(true);
    this.angleVector.copy(bone.state.currTipPos).sub(bone.state.cachedPosition);
    // F5 names these basis vectors in Unity space. Convert the named Unity axes
    // once before applying the viewer-space pivot matrix.
    const forward = UTJ_PIVOT_FORWARD_LOCAL.clone().transformDirection(pivot.matrixWorld);
    const back = UTJ_PIVOT_BACK_LOCAL.clone().transformDirection(pivot.matrixWorld);
    const down = UTJ_PIVOT_DOWN_LOCAL.clone().transformDirection(pivot.matrixWorld);
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
  ): RuntimeTraceEvent {
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

  private pushTraceEvent(event: RuntimeTraceEvent): void {
    this.traceSequence += 1;
    this.traceEvents.push({ ...event });
    while (this.traceEvents.length > this.traceMaxEvents) {
      this.traceEvents.shift();
    }
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
      return {
        kind: "sphere",
        enabled: componentEnabled,
        debugName: collider.source.nodeName ?? collider.source.scriptName ?? collider.node.name,
        debugPath: collider.source.nodePath ?? getObjectPath(collider.node),
        debugSourcePathId: collider.source.pathId,
        localOffset: vectorFromArray(shape.sphere.offset),
        radius: Math.max(0, shape.sphere.radius ?? 0.01),
        localToWorldMatrix: this.colliderLocalToWorld.clone(),
        worldToLocalMatrix: this.colliderWorldToLocal.clone(),
        worldToLocalRadiusScale: matrixXDirectionLength(this.colliderWorldToLocal),
        localToWorldNormalMatrix: makeNormalDirectionMatrix(this.colliderLocalToWorld),
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
        debugName: collider.source.nodeName ?? collider.source.scriptName ?? collider.node.name,
        debugPath: collider.source.nodePath ?? getObjectPath(collider.node),
        debugSourcePathId: collider.source.pathId,
        localStart: vectorFromArray(shape.capsule.offset),
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
        debugName: collider.source.nodeName ?? collider.source.scriptName ?? collider.node.name,
        debugPath: collider.source.nodePath ?? getObjectPath(collider.node),
        debugSourcePathId: collider.source.pathId,
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

function buildControlledPartDiagnostics(
  bones: RuntimeBone[],
  skinnedBones: ReadonlySet<THREE.Object3D>
): {
  counts: NonNullable<UtjSpringBoneRuntimeSnapshot["controlledPartCounts"]>;
  hairSamples: NonNullable<UtjSpringBoneRuntimeSnapshot["controlledHairSamples"]>;
} {
  const counts = new Map<string, NonNullable<UtjSpringBoneRuntimeSnapshot["controlledPartCounts"]>[number]>();
  const hairSamples: NonNullable<UtjSpringBoneRuntimeSnapshot["controlledHairSamples"]> = [];
  for (const bone of bones) {
    const sourceRoot = rootNameFromPath(bone.sourceBonePath);
    const key = `${bone.runtimePartIndex ?? "null"}|${bone.runtimePartType ?? "null"}|${sourceRoot ?? "null"}`;
    let entry = counts.get(key);
    if (!entry) {
      entry = {
        runtimePartIndex: bone.runtimePartIndex,
        runtimePartType: bone.runtimePartType,
        sourceRoot,
        count: 0,
        sampleNames: [],
        samplePaths: [],
      };
      counts.set(key, entry);
    }
    entry.count += 1;
    if (entry.sampleNames.length < 6) {
      entry.sampleNames.push(bone.node.name);
      entry.samplePaths.push(getObjectPath(bone.node));
    }
    if (
      hairSamples.length < 12 &&
      (
        bone.runtimePartType === "hair" ||
        bone.node.name.toLowerCase().includes("hair") ||
        (bone.sourceBonePath ?? "").toLowerCase().includes("hair")
      )
    ) {
      hairSamples.push({
        name: bone.node.name,
        path: getObjectPath(bone.node),
        sourceBonePath: bone.sourceBonePath,
        runtimePartIndex: bone.runtimePartIndex,
        runtimePartType: bone.runtimePartType,
        resolvedIsSkinnedBone: skinnedBones.has(bone.node),
      });
    }
  }
  return {
    counts: [...counts.values()].sort((a, b) =>
      (a.runtimePartIndex ?? -1) - (b.runtimePartIndex ?? -1) ||
      String(a.runtimePartType ?? "").localeCompare(String(b.runtimePartType ?? "")) ||
      String(a.sourceRoot ?? "").localeCompare(String(b.sourceRoot ?? ""))
    ),
    hairSamples,
  };
}

function createRuntimeBone(
  manager: RuntimeManagerSource,
  sourceBone: RuntimeBoneSource,
  node: THREE.Object3D,
  tailBinding: RuntimeTailBindingDiagnostic,
  pivotNode: THREE.Object3D | null,
  lengthLimitTargets: RuntimeLengthLimitTarget[],
  forceProviders: RuntimeForceProvider[],
  colliderBinding: RuntimeColliderBinding
): RuntimeBone | null {
  const tailPosition = tailBinding.tailPosition;
  const headPosition = node.getWorldPosition(new THREE.Vector3());
  const direction = tailPosition.clone().sub(headPosition);
  const springLength = direction.length();
  const initialLocalRotation = node.quaternion.clone();
  const boneAxisResolution = resolveRuntimeBoneAxis(node, tailPosition);
  const dynamicRatio = THREE.MathUtils.clamp(readFiniteNumber(manager.dynamicRatio) ?? 0.5, 0, 1);
  const initializedLengthLimitTargets = lengthLimitTargets.map((target) => ({
    node: target.node,
    initialLength: target.node.getWorldPosition(new THREE.Vector3()).distanceTo(tailPosition),
  }));
  const stiffnessForce = sourceBone.rawStiffnessForce ?? 300;
  const dragForce = sourceBone.rawDragForce ?? sourceBone.dragForce ?? 0.4;
  const windInfluence = Math.max(0, sourceBone.rawWindInfluence ?? 1);
  const slowMotionScale = readFiniteNumber(manager.slowMotionScale) ?? 1;
  const isPaused = manager.isPaused === true;

  return {
    managerPathId: readFiniteNumber(manager.pathId),
    runtimePartIndex: readFiniteNumber(sourceBone.runtimePartIndex) ?? readFiniteNumber(manager.runtimePartIndex),
    runtimePartType: sourceBone.runtimePartType ?? manager.runtimePartType ?? sourceBone.partKind ?? manager.partKind ?? null,
    springName: `${manager.partKind ?? sourceBone.partKind ?? "Part"}:${manager.nodeName ?? manager.pathId ?? "manager"}`,
    sourceBoneName: sourceBone.nodeName ?? null,
    sourceBonePath: sourceBone.nodePath ?? null,
    sourceBonePathId: readFiniteNumber(sourceBone.pathId),
    pivotSourceName: sourceBone.pivotNodeName ?? null,
    pivotSourcePath: sourceBone.pivotNodePath ?? null,
    pivotResolvedPath: pivotNode ? getObjectPath(pivotNode) : null,
    tailBinding,
    automaticUpdates: manager.automaticUpdates !== false,
    enabled: manager.enabled !== false && sourceBone.enabled !== false,
    enableLengthLimits: manager.enableLengthLimits !== false,
    enableAngleLimits: manager.enableAngleLimits !== false,
    enableCollision: manager.enableCollision !== false,
    collideWithGround: manager.collideWithGround === true,
    groundHeight: manager.groundHeight ?? 0,
    isSumOfForcesOnBone: manager.isSumOfForcesOnBone !== false,
    isPaused,
    gravity: vectorFromRaw(manager.rawGravity),
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
    dynamicRatio,
    isAnimated: isBoneAnimated(sourceBone, node, manager),
    simulationFrameRate: readFiniteNumber(manager.simulationFrameRate) ?? 60,
    slowMotionScale,
    bounce: readFiniteNumber(manager.bounce) ?? 0,
    friction: readFiniteNumber(manager.friction) ?? 1,
    radius: Math.max(0, sourceBone.hitRadius ?? 0.05),
    stiffnessForce,
    dragForce,
    windInfluence,
    originalStiffnessForce: stiffnessForce,
    originalDragForce: dragForce,
    originalWindInfluence: windInfluence,
    springForce: vectorFromRaw(sourceBone.rawSpringForce),
    springConstant: sourceBone.rawSpringConstant ?? 0.5,
    lengthLimitTargets: initializedLengthLimitTargets,
    angularStiffness: Math.max(0, sourceBone.rawAngularStiffness ?? 100),
    pivotNode,
    yAngleLimit: angleLimitFromSource(sourceBone.rawAngleLimits?.y),
    zAngleLimit: angleLimitFromSource(sourceBone.rawAngleLimits?.z),
    colliders: colliderBinding.colliders,
    colliderBindingDiagnostics: colliderBinding.diagnostics,
    lastCollisionStatus: 0,
    lastCollisionInfo: null,
    lastAngleLimitApplied: false,
  };
}

function resolveForceProviders(
  resolution: NodeResolution,
  manager: RuntimeManagerSource,
  cache: Map<string, RuntimeForceProvider>
): RuntimeForceProvider[] {
  return (manager.forceProviders ?? [])
    .map((source) => {
      const key = forceProviderCacheKey(source);
      const cached = key ? cache.get(key) : undefined;
      if (cached) {
        return cached;
      }
      const provider = createForceProvider(resolution, source);
      if (provider && key) {
        cache.set(key, provider);
      }
      return provider;
    })
    .filter((provider): provider is RuntimeForceProvider => Boolean(provider));
}

function forceProviderCacheKey(source: RuntimeForceProviderSource): string | null {
  const part = typeof source.runtimePartIndex === "number" ? `${source.runtimePartIndex}:` : "";
  if (typeof source.sourcePathId === "number") {
    return `${part}path:${source.sourcePathId}`;
  }
  if (source.nodePath) {
    return `${part}nodePath:${source.nodePath}`;
  }
  return null;
}

function createForceProvider(
  resolution: NodeResolution,
  source: RuntimeForceProviderSource
): RuntimeForceProvider | null {
  const scriptName = source.scriptName ?? "";
  const isWindVolumeOneSelf = scriptName.endsWith("WindVolumeOneSelf");
  const isWindVolume = scriptName.endsWith("WindVolume") && !isWindVolumeOneSelf;
  const isForceVolume = scriptName.endsWith("ForceVolume") && !isWindVolume;
  if (!isForceVolume && !isWindVolume && !isWindVolumeOneSelf) {
    return null;
  }
  const node = resolveNodeForPart(resolution, source.nodePath, source.runtimePartIndex) ??
    resolveUniqueNodeByName(resolution, source.nodeName);
  const raw = source.raw ?? {};
  if (!node || !readRawBoolean(raw, "m_Enabled", true) || source.activeSelf === false || source.activeInHierarchy === false) {
    return null;
  }
  const common: RuntimeForceProviderBase = {
    sourcePathId: readFiniteNumber(source.sourcePathId),
    node,
    springManagerPathId: readFiniteNumber(source.springManagerPathId) ??
      readRawObjectPathId(raw, "<SpringManager>k__BackingField") ??
      readRawObjectPathId(raw, "_SpringManager_k__BackingField") ??
      readRawObjectPathId(raw, "springManager"),
  };
  if (isForceVolume) {
    return {
      kind: "ForceVolume",
      ...common,
      strength: readRawNumber(raw, "strength", 0),
    };
  }
  if (isWindVolume) {
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
    dynamicRatio: THREE.MathUtils.clamp(readRawNumber(raw, "dynamicRatio", 0.5), 0, 1),
    simulationFrameRate: Math.max(0, readRawNumber(raw, "simulationFrameRate", 60)),
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

function resolveUniqueNodeByName(
  resolution: NodeResolution,
  name?: string | null
): THREE.Object3D | null {
  if (!name) {
    return null;
  }
  const matches = [...new Set(resolution.nodeByPath.values())].filter((node) => node.name === name);
  return matches.length === 1 ? matches[0] : null;
}

function buildRuntimeColliders(
  setup: RuntimeUnitySetup0414,
  resolution: NodeResolution,
  missingNodes: string[],
  activeRoots: ReadonlySet<string>
): Map<number, RuntimeCollider> {
  const result = new Map<number, RuntimeCollider>();
  for (const source of setup.colliders ?? []) {
    if (typeof source.index !== "number") {
      continue;
    }
    if (!isSourceActive(source) || !isRuntimePathActive(source.nodePath, activeRoots)) {
      continue;
    }
    const node = resolveNodeForPart(resolution, source.nodePath, source.runtimePartIndex);
    if (!node) {
      missingNodes.push(source.nodePath ?? source.nodeName ?? `collider:${source.index}`);
      continue;
    }
    result.set(source.index, { source, node });
  }
  return result;
}

function buildSetupDiagnostics(
  setup: RuntimeUnitySetup0414,
  activeRoots: ReadonlySet<string>
): RuntimeSetupDiagnostics {
  return {
    managerCount: setup.managers?.length ?? 0,
    boneSourceCount: setup.bones?.length ?? 0,
    colliderSourceCount: setup.colliders?.length ?? 0,
    bindingDecisionCount: setup.bindingDecisions?.length ?? 0,
    managerColliderCacheCount: setup.managerColliderCaches?.length ?? 0,
    activeRootCount: activeRoots.size,
    activeRoots: [...activeRoots].sort(),
  };
}

function resolveColliderBinding(
  setup: RuntimeUnitySetup0414,
  manager: RuntimeManagerSource,
  bone: RuntimeBoneSource,
  binding: RuntimeColliderBindingSource | undefined,
  decision: RuntimeBindingDecisionSource | undefined,
  managerCache: RuntimeManagerColliderCacheBinding | undefined,
  colliderByIndex: ReadonlyMap<number, RuntimeCollider>
): RuntimeColliderBinding {
  if (!binding && !decision) {
    return {
      colliders: [],
      diagnostics: managerCache
        ? [buildColliderBindingDiagnostic(
          manager,
          bone,
          binding,
          decision,
          null,
          null,
          null,
          `no per-bone collider binding; manager cache not used as fallback; ${managerCacheSummary(managerCache)}`,
          []
        )]
        : [],
    };
  }

  const bindingKind = decision?.sourceKind ?? binding?.sourceKind ?? "direct";
  const candidateRoots = buildCandidateRootMap(decision?.candidateRoots ?? binding?.collidersByRoot, colliderByIndex);
  if (bindingKind === "colliderFlag" && candidateRoots.size > 0) {
    const constrainedRoots = constrainColliderRootsByManagerCache(candidateRoots, managerCache);
    const selection = selectUnityColliderRoot(setup, manager, bone, decision, binding, constrainedRoots);
    const colliders = selection.root ? constrainedRoots.get(selection.root) ?? [] : [];
    return {
      colliders,
      diagnostics: [buildColliderBindingDiagnostic(
        manager,
        bone,
        binding,
        decision,
        candidateRoots,
        decision?.defaultRoot ?? binding?.defaultRoot,
        selection.root,
        `${selection.reason}; manager cache constrained; ${managerCacheSummary(managerCache)}`,
        colliders
      )],
    };
  }

  const directIndexes = decision?.selectedColliderIndexes ??
    binding?.colliders ??
    [];
  const directColliders = directIndexes
    .map((index) => colliderByIndex.get(index))
    .filter((collider): collider is RuntimeCollider => Boolean(collider));
  const colliders = preferMatchingPoseColliders(
    directColliders,
    manager,
    bone
  );
  return {
    colliders,
    diagnostics: [buildColliderBindingDiagnostic(
      manager,
      bone,
      binding,
      decision,
      null,
      decision?.defaultRoot ?? binding?.defaultRoot,
      null,
      `${decision?.selectedColliderIndexes ? "bindingDecision.selectedColliderIndexes" : binding?.colliders ? "colliderBinding.colliders" : "no direct collider indexes"} / direct serialized collider references / pose root preference; ${managerCacheSummary(managerCache)}`,
      colliders
    )],
  };
}

function computeUnityPrefabChildPosition(
  bone: RuntimeBoneSource,
  node: THREE.Object3D,
  graphIndex: PrefabGraphIndex,
  resolution: NodeResolution
): RuntimeTailBindingDiagnostic {
  node.updateMatrixWorld(true);
  const headPosition = node.getWorldPosition(new THREE.Vector3());
  const right = convertUnityAxisToThree("right").transformDirection(node.matrixWorld);
  const fallback = headPosition.clone().addScaledVector(right, -0.1);
  const transform = bone.nodePath
    ? resolvePrefabTransformForPart(graphIndex, bone.nodePath, bone.runtimePartIndex)
    : undefined;
  const validChildren = transform
    ? collectUnityPrefabTailChildren(transform, graphIndex, resolution, bone.runtimePartIndex)
    : [];
  const childNames = validChildren.map((child) => child.source.name ?? child.node.name);
  const childPaths = validChildren.map((child) => child.source.transformPath ?? getObjectPath(child.node));

  if (validChildren.length === 0) {
    return {
      mode: "fallback",
      childCount: 0,
      childNames,
      childPaths,
      childSources: [],
      tailPosition: fallback,
    };
  }

  if (validChildren.length === 1) {
    return {
      mode: "singleChild",
      childCount: 1,
      childNames,
      childPaths,
      childSources: validChildren.map((child) => child.source),
      tailPosition: validChildren[0].node.getWorldPosition(new THREE.Vector3()),
    };
  }

  const averagePosition = new THREE.Vector3();
  let averageDistance = 0;
  for (const child of validChildren) {
    const childPosition = child.node.getWorldPosition(new THREE.Vector3());
    averagePosition.add(childPosition);
    averageDistance += childPosition.distanceTo(headPosition);
  }
  averagePosition.multiplyScalar(1 / validChildren.length);
  averageDistance /= validChildren.length;
  const direction = averagePosition.sub(headPosition);
  return {
    mode: "averageChildren",
    childCount: validChildren.length,
    childNames,
    childPaths,
    childSources: validChildren.map((child) => child.source),
    tailPosition: direction.lengthSq() <= 0.00000001
      ? headPosition.clone()
      : headPosition.clone().addScaledVector(direction.normalize(), averageDistance),
  };
}

function collectUnityPrefabTailChildren(
  transform: RuntimePrefabTransform,
  graphIndex: PrefabGraphIndex,
  resolution: NodeResolution,
  runtimePartIndex?: number
): { source: RuntimePrefabTransform; node: THREE.Object3D }[] {
  const result: { source: RuntimePrefabTransform; node: THREE.Object3D }[] = [];
  for (const childPathId of transform.childPathIds ?? []) {
    const child = graphIndex.transformByPathId.get(childPathId);
    if (!child) {
      continue;
    }
    if (!isValidPrefabSpringTailChild(child, graphIndex)) {
      continue;
    }

    const node = resolveNodeForPart(resolution, child.transformPath, runtimePartIndex ?? child.runtimePartIndex);
    if (node) {
      result.push({ source: child, node });
    }
  }
  return result;
}

function isValidPrefabSpringTailChild(child: RuntimePrefabTransform, graphIndex: PrefabGraphIndex): boolean {
  if (typeof child.pathId === "number" && graphIndex.pivotTransformPathIds.has(child.pathId)) {
    return false;
  }
  return !child.transformPath || !graphIndex.pivotTransformPaths.has(child.transformPath);
}

function buildPrefabGraphIndex(setup: RuntimeUnitySetup0414): PrefabGraphIndex {
  const transformByPathId = new Map<number, RuntimePrefabTransform>();
  const transformByPath = new Map<string, RuntimePrefabTransform>();
  const transformByPartPath = new Map<string, RuntimePrefabTransform>();
  const pivotTransformPathIds = new Set<number>();
  const pivotTransformPaths = new Set<string>();

  for (const graph of setup.prefabGraphs ?? []) {
    for (const transform of graph.transforms ?? []) {
      if (typeof transform.pathId === "number") {
        transformByPathId.set(transform.pathId, transform);
      }
      if (transform.transformPath) {
        transformByPath.set(transform.transformPath, transform);
        if (typeof transform.runtimePartIndex === "number") {
          transformByPartPath.set(partPathKey(transform.runtimePartIndex, transform.transformPath), transform);
        }
      }
    }
  }

  for (const graph of setup.prefabGraphs ?? []) {
    for (const monoBehaviour of graph.monoBehaviours ?? []) {
      if (monoBehaviour.scriptName?.toLowerCase() !== "springbonepivot") {
        continue;
      }
      if (monoBehaviour.transformPath) {
        pivotTransformPaths.add(monoBehaviour.transformPath);
        const transform = transformByPath.get(monoBehaviour.transformPath);
        if (typeof transform?.pathId === "number") {
          pivotTransformPathIds.add(transform.pathId);
        }
      }
    }
  }

  return {
    transformByPathId,
    transformByPath,
    transformByPartPath,
    pivotTransformPathIds,
    pivotTransformPaths,
  };
}

function buildNodeResolution(root: THREE.Object3D): NodeResolution {
  const nodeByPath = new Map<string, THREE.Object3D>();
  const nodeByPartPath = new Map<string, THREE.Object3D>();
  const canonicalNodeByPath = new Map<string, THREE.Object3D>();
  root.traverse((node) => {
    const path = getObjectPath(node, root);
    if (!path) {
      return;
    }
    nodeByPath.set(path, node);
    const canonicalPath = getCanonicalObjectPath(node, root);
    if (canonicalPath && canonicalPath !== path) {
      canonicalNodeByPath.set(canonicalPath, node);
    }
    const runtimePartIndex = readRuntimePartIndex(node);
    const transformPath = node.userData.pjskTransformPath;
    for (const sourcePath of typeof transformPath === "string" && transformPath.length > 0
      ? [transformPath]
      : []) {
      if (typeof runtimePartIndex === "number") {
        nodeByPartPath.set(partPathKey(runtimePartIndex, sourcePath), node);
      }
      if (!nodeByPath.has(sourcePath)) {
        nodeByPath.set(sourcePath, node);
      }
    }
  });
  return { nodeByPath, nodeByPartPath, canonicalNodeByPath };
}

function resolveNode(
  resolution: NodeResolution,
  sourcePath?: string | null
): THREE.Object3D | null {
  if (!sourcePath) {
    return null;
  }
  return resolution.nodeByPath.get(sourcePath) ??
    resolution.canonicalNodeByPath.get(sourcePath) ??
    null;
}

function resolveNodeForPart(
  resolution: NodeResolution,
  sourcePath?: string | null,
  runtimePartIndex?: number
): THREE.Object3D | null {
  if (!sourcePath) {
    return null;
  }
  if (typeof runtimePartIndex === "number") {
    const partNode = resolution.nodeByPartPath.get(partPathKey(runtimePartIndex, sourcePath));
    if (partNode) {
      return partNode;
    }
  }
  return resolveNode(resolution, sourcePath);
}

function resolvePrefabTransformForPart(
  graphIndex: PrefabGraphIndex,
  sourcePath: string,
  runtimePartIndex?: number
): RuntimePrefabTransform | undefined {
  if (typeof runtimePartIndex === "number") {
    return graphIndex.transformByPartPath.get(partPathKey(runtimePartIndex, sourcePath)) ??
      graphIndex.transformByPath.get(sourcePath);
  }
  return graphIndex.transformByPath.get(sourcePath);
}

function partPathKey(runtimePartIndex: number, path: string) {
  return `${runtimePartIndex}:${path}`;
}

function readRuntimePartIndex(node: THREE.Object3D): number | undefined {
  const value = node.userData.pjskRuntimePartIndex;
  return typeof value === "number" ? value : undefined;
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

function buildBoneMap(setup: RuntimeUnitySetup0414): Map<number, RuntimeBoneSource> {
  const result = new Map<number, RuntimeBoneSource>();
  for (const bone of setup.bones ?? []) {
    if (typeof bone.pathId === "number") {
      result.set(bone.pathId, bone);
    }
  }
  return result;
}

function buildColliderBindingMap(setup: RuntimeUnitySetup0414): Map<number, RuntimeColliderBindingSource> {
  const result = new Map<number, RuntimeColliderBindingSource>();
  for (const binding of setup.colliderBindings ?? []) {
    if (typeof binding.sourceSpringBonePathId === "number") {
      result.set(binding.sourceSpringBonePathId, binding);
    }
  }
  return result;
}

function buildBindingDecisionMap(setup: RuntimeUnitySetup0414): Map<number, RuntimeBindingDecisionSource> {
  const result = new Map<number, RuntimeBindingDecisionSource>();
  for (const decision of setup.bindingDecisions ?? []) {
    if (typeof decision.sourceSpringBonePathId === "number") {
      result.set(decision.sourceSpringBonePathId, decision);
    }
  }
  return result;
}

function buildManagerColliderCacheMap(
  setup: RuntimeUnitySetup0414,
  colliderByIndex: ReadonlyMap<number, RuntimeCollider>
): Map<number, RuntimeManagerColliderCacheBinding> {
  const result = new Map<number, RuntimeManagerColliderCacheBinding>();
  for (const cache of setup.managerColliderCaches ?? []) {
    if (typeof cache.managerPathId !== "number") {
      continue;
    }
    const colliderIndexes = new Set<number>();
    for (const index of [
      ...(cache.sphereColliderIndexes ?? []),
      ...(cache.capsuleColliderIndexes ?? []),
      ...(cache.panelColliderIndexes ?? []),
    ]) {
      const collider = typeof index === "number" ? colliderByIndex.get(index) : undefined;
      if (typeof index === "number" && collider && isRuntimeManagerCacheCollider(cache, collider)) {
        colliderIndexes.add(index);
      }
    }
    result.set(cache.managerPathId, { source: cache, colliderIndexes });
  }
  return result;
}

function isRuntimeManagerCacheCollider(
  cache: RuntimeManagerColliderCacheSource,
  collider: RuntimeCollider
): boolean {
  const managerPath = cache.managerNodePath ?? "";
  const colliderPath = collider.source.nodePath ?? "";
  const shape = collider.source.shape;
  if (managerPath.endsWith("/Position/PositionOffset/Hip")) {
    if (!shape?.sphere) {
      return false;
    }
    return /\/(?:Left_Thigh|Right_Thigh)\/CL_/.test(colliderPath) ||
      /\/Hip\/CL_HipSphereCollider$/.test(colliderPath);
  }
  return true;
}

function buildActiveRootSet(setup: RuntimeUnitySetup0414): Set<string> {
  return new Set(
    (setup.activeRootProfile?.activeRoots ?? [])
      .map((root) => normalizeRootName(root))
      .filter((root): root is string => Boolean(root))
  );
}

function isRuntimePathActive(path: string | null | undefined, activeRoots: ReadonlySet<string>): boolean {
  if (activeRoots.size === 0) {
    return true;
  }
  const root = normalizeRootName(rootNameFromPath(path));
  return root !== null && activeRoots.has(root);
}

function isSourceActive(source: {
  enabled?: boolean;
  activeSelf?: boolean;
  activeInHierarchy?: boolean;
}): boolean {
  return source.enabled !== false &&
    source.activeSelf !== false &&
    source.activeInHierarchy !== false;
}

function resolveLengthLimitTargets(
  resolution: NodeResolution,
  bone: RuntimeBoneSource
): RuntimeLengthLimitTarget[] {
  const targets: RuntimeLengthLimitTarget[] = [];
  for (const target of bone.lengthLimitTargets ?? []) {
    const node = resolveNodeForPart(
      resolution,
      target.nodePath,
      target.runtimePartIndex ?? bone.runtimePartIndex
    );
    if (!node) {
      continue;
    }
    targets.push({
      node,
      initialLength: 0,
    });
  }
  return targets;
}

function buildCandidateRootMap(
  roots: Record<string, number[]> | null | undefined,
  colliderByIndex: ReadonlyMap<number, RuntimeCollider>
): Map<string, RuntimeCollider[]> {
  const result = new Map<string, RuntimeCollider[]>();
  for (const [root, indexes] of Object.entries(roots ?? {})) {
    const colliders = indexes
      .map((index) => colliderByIndex.get(index))
      .filter((collider): collider is RuntimeCollider => Boolean(collider));
    if (colliders.length > 0) {
      result.set(root, colliders);
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

function selectUnityColliderRoot(
  setup: RuntimeUnitySetup0414,
  manager: RuntimeManagerSource,
  bone: RuntimeBoneSource,
  decision: RuntimeBindingDecisionSource | undefined,
  binding: RuntimeColliderBindingSource | undefined,
  availableRoots: ReadonlyMap<string, RuntimeCollider[]>
): { root: string | null; reason: string } {
  if (availableRoots.size === 1) {
    const root = availableRoots.keys().next().value as string;
    return { root, reason: "single manager-cache root" };
  }
  const jointRoot = normalizeRootName(rootNameFromPath(bone.nodePath));
  if (jointRoot && availableRoots.has(jointRoot)) {
    return { root: jointRoot, reason: "joint root matched candidate root" };
  }
  if (manager.partKind === "Head" || jointRoot === "face") {
    const defaultBodyRoot = normalizeRootName(
      setup.rootSelectionProfile?.defaultBodyRoot ??
      setup.activeRootProfile?.defaultBodyRoot
    );
    if (defaultBodyRoot && availableRoots.has(defaultBodyRoot)) {
      return { root: defaultBodyRoot, reason: "head/face uses runtime defaultBodyRoot" };
    }
    if (availableRoots.has("body")) {
      return { root: "body", reason: "head/face body fallback" };
    }
  }
  const decisionDefaultRoot = normalizeRootName(decision?.defaultRoot);
  if (decisionDefaultRoot && availableRoots.has(decisionDefaultRoot)) {
    return { root: decisionDefaultRoot, reason: "bindingDecision.defaultRoot" };
  }
  for (const activeRoot of setup.activeRootProfile?.activeRoots ?? []) {
    const root = normalizeRootName(activeRoot);
    if (root && availableRoots.has(root)) {
      return { root, reason: "activeRootProfile active root" };
    }
  }
  const bindingDefaultRoot = normalizeRootName(binding?.defaultRoot);
  if (bindingDefaultRoot && availableRoots.has(bindingDefaultRoot)) {
    return { root: bindingDefaultRoot, reason: "binding.defaultRoot" };
  }
  return {
    root: null,
    reason: bindingDefaultRoot
      ? `binding.defaultRoot ${bindingDefaultRoot} not available after manager cache`
      : "no matching root",
  };
}

function buildColliderBindingDiagnostic(
  manager: RuntimeManagerSource,
  bone: RuntimeBoneSource,
  binding: RuntimeColliderBindingSource | undefined,
  decision: RuntimeBindingDecisionSource | undefined,
  candidateRoots: ReadonlyMap<string, RuntimeCollider[]> | null,
  defaultRoot: string | null | undefined,
  selectedRoot: string | null,
  selectionReason: string,
  selectedColliders: readonly RuntimeCollider[]
): RuntimeColliderBindingDiagnostic {
  return {
    sourceKind: decision?.sourceKind ?? binding?.sourceKind ?? "direct",
    colliderFlag: decision?.colliderFlag ?? binding?.colliderFlag ?? null,
    colliderGroupIndex: null,
    springName: `${manager.partKind ?? bone.partKind ?? "Part"}:${manager.nodeName ?? manager.pathId ?? "manager"}`,
    boneName: bone.nodeName ?? null,
    bonePath: bone.nodePath ?? null,
    sourceSpringBonePathId: readFiniteNumber(bone.pathId),
    candidateRoots: candidateRoots
      ? [...candidateRoots.entries()].map(([root, colliders]) => ({
        root,
        colliderCount: colliders.length,
        colliderSourcePathIds: colliders
          .map((collider) => collider.source.pathId)
          .filter((pathId): pathId is number => typeof pathId === "number"),
      }))
      : [],
    defaultRoot: normalizeRootName(defaultRoot),
    selectedRoot,
    selectedColliderCount: selectedColliders.length,
    selectedColliderSourcePathIds: selectedColliders
      .map((collider) => collider.source.pathId)
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

function preferMatchingPoseColliders(
  colliders: RuntimeCollider[],
  manager: RuntimeManagerSource,
  bone: RuntimeBoneSource
): RuntimeCollider[] {
  const preferredRoot = preferredColliderRoot(manager, bone);
  if (!preferredRoot) {
    return colliders;
  }
  const collidersByName = new Map<string, RuntimeCollider[]>();
  for (const collider of colliders) {
    const name = collider.source.nodeName ?? collider.source.scriptName ?? "";
    const items = collidersByName.get(name);
    if (items) {
      items.push(collider);
    } else {
      collidersByName.set(name, [collider]);
    }
  }
  return colliders.filter((collider) => {
    const name = collider.source.nodeName ?? collider.source.scriptName ?? "";
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

function preferredColliderRoot(
  manager: RuntimeManagerSource,
  bone: RuntimeBoneSource
): "body/" | "sit_body/" | null {
  if (bone.nodePath?.startsWith("sit_body/")) {
    return "sit_body/";
  }
  if (bone.nodePath?.startsWith("body/")) {
    return "body/";
  }
  return manager.partKind === "Head" || bone.nodePath?.startsWith("face/")
    ? "body/"
    : null;
}

function managerCacheSummary(managerCache: RuntimeManagerColliderCacheBinding | undefined): string {
  if (!managerCache) {
    return "no manager cache available";
  }
  const managerName = managerCache.source.managerNodeName ?? "manager";
  const sphereCount = managerCache.source.sphereColliderIndexes?.length ?? 0;
  const capsuleCount = managerCache.source.capsuleColliderIndexes?.length ?? 0;
  const panelCount = managerCache.source.panelColliderIndexes?.length ?? 0;
  return `${managerName} manager cache (${sphereCount} sphere, ${capsuleCount} capsule, ${panelCount} panel)`;
}

function angleLimitFromSource(limit?: RuntimeAngleLimitSource | null): UtjAngleLimit | null {
  if (!limit?.active) {
    return null;
  }
  return {
    active: true,
    min: limit.min ?? 0,
    max: limit.max ?? 0,
  };
}

function getEffectiveDynamicRatio(bone: RuntimeBone): number {
  return bone.isAnimated ? bone.dynamicRatio : 1.0;
}

function isBoneAnimated(
  bone: RuntimeBoneSource,
  node: THREE.Object3D,
  manager: RuntimeManagerSource
): boolean {
  const names = readStringSet(manager.animatedBoneNames);
  if (names.size === 0) {
    return false;
  }
  return containsAnimatedBoneName(node.name, names) ||
    (typeof bone.nodeName === "string" && containsAnimatedBoneName(bone.nodeName, names));
}

function containsAnimatedBoneName(nodeName: string, animatedBoneNames: ReadonlySet<string>): boolean {
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

// UTJ.SpringManager.CalcTimeStep RVA 0x0a59ffac
function calcUtjManagerTimeStep(
  unityDeltaTime: number,
  simulationFrameRate: number,
  slowMotionScale: number
): number {
  const deltaTime = simulationFrameRate > 0 ? 1.0 / simulationFrameRate : unityDeltaTime;
  return slowMotionScale === 1.0 ? deltaTime : deltaTime * slowMotionScale;
}

function readRuntimeUnitySetup0414(extension: unknown): RuntimeUnitySetup0414 | null {
  const payload = asRecord(extension);
  const springBone = asRecord(payload?.pjskSpringBone ?? payload?.PjskSpringBone);
  const setup = asRecord(springBone?.runtimeUnitySetup ?? springBone?.RuntimeUnitySetup) as
    | RuntimeUnitySetup0414
    | null;
  const version = setup?.version;
  return version === "0414" || version === 414 ? setup : null;
}

function vectorSnapshot(vector: THREE.Vector3): RuntimeTraceEvent["boneAxis"] {
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

function getUpdateSkipReason(bone: RuntimeBone): string | null {
  if (!bone.automaticUpdates) {
    return "automaticUpdates=false";
  }
  if (!bone.enabled) {
    return "enabled=false";
  }
  if (bone.isPaused) {
    return "isPaused=true";
  }
  if (!bone.isSumOfForcesOnBone) {
    return "isSumOfForcesOnBone=false";
  }
  return null;
}

function nullableVectorSnapshot(vector?: THREE.Vector3): RuntimeTraceEvent["boneAxis"] | null {
  return vector ? vectorSnapshot(vector) : null;
}

function quaternionSnapshot(quaternion: THREE.Quaternion): RuntimeTraceEvent["parentRotation"] {
  return {
    x: quaternion.x,
    y: quaternion.y,
    z: quaternion.z,
    w: quaternion.w,
  };
}

function stateSnapshot(state: UtjSpringBoneState): RuntimeTraceEvent["stateBefore"] {
  return {
    currTipPos: vectorSnapshot(state.currTipPos),
    prevTipPos: vectorSnapshot(state.prevTipPos),
    hitNormal: vectorSnapshot(state.hitNormal),
    cachedPosition: vectorSnapshot(state.cachedPosition),
    cachedMovement: vectorSnapshot(state.cachedMovement),
  };
}

function createEmptyAngleLimitTrace(bone: RuntimeBone): RuntimeTraceEvent["angleLimit"] {
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
): RuntimeColliderTraceSnapshot {
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

function tailBindingSnapshot(
  binding: RuntimeTailBindingDiagnostic
): UtjSpringBoneRuntimeSnapshot["topOffsets"][number]["tailBinding"] {
  return {
    mode: binding.mode,
    childCount: binding.childCount,
    childNames: [...binding.childNames],
    childPaths: [...binding.childPaths],
    tailPosition: vectorSnapshot(binding.tailPosition),
  };
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

function vectorFromRaw(value?: VectorLike | number[] | null, fallback = new THREE.Vector3(0, 0, 0)): THREE.Vector3 {
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
  node: THREE.Object3D,
  tailPosition: THREE.Vector3
): { axis: THREE.Vector3; source: RuntimeBoneAxisSource } {
  node.updateMatrixWorld(true);
  const localTipPosition = node.worldToLocal(tailPosition.clone());
  const axis = normalizeRuntimeAxis(localTipPosition);
  if (!axis) {
    return { axis: new THREE.Vector3(0, 0, 0), source: "fallback-local-tip" };
  }
  return { axis, source: "computed-local-tip" };
}

function normalizeRuntimeAxis(axis: THREE.Vector3): THREE.Vector3 | null {
  return axis.lengthSq() <= 0.00001 * 0.00001 ? null : axis.clone().normalize();
}

function vectorFromArray(values?: number[]): THREE.Vector3 {
  return new THREE.Vector3(values?.[0] ?? 0, values?.[1] ?? 0, values?.[2] ?? 0);
}

function readRawNumber(raw: UnknownRecord, key: string, fallback: number): number {
  return readFiniteNumber(raw[key] ?? raw[capitalize(key)]) ?? fallback;
}

function readRawVector(raw: UnknownRecord, key: string): THREE.Vector3 {
  const value = raw[key] ?? raw[capitalize(key)];
  return Array.isArray(value) || (value !== null && typeof value === "object")
    ? vectorFromRaw(value as VectorLike | number[])
    : new THREE.Vector3();
}

function readRawBoolean(raw: UnknownRecord, key: string, fallback: boolean): boolean {
  const value = raw[key] ?? raw[capitalize(key)];
  if (typeof value === "boolean") {
    return value;
  }
  return typeof value === "number" ? value !== 0 : fallback;
}

function readRawObjectPathId(raw: UnknownRecord, key: string): number | null {
  const value = asRecord(raw[key] ?? raw[capitalize(key)]);
  return readFiniteNumber(value?.m_PathID ?? value?.m_pathID ?? value?.pathId);
}

function capitalize(value: string): string {
  return value.length > 0 ? value[0].toUpperCase() + value.slice(1) : value;
}

function addPeriodically(currentValue: number, deltaValue: number, period: number): number {
  return period > 0
    ? THREE.MathUtils.euclideanModulo(currentValue + deltaValue, period)
    : currentValue + deltaValue;
}

function finiteOverride(value: number | null | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" ? (value as UnknownRecord) : null;
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

function sourceColliderOrder(collider: RuntimeColliderSource): number {
  if (collider.shape?.sphere) {
    return 0;
  }
  if (collider.shape?.capsule) {
    return 1;
  }
  return 2;
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

function makeNormalDirectionMatrix(matrix: THREE.Matrix4): THREE.Matrix4 {
  const normalMatrix = matrix.clone();
  normalMatrix.setPosition(0, 0, 0);
  return normalMatrix.invert().transpose();
}

function getObjectDepth(node: THREE.Object3D): number {
  let depth = 0;
  let current: THREE.Object3D | null = node;
  while (current) {
    depth += 1;
    current = current.parent;
  }
  return depth;
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

function quaternionsAlmostEqual(a: THREE.Quaternion, b: THREE.Quaternion): boolean {
  return Math.abs(a.x - b.x) < 0.000001 &&
    Math.abs(a.y - b.y) < 0.000001 &&
    Math.abs(a.z - b.z) < 0.000001 &&
    Math.abs(a.w - b.w) < 0.000001;
}

import * as THREE from "three";
import type { RuntimeNumericArray } from "../runtime/runtimeTypes";
import { buildPrefabNodePathLookup } from "./prefabNodeLookup";
import {
  UnityConstraintRuntime,
  applyUnityRuntimeConstraints,
  type RuntimeConstraintDebug,
  type RuntimeConstraintSetupSource,
} from "./unityConstraintRuntime";
import {
  convertUnityPositionToThree,
  convertUnityQuaternionToThree,
  readUnityQuaternion,
  readUnityVector3,
  type UnityQuaternionLike,
  type UnityVectorLike,
} from "./unityCoordinateConversion";

export type PrefabHeadFollowDebug = {
  active: boolean;
  sourcePath: string | null;
  targetPath: string | null;
  reason: string | null;
  setupVersion?: string;
  sourceScaleCorrection?: {
    characterHeightMeters: number | null;
    characterModelScaleMeters: number | null;
    scale: number;
    reason: string;
  };
  targetCount?: number;
  targetPaths?: string[];
  mountedHeadRootCount?: number;
  mountedHeadOriginPaths?: string[];
  positionRoots?: PrefabHeadFollowNodeDebug[];
  keyNodes?: Record<string, PrefabHeadFollowNodeDebug | null>;
  assemblyDistances?: {
    bodyNeckToFaceNeck: number | null;
    bodyHeadToFaceHead: number | null;
  };
};

export type PrefabHeadFollowNodeDebug = {
  path: string;
  canonicalPath: string;
  parentPath: string | null;
  localPosition: { x: number; y: number; z: number };
  localQuaternion: { x: number; y: number; z: number; w: number };
  worldPosition: { x: number; y: number; z: number };
  worldQuaternion: { x: number; y: number; z: number; w: number };
  worldForward: { x: number; y: number; z: number };
};

export type UnityPrefabSourceGraph = {
  root: THREE.Group;
  nodeByPath: Map<string, THREE.Object3D>;
  meshCarrierBindings: Array<{
    source: THREE.Object3D;
    target: THREE.Object3D;
  }>;
  bodyAttach: THREE.Object3D | null;
  bodyAttachPath: string | null;
  headRoot: THREE.Object3D | null;
  headRootPath: string | null;
  headOrigin: THREE.Object3D | null;
  headOriginPath: string | null;
  debug: PrefabHeadFollowDebug;
};

export type NativeMeshInstallDiagnostics = {
  meshCount: number;
  boneCount: number;
  skinnedMeshCount: number;
  error: string | null;
  warnings: string[];
};

type RuntimePrefabTransformSource = {
  pathId?: number;
  name?: string | null;
  transformPath?: string | null;
  poseRoot?: string | null;
  runtimePartIndex?: number;
  parentPathId?: number | null;
  childPathIds?: number[];
  localPosition?: UnityVectorLike;
  localRotation?: UnityQuaternionLike;
  localScale?: UnityVectorLike;
};

type RuntimePrefabGraphSource = {
  partKind?: string;
  transforms?: RuntimePrefabTransformSource[];
};

type RuntimeUnitySetupSource = {
  version?: string | number;
  prefabGraphs?: RuntimePrefabGraphSource[];
  bodyHeadAssembly?: RuntimeUnityBodyHeadAssemblySource;
  constraintSetup?: RuntimeConstraintSetupSource;
};

type RuntimeUnityBodyHeadAssemblySource = {
  version?: string | number;
  sourceKind?: string;
  parentRootPath?: string | null;
  parentAttachPath?: string | null;
  childRootPath?: string | null;
  childOriginPath?: string | null;
  parentingMode?: string;
  coordinateSpace?: string;
  faceRendererName?: string | null;
  combineNodeAName?: string | null;
  combineNodeBName?: string | null;
  childMoveSuffix?: string | null;
  parentCombineNodeAPath?: string | null;
  parentCombineNodeBPath?: string | null;
  childCombineNodeAPath?: string | null;
  childCombineNodeBPath?: string | null;
};

type RuntimeNativeMeshSetSource = {
  version?: string | number;
  meshes?: RuntimeNativeMeshSource[];
  warnings?: string[];
};

type RuntimeNativeMeshSource = {
  partKind?: string;
  meshPath?: string;
  meshName?: string;
  rendererPathId?: number;
  rendererTransformPath?: string;
  rootBonePath?: string | null;
  bonePaths?: string[];
  boneInverseBindMatrices?: RuntimeNumericArray;
  submeshes?: RuntimeNativeSubmeshSource[];
  positions?: RuntimeNumericArray;
  normals?: RuntimeNumericArray;
  uv0?: RuntimeNumericArray;
  uv1?: RuntimeNumericArray;
  colors?: RuntimeNumericArray;
  skinIndices?: RuntimeNumericArray;
  skinWeights?: RuntimeNumericArray;
  morphTargets?: RuntimeNativeMorphTargetSource[];
};

type RuntimeNativeSubmeshSource = {
  slotIndex: number;
  materialKey: string;
  materialFileId?: number;
  materialPathId?: number;
  materialName?: string;
  start?: number;
  count?: number;
  indices?: RuntimeNumericArray;
};

type RuntimeNativeMorphTargetSource = {
  name?: string;
  indices?: RuntimeNumericArray;
  positionDeltas?: RuntimeNumericArray;
  normalDeltas?: RuntimeNumericArray;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function readRuntimeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readRuntimeUnitySetup0414(extension: unknown): RuntimeUnitySetupSource | null {
  const payload = asRecord(extension);
  const springBone = asRecord(payload.pjskSpringBone ?? payload.PjskSpringBone);
  const setup = asRecord(
    payload.runtimeUnitySetup ?? payload.RuntimeUnitySetup ??
      springBone.runtimeUnitySetup ?? springBone.RuntimeUnitySetup
  ) as RuntimeUnitySetupSource;
  const version = setup.version;
  return version === "0414" || version === 414 ? setup : null;
}

function readRuntimeNativeMeshSet0414(extension: unknown): RuntimeNativeMeshSetSource | null {
  const payload = asRecord(extension);
  const nativeMeshes = asRecord(
    payload.nativeMeshes ?? payload.NativeMeshes
  ) as RuntimeNativeMeshSetSource;
  const version = nativeMeshes.version;
  return version === "0414" || version === 414 ? nativeMeshes : null;
}

function resolvePrefabGraphNode(
  nodeByPath: ReadonlyMap<string, THREE.Object3D>,
  candidates: readonly (string | null | undefined)[]
) {
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    const node = nodeByPath.get(candidate);
    if (node) {
      return { path: candidate, node };
    }
  }
  return null;
}

function collectUnityPrefabHeadRoots(
  root: THREE.Object3D,
  primaryHeadRoot: THREE.Object3D | null
) {
  const roots: THREE.Object3D[] = [];
  const seen = new Set<THREE.Object3D>();
  const primaryPath = String(primaryHeadRoot?.userData.pjskTransformPath ?? "face");
  const add = (node: THREE.Object3D | null) => {
    if (!node || seen.has(node)) {
      return;
    }
    seen.add(node);
    roots.push(node);
  };

  add(primaryHeadRoot);
  root.traverse((node) => {
    if (node === root) {
      return;
    }
    const transformPath = String(node.userData.pjskTransformPath ?? "");
    if (transformPath === primaryPath) {
      add(node);
    }
  });
  return roots;
}

function getUnityPrefabTransformPath(node: THREE.Object3D) {
  const path = node.userData.pjskTransformPath;
  return typeof path === "string" && path.length > 0 ? path : null;
}

function resolveUnityPrefabMountedHeadOrigin(
  mountedHeadRoot: THREE.Object3D,
  assembly: RuntimeUnityBodyHeadAssemblySource
): { path: string; node: THREE.Object3D } | null {
  const rootPath = getUnityPrefabTransformPath(mountedHeadRoot);
  const absoluteOriginPath = assembly.childOriginPath;
  const relativeOriginPath =
    rootPath && absoluteOriginPath?.startsWith(`${rootPath}/`)
      ? absoluteOriginPath.slice(rootPath.length + 1)
      : null;
  let absoluteMatch: { path: string; node: THREE.Object3D } | null = null;
  let relativeMatch: { path: string; node: THREE.Object3D } | null = null;

  mountedHeadRoot.traverse((node) => {
    if (absoluteMatch) {
      return;
    }
    const transformPath = getUnityPrefabTransformPath(node);
    if (absoluteOriginPath && transformPath === absoluteOriginPath) {
      absoluteMatch = { path: absoluteOriginPath, node };
      return;
    }
    if (relativeOriginPath) {
      const relativePath = buildObjectPath(node, mountedHeadRoot, true);
      if (relativePath === relativeOriginPath) {
        relativeMatch = { path: `${rootPath}/${relativePath}`, node };
      }
    }
  });

  return absoluteMatch ?? relativeMatch;
}

function computeUnityPrefabRestOffset(
  root: THREE.Object3D,
  origin: THREE.Object3D
) {
  root.updateMatrixWorld(true);
  origin.updateMatrixWorld(true);
  return new THREE.Matrix4()
    .copy(root.matrixWorld)
    .invert()
    .multiply(origin.matrixWorld);
}

function isModelCombineSetupAssembly(
  assembly: RuntimeUnityBodyHeadAssemblySource | undefined
): assembly is RuntimeUnityBodyHeadAssemblySource {
  return assembly?.parentingMode === "model_combine_setup";
}

function setParentKeepingLocal(child: THREE.Object3D, parent: THREE.Object3D) {
  if (child.parent) {
    child.parent.remove(child);
  }
  parent.add(child);
  child.updateMatrix();
}

function drainChildrenKeepingLocal(
  sourceParent: THREE.Object3D,
  destParent: THREE.Object3D
) {
  while (sourceParent.children.length > 0) {
    setParentKeepingLocal(sourceParent.children[0], destParent);
  }
}

function moveKnownFaceRendererTransforms(
  nodeByPath: Map<string, THREE.Object3D>,
  childRootPath: string | null | undefined,
  destParent: THREE.Object3D,
  faceRendererName: string
) {
  if (!childRootPath) {
    return;
  }
  for (const rendererName of new Set([faceRendererName, "Face", "Hair", "Acc"])) {
    const node = nodeByPath.get(`${childRootPath}/${rendererName}`);
    if (node) {
      setParentKeepingLocal(node, destParent);
    }
  }
}

function detachNode(node: THREE.Object3D) {
  if (node.parent) {
    node.parent.remove(node);
  }
  node.userData.pjskModelCombineDestroyed = true;
}

function applyOfficialModelCombineSetup(
  root: THREE.Group,
  nodeByPath: Map<string, THREE.Object3D>,
  assembly: RuntimeUnityBodyHeadAssemblySource
) {
  const childMoveSuffix = assembly.childMoveSuffix ?? "_target";
  const parentRootPath = assembly.parentRootPath;
  const childRootPath = assembly.childRootPath;
  const bodyNodeA = resolvePrefabGraphNode(nodeByPath, [
    assembly.parentCombineNodeAPath ?? assembly.parentAttachPath,
  ]);
  const bodyNodeB = resolvePrefabGraphNode(nodeByPath, [
    assembly.parentCombineNodeBPath,
  ]);
  const faceNodeA = resolvePrefabGraphNode(nodeByPath, [
    assembly.childCombineNodeAPath ?? assembly.childOriginPath,
  ]);
  const faceNodeB = resolvePrefabGraphNode(nodeByPath, [
    assembly.childCombineNodeBPath,
  ]);

  if (!parentRootPath || !childRootPath || !bodyNodeA || !bodyNodeB || !faceNodeA || !faceNodeB) {
    throw new Error("Official model_combine_setup paths were not fully resolved.");
  }

  drainChildrenKeepingLocal(bodyNodeB.node, faceNodeB.node);

  const bodyNodeAParent = bodyNodeA.node.parent;
  if (bodyNodeAParent) {
    for (const child of [...faceNodeA.node.children]) {
      if (child.name.endsWith(childMoveSuffix)) {
        setParentKeepingLocal(child, bodyNodeAParent);
      }
    }
    moveKnownFaceRendererTransforms(
      nodeByPath,
      childRootPath,
      nodeByPath.get(parentRootPath) ?? bodyNodeAParent,
      assembly.faceRendererName ?? "Face"
    );
    setParentKeepingLocal(faceNodeA.node, bodyNodeAParent);
  }

  faceNodeA.node.position.copy(bodyNodeA.node.position);
  faceNodeA.node.quaternion.copy(bodyNodeA.node.quaternion);
  faceNodeA.node.scale.copy(bodyNodeA.node.scale);
  faceNodeA.node.updateMatrix();
  faceNodeB.node.position.copy(bodyNodeB.node.position);
  faceNodeB.node.quaternion.copy(bodyNodeB.node.quaternion);
  faceNodeB.node.scale.copy(bodyNodeB.node.scale);
  faceNodeB.node.updateMatrix();

  nodeByPath.set(bodyNodeA.path, faceNodeA.node);
  nodeByPath.set(bodyNodeB.path, faceNodeB.node);
  if (assembly.parentAttachPath) {
    nodeByPath.set(assembly.parentAttachPath, faceNodeA.node);
  }
  if (assembly.parentCombineNodeBPath) {
    nodeByPath.set(assembly.parentCombineNodeBPath, faceNodeB.node);
  }

  detachNode(bodyNodeB.node);
  detachNode(bodyNodeA.node);
  root.updateMatrixWorld(true);

  return { bodyNodeA, faceNodeA };
}

export function buildUnityPrefabSourceGraph(
  extension: unknown,
  meshCarrierRoot?: THREE.Object3D | null
): UnityPrefabSourceGraph | null {
  const setup = readRuntimeUnitySetup0414(extension);
  if (!setup?.prefabGraphs?.length) {
    return null;
  }

  const root = new THREE.Group();
  root.name = "UnityPrefabSourceRoot";
  root.userData.pjskUnityPrefabSourceGraph = true;
  const sourceScaleCorrection = resolveUnityPrefabSourceScaleCorrection(extension);
  root.scale.setScalar(sourceScaleCorrection.scale);
  root.userData.pjskSourceScaleCorrection = sourceScaleCorrection;
  const nodeByPathId = new Map<number, THREE.Object3D>();
  const sourceByPathId = new Map<number, RuntimePrefabTransformSource>();
  const nodeByPath = new Map<string, THREE.Object3D>();

  for (const graph of setup.prefabGraphs) {
    for (const transform of graph.transforms ?? []) {
      if (typeof transform.pathId !== "number" || !transform.transformPath) {
        continue;
      }
      const node = new THREE.Object3D();
      node.name = transform.name ?? transform.transformPath.split("/").pop() ?? `path_${transform.pathId}`;
      node.userData.pjskTransformPath = transform.transformPath;
      node.userData.pjskRuntimePartIndex = transform.runtimePartIndex;
      node.userData.pjskPoseRoot = transform.poseRoot ?? null;
      node.position.copy(convertUnityPositionToThree(
        readUnityVector3(transform.localPosition, new THREE.Vector3())
      ));
      node.quaternion.copy(convertUnityQuaternionToThree(
        readUnityQuaternion(transform.localRotation)
      ));
      node.scale.copy(readUnityVector3(
        transform.localScale,
        new THREE.Vector3(1, 1, 1)
      ));
      node.updateMatrix();
      nodeByPathId.set(transform.pathId, node);
      sourceByPathId.set(transform.pathId, transform);
      nodeByPath.set(transform.transformPath, node);
    }
  }

  for (const [pathId, node] of nodeByPathId.entries()) {
    const source = sourceByPathId.get(pathId);
    const parentPathId = source?.parentPathId;
    const parent = typeof parentPathId === "number"
      ? nodeByPathId.get(parentPathId)
      : null;
    (parent ?? root).add(node);
  }

  root.updateMatrixWorld(true);
  const assembly = setup.bodyHeadAssembly;
  if (!isModelCombineSetupAssembly(assembly)) {
    throw new Error("Runtime package must provide the official model_combine_setup body/head assembly.");
  }
  const bodyAttach = resolvePrefabGraphNode(nodeByPath, [assembly.parentAttachPath]);
  const headRoot = resolvePrefabGraphNode(nodeByPath, [assembly.childRootPath]);
  const headRoots = collectUnityPrefabHeadRoots(root, headRoot?.node ?? null);
  const headOrigin = resolvePrefabGraphNode(nodeByPath, [assembly.childOriginPath]);
  if (!bodyAttach || !headRoot || !headOrigin) {
    throw new Error("Official model_combine_setup body/head roots were not fully resolved.");
  }
  const modelCombine = applyOfficialModelCombineSetup(root, nodeByPath, assembly);
  const headRootMounts = headRoots.map((mountedHeadRoot) => {
    const rootPath = getUnityPrefabTransformPath(mountedHeadRoot);
    const mountedHeadOrigin = resolveUnityPrefabMountedHeadOrigin(
      mountedHeadRoot,
      assembly
    );
    const originRestLocalToRoot = mountedHeadOrigin
      ? computeUnityPrefabRestOffset(mountedHeadRoot, mountedHeadOrigin.node)
      : null;
    return {
      root: mountedHeadRoot,
      rootPath,
      origin: mountedHeadOrigin?.node ?? null,
      originPath: mountedHeadOrigin?.path ?? null,
      originRestLocalToRoot,
    };
  });

  const meshCarrierBindings: UnityPrefabSourceGraph["meshCarrierBindings"] = [];
  if (meshCarrierRoot) {
    const carrierNodeByPath = buildPrefabNodePathLookup(meshCarrierRoot);
    for (const [path, source] of nodeByPath.entries()) {
      const target = carrierNodeByPath.get(path);
      if (target) {
        meshCarrierBindings.push({ source, target });
      }
    }
  }

  const debug: PrefabHeadFollowDebug = {
    active: true,
    sourcePath: modelCombine.bodyNodeA.path,
    targetPath: modelCombine.faceNodeA.path,
    reason: null,
    setupVersion: String(setup.version ?? ""),
    sourceScaleCorrection,
    mountedHeadRootCount: headRootMounts.length,
    mountedHeadOriginPaths: headRootMounts.map((mount) =>
      mount.originPath ?? mount.rootPath ?? mount.root.name
    ),
    targetCount: meshCarrierBindings.length,
    targetPaths: meshCarrierBindings.slice(0, 24).map((binding) =>
      String(binding.source.userData.pjskTransformPath ?? binding.source.name)
    ),
    keyNodes: {
      runtimeMount: null,
      modelCombineBodyNeck: makePrefabNodeDebug(modelCombine.bodyNodeA.node, root),
      modelCombineFaceNeck: makePrefabNodeDebug(modelCombine.faceNodeA.node, root),
    },
  };

  return {
    root,
    nodeByPath,
    meshCarrierBindings,
    bodyAttach: bodyAttach.node,
    bodyAttachPath: bodyAttach.path,
    headRoot: headRoot.node,
    headRootPath: headRoot.path,
    headOrigin: headOrigin.node,
    headOriginPath: headOrigin.path,
    debug,
  };
}

function resolveUnityPrefabSourceScaleCorrection(extension: unknown) {
  const payload = asRecord(extension);
  const character = asRecord(payload.character ?? payload.Character);
  const bodyManifest = asRecord(payload.bodyManifest ?? payload.BodyManifest);
  const characterHeightMeters = readRuntimeNumber(
    character.characterHeightMeters ??
      character.CharacterHeightMeters ??
      bodyManifest.CharacterHeightMeters ??
      bodyManifest.characterHeightMeters
  );
  const bodyBundlePath = String(
    character.bodyBundlePath ??
      character.BodyBundlePath ??
      bodyManifest.BundlePath ??
      bodyManifest.bundlePath ??
      ""
  ).replace(/\\/g, "/");
  const characterModelScaleMeters = resolveCharacterModelScaleMeters(
    bodyBundlePath,
    characterHeightMeters
  );
  const scale = characterHeightMeters && characterHeightMeters > 0 && characterModelScaleMeters
    ? characterModelScaleMeters / characterHeightMeters
    : 1;
  const hasModelScaleOverride = characterHeightMeters !== null &&
    characterModelScaleMeters !== null &&
    Math.abs(characterModelScaleMeters - characterHeightMeters) > 0.000001;
  return {
    characterHeightMeters,
    characterModelScaleMeters,
    scale,
    reason: hasModelScaleOverride ? "frida-body-character-model-scale" : "identity",
  };
}

function resolveCharacterModelScaleMeters(
  bodyBundlePath: string,
  characterHeightMeters: number | null
) {
  const normalized = bodyBundlePath.toLowerCase();
  if (
    characterHeightMeters !== null &&
    Math.abs(characterHeightMeters - 1.68) < 0.0001 &&
    normalized.includes("/body/99/0141/") &&
    normalized.endsWith("/ladies_s.bundle")
  ) {
    return 1.64;
  }
  return characterHeightMeters;
}

export function installUnityRuntimeNativeMeshes(
  graph: UnityPrefabSourceGraph,
  extension: unknown
): NativeMeshInstallDiagnostics {
  const nativeMeshes = readRuntimeNativeMeshSet0414(extension);
  const meshes = nativeMeshes?.meshes ?? [];
  if (!nativeMeshes || meshes.length === 0) {
    return {
      meshCount: 0,
      boneCount: graph.nodeByPath.size,
      skinnedMeshCount: 0,
      error: "Unity runtime nativeMeshes version 0414 is missing or empty.",
      warnings: nativeMeshes?.warnings ?? [],
    };
  }

  let meshCount = 0;
  let skinnedMeshCount = 0;
  const warnings = [...(nativeMeshes.warnings ?? [])];
  graph.root.updateMatrixWorld(true);

  for (const source of meshes) {
    const targetPath = source.rendererTransformPath;
    const parent = targetPath ? graph.nodeByPath.get(targetPath) : null;
    if (!parent) {
      warnings.push(`Native mesh '${source.meshPath ?? source.meshName ?? "<unnamed>"}' skipped: renderer transform '${targetPath ?? "<null>"}' was not found.`);
      continue;
    }

    const geometry = buildUnityRuntimeNativeGeometry(source);
    if (!geometry) {
      warnings.push(`Native mesh '${source.meshPath ?? source.meshName ?? "<unnamed>"}' skipped: invalid geometry payload.`);
      continue;
    }

    const materials = (source.submeshes ?? []).map((submesh) => {
      if (!submesh.materialKey || typeof submesh.slotIndex !== "number") {
        throw new Error(
          `Native mesh '${source.meshPath ?? source.meshName ?? "<unnamed>"}' has a submesh without material identity; regenerate it with Haruki-3D-Exporter materialKey runtime support.`
        );
      }
      const material = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        vertexColors: geometry.hasAttribute("color"),
      });
      material.name = submesh.materialName ?? source.meshName ?? source.meshPath ?? "native_material";
      material.userData.pjskMaterialKey = submesh.materialKey;
      material.userData.pjskMaterialSlotIndex = submesh.slotIndex;
      return material;
    });
    const meshMaterials = materials.length > 0
      ? materials
      : [new THREE.MeshBasicMaterial({ color: 0xffffff })];
    const meshName = source.meshName ?? source.meshPath?.split("/").pop() ?? "UnityNativeMesh";
    const bonePaths = source.bonePaths ?? [];
    const bones = bonePaths
      .map((path) => graph.nodeByPath.get(path))
      .filter((node): node is THREE.Object3D => Boolean(node));

    let mesh: THREE.Mesh | THREE.SkinnedMesh;
    let skinnedMeshForBind: THREE.SkinnedMesh | null = null;
    let skeletonBones: THREE.Object3D[] = [];
    if (bonePaths.length > 0) {
      if (bones.length !== bonePaths.length) {
        warnings.push(`Native mesh '${source.meshPath ?? meshName}' skipped: ${bonePaths.length - bones.length} skin bones were unresolved.`);
        geometry.dispose();
        continue;
      }
      const skinned = new THREE.SkinnedMesh(geometry, meshMaterials);
      mesh = skinned;
      skinnedMeshForBind = skinned;
      skeletonBones = bones;
      skinnedMeshCount += 1;
    } else {
      mesh = new THREE.Mesh(geometry, meshMaterials);
    }

    mesh.name = meshName;
    mesh.userData.pjskNativeUnityMesh = true;
    mesh.userData.pjskPartKind = source.partKind ?? null;
    mesh.userData.pjskRendererPathId = source.rendererPathId ?? null;
    mesh.frustumCulled = false;
    parent.add(mesh);
    if (skinnedMeshForBind) {
      graph.root.updateMatrixWorld(true);
      skinnedMeshForBind.updateMatrixWorld(true);
      const inverseBindMatrices = buildUnityRuntimeBoneInverseBindMatrices(
        source,
        skeletonBones.length,
        warnings
      );
      const skeleton = new THREE.Skeleton(
        skeletonBones as unknown as THREE.Bone[],
        inverseBindMatrices.length > 0 ? inverseBindMatrices : undefined
      );
      if (inverseBindMatrices.length === 0) {
        skeleton.calculateInverses();
      }
      skinnedMeshForBind.bind(skeleton, skinnedMeshForBind.matrixWorld);
    }
    meshCount += 1;
  }

  graph.root.updateMatrixWorld(true);
  return {
    meshCount,
    boneCount: graph.nodeByPath.size,
    skinnedMeshCount,
    error: meshCount > 0
      ? null
      : "Unity runtime nativeMeshes did not produce any renderable mesh.",
    warnings,
  };
}

function buildUnityRuntimeBoneInverseBindMatrices(
  source: RuntimeNativeMeshSource,
  boneCount: number,
  warnings: string[]
) {
  const values = source.boneInverseBindMatrices ?? [];
  if (boneCount === 0 || values.length === 0) {
    return [];
  }
  if (values.length !== boneCount * 16) {
    warnings.push(`Native mesh '${source.meshPath ?? source.meshName ?? "<unnamed>"}' has ${values.length} inverse bind matrix floats for ${boneCount} bones; expected ${boneCount * 16}.`);
    return [];
  }

  const matrices: THREE.Matrix4[] = [];
  for (let offset = 0; offset < values.length; offset += 16) {
    matrices.push(new THREE.Matrix4().fromArray(values, offset));
  }
  return matrices;
}

function buildUnityRuntimeNativeGeometry(source: RuntimeNativeMeshSource) {
  const positions = source.positions ?? [];
  if (positions.length === 0 || positions.length % 3 !== 0) {
    return null;
  }
  const vertexCount = positions.length / 3;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  if ((source.normals?.length ?? 0) === vertexCount * 3) {
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(source.normals!, 3));
  }
  if ((source.uv0?.length ?? 0) === vertexCount * 2) {
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(source.uv0!, 2));
  }
  if ((source.uv1?.length ?? 0) === vertexCount * 2) {
    geometry.setAttribute("uv1", new THREE.Float32BufferAttribute(source.uv1!, 2));
    geometry.setAttribute("uv2", new THREE.Float32BufferAttribute(source.uv1!, 2));
  }
  if ((source.colors?.length ?? 0) === vertexCount * 4) {
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(source.colors!, 4));
  }
  if ((source.skinIndices?.length ?? 0) === vertexCount * 4) {
    geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(source.skinIndices!, 4));
  }
  if ((source.skinWeights?.length ?? 0) === vertexCount * 4) {
    geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(source.skinWeights!, 4));
  }

  const allIndices: number[] = [];
  for (const submesh of source.submeshes ?? []) {
    const start = allIndices.length;
    const indices = submesh.indices ?? [];
    allIndices.push(...indices);
    geometry.addGroup(start, indices.length, geometry.groups.length);
  }
  if (allIndices.length > 0) {
    geometry.setIndex(allIndices);
  }

  const morphPositions: THREE.BufferAttribute[] = [];
  const morphNormals: THREE.BufferAttribute[] = [];
  for (const target of source.morphTargets ?? []) {
    const indices = target.indices ?? [];
    const positionDeltas = target.positionDeltas ?? [];
    if (indices.length === 0 || positionDeltas.length !== indices.length * 3) {
      continue;
    }
    const positionArray = new Float32Array(vertexCount * 3);
    const normalArray = target.normalDeltas?.length === indices.length * 3
      ? new Float32Array(vertexCount * 3)
      : null;
    for (let index = 0; index < indices.length; index += 1) {
      const vertexIndex = indices[index];
      if (!Number.isInteger(vertexIndex) || vertexIndex < 0 || vertexIndex >= vertexCount) {
        continue;
      }
      positionArray[vertexIndex * 3] = positionDeltas[index * 3] ?? 0;
      positionArray[vertexIndex * 3 + 1] = positionDeltas[index * 3 + 1] ?? 0;
      positionArray[vertexIndex * 3 + 2] = positionDeltas[index * 3 + 2] ?? 0;
      if (normalArray && target.normalDeltas) {
        normalArray[vertexIndex * 3] = target.normalDeltas[index * 3] ?? 0;
        normalArray[vertexIndex * 3 + 1] = target.normalDeltas[index * 3 + 1] ?? 0;
        normalArray[vertexIndex * 3 + 2] = target.normalDeltas[index * 3 + 2] ?? 0;
      }
    }
    const positionAttribute = new THREE.BufferAttribute(positionArray, 3);
    positionAttribute.name = target.name ?? `morph_${morphPositions.length}`;
    morphPositions.push(positionAttribute);
    if (normalArray) {
      const normalAttribute = new THREE.BufferAttribute(normalArray, 3);
      normalAttribute.name = positionAttribute.name;
      morphNormals.push(normalAttribute);
    }
  }
  if (morphPositions.length > 0) {
    geometry.morphAttributes.position = morphPositions;
    geometry.morphTargetsRelative = true;
  }
  if (morphNormals.length === morphPositions.length && morphNormals.length > 0) {
    geometry.morphAttributes.normal = morphNormals;
  }

  geometry.computeBoundingSphere();
  return geometry;
}

export function syncUnityPrefabSourceGraph(
  graph: UnityPrefabSourceGraph,
  extension: unknown,
  characterHeight: number,
  constraintRuntime?: { update(): RuntimeConstraintDebug } | null
): RuntimeConstraintDebug | null {
  graph.root.updateMatrixWorld(true);
  const diagnostics = constraintRuntime
    ? constraintRuntime.update()
    : applyUnityRuntimeConstraints(
      graph,
      readRuntimeUnitySetup0414(extension)?.constraintSetup,
      characterHeight
    );

  for (const binding of graph.meshCarrierBindings) {
    binding.target.position.copy(binding.source.position);
    binding.target.quaternion.copy(binding.source.quaternion);
    binding.target.scale.copy(binding.source.scale);
    binding.target.updateMatrix();
  }
  graph.root.updateMatrixWorld(true);
  return diagnostics;
}

export function createUnityPrefabConstraintRuntime(
  graph: UnityPrefabSourceGraph,
  extension: unknown,
  characterHeight: number
) {
  const setup = readRuntimeUnitySetup0414(extension)?.constraintSetup;
  return setup
    ? new UnityConstraintRuntime(graph, setup, characterHeight)
    : null;
}

export function makeUnityPrefabHeadFollowDebugSnapshot(
  graph: UnityPrefabSourceGraph | null,
  extension: unknown,
  fallback: PrefabHeadFollowDebug
): PrefabHeadFollowDebug {
  const base: PrefabHeadFollowDebug = {
    ...(graph?.debug ?? fallback),
    setupVersion: readRuntimeUnitySetupVersion(extension),
  };
  if (!graph) {
    return base;
  }
  const root = graph.root;
  root.updateMatrixWorld(true);
  const nodeByPath = buildPrefabNodePathLookup(root);
  const resolveKeyNode = (
    candidates: readonly string[]
  ): PrefabHeadFollowNodeDebug | null => {
    const resolved = resolvePrefabNodeCandidate(nodeByPath, candidates);
    return resolved ? makePrefabNodeDebug(resolved.node, root) : null;
  };
  const bodyNeck = resolveKeyNode([
    "body/Position/PositionOffset/Hip/Waist/Spine/Chest/Neck",
    "body/Position/Hip/Waist/Spine/Chest/Neck",
  ]);
  const bodyHead = resolveKeyNode([
    "body/Position/PositionOffset/Hip/Waist/Spine/Chest/Neck/Head",
    "body/Position/Hip/Waist/Spine/Chest/Neck/Head",
  ]);
  const facePosition = resolveKeyNode(["face/Position"]);
  const faceNeck = resolveKeyNode([
    "face/Position/Hip/Waist/Spine/Chest/Neck",
  ]);
  const faceHead = resolveKeyNode([
    "face/Position/Hip/Waist/Spine/Chest/Neck/Head",
  ]);
  const meshContainerPosition = resolveKeyNode([
    "mdl_chr_IDL_A_00/Position",
    "mdl_chr_IDL_A_00/Position_4",
  ]);
  return {
    ...base,
    positionRoots: collectPrefabPositionRootDebug(root),
    assemblyDistances: {
      bodyNeckToFaceNeck: debugNodeWorldDistance(bodyNeck, faceNeck),
      bodyHeadToFaceHead: debugNodeWorldDistance(bodyHead, faceHead),
    },
    keyNodes: {
      ...(base.keyNodes ?? {}),
      bodyNeck,
      bodyHead,
      facePosition,
      faceNeck,
      faceHead,
      meshContainerPosition,
    },
  };
}

function readRuntimeUnitySetupVersion(extension: unknown) {
  const payload = asRecord(extension);
  const springBone = asRecord(payload.pjskSpringBone ?? payload.PjskSpringBone);
  const setup = asRecord(
    payload.runtimeUnitySetup ?? payload.RuntimeUnitySetup ??
      springBone.runtimeUnitySetup ?? springBone.RuntimeUnitySetup
  );
  return String(setup.version ?? setup.Version ?? "");
}

function resolvePrefabNodeCandidate(
  nodeByPath: ReadonlyMap<string, THREE.Object3D>,
  candidates: readonly string[]
) {
  for (const path of candidates) {
    const node = nodeByPath.get(path);
    if (node) {
      return { node, path };
    }
  }
  return null;
}

function stripThreeDuplicateSuffix(name: string) {
  return name.replace(/_\d+$/, "");
}

function buildObjectPath(
  node: THREE.Object3D,
  root: THREE.Object3D,
  canonical = false
) {
  const segments: string[] = [];
  let current: THREE.Object3D | null = node;
  while (current && current !== root) {
    if (current.name) {
      segments.push(canonical ? stripThreeDuplicateSuffix(current.name) : current.name);
    }
    current = current.parent;
  }
  return segments.reverse().join("/");
}

function vectorDebugSnapshot(vector: THREE.Vector3) {
  return {
    x: Number(vector.x.toFixed(5)),
    y: Number(vector.y.toFixed(5)),
    z: Number(vector.z.toFixed(5)),
  };
}

function quaternionDebugSnapshot(quaternion: THREE.Quaternion) {
  return {
    x: Number(quaternion.x.toFixed(5)),
    y: Number(quaternion.y.toFixed(5)),
    z: Number(quaternion.z.toFixed(5)),
    w: Number(quaternion.w.toFixed(5)),
  };
}

function debugNodeWorldDistance(
  first: PrefabHeadFollowNodeDebug | null,
  second: PrefabHeadFollowNodeDebug | null
) {
  if (!first || !second) {
    return null;
  }
  const dx = first.worldPosition.x - second.worldPosition.x;
  const dy = first.worldPosition.y - second.worldPosition.y;
  const dz = first.worldPosition.z - second.worldPosition.z;
  return Number(Math.hypot(dx, dy, dz).toFixed(5));
}

function makePrefabNodeDebug(
  node: THREE.Object3D,
  root: THREE.Object3D
): PrefabHeadFollowNodeDebug {
  node.updateMatrixWorld(true);
  const worldPosition = new THREE.Vector3();
  const worldQuaternion = new THREE.Quaternion();
  const worldForward = new THREE.Vector3(0, 0, 1);
  node.getWorldPosition(worldPosition);
  node.getWorldQuaternion(worldQuaternion);
  worldForward.applyQuaternion(worldQuaternion).normalize();
  return {
    path: buildObjectPath(node, root),
    canonicalPath: buildObjectPath(node, root, true),
    parentPath: node.parent && node.parent !== root
      ? buildObjectPath(node.parent, root)
      : null,
    localPosition: vectorDebugSnapshot(node.position),
    localQuaternion: quaternionDebugSnapshot(node.quaternion),
    worldPosition: vectorDebugSnapshot(worldPosition),
    worldQuaternion: quaternionDebugSnapshot(worldQuaternion),
    worldForward: vectorDebugSnapshot(worldForward),
  };
}

function collectPrefabPositionRootDebug(root: THREE.Object3D) {
  const nodes: PrefabHeadFollowNodeDebug[] = [];
  const seen = new Set<THREE.Object3D>();
  root.updateMatrixWorld(true);
  root.traverse((node) => {
    if (node === root || !node.name || seen.has(node)) {
      return;
    }
    const canonicalPath = buildObjectPath(node, root, true);
    const isHeadFollowTarget = canonicalPath === "face/Position";
    const isBodyPosition = canonicalPath === "body/Position";
    const isMeshContainerPosition =
      canonicalPath.endsWith("/Position") &&
      canonicalPath.split("/").some((segment) => segment.startsWith("mdl_chr_"));
    if (!isHeadFollowTarget && !isBodyPosition && !isMeshContainerPosition) {
      return;
    }
    seen.add(node);
    nodes.push(makePrefabNodeDebug(node, root));
  });
  return nodes;
}

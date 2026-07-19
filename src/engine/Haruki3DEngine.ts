import * as THREE from "three";
import {
  ensureRoleRuntimePackage,
  loadRuntimePackageFromBaseUrl,
  type RuntimePackageLoadOptions,
  type RuntimePackageLoadResult,
} from "../runtime/runtimePackageLoader";
import type {
  BodyAssetManifest,
  HeadAssetManifest,
  MaterialLightingSettings,
  PreviewLightState,
} from "../data/sampleScene";
import {
  sekaiCostumeShopDirectionalLightDirection,
  sekaiCostumeShopDirectionalLightRotationDegrees,
} from "../data/sampleScene";
import {
  createSekaiBodyMaterial,
} from "../materials/sekaiBodyMaterial";
import {
  createSekaiFaceMaterial,
} from "../materials/sekaiFaceMaterial";
import type { SekaiLayerAtlas } from "../materials/sekaiLayerMaterial";
import {
  type UtjSpringBoneDebugOptions,
  type UtjSpringBoneRuntimeSnapshot,
  type UtjSpringBoneTraceSnapshot,
} from "./springRuntimeTypes";
import {
  UnityPrefabSpringRuntime,
  type SpringTimelineControl,
} from "./unityPrefabSpringRuntimeAdapter";
import { SekaiExtraBoneRuntime } from "./sekaiExtraBoneRuntime";
import {
  UnityConstraintRuntime,
  type RuntimeConstraintDebug,
} from "./unityConstraintRuntime";
import {
  readUnityVector3,
  type UnityVectorLike,
} from "./unityCoordinateConversion";
import type { SpringRuntimeMode } from "../config/viewerConfig";
import type {
  CustomPartSelection,
  RuntimePartType,
} from "../parts/runtimePartComposer";
import { runtimeRoleId } from "../parts/runtimePartComposer";
import {
  normalizeHarukiRenderRecipe,
  type HarukiRuntimeRenderRecipe,
} from "../kernel/renderRecipe";
import type {
  RuntimeCombinedCharacterAsset,
} from "../runtime/runtimeTypes";
import {
  getCostumeShopCameraPose,
  getDefaultCameraPose,
  shiftCameraPoseRight,
  type PjskCameraProfile,
  type PjskCameraPreset,
  type RuntimeCameraDebug,
} from "./cameraRuntime";
import { createCaptureBackgroundTexture } from "./captureBackground";
import {
  CharacterProjectedShadowController,
  defaultProjectedShadowSettings,
  projectedShadowTargetBoneNames,
  type ProjectedShadowSettings,
  type ProjectedShadowSettingsInput,
  type RuntimeProjectedShadowDebug,
} from "./projectedShadow";
import { buildPrefabNodePathLookup } from "./prefabNodeLookup";
import {
  buildUnityPrefabSourceGraph,
  createUnityPrefabConstraintRuntime,
  installUnityRuntimeNativeMeshes,
  makeUnityPrefabHeadFollowDebugSnapshot,
  syncUnityPrefabSourceGraph as syncUnityPrefabRuntimeGraph,
  type NativeMeshInstallDiagnostics,
  type PrefabHeadFollowDebug,
  type UnityPrefabSourceGraph,
} from "./unityPrefabRuntime";
import { inferBodyAnimationKind } from "./runtimeMotion";
import {
  AnimationPlaybackRuntime,
  type AnimationPlaybackSnapshot as RuntimeAnimationPlaybackSnapshot,
  type BodyAnimationSelection as RuntimeBodyAnimationSelection,
} from "./animationPlaybackRuntime";
import {
  FaceMotionRuntime,
  readEmbeddedRuntimeFaceMotion,
  type FaceMotionClip as RuntimeFaceMotionClip,
  type FaceMotionCurve as RuntimeFaceMotionCurve,
  type FaceMotionKeyframe as RuntimeFaceMotionKeyframe,
  type FaceMotionPlaybackSnapshot as RuntimeFaceMotionPlaybackSnapshot,
  type FaceMotionSet as RuntimeFaceMotionSet,
  type RuntimeHeadMorphDebug as FaceRuntimeHeadMorphDebug,
} from "./faceMotionRuntime";
import {
  bindBodyRuntimeMaterials,
  getSekaiPreviewRimDirection,
  normalizeMeshSlotName,
  type RuntimeMaterialDebug,
} from "./characterMaterialRuntime";
import {
  bindHeadRuntimeMaterials,
  type CharacterEyeMaterialController,
} from "./headMaterialRuntime";
import {
  CharacterLightingRuntime,
  type BodyDebugMode,
  type FaceSdfDebugLightMode,
  type FaceSdfDebugMode,
  type HairShadowMode,
  type RenderIsolationMode,
} from "./characterLightingRuntime";

export type {
  BodyDebugMode,
  FaceSdfDebugLightMode,
  FaceSdfDebugMode,
  HairShadowMode,
  RenderIsolationMode,
} from "./characterLightingRuntime";

export type {
  PjskCameraProfile,
  PjskCameraPreset,
  RuntimeCameraDebug,
} from "./cameraRuntime";
export {
  defaultProjectedShadowSettings,
} from "./projectedShadow";
export type {
  AnimationTrackDebug,
  BodyAnimationKind,
} from "./runtimeMotion";
export type { RuntimeMaterialDebug } from "./characterMaterialRuntime";
export type {
  ProjectedShadowSettings,
  ProjectedShadowSettingsInput,
  RuntimeProjectedShadowDebug,
} from "./projectedShadow";
const SEKAI_OUTLINE_RECONSTRUCTION_DISTANCE_NEAR = 2.0;
const SEKAI_OUTLINE_RECONSTRUCTION_DISTANCE_FAR = 6.0;
const SEKAI_OUTLINE_RECONSTRUCTION_WIDTH_MIN_SCALE = 0.01 / 0.255;
const SEKAI_OUTLINE_RECONSTRUCTION_WIDTH_MAX_SCALE = 0.6 / 0.255;
const COSTUME_SHOP_BODY_VALUE_SHADOW_INFLUENCE = 1.0;
const COSTUME_SHOP_DIRECTIONAL_LIGHT_ROTATION_DEGREES = new THREE.Vector3(
  sekaiCostumeShopDirectionalLightRotationDegrees.x,
  sekaiCostumeShopDirectionalLightRotationDegrees.y,
  sekaiCostumeShopDirectionalLightRotationDegrees.z
);
const COSTUME_SHOP_FACE_SHADOW_LIGHT_DIRECTION = new THREE.Vector3(
  sekaiCostumeShopDirectionalLightDirection.x,
  sekaiCostumeShopDirectionalLightDirection.y,
  sekaiCostumeShopDirectionalLightDirection.z
).normalize();
const COSTUME_SHOP_USE_FACE_SHADOW_LIMITER = true;
const COSTUME_SHOP_FACE_SHADOW_LIMIT_RANGE = 0;
const FACE_SHADOW_HORIZONTAL_EPSILON = 0.00001;

type SpringRuntimeController = UnityPrefabSpringRuntime;
export type SpringTimelineControlState = SpringTimelineControl;

export type PjskPresentationMode = "interactive" | "capture";

export type HarukiCameraControls = {
  readonly target: THREE.Vector3;
  readonly minPolarAngle: number;
  readonly maxPolarAngle: number;
  update(): void;
  dispose(): void;
};

export type HarukiCameraControlsFactory = (options: {
  camera: THREE.PerspectiveCamera;
  canvas: HTMLCanvasElement;
  target: THREE.Vector3;
  onChange: (target: THREE.Vector3) => void;
}) => HarukiCameraControls;

export type PjskEngineOptions = {
  container?: HTMLElement;
  canvas?: HTMLCanvasElement;
  initialLight: PreviewLightState;
  presentationMode?: PjskPresentationMode;
  cameraPreset?: PjskCameraPreset;
  cameraProfile?: PjskCameraProfile;
  autoRender?: boolean;
  manageResize?: boolean;
  controlsFactory?: HarukiCameraControlsFactory;
};

export type PjskViewerEngineOptions = PjskEngineOptions;
export type Haruki3DEngineOptions = PjskEngineOptions;

export type HarukiRuntimePackageRequest = RuntimePackageLoadOptions & {
  baseUrl: string;
  applyDefaultAnimation?: boolean;
  applyFaceMotion?: boolean;
};

export type HarukiRenderResult = {
  selection: CustomPartSelection;
  combinedCharacter: RuntimeCombinedCharacterAsset;
};

export type HarukiEngineSnapshots = {
  animation: AnimationPlaybackSnapshot;
  faceMotion: FaceMotionPlaybackSnapshot;
  springBone: SpringBoneRuntimeSnapshot;
  camera: RuntimeCameraDebug;
  runtimeDebug: RuntimeDebugSnapshot;
  utjSpringBoneTrace?: UtjSpringBoneTraceSnapshot | null;
};

export type RuntimePartImportMode = "unity-runtime";
export type CompositionMode = "pending" | "model_combine_setup";

export type PartImportStatus = {
  assetId: string;
  displayName: string;
  sourceMode: RuntimePartImportMode;
  requestedUrl: string;
  meshCount: number;
  boneCount: number;
  skinnedMeshCount: number;
};

export type CompositionStatus = {
  mode: CompositionMode;
  missingBodyBones: string[];
  missingHeadBones: string[];
};

export type BodyAnimationSelection = RuntimeBodyAnimationSelection;
export type AnimationPlaybackSnapshot = RuntimeAnimationPlaybackSnapshot;

export type RuntimeHeadMorphDebug = FaceRuntimeHeadMorphDebug;

export type RuntimeOutlineShellDebug = {
  meshName: string;
  outlineName: string;
  sourceMaterialKind: string | null;
  sourceMaterialKinds: string[];
  sourceMaterialNames: string[];
  hasVertexColor: boolean;
  vertexColorRedMax: number | null;
  renderOrder: number;
  sourceRenderOrder: number;
};

export type RuntimeFaceLightDebug = {
  lightDirection: { x: number; y: number; z: number };
  previewLightDirection: { x: number; y: number; z: number };
  costumeShopLightRotationDegrees: { x: number; y: number; z: number };
  faceRightWorld: { x: number; y: number; z: number };
  faceUpWorld: { x: number; y: number; z: number };
  faceForwardWorld: { x: number; y: number; z: number };
  headHorizontalFromUp: { x: number; y: number };
  headHorizontalFromRight: { x: number; y: number };
  headHorizontalFromForward: { x: number; y: number };
  lightHorizontal: { x: number; y: number };
  headDotDirectionalLight: { x: number; y: number };
  faceTbnLight: { x: number; y: number; z: number };
  faceLight: { side: number; front: number };
  faceSdfLimit: number;
  headYawDegrees: number;
  lightYawDegrees: number;
};

export type RuntimeDebugSnapshot = {
  materialBindingMode: "manifest";
  hairShadowMode: HairShadowMode;
  hairShadowOffset: { x: number; y: number; z: number };
  hairShadowWorldPosition: { x: number; y: number; z: number };
  funit: RuntimeFUnitDebug;
  body: RuntimeMaterialDebug[];
  head: RuntimeMaterialDebug[];
  headMaterialSlots: Array<{
    meshName: string;
    slotIndex: number;
    materialKey: string;
    materialName?: string;
    materialKind?: string;
    isAccessory?: boolean;
    valueTex?: string;
  }>;
  headMorphs: RuntimeHeadMorphDebug[];
  outlineShells: RuntimeOutlineShellDebug[];
  camera?: RuntimeCameraDebug;
  faceLight?: RuntimeFaceLightDebug;
  projectedShadow?: RuntimeProjectedShadowDebug;
  constraints?: RuntimeConstraintDebug | null;
};

export type RuntimeFUnitDebug = {
  present: boolean;
  scriptCount: number;
  springManagerCount: number;
  springBoneCount: number;
  sphereColliderCount: number;
  capsuleColliderCount: number;
  panelColliderCount: number;
  detectedScripts: string[];
  policy: string;
};

export type SpringBoneRuntimeSnapshot = {
  present: boolean;
  runtimePresent: boolean;
  active: boolean;
  bodyManagerCount: number;
  bodySpringBoneCount: number;
  bodyExtraBoneCount: number;
  bodySphereColliderCount: number;
  bodyCapsuleColliderCount: number;
  bodyPanelColliderCount: number;
  headManagerCount: number;
  headSpringBoneCount: number;
  headExtraBoneCount: number;
  headSphereColliderCount: number;
  headCapsuleColliderCount: number;
  headPanelColliderCount: number;
  characterHairPresent: boolean;
  characterEyePresent: boolean;
  vrmSpringBoneManagerPresent: boolean;
  utjRuntime?: UtjSpringBoneRuntimeSnapshot | null;
  source: "PJSK_sekai_runtime" | "none";
};

type CombinedCharacterImportOptions = {
  preserveAnimation?: boolean;
  disposeBeforeLoad?: boolean;
  clearAnimationCache?: boolean;
};

export type FaceMotionKeyframe = RuntimeFaceMotionKeyframe;
export type FaceMotionCurve = RuntimeFaceMotionCurve;
export type FaceMotionClip = RuntimeFaceMotionClip;
export type FaceMotionSet = RuntimeFaceMotionSet;
export type FaceMotionPlaybackSnapshot = RuntimeFaceMotionPlaybackSnapshot;

export type PartImportSnapshot = {
  revision: number;
  body: PartImportStatus;
  head: PartImportStatus;
  composition: CompositionStatus;
};

type LoadedPartResult = {
  root: THREE.Group;
  sourceMode: RuntimePartImportMode;
  requestedUrl: string;
  meshCount: number;
  boneCount: number;
  skinnedMeshCount: number;
  prefabSourceGraph: UnityPrefabSourceGraph;
};

type CharacterHairMaterialController = {
  offset: THREE.Vector3;
  headTransformName: string | null;
  headTransformPath: string | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function countArray(value: unknown) {
  return Array.isArray(value) ? value.length : 0;
}

function summarizeSpringBonePart(value: unknown) {
  const part = asRecord(value);
  return {
    managers: countArray(part.managers ?? part.Managers),
    bones: countArray(part.bones ?? part.Bones),
    extraBones: countArray(part.extraBones ?? part.ExtraBones),
    sphereColliders: countArray(part.sphereColliders ?? part.SphereColliders),
    capsuleColliders: countArray(part.capsuleColliders ?? part.CapsuleColliders),
    panelColliders: countArray(part.panelColliders ?? part.PanelColliders),
    characterHairPresent: Boolean(part.characterHair ?? part.CharacterHair),
    characterEyePresent: Boolean(part.characterEye ?? part.CharacterEye),
  };
}

function summarizeSpringBoneMetadata(
  runtimeExtension: unknown,
  vrmSpringBoneManagerPresent: boolean,
  utjRuntime: UtjSpringBoneRuntimeSnapshot | null
): SpringBoneRuntimeSnapshot {
  const extension = asRecord(runtimeExtension);
  const payload = asRecord(extension.pjskSpringBone ?? extension.PjskSpringBone);
  const raw = asRecord(payload.raw ?? payload.Raw);
  const body = summarizeSpringBonePart(raw.body ?? raw.Body);
  const head = summarizeSpringBonePart(raw.head ?? raw.Head);
  const present = Boolean(raw.body ?? raw.Body ?? raw.head ?? raw.Head);
  const runtimePresent = Boolean(utjRuntime);
  const active = Boolean(utjRuntime?.enabled);
  return {
    present,
    runtimePresent,
    active,
    bodyManagerCount: body.managers,
    bodySpringBoneCount: body.bones,
    bodyExtraBoneCount: body.extraBones,
    bodySphereColliderCount: body.sphereColliders,
    bodyCapsuleColliderCount: body.capsuleColliders,
    bodyPanelColliderCount: body.panelColliders,
    headManagerCount: head.managers,
    headSpringBoneCount: head.bones,
    headExtraBoneCount: head.extraBones,
    headSphereColliderCount: head.sphereColliders,
    headCapsuleColliderCount: head.capsuleColliders,
    headPanelColliderCount: head.panelColliders,
    characterHairPresent: head.characterHairPresent,
    characterEyePresent: head.characterEyePresent,
    vrmSpringBoneManagerPresent,
    utjRuntime,
    source: present ? "PJSK_sekai_runtime" : "none",
  };
}

function collectMaterialTextures(
  value: unknown,
  textures: Set<THREE.Texture>,
  seen: Set<unknown> = new Set()
) {
  if (!value || typeof value !== "object" || seen.has(value)) {
    return;
  }
  seen.add(value);
  if (value instanceof THREE.Texture) {
    textures.add(value);
    return;
  }
  if (
    value instanceof THREE.Color ||
    value instanceof THREE.Vector2 ||
    value instanceof THREE.Vector3 ||
    value instanceof THREE.Vector4 ||
    value instanceof THREE.Matrix3 ||
    value instanceof THREE.Matrix4 ||
    ArrayBuffer.isView(value) ||
    value instanceof ArrayBuffer
  ) {
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectMaterialTextures(item, textures, seen);
    }
    return;
  }
  for (const item of Object.values(value as Record<string, unknown>)) {
    collectMaterialTextures(item, textures, seen);
  }
}

function disposeMaterial(
  material: THREE.Material | THREE.Material[],
  disposeTextures = true,
  preservedMaterials: ReadonlySet<THREE.Material> = new Set(),
  disposedTextures: Set<THREE.Texture> = new Set()
) {
  const materials = Array.isArray(material) ? material : [material];
  for (const item of materials) {
    if (preservedMaterials.has(item)) {
      continue;
    }
    if (disposeTextures) {
      const textures = new Set<THREE.Texture>();
      collectMaterialTextures(item, textures);
      for (const texture of textures) {
        if (!disposedTextures.has(texture)) {
          texture.dispose();
          disposedTextures.add(texture);
        }
      }
    }
    item.dispose();
  }
}

function disposeObjectResources(
  root: THREE.Object3D,
  preservedMaterials: ReadonlySet<THREE.Material> = new Set()
) {
  const disposedGeometries = new Set<THREE.BufferGeometry>();
  const disposedTextures = new Set<THREE.Texture>();
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) {
      return;
    }
    if (
      mesh.geometry &&
      !mesh.userData.pjskOutlineShell &&
      !disposedGeometries.has(mesh.geometry)
    ) {
      mesh.geometry.dispose();
      disposedGeometries.add(mesh.geometry);
    }
    if (mesh.material) {
      disposeMaterial(mesh.material, true, preservedMaterials, disposedTextures);
    }
  });
}

function clearGroup(
  group: THREE.Group,
  preservedMaterials: ReadonlySet<THREE.Material> = new Set()
) {
  for (const child of [...group.children]) {
    disposeObjectResources(child, preservedMaterials);
    group.remove(child);
  }
}

function getVertexColorRedMax(geometry: THREE.BufferGeometry) {
  const color = geometry.getAttribute("color");
  if (!color) {
    return null;
  }

  let max = 0;
  for (let index = 0; index < color.count; index += 1) {
    max = Math.max(max, color.getX(index));
    if (max > 0.01) {
      return max;
    }
  }
  return max;
}

function isFaceLayerMaterialKind(kind: unknown) {
  return kind === "eyelash" ||
    kind === "eyebrow" ||
    kind === "eye" ||
    kind === "eyelight";
}

function getOutlineSourceMaterialKinds(mesh: THREE.Mesh) {
  const kinds = new Set<string>();
  if (typeof mesh.userData.pjskMaterialKind === "string") {
    kinds.add(mesh.userData.pjskMaterialKind);
  }
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const material of materials) {
    if (typeof material?.userData.pjskMaterialKind === "string") {
      kinds.add(material.userData.pjskMaterialKind);
    }
  }
  const materialNames = materials.map((material) => material.name.toLowerCase());
  const meshName = mesh.name.toLowerCase();
  if (
    normalizeMeshSlotName(mesh.name) === "acc" ||
    meshName.includes("/acc") ||
    materialNames.some((name) => name.includes("_acc") || name.startsWith("mtl_acc"))
  ) {
    kinds.add("accessory");
  }
  return [...kinds];
}

function chooseOutlineSourceMaterialKind(kinds: string[]) {
  return kinds.find((kind) => !isFaceLayerMaterialKind(kind)) ?? kinds[0] ?? null;
}

function shouldSkipOutlineMaterialKinds(kinds: unknown[]) {
  return kinds.length > 0 && kinds.every(isFaceLayerMaterialKind);
}

function createSekaiOutlineMaterial(
  useVertexColor: boolean,
  lighting?: MaterialLightingSettings,
  useSecondNormal = false
) {
  const sourceOutlineWidth = lighting?.outlineWidth && lighting.outlineWidth > 0
    ? lighting.outlineWidth
    : 0.001;
  const outlineWidthMin = sourceOutlineWidth * SEKAI_OUTLINE_RECONSTRUCTION_WIDTH_MIN_SCALE;
  const outlineWidthMax = sourceOutlineWidth * SEKAI_OUTLINE_RECONSTRUCTION_WIDTH_MAX_SCALE;
  const outlineClipOffset = THREE.MathUtils.clamp(lighting?.outlineOffset ?? 0, 0, 20) * 0.00008;
  const outlineColor = new THREE.Color("#000000");
  const material = new THREE.MeshBasicMaterial({
    color: outlineColor,
    side: THREE.BackSide,
    transparent: false,
    opacity: 1,
    depthWrite: true,
    depthTest: true,
    blending: THREE.NoBlending,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
    vertexColors: useVertexColor,
  });
  material.name = "pjsk_shell_outline";
  material.userData.pjskBaseOutlineColor = `#${outlineColor.getHexString()}`;
  material.userData.pjskBaseOutlineOpacity = 1;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSekaiOutlineWidth = {
      value: new THREE.Vector2(outlineWidthMin, outlineWidthMax),
    };
    shader.uniforms.uSekaiOutlineFactor = {
      value: new THREE.Vector3(
        SEKAI_OUTLINE_RECONSTRUCTION_DISTANCE_NEAR,
        1 / (SEKAI_OUTLINE_RECONSTRUCTION_DISTANCE_FAR - SEKAI_OUTLINE_RECONSTRUCTION_DISTANCE_NEAR),
        1
      ),
    };
    shader.uniforms.uOutlineClipOffset = { value: outlineClipOffset };
    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      [
        "#include <common>",
        "uniform vec2 uSekaiOutlineWidth;",
        "uniform vec3 uSekaiOutlineFactor;",
        "uniform float uOutlineClipOffset;",
        useSecondNormal ? "attribute vec4 tangent;" : "",
      ].join("\n")
    );
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      [
        "#include <begin_vertex>",
        "vec4 outlineViewPosition = modelViewMatrix * vec4(position, 1.0);",
        "float outlineFovDistance = (2.41400003 / projectionMatrix[1][1]) * max(-outlineViewPosition.z, 0.001) * uSekaiOutlineFactor.z;",
        "float distanceFovFactor = clamp((outlineFovDistance - uSekaiOutlineFactor.x) * uSekaiOutlineFactor.y, 0.0, 1.0);",
        "float outlineWidth = mix(uSekaiOutlineWidth.x, uSekaiOutlineWidth.y, distanceFovFactor);",
        useSecondNormal
          ? "vec3 outlineDirection = normalize(tangent.xyz);"
          : "vec3 outlineDirection = objectNormal;",
        "#ifdef USE_COLOR",
        "float outlineMask = clamp(color.r, 0.0, 1.0);",
        "float outlineScale = outlineMask;",
        "#else",
        "float outlineScale = 1.0;",
        "#endif",
        "transformed += outlineDirection * outlineWidth * outlineScale;",
      ].join("\n")
    );
    shader.vertexShader = shader.vertexShader.replace(
      "#include <project_vertex>",
      [
        "#include <project_vertex>",
        "gl_Position.z += gl_Position.w * uOutlineClipOffset;",
      ].join("\n")
    );
    shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", "");
  };
  return material;
}

function normalizeFaceShadowHorizontal(
  target: THREE.Vector2,
  x: number,
  z: number,
  fallbackX = 0,
  fallbackY = 1
) {
  const length = Math.hypot(x, z);
  if (length <= FACE_SHADOW_HORIZONTAL_EPSILON) {
    return target.set(fallbackX, fallbackY);
  }
  return target.set(x / length, z / length);
}

function faceShadowYawRangeFactor(headYawDegrees: number, lightYawDegrees: number) {
  const delta = Math.abs(lightYawDegrees - headYawDegrees);
  return THREE.MathUtils.clamp(1.0 - Math.abs(delta - 180.0) / 180.0, 0.0, 1.0);
}

function asRuntimeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function readRuntimeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readRuntimeColor(value: unknown) {
  const record = asRuntimeRecord(value);
  const r = readRuntimeNumber(record.r ?? record.R);
  const g = readRuntimeNumber(record.g ?? record.G);
  const b = readRuntimeNumber(record.b ?? record.B);
  if (r === null || g === null || b === null) {
    return null;
  }
  return `#${new THREE.Color(r, g, b).getHexString()}`;
}

function readRuntimeTiling(value: unknown, enabled = true): SekaiLayerAtlas | null {
  const record = asRuntimeRecord(value);
  const tileX = readRuntimeNumber(record.tileX ?? record.TileX);
  const tileY = readRuntimeNumber(record.tileY ?? record.TileY);
  const sample = readRuntimeNumber(record.sample ?? record.Sample);
  return tileX && tileY && sample !== null
    ? { tileX, tileY, sample, enabled }
    : null;
}

function readCharacterEyeMaterialController(
  runtimeExtension: unknown
): CharacterEyeMaterialController | null {
  const extension = asRuntimeRecord(runtimeExtension);
  const controllers = asRuntimeRecord(
    extension.characterControllers ?? extension.CharacterControllers
  );
  const eye = asRuntimeRecord(controllers.eye ?? controllers.Eye);
  if (!Object.keys(eye).length) {
    return null;
  }
  return {
    lightInfluence: readRuntimeNumber(eye.lightInfluence ?? eye.LightInfluence),
    lightInfluenceForEyeHighlight: readRuntimeNumber(
      eye.lightInfluenceForEyeHighlight ?? eye.LightInfluenceForEyeHighlight
    ),
    tintColor: readRuntimeColor(eye.tintColor ?? eye.TintColor),
    emissionColor: readRuntimeColor(eye.emissionColor ?? eye.EmissionColor),
    baseTiling: readRuntimeTiling(eye.baseTiling ?? eye.BaseTiling),
    highlightTiling: readRuntimeTiling(eye.highlightTiling ?? eye.HighlightTiling),
  };
}

function readRuntimeFUnitDebug(extension: unknown): RuntimeFUnitDebug {
  const payload = asRuntimeRecord(extension);
  const springBone = asRuntimeRecord(payload.pjskSpringBone ?? payload.PjskSpringBone);
  const setup = asRuntimeRecord(
    payload.runtimeUnitySetup ?? payload.RuntimeUnitySetup ??
      springBone.runtimeUnitySetup ?? springBone.RuntimeUnitySetup
  );
  const funit = asRuntimeRecord(
    payload.funit ?? payload.FUnit ??
      springBone.funit ?? springBone.FUnit ??
      setup.funit ?? setup.FUnit
  );
  const detectedScriptsValue = funit.detectedScripts ?? funit.DetectedScripts;
  const detectedScripts = Array.isArray(detectedScriptsValue)
    ? (detectedScriptsValue as unknown[])
        .filter((value): value is string => typeof value === "string")
    : [];
  const readCount = (camel: string, pascal: string) =>
    Math.max(Math.trunc(readRuntimeNumber(funit[camel] ?? funit[pascal]) ?? 0), 0);
  return {
    present: Boolean(funit.present ?? funit.Present),
    scriptCount: readCount("scriptCount", "ScriptCount"),
    springManagerCount: readCount("springManagerCount", "SpringManagerCount"),
    springBoneCount: readCount("springBoneCount", "SpringBoneCount"),
    sphereColliderCount: readCount("sphereColliderCount", "SphereColliderCount"),
    capsuleColliderCount: readCount("capsuleColliderCount", "CapsuleColliderCount"),
    panelColliderCount: readCount("panelColliderCount", "PanelColliderCount"),
    detectedScripts,
    policy: typeof (funit.policy ?? funit.Policy) === "string"
      ? String(funit.policy ?? funit.Policy)
      : "metadata_only; do not merge with UTJ/Sekai SpringBone runtime",
  };
}

function readCharacterHairMaterialController(
  runtimeExtension: unknown
): CharacterHairMaterialController | null {
  const extension = asRuntimeRecord(runtimeExtension);
  const controllers = asRuntimeRecord(
    extension.characterControllers ?? extension.CharacterControllers
  );
  const hair = asRuntimeRecord(controllers.hair ?? controllers.Hair);
  if (!Object.keys(hair).length) {
    return null;
  }
  const headTransform = asRuntimeRecord(hair.headTransform ?? hair.HeadTransform);
  return {
    offset: readUnityVector3(
      (hair.offset ?? hair.Offset) as UnityVectorLike | undefined,
      new THREE.Vector3()
    ),
    headTransformName: typeof (headTransform.name ?? headTransform.Name) === "string"
      ? String(headTransform.name ?? headTransform.Name)
      : null,
    headTransformPath: typeof (headTransform.transformPath ?? headTransform.TransformPath) === "string"
      ? String(headTransform.transformPath ?? headTransform.TransformPath)
      : null,
  };
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

function vectorDebugSnapshot(vector: THREE.Vector3) {
  return {
    x: Number(vector.x.toFixed(5)),
    y: Number(vector.y.toFixed(5)),
    z: Number(vector.z.toFixed(5)),
  };
}

function parseRuntimeRoleId(roleId: string): { characterId: number; unit: string | null } {
  const [rawCharacterId, ...unitParts] = roleId.split(":");
  const characterId = Number(rawCharacterId);
  if (!Number.isInteger(characterId) || characterId <= 0) {
    throw new Error(`Invalid roleId ${roleId}: expected "<characterId>:<unit>".`);
  }
  const unit = unitParts.length > 0
    ? unitParts.join(":").trim() || null
    : null;
  return { characterId, unit };
}

export class Haruki3DEngine {
  private readonly container: HTMLElement | null;
  private readonly ownsCanvas: boolean;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly controls: HarukiCameraControls | null;
  private readonly cameraTarget = new THREE.Vector3();
  private readonly autoRender: boolean;
  private readonly manageResize: boolean;
  private readonly clock = new THREE.Clock();
  private readonly directionalLight: THREE.DirectionalLight;
  private readonly fillLight: THREE.AmbientLight;
  private readonly textureLoader: THREE.TextureLoader;
  private readonly bodyMaterial: THREE.ShaderMaterial;
  private readonly hairMaterial: THREE.ShaderMaterial;
  private readonly faceMaterial: THREE.ShaderMaterial;
  private readonly characterLighting: CharacterLightingRuntime;
  private readonly projectedShadow: CharacterProjectedShadowController;
  private readonly characterRoot: THREE.Group;
  private readonly bodySlot: THREE.Group;
  private readonly headSlot: THREE.Group;
  private readonly sceneReference = new THREE.Group();
  private capturePresentationEnabled = false;
  private captureBackgroundTexture: THREE.CanvasTexture | null = null;
  private animationFrame = 0;
  private importRevision = 0;
  private customSelectionQueue: Promise<unknown> = Promise.resolve();
  private currentBodyAsset: BodyAssetManifest | null = null;
  private currentHeadAsset: HeadAssetManifest | null = null;
  private currentImportSnapshot: PartImportSnapshot | null = null;
  private currentBodyAttachNode: THREE.Object3D | null = null;
  private currentHeadAttachOriginNode: THREE.Object3D | null = null;
  private currentCompositionStatus: CompositionStatus = {
    mode: "pending",
    missingBodyBones: [],
    missingHeadBones: [],
  };
  private currentBodyAnimationRoot: THREE.Object3D | null = null;
  private readonly faceMotion = new FaceMotionRuntime();
  private readonly animationPlayback: AnimationPlaybackRuntime;
  private currentRuntimeExtension: unknown = null;
  private currentSpringRuntime: SpringRuntimeController | null = null;
  private currentExtraBoneRuntime: SekaiExtraBoneRuntime | null = null;
  private currentConstraintRuntime: UnityConstraintRuntime | null = null;
  private currentSpringTimelineControl: SpringTimelineControlState | null = null;
  private currentPrefabSourceGraph: UnityPrefabSourceGraph | null = null;
  private currentPrefabHeadFollowDebug: PrefabHeadFollowDebug = {
    active: false,
    sourcePath: null,
    targetPath: null,
    reason: null,
  };
  private springRuntimeMode: SpringRuntimeMode = "unity-prefab";
  private characterHeight = 1;
  private readonly tempMatrixA = new THREE.Matrix4();
  private readonly tempMatrixB = new THREE.Matrix4();
  private readonly tempVector = new THREE.Vector3();
  private readonly tempVectorB = new THREE.Vector3();
  private readonly tempQuaternion = new THREE.Quaternion();
  private readonly tempScale = new THREE.Vector3();
  private readonly faceRightWorld = new THREE.Vector3();
  private readonly faceUpWorld = new THREE.Vector3();
  private readonly faceForwardWorld = new THREE.Vector3();
  private readonly faceHeadWorldPosition = new THREE.Vector3();
  private readonly faceShadowHeadHorizontal = new THREE.Vector2();
  private readonly faceShadowLightHorizontal = new THREE.Vector2();
  private readonly headDotDirectionalLight = new THREE.Vector2();
  private readonly hairHeadPosition = new THREE.Vector3();
  private currentHairOffset = new THREE.Vector3();
  private currentHairHeadTransform: THREE.Object3D | null = null;
  private currentCameraPreset: PjskCameraPreset = "default";
  private currentCameraProfile: PjskCameraProfile | null = null;
  private cameraDebugChangeCallback: (() => void) | null = null;
  private currentLoadedRuntimePackage: RuntimePackageLoadResult | null = null;
  private lastNativeMeshInstallDiagnostics: NativeMeshInstallDiagnostics | null = null;
  private lastConstraintSetupDiagnostics: RuntimeConstraintDebug | null = null;
  private readonly runtimeDebug: RuntimeDebugSnapshot = {
    materialBindingMode: "manifest",
    hairShadowMode: "sekai_head_position",
    hairShadowOffset: vectorDebugSnapshot(this.currentHairOffset),
    hairShadowWorldPosition: vectorDebugSnapshot(this.hairHeadPosition),
    funit: readRuntimeFUnitDebug(null),
    body: [],
    head: [],
    headMaterialSlots: [],
    headMorphs: [],
    outlineShells: [],
  };

  constructor(
    containerOrOptions: HTMLElement | PjskEngineOptions,
    initialLight?: PreviewLightState
  ) {
    const options =
      containerOrOptions instanceof HTMLElement
        ? { container: containerOrOptions, initialLight: initialLight! }
        : containerOrOptions;
    if (!options.initialLight) {
      throw new Error("Missing initial light state for Haruki 3D engine.");
    }
    const light = options.initialLight;
    if (!options.container && !options.canvas) {
      throw new Error("Haruki 3D engine requires a container or canvas.");
    }
    this.animationPlayback = new AnimationPlaybackRuntime({
      onLoopPromoted: () => this.faceMotion.promoteLoop(),
    });
    this.container = options.container ?? null;
    this.ownsCanvas = options.canvas === undefined;
    this.autoRender = options.autoRender ?? true;
    this.manageResize = options.manageResize ?? options.canvas === undefined;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#7f8d95");
    this.scene.fog = new THREE.Fog("#7f8d95", 5.5, 15);

    const viewport = options.canvas ?? options.container!;
    const viewportMinimum = this.ownsCanvas ? 320 : 1;
    const width = Math.max(viewport.clientWidth, viewportMinimum);
    const height = Math.max(viewport.clientHeight, viewportMinimum);
    const initialCameraPose = getDefaultCameraPose(light.characterHeight);
    this.camera = new THREE.PerspectiveCamera(initialCameraPose.fov, width / height, 0.1, 100);
    this.camera.position.copy(initialCameraPose.position);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      stencil: true,
      canvas: options.canvas,
    });
    this.renderer.autoClearStencil = true;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height, this.ownsCanvas);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    if (this.container && this.renderer.domElement.parentElement !== this.container) {
      this.container.appendChild(this.renderer.domElement);
    }
    this.updateCaptureBackgroundTexture();

    this.cameraTarget.copy(initialCameraPose.target);
    if (options.controlsFactory) {
      this.controls = options.controlsFactory({
        camera: this.camera,
        canvas: this.renderer.domElement,
        target: this.cameraTarget,
        onChange: (target) => {
          this.cameraTarget.copy(target);
          this.cameraDebugChangeCallback?.();
        },
      });
      this.controls.update();
    } else {
      this.controls = null;
      this.camera.lookAt(this.cameraTarget);
    }

    this.directionalLight = new THREE.DirectionalLight(
      "#fffaf2",
      light.intensity
    );
    this.directionalLight.position.set(
      light.x,
      light.y,
      light.z
    );
    this.scene.add(this.directionalLight);

    this.fillLight = new THREE.AmbientLight("#fff8f0", light.ambient);
    this.scene.add(this.fillLight);
    this.textureLoader = new THREE.TextureLoader();

    this.bodyMaterial = createSekaiBodyMaterial({
      baseColor: "#f5d6d0",
      shadowColor: "#c79b95",
      lightDirection: this.directionalLight.position.clone(),
      lightIntensity: light.intensity,
      ambientIntensity: light.ambient,
      shadowThreshold: light.shadowThreshold,
      shadowWeight: light.shadowWeight,
      valueShadowInfluence: COSTUME_SHOP_BODY_VALUE_SHADOW_INFLUENCE,
      characterAmbientIntensity: light.characterAmbient,
      rimIntensity: light.rimIntensity,
      controllerRimThreshold: light.rimThreshold,
      rimDirectionality: light.rimDirectionality,
      rimDirection: getSekaiPreviewRimDirection(),
      skinTintEnabled: true,
    });
    this.hairMaterial = createSekaiBodyMaterial({
      baseColor: "#7b5b4a",
      shadowColor: "#513d33",
      lightDirection: this.directionalLight.position.clone(),
      lightIntensity: light.intensity,
      ambientIntensity: light.ambient,
      shadowThreshold: light.shadowThreshold,
      shadowWeight: light.shadowWeight,
      valueShadowInfluence: COSTUME_SHOP_BODY_VALUE_SHADOW_INFLUENCE,
      characterAmbientIntensity: light.characterAmbient,
      rimIntensity: light.rimIntensity,
      controllerRimThreshold: light.rimThreshold,
      rimDirectionality: light.rimDirectionality,
      rimDirection: getSekaiPreviewRimDirection(),
      skinTintEnabled: false,
      hairShadowEnabled: false,
      useLambert: true,
      headPosition: this.hairHeadPosition,
    });
    this.faceMaterial = createSekaiFaceMaterial({
      baseColor: "#ffe4dc",
      warmColor: "#ffd4c8",
      lightDirection: COSTUME_SHOP_FACE_SHADOW_LIGHT_DIRECTION.clone(),
      lightIntensity: light.intensity,
      ambientIntensity: light.ambient,
      headDotDirectionalLight: this.headDotDirectionalLight,
      useFaceShadowLimiter: COSTUME_SHOP_USE_FACE_SHADOW_LIMITER,
      faceShadowLimitRange: COSTUME_SHOP_FACE_SHADOW_LIMIT_RANGE,
      shadowThreshold: light.shadowThreshold,
      shadowWeight: light.shadowWeight,
      useLambert: true,
    });

    this.characterRoot = new THREE.Group();
    this.bodySlot = new THREE.Group();
    this.headSlot = new THREE.Group();
    this.characterRoot.add(this.bodySlot);
    this.characterRoot.add(this.headSlot);
    this.characterLighting = new CharacterLightingRuntime({
      bodyMaterial: this.bodyMaterial,
      hairMaterial: this.hairMaterial,
      faceMaterial: this.faceMaterial,
      bodySlot: this.bodySlot,
      headSlot: this.headSlot,
      directionalLight: this.directionalLight,
      fillLight: this.fillLight,
      debug: this.runtimeDebug,
      valueShadowInfluence: COSTUME_SHOP_BODY_VALUE_SHADOW_INFLUENCE,
    });
    this.applyCharacterHeight(light.characterHeight);
    this.scene.add(this.characterRoot);
    this.projectedShadow = new CharacterProjectedShadowController();
    this.scene.add(this.projectedShadow.group);
    this.setPresentationMode(options.presentationMode ?? "interactive");
    this.applyCameraPreset(options.cameraPreset ?? "default", options.cameraProfile);

    this.handleResize = this.handleResize.bind(this);
    if (this.manageResize) {
      window.addEventListener("resize", this.handleResize);
      this.handleResize();
    }
    if (this.autoRender) {
      this.render();
    }
  }

  async importCombinedCharacter(
    characterAsset: RuntimeCombinedCharacterAsset,
    options: CombinedCharacterImportOptions = {}
  ): Promise<PartImportSnapshot> {
    const revision = ++this.importRevision;
    const preservedAnimation = options.preserveAnimation
      ? this.animationPlayback.capturePosition()
      : null;
    if (options.disposeBeforeLoad) {
      this.releaseCurrentCharacterResources({
        preserveAnimationSelection: options.preserveAnimation ?? false,
        clearAnimationCache: options.clearAnimationCache ?? false,
      });
    }
    this.runtimeDebug.outlineShells = [];
    this.lastNativeMeshInstallDiagnostics = null;
    this.currentBodyAsset = characterAsset.bodyAsset;
    this.currentHeadAsset = characterAsset.headAsset;
    this.lastConstraintSetupDiagnostics = null;
    this.applyCharacterHeight(characterAsset.bodyAsset.characterHeightMeters ?? this.characterHeight);
    const loaded = await this.loadCombinedCharacterAsset(characterAsset);

    if (revision !== this.importRevision) {
      return {
        revision,
        body: this.makeImportStatus(characterAsset.bodyAsset, loaded),
        head: this.makeImportStatus(characterAsset.headAsset, loaded),
        composition: this.currentCompositionStatus,
      };
    }

    this.clearCharacterSlot(this.bodySlot);
    this.clearCharacterSlot(this.headSlot);
    this.resetSlotParents();
    this.currentRuntimeExtension = characterAsset.runtimeExtension;
    this.currentSpringRuntime = null;
    this.currentExtraBoneRuntime = null;
    this.currentConstraintRuntime = null;
    this.currentBodyAttachNode = null;
    this.currentHeadAttachOriginNode = null;
    this.runtimeDebug.headMorphs = [];
    this.faceMotion.release({ preserveMotion: true });
    this.currentBodyAnimationRoot = null;
    this.currentPrefabSourceGraph = null;
    this.currentHairHeadTransform = null;
    this.currentPrefabHeadFollowDebug = {
      active: false,
      sourcePath: null,
      targetPath: null,
      reason: "not initialized",
    };

    this.bodySlot.add(loaded.root);
    this.currentPrefabSourceGraph = loaded.prefabSourceGraph;
    if (loaded.prefabSourceGraph.root !== loaded.root) {
      this.bodySlot.add(loaded.prefabSourceGraph.root);
    }
    this.currentBodyAnimationRoot = loaded.prefabSourceGraph.root;
    this.currentBodyAttachNode = loaded.prefabSourceGraph.bodyAttach;
    this.currentHeadAttachOriginNode = loaded.prefabSourceGraph.headOrigin;
    this.currentPrefabHeadFollowDebug = loaded.prefabSourceGraph.debug;
    this.runtimeDebug.headMorphs = this.faceMotion.bind(
      loaded.root,
      characterAsset.headAsset
    );
    this.prepareCombinedComposition();
    this.currentExtraBoneRuntime = SekaiExtraBoneRuntime.fromPjskRuntimeExtension(
      this.currentRuntimeExtension,
      loaded.prefabSourceGraph.root
    );
    this.currentSpringRuntime = this.createSpringRuntime(loaded.prefabSourceGraph.root);
    this.currentConstraintRuntime = createUnityPrefabConstraintRuntime(
      loaded.prefabSourceGraph,
      this.currentRuntimeExtension,
      this.characterHeight
    );
    this.syncUnityPrefabSourceGraph();
    await this.reloadAnimationPlayback({
      resetSpring: preservedAnimation === null,
    });
    if (preservedAnimation) {
      this.animationPlayback.restorePosition(preservedAnimation);
      this.faceMotion.applyCurrent();
      this.syncOfficialModelCombineSetup();
      this.currentExtraBoneRuntime?.update();
      this.resetCurrentSpringRuntimeState();
    }

    const bodyStatus = {
      ...this.makeImportStatus(characterAsset.bodyAsset, loaded),
      assetId: characterAsset.id,
      displayName: `${characterAsset.displayName} [combined body]`,
    };
    const headStatus = {
      ...this.makeImportStatus(characterAsset.headAsset, loaded),
      assetId: characterAsset.id,
      displayName: `${characterAsset.displayName} [combined head]`,
    };
    const snapshot = {
      revision,
      body: bodyStatus,
      head: headStatus,
      composition: this.currentCompositionStatus,
    };
    this.currentImportSnapshot = snapshot;
    this.characterLighting.applyCharacterView();
    return snapshot;
  }

  setHairShadowMode(mode: HairShadowMode) {
    this.characterLighting.setHairShadowMode(mode);
  }

  setProjectedShadowSettings(settings: ProjectedShadowSettingsInput = {}) {
    this.projectedShadow.setSettings(settings);
  }

  setFaceSdfDebugMode(mode: FaceSdfDebugMode) {
    this.characterLighting.setFaceSdfDebugMode(mode);
  }

  setFaceSdfEnabled(enabled: boolean) {
    this.characterLighting.setFaceSdfEnabled(enabled);
  }

  setBodyDebugMode(mode: BodyDebugMode) {
    this.characterLighting.setBodyDebugMode(mode);
  }

  setToonShadowPreview(shadowWidthOverride: number | null, valueShadowInfluence: number) {
    this.characterLighting.setToonShadowPreview(shadowWidthOverride, valueShadowInfluence);
  }

  setFaceSdfDebugLightMode(mode: FaceSdfDebugLightMode) {
    this.characterLighting.setFaceSdfDebugLightMode(mode);
    this.updateShaderFaceBasis();
  }

  setRenderIsolationMode(mode: RenderIsolationMode) {
    this.characterLighting.setRenderIsolationMode(mode);
  }

  setCharacterYawDegrees(degrees: number) {
    const yaw = THREE.MathUtils.degToRad(Number.isFinite(degrees) ? degrees : 0);
    this.characterRoot.rotation.y = yaw;
    this.characterRoot.updateMatrixWorld(true);
    this.syncOfficialModelCombineSetup();
    this.characterRoot.updateMatrixWorld(true);
    this.updateShaderFaceBasis();
  }

  faceCharacterTowardCamera() {
    this.characterRoot.updateMatrixWorld(true);
    const root = this.currentBodyAnimationRoot ?? this.characterRoot;
    root.updateMatrixWorld(true);
    const nodeByPath = buildPrefabNodePathLookup(root);
    const facingNode = resolvePrefabNodeCandidate(nodeByPath, [
      "body/Position",
      "body/Position/PositionOffset",
      "body/Position/PositionOffset/Hip",
      "body/Position/Hip",
      "face/Position",
    ])?.node ?? root;

    facingNode.updateMatrixWorld(true);
    facingNode.getWorldQuaternion(this.tempQuaternion);
    this.tempVector.set(0, 0, 1).applyQuaternion(this.tempQuaternion);
    this.tempVector.y = 0;
    if (this.tempVector.lengthSq() < 0.000001) {
      this.setCharacterYawDegrees(0);
      return;
    }
    this.tempVector.normalize();

    facingNode.getWorldPosition(this.tempVectorB);
    const cameraDirection = this.camera.position.clone().sub(this.tempVectorB);
    cameraDirection.y = 0;
    if (cameraDirection.lengthSq() < 0.000001) {
      this.setCharacterYawDegrees(0);
      return;
    }
    cameraDirection.normalize();

    const currentYaw = Math.atan2(this.tempVector.x, this.tempVector.z);
    const targetYaw = Math.atan2(cameraDirection.x, cameraDirection.z);
    this.characterRoot.rotation.y += targetYaw - currentYaw;
    this.characterRoot.updateMatrixWorld(true);
    this.syncOfficialModelCombineSetup();
    this.characterRoot.updateMatrixWorld(true);
    this.updateShaderFaceBasis();
  }

  getRuntimeDebugSnapshot() {
    return {
      ...structuredClone(this.runtimeDebug),
      headMaterialSlots: this.currentHeadAsset?.faceMaterials.map((slot) => ({
        meshName: slot.meshName,
        slotIndex: slot.slotIndex,
        materialKey: slot.materialKey,
        materialName: slot.materialName,
        materialKind: slot.materialKind,
        isAccessory: slot.isAccessory,
        valueTex: slot.valueTex,
      })) ?? [],
      nativeMeshes: this.lastNativeMeshInstallDiagnostics,
      constraints: this.lastConstraintSetupDiagnostics,
      funit: readRuntimeFUnitDebug(this.currentRuntimeExtension),
      hairShadowOffset: vectorDebugSnapshot(this.currentHairOffset),
      hairShadowWorldPosition: vectorDebugSnapshot(this.hairHeadPosition),
      camera: this.getCameraDebugSnapshot(),
      faceLight: this.getFaceLightDebugSnapshot(),
      projectedShadow: this.projectedShadow.getDebugSnapshot(
        this.characterHeight
      ),
    };
  }

  getFaceLightDebugSnapshot(): RuntimeFaceLightDebug {
    const previewLightDirection = this.directionalLight.position.clone().normalize();
    const lightDirection = this.characterLighting.resolveFaceShadowLightDirection(
      COSTUME_SHOP_FACE_SHADOW_LIGHT_DIRECTION,
      this.faceRightWorld,
      this.faceForwardWorld
    );
    const headHorizontalFromUp = new THREE.Vector2();
    const headHorizontalFromRight = new THREE.Vector2();
    const headHorizontalFromForward = new THREE.Vector2();
    const lightHorizontal = new THREE.Vector2();
    normalizeFaceShadowHorizontal(
      headHorizontalFromUp,
      -this.faceUpWorld.x,
      -this.faceUpWorld.z
    );
    normalizeFaceShadowHorizontal(
      headHorizontalFromRight,
      this.faceRightWorld.x,
      this.faceRightWorld.z
    );
    normalizeFaceShadowHorizontal(
      headHorizontalFromForward,
      this.faceForwardWorld.x,
      this.faceForwardWorld.z
    );
    normalizeFaceShadowHorizontal(
      lightHorizontal,
      lightDirection.x,
      lightDirection.z
    );
    const headYawDegrees = THREE.MathUtils.radToDeg(
      Math.atan2(this.faceForwardWorld.x, this.faceForwardWorld.z)
    );
    const lightYawDegrees = THREE.MathUtils.radToDeg(
      Math.atan2(lightHorizontal.x, lightHorizontal.y)
    );
    const faceForward = this.faceForwardWorld.clone().normalize();
    const faceRight = this.faceRightWorld.clone()
      .sub(faceForward.clone().multiplyScalar(this.faceRightWorld.dot(faceForward)))
      .normalize();
    const faceUp = this.faceUpWorld.clone()
      .sub(faceForward.clone().multiplyScalar(this.faceUpWorld.dot(faceForward)))
      .sub(faceRight.clone().multiplyScalar(this.faceUpWorld.dot(faceRight)))
      .normalize();
    const faceTbnLight = new THREE.Vector3(
      lightDirection.dot(faceRight),
      lightDirection.dot(faceUp),
      lightDirection.dot(faceForward)
    );
    const faceLightLength = Math.max(
      Math.hypot(faceTbnLight.x, faceTbnLight.z),
      0.001
    );
    const faceSide = faceTbnLight.x / faceLightLength;
    const faceFront = faceTbnLight.z / faceLightLength;
    const useLimiter = (this.faceMaterial.uniforms.uUseFaceShadowLimiter?.value ?? 1) > 0.5;
    const rangeLimit = this.faceMaterial.uniforms.uFaceShadowLimitRange?.value ?? 0;
    const faceSdfBias = this.faceMaterial.uniforms.uFaceSdfBias?.value ?? 0;
    const headDotY = this.headDotDirectionalLight.y;
    const faceSdfLimit = THREE.MathUtils.clamp(
      (useLimiter
        ? Math.min(Math.max((1 - Math.abs(2 * headDotY - 1)) * 0.5, 0), rangeLimit)
        : headDotY) + faceSdfBias,
      0,
      1
    );
    return {
      lightDirection: vectorDebugSnapshot(lightDirection),
      previewLightDirection: vectorDebugSnapshot(previewLightDirection),
      costumeShopLightRotationDegrees: vectorDebugSnapshot(
        COSTUME_SHOP_DIRECTIONAL_LIGHT_ROTATION_DEGREES
      ),
      faceRightWorld: vectorDebugSnapshot(faceRight),
      faceUpWorld: vectorDebugSnapshot(faceUp),
      faceForwardWorld: vectorDebugSnapshot(faceForward),
      headHorizontalFromUp: {
        x: Number(headHorizontalFromUp.x.toFixed(5)),
        y: Number(headHorizontalFromUp.y.toFixed(5)),
      },
      headHorizontalFromRight: {
        x: Number(headHorizontalFromRight.x.toFixed(5)),
        y: Number(headHorizontalFromRight.y.toFixed(5)),
      },
      headHorizontalFromForward: {
        x: Number(headHorizontalFromForward.x.toFixed(5)),
        y: Number(headHorizontalFromForward.y.toFixed(5)),
      },
      lightHorizontal: {
        x: Number(lightHorizontal.x.toFixed(5)),
        y: Number(lightHorizontal.y.toFixed(5)),
      },
      headDotDirectionalLight: {
        x: Number(this.headDotDirectionalLight.x.toFixed(5)),
        y: Number(this.headDotDirectionalLight.y.toFixed(5)),
      },
      faceTbnLight: vectorDebugSnapshot(faceTbnLight),
      faceLight: {
        side: Number(faceSide.toFixed(5)),
        front: Number(faceFront.toFixed(5)),
      },
      faceSdfLimit: Number(faceSdfLimit.toFixed(5)),
      headYawDegrees: Number(headYawDegrees.toFixed(3)),
      lightYawDegrees: Number(lightYawDegrees.toFixed(3)),
    };
  }

  getCameraDebugSnapshot(): RuntimeCameraDebug {
    const position = this.camera.position;
    const target = this.controls?.target ?? this.cameraTarget;
    const offset = position.clone().sub(target);
    const spherical = new THREE.Spherical().setFromVector3(offset);
    const costumeShopPose = this.currentCameraPreset === "capture"
      ? getCostumeShopCameraPose(this.currentCameraProfile ?? "full-body")
      : null;
    const costumeShopState = costumeShopPose?.costumeShopState ?? null;
    return {
      preset: this.currentCameraPreset,
      profile: this.currentCameraProfile,
      costumeShopState: costumeShopState === null
        ? null
        : {
            cameraRootYawDegrees: Number(costumeShopState.cameraRootYawDegrees.toFixed(3)),
            zoomValue: Number(costumeShopState.zoomValue.toFixed(4)),
            zoomMoveValue: Number(costumeShopState.zoomMoveValue.toFixed(4)),
            zoomRatio: Number(costumeShopState.zoomRatio.toFixed(4)),
            localCameraPosition: {
              x: Number(costumeShopState.localCameraPosition.x.toFixed(4)),
              y: Number(costumeShopState.localCameraPosition.y.toFixed(4)),
              z: Number(costumeShopState.localCameraPosition.z.toFixed(4)),
            },
            localCameraRotationYDegrees: costumeShopState.localCameraRotationYDegrees,
          },
      position: {
        x: Number(position.x.toFixed(4)),
        y: Number(position.y.toFixed(4)),
        z: Number(position.z.toFixed(4)),
      },
      target: {
        x: Number(target.x.toFixed(4)),
        y: Number(target.y.toFixed(4)),
        z: Number(target.z.toFixed(4)),
      },
      offset: {
        x: Number(offset.x.toFixed(4)),
        y: Number(offset.y.toFixed(4)),
        z: Number(offset.z.toFixed(4)),
      },
      distance: Number(spherical.radius.toFixed(4)),
      polarDegrees: Number(THREE.MathUtils.radToDeg(spherical.phi).toFixed(3)),
      azimuthDegrees: Number(THREE.MathUtils.radToDeg(spherical.theta).toFixed(3)),
      fovDegrees: Number(this.camera.fov.toFixed(3)),
      aspect: Number(this.camera.aspect.toFixed(4)),
      zoom: Number(this.camera.zoom.toFixed(4)),
      minPolarDegrees: Number(THREE.MathUtils.radToDeg(this.controls?.minPolarAngle ?? THREE.MathUtils.degToRad(82)).toFixed(3)),
      maxPolarDegrees: Number(THREE.MathUtils.radToDeg(this.controls?.maxPolarAngle ?? THREE.MathUtils.degToRad(100)).toFixed(3)),
      characterHeight: Number(this.characterHeight.toFixed(4)),
    };
  }

  onCameraDebugChange(callback: (() => void) | null) {
    this.cameraDebugChangeCallback = callback;
  }

  getSpringBoneSnapshot(debugOptions?: UtjSpringBoneDebugOptions): SpringBoneRuntimeSnapshot {
    return summarizeSpringBoneMetadata(
      this.currentRuntimeExtension,
      false,
      this.currentSpringRuntime?.getSnapshot(this.isSpringRuntimeEnabled(), debugOptions) ?? null
    );
  }

  setUtjSpringBoneTraceFilters(filters: readonly string[], maxEvents?: number) {
    this.currentSpringRuntime?.setTraceBoneFilters(filters, maxEvents);
  }

  getUtjSpringBoneTraceSnapshot(): UtjSpringBoneTraceSnapshot | null {
    return this.currentSpringRuntime?.getTraceSnapshot() ?? null;
  }

  getAnimationSnapshot(): AnimationPlaybackSnapshot {
    const utjControlledNodeNames =
      this.currentSpringRuntime?.getControlledTrackNodeNames() ??
      new Set<string>();
    return this.animationPlayback.getSnapshot({
      faceMotionEnabled: this.faceMotion.isEnabled(),
      utjControlledNodeNames,
    });
  }

  getFaceMotionSnapshot(): FaceMotionPlaybackSnapshot {
    return this.faceMotion.getSnapshot();
  }

  setAnimationPaused(paused: boolean) {
    this.animationPlayback.setPaused(paused);
  }

  setAnimationSpeed(speed: number) {
    this.animationPlayback.setSpeed(speed);
  }

  setFaceMotionEnabled(enabled: boolean) {
    this.faceMotion.setEnabled(enabled);
  }

  setBodyHeadTracksEnabled(enabled: boolean) {
    if (!this.animationPlayback.setBodyHeadTracksEnabled(enabled)) {
      return;
    }
    void this.reloadAnimationPlayback();
  }

  setUtjSpringBoneEnabled(enabled: boolean) {
    this.setSpringRuntimeMode(enabled ? "unity-prefab" : "off");
  }

  setSpringRuntimeMode(mode: SpringRuntimeMode) {
    const wasEnabled = this.isSpringRuntimeEnabled();
    const previousMode = this.springRuntimeMode;
    this.springRuntimeMode = mode;
    if (previousMode !== mode && this.currentBodyAnimationRoot) {
      this.currentSpringRuntime?.resetPose();
      this.currentSpringRuntime = this.createSpringRuntime(
        this.currentPrefabSourceGraph?.root ?? this.currentBodyAnimationRoot
      );
    }
    const isEnabled = this.isSpringRuntimeEnabled();
    if (isEnabled && !wasEnabled) {
      this.resetAndSettleCurrentSpringRuntime(60);
    } else if (!isEnabled && wasEnabled) {
      this.currentSpringRuntime?.resetPose();
    }
  }

  private resetCurrentSpringRuntimeState() {
    this.currentSpringRuntime?.resetStateToCurrentPose();
  }

  private resetAndSettleCurrentSpringRuntime(frameCount: number) {
    this.resetCurrentSpringRuntimeState();
    this.currentSpringRuntime?.settleCurrentPose(frameCount);
  }

  private isSpringRuntimeEnabled(): boolean {
    return this.springRuntimeMode !== "off";
  }

  private createSpringRuntime(root: THREE.Object3D): SpringRuntimeController | null {
    if (this.springRuntimeMode === "unity-prefab") {
      const runtime = UnityPrefabSpringRuntime.fromPjskRuntimeExtension(
        this.currentRuntimeExtension,
        root
      );
      if (runtime && this.currentSpringTimelineControl) {
        runtime.setTimelineControl(this.currentSpringTimelineControl);
      }
      return runtime;
    }

    return null;
  }

  setSpringTimelineControl(control: SpringTimelineControlState | null) {
    this.currentSpringTimelineControl = control ? { ...control } : null;
    if (this.currentSpringTimelineControl) {
      this.currentSpringRuntime?.setTimelineControl(this.currentSpringTimelineControl);
    } else {
      this.currentSpringRuntime?.clearTimelineControl();
    }
  }

  seekAnimation(time: number) {
    this.applyAnimationSeekResult(this.animationPlayback.seek(time));
  }

  seekAnimationPhase(phase: number) {
    this.applyAnimationSeekResult(this.animationPlayback.seekPhase(phase));
    return this.getAnimationSnapshot();
  }

  seekAnimationLoopPhase(phase: number) {
    this.applyAnimationSeekResult(this.animationPlayback.seekLoopPhase(phase));
    return this.getAnimationSnapshot();
  }

  private applyAnimationSeekResult(nextTime: number) {
    this.faceMotion.seek(nextTime);
    this.syncOfficialModelCombineSetup();
    this.resetCurrentSpringRuntimeState();
  }

  setPresentationMode(mode: PjskPresentationMode) {
    this.setCapturePresentation(mode === "capture");
  }

  setCapturePresentation(enabled: boolean) {
    this.capturePresentationEnabled = enabled;
    if (enabled) {
      this.scene.fog = null;
      this.sceneReference.visible = false;
      this.handleResize();
      return;
    }
    this.scene.fog = new THREE.Fog("#7f8d95", 5.5, 15);
    this.sceneReference.visible = false;
  }

  private stepCharacterDynamics(delta: number, advanceAnimation: boolean) {
    const stepDelta = Math.max(0, delta);
    if (advanceAnimation) {
      this.animationPlayback.step(stepDelta);
      this.faceMotion.step(
        stepDelta,
        this.animationPlayback.getSpeed(),
        this.animationPlayback.isPaused()
      );
    }
    this.syncOfficialModelCombineSetup();
    this.currentExtraBoneRuntime?.update();
    if (this.isSpringRuntimeEnabled()) {
      this.currentSpringRuntime?.update(stepDelta);
    } else {
      this.currentSpringRuntime?.resetPose();
    }
  }

  stepCaptureFrame(delta: number, advanceAnimation: boolean) {
    this.stepCharacterDynamics(delta, advanceAnimation);
    this.updateProjectedShadows();
    this.updateShaderCameraPositions();
    this.updateShaderFaceBasis();
  }

  getCharacterRoot() {
    return this.characterRoot;
  }

  private updateProjectedShadows() {
    if (!this.currentBodyAsset) {
      this.projectedShadow.update({
        targetWorldPositions: [],
        lightWorldPosition: null,
        characterHeight: this.characterHeight,
        visible: false,
      });
      return;
    }

    const lightPosition = new THREE.Vector3();
    this.directionalLight.getWorldPosition(lightPosition);
    this.projectedShadow.update({
      targetWorldPositions: this.resolveProjectedShadowTargetWorldPositions(),
      lightWorldPosition: lightPosition,
      characterHeight: this.characterHeight,
      visible: true,
    });
  }

  private resolveProjectedShadowTargetWorldPositions() {
    const root = this.currentBodyAnimationRoot ?? this.characterRoot;
    root.updateMatrixWorld(true);
    const toePositions = projectedShadowTargetBoneNames
      .map((name) => this.findNodeByImportedName(root, name))
      .filter((node): node is THREE.Object3D => node !== null)
      .map((node) => node.getWorldPosition(new THREE.Vector3()));
    if (toePositions.length > 0) {
      return toePositions;
    }
    const candidates = [
      this.findNodeByImportedName(root, "Position"),
      this.findNodeByImportedName(root, "Hip"),
      this.findNodeByImportedName(root, "Hips"),
      this.findNodeByImportedName(root, "Waist"),
      this.findNodeByImportedName(root, "Root"),
    ];
    const target = candidates.find((node): node is THREE.Object3D => node !== null) ?? root;
    const position = new THREE.Vector3();
    target.getWorldPosition(position);
    return [position];
  }

  getCanvas() {
    return this.renderer.domElement;
  }

  setViewportSize(width: number, height: number) {
    const viewportMinimum = this.ownsCanvas ? 320 : 1;
    const nextWidth = Math.max(Math.trunc(width) || 0, viewportMinimum);
    const nextHeight = Math.max(Math.trunc(height) || 0, viewportMinimum);
    this.camera.aspect = nextWidth / nextHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(nextWidth, nextHeight, this.ownsCanvas);
    this.updateCaptureBackgroundTexture(nextWidth, nextHeight);
  }

  renderFrame() {
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.scene, this.camera);
  }

  stepRuntimeFrame(
    delta: number,
    options: { advanceAnimation?: boolean; elapsedTime?: number } = {}
  ) {
    this.stepCaptureFrame(delta, options.advanceAnimation ?? true);
    this.updateLayerMaterialTime(options.elapsedTime ?? this.clock.elapsedTime);
  }

  async loadRuntimePackage(
    request: HarukiRuntimePackageRequest
  ): Promise<RuntimePackageLoadResult> {
    const previousRoleId = this.currentLoadedRuntimePackage?.wardrobe?.getActiveRoleId() ?? null;
    const nextRoleId = request.roleId ?? null;
    if (previousRoleId && nextRoleId && previousRoleId !== nextRoleId) {
      this.releaseCurrentCharacterResources({
        preserveAnimationSelection: false,
        clearAnimationCache: true,
      });
      this.currentLoadedRuntimePackage = null;
    }
    const loaded = await loadRuntimePackageFromBaseUrl(request.baseUrl, request);
    this.currentLoadedRuntimePackage = loaded;
    if (loaded.previewLight) {
      this.updatePreviewLight(loaded.previewLight);
    }
    await this.setAnimationSelection(null);
    this.setFaceMotionSet(null, null, null);
    if (!loaded.combinedCharacter) {
      return loaded;
    }
    await this.importCombinedCharacter(loaded.combinedCharacter);
    const animationUrl = loaded.combinedCharacter.bodyAsset.source.animationUrls?.[0];
    const defaultAnimationKind = inferBodyAnimationKind(animationUrl ?? null);
    const defaultLoopUrl = animationUrl && (
      defaultAnimationKind === "unity-json" ||
      /body[_-]?motion/i.test(animationUrl.split(/[/?#]/)[0] ?? "")
    )
      ? animationUrl
      : null;
    const embeddedFaceMotion = readEmbeddedRuntimeFaceMotion(loaded.combinedCharacter.runtimeExtension);
    if (request.applyFaceMotion !== false && (loaded.faceMotion ?? embeddedFaceMotion)) {
      this.setFaceMotionSet(
        loaded.faceMotion ?? embeddedFaceMotion,
        "face",
        defaultLoopUrl ? "face_loop" : null
      );
    }
    if (request.applyDefaultAnimation !== false && animationUrl) {
      await this.setAnimationSelection({
        motionUrl: animationUrl,
        motionKind: defaultAnimationKind,
        loopUrl: defaultLoopUrl,
        loopKind: defaultLoopUrl ? defaultAnimationKind : null,
      });
    }
    return loaded;
  }

  async setCustomSelection(
    selection: CustomPartSelection
  ): Promise<RuntimeCombinedCharacterAsset> {
    return this.enqueueCustomSelectionMutation(() =>
      this.applyCustomSelection(selection)
    );
  }

  async updateCustomSelection(
    partType: RuntimePartType,
    costume3dId: number | null
  ): Promise<RuntimeCombinedCharacterAsset> {
    return this.enqueueCustomSelectionMutation(async () => {
      const wardrobe = this.currentLoadedRuntimePackage?.wardrobe;
      if (!wardrobe) {
        throw new Error("No custom part package is loaded.");
      }
      const selection = wardrobe.getCustomSelection();
      if (!selection) {
        throw new Error("No custom selection is active.");
      }
      return this.applyCustomSelection({
        ...selection,
        bodyCostume3dId: partType === "body" && costume3dId !== null
          ? costume3dId
          : selection.bodyCostume3dId,
        headCostume3dId: partType === "head" && costume3dId !== null
          ? costume3dId
          : selection.headCostume3dId,
        headPackagePath: partType === "head" && costume3dId !== null
          ? null
          : selection.headPackagePath,
        hairCostume3dId: partType === "hair" && costume3dId !== null
          ? costume3dId
          : selection.hairCostume3dId,
        headOptionalCostume3dId: partType === "head_optional"
          ? costume3dId
          : selection.headOptionalCostume3dId,
      });
    });
  }

  async loadRenderRecipe(
    recipe: HarukiRuntimeRenderRecipe
  ): Promise<HarukiRenderResult> {
    return this.enqueueCustomSelectionMutation(() =>
      this.loadRenderRecipeInternal(recipe)
    );
  }

  private enqueueCustomSelectionMutation<T>(
    operation: () => Promise<T>
  ): Promise<T> {
    const queued = this.customSelectionQueue.then(operation, operation);
    this.customSelectionQueue = queued.catch(() => undefined);
    return queued;
  }

  private async applyCustomSelection(
    selection: CustomPartSelection
  ): Promise<RuntimeCombinedCharacterAsset> {
    const wardrobe = this.currentLoadedRuntimePackage?.wardrobe;
    if (!wardrobe) {
      throw new Error("No custom part package is loaded.");
    }
    const previousSelection = wardrobe.getCustomSelection();
    const previousCombinedId = wardrobe.getCombinedCharacter()?.id ?? null;
    const combined = await wardrobe.setCustomSelection(selection);
    const sameResolvedSelection = previousCombinedId !== null &&
      previousCombinedId === combined.id;
    const nextAnimationUrl = combined.bodyAsset.source.animationUrls?.[0] ?? null;
    const nextAnimationKind = inferBodyAnimationKind(nextAnimationUrl);
    const nextLoopUrl = nextAnimationUrl && (
      nextAnimationKind === "unity-json" ||
      /body[_-]?motion/i.test(nextAnimationUrl.split(/[/?#]/)[0] ?? "")
    )
      ? nextAnimationUrl
      : null;
    const preserveAnimation = previousCombinedId !== null &&
      previousSelection !== null &&
      runtimeRoleId(previousSelection.characterId, previousSelection.unit) ===
        runtimeRoleId(selection.characterId, selection.unit) &&
      this.animationPlayback.matchesSelection(nextAnimationUrl, nextLoopUrl);
    if (!sameResolvedSelection) {
      // Match the official preview update path: preserve the outer engine, rebuild the full character graph.
      await this.importCombinedCharacter(combined, {
        preserveAnimation,
        disposeBeforeLoad: true,
        clearAnimationCache: false,
      });
    }
    await this.applyCustomRoleDefaultMotion(combined, !preserveAnimation);
    return combined;
  }

  private async loadRenderRecipeInternal(
    recipe: HarukiRuntimeRenderRecipe
  ): Promise<HarukiRenderResult> {
    const baseUrl = String(recipe.baseUrl ?? "").trim();
    if (!baseUrl) {
      throw new Error("baseUrl is required to load a render recipe.");
    }
    const normalized = normalizeHarukiRenderRecipe(recipe);
    const requestedRole = parseRuntimeRoleId(normalized.roleId);
    const nextRoleId = runtimeRoleId(requestedRole.characterId, requestedRole.unit);
    const currentPackage = this.currentLoadedRuntimePackage;
    const currentBaseUrl = currentPackage?.partSet?.baseUrl ?? null;
    const currentRoleId = currentPackage?.wardrobe?.getActiveRoleId() ?? null;

    if (!currentPackage?.wardrobe || currentBaseUrl !== baseUrl || currentRoleId !== nextRoleId) {
      await this.loadRuntimePackage({
        baseUrl,
        roleId: nextRoleId,
        deferDefaultSelection: true,
        applyDefaultAnimation: false,
        applyFaceMotion: false,
      });
    }

    const wardrobe = this.currentLoadedRuntimePackage?.wardrobe;
    if (!wardrobe) {
      throw new Error("No custom part package is loaded.");
    }
    if (wardrobe.getActiveRoleId() !== nextRoleId) {
      wardrobe.selectRole(requestedRole.characterId, requestedRole.unit);
    }
    const partSet = wardrobe.getPartPackageSet();
    if (partSet) {
      await ensureRoleRuntimePackage(partSet, requestedRole.characterId, requestedRole.unit);
    }

    const selection: CustomPartSelection = {
      characterId: requestedRole.characterId,
      unit: requestedRole.unit,
      bodyCostume3dId: normalized.bodyCostume3dId,
      headCostume3dId: normalized.headCostume3dId,
      headPackagePath: normalized.headPackagePath,
      hairCostume3dId: normalized.hairCostume3dId,
      headOptionalCostume3dId: normalized.headOptionalCostume3dId,
      origin: "custom",
    };
    return {
      selection,
      combinedCharacter: await this.applyCustomSelection(selection),
    };
  }

  private async applyCustomRoleDefaultMotion(
    combined: RuntimeCombinedCharacterAsset,
    force: boolean
  ): Promise<void> {
    const animationUrl = combined.bodyAsset.source.animationUrls?.[0];
    const defaultAnimationKind = inferBodyAnimationKind(animationUrl ?? null);
    const defaultLoopUrl = animationUrl && (
      defaultAnimationKind === "unity-json" ||
      /body[_-]?motion/i.test(animationUrl.split(/[/?#]/)[0] ?? "")
    )
      ? animationUrl
      : null;
    const faceMotion = readEmbeddedRuntimeFaceMotion(combined.runtimeExtension);
    if (faceMotion && (force || !this.faceMotion.hasMotion())) {
      this.setFaceMotionSet(
        faceMotion,
        "face",
        defaultLoopUrl ? "face_loop" : null
      );
    }
    if (animationUrl && (force || !this.animationPlayback.hasSelection())) {
      await this.setAnimationSelection({
        motionUrl: animationUrl,
        motionKind: defaultAnimationKind,
        loopUrl: defaultLoopUrl,
        loopKind: defaultLoopUrl ? defaultAnimationKind : null,
      });
    }
  }

  getSnapshots(debugOptions?: UtjSpringBoneDebugOptions): HarukiEngineSnapshots {
    return {
      animation: this.getAnimationSnapshot(),
      faceMotion: this.getFaceMotionSnapshot(),
      springBone: this.getSpringBoneSnapshot(debugOptions),
      camera: this.getCameraDebugSnapshot(),
      runtimeDebug: this.getRuntimeDebugSnapshot(),
      utjSpringBoneTrace: this.getUtjSpringBoneTraceSnapshot(),
    };
  }

  setFaceMotionSet(
    data: FaceMotionSet | null,
    preferredClipName: string | null,
    preferredLoopClipName: string | null
  ) {
    this.faceMotion.setMotion(
      data,
      preferredClipName,
      preferredLoopClipName
    );
  }

  async setAnimationSelection(selection: BodyAnimationSelection | null) {
    this.animationPlayback.setSelection(selection);
    await this.reloadAnimationPlayback();
    return this.getAnimationSnapshot();
  }

  updatePreviewLight(next: PreviewLightState) {
    this.applyCharacterHeight(next.characterHeight);
    this.characterLighting.updatePreviewLight(
      next,
      this.currentBodyAsset,
      this.currentHeadAsset,
      this.headDotDirectionalLight,
      COSTUME_SHOP_FACE_SHADOW_LIGHT_DIRECTION
    );
  }

  updateGlobalShadowColor(color: THREE.ColorRepresentation) {
    this.characterLighting.updateGlobalShadowColor(color);
  }

  updateLightControllerColors(colors: {
    ambientColor?: THREE.ColorRepresentation | null;
    rimColor?: THREE.ColorRepresentation | null;
    shadowRimColor?: THREE.ColorRepresentation | null;
  }) {
    this.characterLighting.updateControllerColors(colors);
  }

  updateLightControllerRimShape(shape: {
    edgeSmoothness?: number | null;
    shadowSharpness?: number | null;
  }) {
    this.characterLighting.updateControllerRimShape(shape);
  }

  updateLightControllerOutline(outline: {
    color?: THREE.ColorRepresentation | null;
    blending?: number | null;
  }) {
    this.characterLighting.updateControllerOutline(outline);
  }

  destroy() {
    cancelAnimationFrame(this.animationFrame);
    this.releaseCurrentCharacterResources({
      preserveAnimationSelection: false,
      clearAnimationCache: true,
    });
    if (this.manageResize) {
      window.removeEventListener("resize", this.handleResize);
    }
    this.controls?.dispose();
    this.projectedShadow.dispose();
    this.captureBackgroundTexture?.dispose();
    this.renderer.dispose();
    if (this.ownsCanvas && this.renderer.domElement.parentElement === this.container) {
      this.renderer.domElement.remove();
    }
  }

  private addSceneReference() {
  }

  private setCameraTarget(target: THREE.Vector3) {
    this.cameraTarget.copy(target);
    this.controls?.target.copy(target);
  }

  private syncCameraTarget() {
    if (this.controls) {
      this.controls.update();
      this.cameraTarget.copy(this.controls.target);
      return;
    }
    this.camera.lookAt(this.cameraTarget);
  }

  private applyCharacterHeight(height: number) {
    const nextHeight = THREE.MathUtils.clamp(height || 1, 0.5, 2);
    if (Math.abs(nextHeight - this.characterHeight) < 0.0001) {
      return;
    }
    this.characterHeight = nextHeight;
    this.characterRoot.scale.setScalar(nextHeight);
    const pose = getDefaultCameraPose(nextHeight);
    this.setCameraTarget(pose.target);
    this.camera.position.copy(pose.position);
    this.syncCameraTarget();
  }

  applyCameraPreset(preset: PjskCameraPreset, profile: PjskCameraProfile = "full-body") {
    this.currentCameraPreset = preset;
    if (preset === "capture") {
      this.currentCameraProfile = profile;
      const pose = getCostumeShopCameraPose(profile);
      this.setCameraTarget(pose.target);
      this.camera.position.copy(pose.position);
      this.camera.fov = pose.fov;
    } else {
      this.currentCameraProfile = null;
      const pose = getDefaultCameraPose(this.characterHeight);
      this.setCameraTarget(pose.target);
      this.camera.position.copy(pose.position);
      this.camera.fov = pose.fov;
    }
    this.camera.updateProjectionMatrix();
    this.syncCameraTarget();
    this.cameraDebugChangeCallback?.();
  }

  shiftCameraRight(amount = 1) {
    if (!Number.isFinite(amount) || amount === 0) {
      return;
    }
    const target = this.controls?.target ?? this.cameraTarget;
    const pose = shiftCameraPoseRight(
      this.camera.position,
      target,
      amount,
      this.characterHeight
    );
    this.setCameraTarget(pose.target);
    this.camera.position.copy(pose.position);
    this.syncCameraTarget();
    this.cameraDebugChangeCallback?.();
  }

  private makeImportStatus(
    asset: BodyAssetManifest | HeadAssetManifest,
    loaded: LoadedPartResult
  ): PartImportStatus {
    return {
      assetId: asset.id,
      displayName: asset.displayName,
      sourceMode: loaded.sourceMode,
      requestedUrl: loaded.requestedUrl,
      meshCount: loaded.meshCount,
      boneCount: loaded.boneCount,
      skinnedMeshCount: loaded.skinnedMeshCount,
    };
  }

  private resetSlotParents() {
    this.bodySlot.parent?.remove(this.bodySlot);
    this.headSlot.parent?.remove(this.headSlot);
    this.characterRoot.add(this.bodySlot);
    this.characterRoot.add(this.headSlot);
  }

  private getPersistentCharacterMaterials(): ReadonlySet<THREE.Material> {
    return new Set([
      this.bodyMaterial,
      this.hairMaterial,
      this.faceMaterial,
    ]);
  }

  private clearCharacterSlot(slot: THREE.Group) {
    clearGroup(slot, this.getPersistentCharacterMaterials());
  }

  private releaseCurrentCharacterResources(
    options: {
      preserveAnimationSelection?: boolean;
      clearAnimationCache?: boolean;
    } = {}
  ) {
    this.animationPlayback.release({
      preserveSelection: options.preserveAnimationSelection,
      clearCache: options.clearAnimationCache,
    });
    this.faceMotion.release({
      preserveMotion: options.preserveAnimationSelection,
    });
    this.currentSpringRuntime?.resetPose();
    this.currentSpringRuntime = null;
    this.currentExtraBoneRuntime = null;
    this.currentConstraintRuntime = null;
    this.currentRuntimeExtension = null;
    this.currentBodyAttachNode = null;
    this.currentHeadAttachOriginNode = null;
    this.currentBodyAnimationRoot = null;
    this.currentPrefabSourceGraph = null;
    this.currentPrefabHeadFollowDebug = {
      active: false,
      sourcePath: null,
      targetPath: null,
      reason: "not initialized",
    };
    this.runtimeDebug.headMorphs = [];
    this.clearCharacterSlot(this.bodySlot);
    this.clearCharacterSlot(this.headSlot);
    this.resetSlotParents();
    this.renderer.renderLists.dispose();
    this.renderer.info.reset();
  }

  private findNodeByName(
    root: THREE.Object3D,
    name: string | undefined
  ): THREE.Object3D | null {
    if (!name) {
      return null;
    }
    return this.findNodeByImportedName(root, name);
  }

  private findNodeByImportedName(
    root: THREE.Object3D,
    name: string
  ): THREE.Object3D | null {
    const exact = root.getObjectByName(name);
    if (exact) {
      return exact;
    }

    for (let suffix = 1; suffix <= 16; suffix++) {
      const duplicate = root.getObjectByName(`${name}_${suffix}`);
      if (duplicate) {
        return duplicate;
      }
    }

    return null;
  }

  private findBoneByImportedName(
    bones: ReadonlyMap<string, THREE.Bone>,
    name: string
  ): THREE.Bone | null {
    const exact = bones.get(name);
    if (exact) {
      return exact;
    }

    for (let suffix = 1; suffix <= 16; suffix++) {
      const duplicate = bones.get(`${name}_${suffix}`);
      if (duplicate) {
        return duplicate;
      }
    }

    return null;
  }

  private getNodeDepth(node: THREE.Object3D) {
    let depth = 0;
    let current = node.parent;
    while (current) {
      depth += 1;
      current = current.parent;
    }
    return depth;
  }

  private prepareCombinedComposition(): CompositionStatus {
    const graph = this.currentPrefabSourceGraph;
    if (!graph) {
      throw new Error("Official model_combine_setup graph is not loaded.");
    }
    this.currentCompositionStatus = {
      mode: "model_combine_setup",
      missingBodyBones: graph.bodyAttach ? [] : ["Unity prefab body attach unresolved"],
      missingHeadBones:
        graph.headRoot && graph.headOrigin
          ? []
          : ["Unity prefab head root/origin unresolved"],
    };
    return this.currentCompositionStatus;
  }

  private async loadCombinedCharacterAsset(
    characterAsset: RuntimeCombinedCharacterAsset
  ): Promise<LoadedPartResult> {
    if (!characterAsset.unityRuntimeJsonUrl) {
      throw new Error("Final runtime package must provide container.unityRuntimeJson.");
    }
    const prefabSourceGraph = buildUnityPrefabSourceGraph(
      characterAsset.runtimeExtension,
      null
    );
    if (!prefabSourceGraph) {
      throw new Error("Final runtime package must provide runtimeUnitySetup version 0414.");
    }

    this.currentPrefabSourceGraph = prefabSourceGraph;
    this.syncUnityPrefabSourceGraph();
    const nativeResult = installUnityRuntimeNativeMeshes(
      prefabSourceGraph,
      characterAsset.runtimeExtension
    );
    this.lastNativeMeshInstallDiagnostics = nativeResult;
    if (nativeResult.error) {
      throw new Error(
        `${nativeResult.error}${nativeResult.warnings.length ? ` ${nativeResult.warnings.slice(0, 3).join(" ")}` : ""}`
      );
    }

    this.syncUnityPrefabSourceGraph();
    await this.overrideBodyMaterials(prefabSourceGraph.root, characterAsset.bodyAsset);
    await this.overrideHeadMaterials(prefabSourceGraph.root, characterAsset.headAsset, {
      eyeController: readCharacterEyeMaterialController(characterAsset.runtimeExtension),
      hairController: readCharacterHairMaterialController(characterAsset.runtimeExtension),
    });
    this.installSekaiOutlineShells(prefabSourceGraph.root);
    return {
      root: prefabSourceGraph.root,
      sourceMode: "unity-runtime",
      requestedUrl: characterAsset.unityRuntimeJsonUrl,
      meshCount: nativeResult.meshCount,
      boneCount: nativeResult.boneCount,
      skinnedMeshCount: nativeResult.skinnedMeshCount,
      prefabSourceGraph,
    };
  }

  private installSekaiOutlineShells(root: THREE.Object3D) {
    const targets: THREE.Mesh[] = [];
    root.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (
        !mesh.isMesh ||
        mesh.userData.pjskOutlineShell ||
        mesh.userData.pjskEyeThroughHairOverlay ||
        mesh.userData.pjskEyeThroughHairStencilPrepass
      ) {
        return;
      }
      targets.push(mesh);
    });

    for (const mesh of targets) {
      const sourceMaterialKinds = getOutlineSourceMaterialKinds(mesh);
      if (shouldSkipOutlineMaterialKinds(sourceMaterialKinds)) {
        continue;
      }
      const sourceMaterialKind = chooseOutlineSourceMaterialKind(sourceMaterialKinds);

      const vertexColorRedMax = getVertexColorRedMax(mesh.geometry);
      if (vertexColorRedMax !== null && vertexColorRedMax <= 0.01) {
        continue;
      }

      const meshMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const sourceMaterialNames = meshMaterials.map((material) => material.name);
      const lighting = meshMaterials
        .map((material) => material.userData.pjskLighting as MaterialLightingSettings | undefined)
        .find(Boolean);
      const useSecondNormal =
        (lighting?.useOutlineSecondNormal ?? 0) > 0.5 &&
        Boolean(mesh.geometry.getAttribute("tangent"));
      const outlineMaterial = createSekaiOutlineMaterial(
        Boolean(mesh.geometry.getAttribute("color")),
        lighting,
        useSecondNormal
      );
      this.characterLighting.applyOutlineMaterial(outlineMaterial);
      const outline = mesh instanceof THREE.SkinnedMesh
        ? new THREE.SkinnedMesh(mesh.geometry, outlineMaterial)
        : new THREE.Mesh(mesh.geometry, outlineMaterial);
      outline.name = `${mesh.name}_outline`;
      outline.renderOrder = Math.max(mesh.renderOrder - 2, 0);
      outline.frustumCulled = mesh.frustumCulled;
      outline.userData.pjskOutlineShell = true;
      outline.userData.pjskSourceMaterialKind = sourceMaterialKind;
      outline.matrixAutoUpdate = mesh.matrixAutoUpdate;
      outline.position.copy(mesh.position);
      outline.quaternion.copy(mesh.quaternion);
      outline.scale.copy(mesh.scale);
      if (outline instanceof THREE.SkinnedMesh && mesh instanceof THREE.SkinnedMesh) {
        outline.bind(mesh.skeleton, mesh.bindMatrix);
      }
      this.runtimeDebug.outlineShells.push({
        meshName: mesh.name,
        outlineName: outline.name,
        sourceMaterialKind,
        sourceMaterialKinds,
        sourceMaterialNames,
        hasVertexColor: Boolean(mesh.geometry.getAttribute("color")),
        vertexColorRedMax,
        renderOrder: outline.renderOrder,
        sourceRenderOrder: mesh.renderOrder,
      });
      mesh.parent?.add(outline);
    }
  }

  private async overrideBodyMaterials(
    root: THREE.Object3D,
    bodyAsset: BodyAssetManifest
  ) {
    this.runtimeDebug.body = [];
    const view = this.characterLighting.getBindingView();
    await bindBodyRuntimeMaterials({
      root,
      bodyAsset,
      headAsset: this.currentHeadAsset,
      textureLoader: this.textureLoader,
      template: this.bodyMaterial,
      bodyDebugMode: view.bodyDebugMode,
      debug: this.runtimeDebug.body,
    });
  }
  private async overrideHeadMaterials(
    root: THREE.Object3D,
    headAsset: HeadAssetManifest,
    options: {
      eyeController?: CharacterEyeMaterialController | null;
      hairController?: CharacterHairMaterialController | null;
    } = {}
  ) {
    const view = this.characterLighting.getBindingView();
    this.runtimeDebug.head = [];
    this.currentHairOffset.copy(options.hairController?.offset ?? new THREE.Vector3());
    this.currentHairHeadTransform = null;
    const hairHeadTransformPath = options.hairController?.headTransformPath;
    if (hairHeadTransformPath) {
      root.traverse((node) => {
        if (
          !this.currentHairHeadTransform &&
          node.userData.pjskTransformPath === hairHeadTransformPath
        ) {
          this.currentHairHeadTransform = node;
        }
      });
    }
    this.currentHairHeadTransform ??= options.hairController?.headTransformName
      ? this.findNodeByImportedName(root, options.hairController.headTransformName)
      : null;
    await bindHeadRuntimeMaterials({
      root,
      headAsset,
      textureLoader: this.textureLoader,
      templates: {
        body: this.bodyMaterial,
        hair: this.hairMaterial,
        face: this.faceMaterial,
      },
      view: {
        bodyDebugMode: view.bodyDebugMode,
        faceDebugMode: view.faceDebugMode,
        faceSdfEnabled: view.faceSdfEnabled,
      },
      hair: {
        controllerPresent: Boolean(options.hairController),
        proximityShadowEnabled: view.proximityHairShadowEnabled,
        headPosition: this.hairHeadPosition,
      },
      eyeController: options.eyeController,
      debug: this.runtimeDebug.head,
    });
  }

  private handleResize() {
    const viewport = this.container ?? this.renderer.domElement;
    const width = Math.max(viewport.clientWidth, 320);
    const height = Math.max(viewport.clientHeight, 320);
    this.setViewportSize(width, height);
  }

  private updateCaptureBackgroundTexture(width?: number, height?: number) {
    const viewport = this.container ?? this.renderer.domElement;
    const textureWidth = Math.max(
      Math.round(width ?? viewport.clientWidth),
      320
    );
    const textureHeight = Math.max(
      Math.round(height ?? viewport.clientHeight),
      320
    );
    this.captureBackgroundTexture?.dispose();
    this.captureBackgroundTexture = createCaptureBackgroundTexture(
      textureWidth,
      textureHeight
    );
    this.scene.background = this.captureBackgroundTexture;
  }

  private updateShaderCameraPositions() {
    this.characterLighting.updateCamera(this.camera.position);
  }

  private updateShaderFaceBasis() {
    const headNode =
      this.currentHairHeadTransform ??
      this.findFaceSdfHeadBone() ??
      this.findNodeByImportedName(this.bodySlot, "Head") ??
      this.findNodeByImportedName(this.headSlot, "Head") ??
      this.currentBodyAnimationRoot ??
      this.characterRoot;
    headNode.getWorldQuaternion(this.tempQuaternion);
    headNode.getWorldPosition(this.faceHeadWorldPosition);
    // PJSK imported head bones use local X as face up and local Z as face forward.
    this.faceUpWorld.set(1, 0, 0).applyQuaternion(this.tempQuaternion).normalize();
    this.faceForwardWorld.set(0, 0, 1).applyQuaternion(this.tempQuaternion).normalize();
    this.faceRightWorld.crossVectors(this.faceUpWorld, this.faceForwardWorld).normalize();
    this.faceUpWorld.crossVectors(this.faceForwardWorld, this.faceRightWorld).normalize();
    const faceShadowLightDirection = this.characterLighting.resolveFaceShadowLightDirection(
      COSTUME_SHOP_FACE_SHADOW_LIGHT_DIRECTION,
      this.faceRightWorld,
      this.faceForwardWorld
    );
    normalizeFaceShadowHorizontal(
      this.faceShadowHeadHorizontal,
      -this.faceUpWorld.x,
      -this.faceUpWorld.z
    );
    normalizeFaceShadowHorizontal(
      this.faceShadowLightHorizontal,
      faceShadowLightDirection.x,
      faceShadowLightDirection.z
    );
    const headYawDegrees = THREE.MathUtils.radToDeg(
      Math.atan2(this.faceForwardWorld.x, this.faceForwardWorld.z)
    );
    const lightYawDegrees = THREE.MathUtils.radToDeg(
      Math.atan2(this.faceShadowLightHorizontal.x, this.faceShadowLightHorizontal.y)
    );
    this.headDotDirectionalLight.set(
      this.faceShadowHeadHorizontal.dot(this.faceShadowLightHorizontal),
      faceShadowYawRangeFactor(headYawDegrees, lightYawDegrees)
    );
    this.hairHeadPosition.copy(this.currentHairOffset);
    headNode.localToWorld(this.hairHeadPosition);
    this.runtimeDebug.hairShadowOffset = vectorDebugSnapshot(this.currentHairOffset);
    this.runtimeDebug.hairShadowWorldPosition = vectorDebugSnapshot(this.hairHeadPosition);
    this.characterLighting.updateFaceBasis(
      faceShadowLightDirection,
      this.headDotDirectionalLight,
      this.hairHeadPosition
    );
    this.characterLighting.updateEyeThroughHairView(
      this.camera.position,
      this.faceHeadWorldPosition,
      this.faceForwardWorld
    );
  }

  private findFaceSdfHeadBone() {
    for (const slot of [this.headSlot, this.bodySlot]) {
      let fallbackHead: THREE.Bone | null = null;
      let faceSdfHead: THREE.Bone | null = null;
      slot.traverse((node) => {
        if (faceSdfHead) {
          return;
        }
        const mesh = node as THREE.SkinnedMesh;
        if (!mesh.isSkinnedMesh || !mesh.skeleton) {
          return;
        }
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        const usesFaceSdf = materials.some(
          (material) =>
            material instanceof THREE.ShaderMaterial &&
            Boolean(material.uniforms.uFaceShadowTex)
        );
        if (!usesFaceSdf) {
          return;
        }
        for (const bone of mesh.skeleton.bones) {
          if (bone.name === "Head" || /^Head_\d+$/.test(bone.name)) {
            faceSdfHead = bone;
            return;
          }
          if (!fallbackHead && bone.name.toLowerCase().includes("head")) {
            fallbackHead = bone;
          }
        }
      });
      if (faceSdfHead ?? fallbackHead) {
        return faceSdfHead ?? fallbackHead;
      }
    }
    return null;
  }

  private updateLayerMaterialTime(elapsedTime: number) {
    for (const slot of [this.bodySlot, this.headSlot]) {
      slot.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh) {
          return;
        }
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of materials) {
          if (material instanceof THREE.ShaderMaterial && material.uniforms.uTime) {
            material.uniforms.uTime.value = elapsedTime;
          }
        }
      });
    }
  }

  private render() {
    const delta = this.clock.getDelta();
    const elapsedTime = this.clock.elapsedTime;
    this.stepRuntimeFrame(delta, { advanceAnimation: true, elapsedTime });
    this.controls?.update();
    this.renderFrame();
    this.animationFrame = requestAnimationFrame(() => this.render());
  }

  private async reloadAnimationPlayback(
    options: { resetSpring?: boolean } = {}
  ) {
    const result = await this.animationPlayback.refresh({
      root: this.currentBodyAnimationRoot,
      retargetWithUnityPrefab: this.currentPrefabSourceGraph !== null,
      runtimeExtension: this.currentRuntimeExtension,
      prefabHeadFollow: this.getPrefabHeadFollowDebugSnapshot(),
    });
    if (!result.poseApplied) {
      return;
    }
    this.syncOfficialModelCombineSetup();
    this.currentExtraBoneRuntime?.update();
    if (options.resetSpring ?? true) {
      this.resetCurrentSpringRuntimeState();
    }
  }

  private getPrefabHeadFollowDebugSnapshot(): PrefabHeadFollowDebug {
    return makeUnityPrefabHeadFollowDebugSnapshot(
      this.currentPrefabSourceGraph,
      this.currentRuntimeExtension,
      this.currentPrefabHeadFollowDebug
    );
  }

  private syncUnityPrefabSourceGraph() {
    const graph = this.currentPrefabSourceGraph;
    if (!graph) {
      return;
    }

    this.lastConstraintSetupDiagnostics = syncUnityPrefabRuntimeGraph(
      graph,
      this.currentRuntimeExtension,
      this.characterHeight,
      this.currentConstraintRuntime
    );
  }

  private syncOfficialModelCombineSetup() {
    this.syncUnityPrefabSourceGraph();
  }

}

import * as THREE from "three";
import {
  ensureRoleRuntimePackage,
  fetchRuntimeMessagePack,
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
  createSekaiBodyMaterial,
  updateSekaiBodyCamera,
  updateSekaiBodyMaterial,
} from "../materials/sekaiBodyMaterial";
import {
  createSekaiFaceMaterial,
  updateSekaiFaceMaterial,
  updateSekaiFaceShadowParameters,
} from "../materials/sekaiFaceMaterial";
import type { SekaiLayerAtlas } from "../materials/sekaiLayerMaterial";
import {
  type UtjSpringBoneDebugOptions,
  type UtjSpringBoneRuntimeSnapshot,
  type UtjSpringBoneTraceSnapshot,
} from "./springRuntimeTypes";
import { UnityPrefabSpringRuntime } from "./unityPrefabSpringRuntimeAdapter";
import { SekaiExtraBoneRuntime } from "./sekaiExtraBoneRuntime";
import type { RuntimeConstraintDebug } from "./unityConstraintRuntime";
import {
  convertUnityDirectionToThree,
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
  installUnityRuntimeNativeMeshes,
  makeUnityPrefabHeadFollowDebugSnapshot,
  syncUnityPrefabSourceGraph as syncUnityPrefabRuntimeGraph,
  type NativeMeshInstallDiagnostics,
  type PrefabHeadFollowDebug,
  type UnityPrefabSourceGraph,
} from "./unityPrefabRuntime";
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
import {
  bindBodyRuntimeMaterials,
  getSekaiPreviewRimDirection,
  normalizeMeshSlotName,
  updateSekaiEyelashPassView,
  type RuntimeMaterialDebug,
} from "./characterMaterialRuntime";
import {
  bindHeadRuntimeMaterials,
  type CharacterEyeMaterialController,
} from "./headMaterialRuntime";

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
const COSTUME_SHOP_DIRECTIONAL_LIGHT_ROTATION_DEGREES = new THREE.Vector3(-15, 50, 0);
const COSTUME_SHOP_FACE_SHADOW_LIGHT_DIRECTION = convertUnityDirectionToThree(
  new THREE.Vector3(0, 0, 1)
    .applyEuler(
      new THREE.Euler(
        THREE.MathUtils.degToRad(COSTUME_SHOP_DIRECTIONAL_LIGHT_ROTATION_DEGREES.x),
        THREE.MathUtils.degToRad(COSTUME_SHOP_DIRECTIONAL_LIGHT_ROTATION_DEGREES.y),
        THREE.MathUtils.degToRad(COSTUME_SHOP_DIRECTIONAL_LIGHT_ROTATION_DEGREES.z),
        "XYZ"
      )
    )
    .normalize()
).normalize();
const COSTUME_SHOP_USE_FACE_SHADOW_LIMITER = true;
const COSTUME_SHOP_FACE_SHADOW_LIMIT_RANGE = 0;
const FACE_SHADOW_HORIZONTAL_EPSILON = 0.00001;

type SpringRuntimeController = UnityPrefabSpringRuntime;

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

export type BodyDebugMode =
  | "off"
  | "skin"
  | "h_r"
  | "h_g"
  | "h_b"
  | "h_a"
  | "vertex_r"
  | "vertex_g"
  | "base_shadow"
  | "ndotl_raw"
  | "h_b_adjusted_shadow"
  | "ambient_target"
  | "ambient_weight"
  | "ambient_tint"
  | "specular"
  | "specular_mask"
  | "specular_add"
  | "rim_raw"
  | "rim_add"
  | "rim_gate"
  | "rim_color"
  | "rim_scalar"
  | "toon_luma"
  | "shadow_mask"
  | "shadow_target";
export type FaceSdfDebugMode = "off" | "sdf" | "mask" | "limit" | "basis" | "range";
export type FaceSdfDebugLightMode = "scene" | "front" | "left" | "right" | "back";
export type RenderIsolationMode =
  | "normal"
  | "face_sdf"
  | "no_face_sdf"
  | "no_face_layers"
  | "no_eye_through_hair"
  | "eye_through_hair_only"
  | "eye_through_hair_eye_only"
  | "eye_through_hair_eyebrow_only"
  | "eye_through_hair_eyelash_only"
  | "no_eye_through_hair_eye"
  | "no_eye_through_hair_eyebrow"
  | "no_eye_through_hair_eyelash"
  | "no_eye_through_hair_eyelash_overlay"
  | "no_eye_through_hair_eyelash_prepass"
  | "eyelight_only"
  | "no_eyelight"
  | "outline_only"
  | "no_outline"
  | "no_body_outline"
  | "no_hair_outline"
  | "no_face_outline";
export type HairShadowMode = "off" | "sekai_head_position" | "head_proximity";

function normalizeHairShadowMode(mode: HairShadowMode): HairShadowMode {
  return mode === "head_proximity" ? "sekai_head_position" : mode;
}

export type BodyAnimationSelection = {
  motionUrl: string | null;
  motionKind?: BodyAnimationKind | null;
  loopUrl: string | null;
  loopKind?: BodyAnimationKind | null;
};

export type RuntimeHeadMorphDebug = {
  meshName: string;
  morphTargetCount: number;
  mappedChannelCount: number;
  sampleChannels: string[];
};

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

export type AnimationRetargetDebug = RuntimeMotionRetargetDebug & {
  prefabHeadFollow?: PrefabHeadFollowDebug;
};

export type FaceMotionKeyframe = {
  time: number;
  value: number;
};

export type FaceMotionCurve = {
  curveHash: number;
  keyframes: FaceMotionKeyframe[];
};

export type FaceMotionClip = {
  name: string;
  sampleRate: number;
  duration: number;
  curves: FaceMotionCurve[];
};

export type FaceMotionSet = {
  bundlePath?: string;
  clips: FaceMotionClip[];
};

export type FaceMotionPlaybackSnapshot = {
  activeClipName: string | null;
  queuedLoopClipName: string | null;
  error: string | null;
  currentTime: number;
  mappedMeshCount: number;
  mappedCurveCount: number;
};

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

type HeadMorphRuntime = {
  mesh: THREE.Mesh;
  curveIndexByHash: Map<number, number>;
  controlledIndices: number[];
};

type CharacterHairMaterialController = {
  offset: THREE.Vector3;
  headTransformName: string | null;
  headTransformPath: string | null;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function countArray(value: unknown) {
  return Array.isArray(value) ? value.length : 0;
}

function readEmbeddedRuntimeFaceMotion(extension: unknown): FaceMotionSet | null {
  const motionPackage = asRecord(
    asRecord(extension).motionPackage ?? asRecord(extension).MotionPackage
  );
  const faceMotion = motionPackage.faceMotion ?? motionPackage.FaceMotion;
  return faceMotion ? faceMotion as FaceMotionSet : null;
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

function isFaceOrFaceLayerMaterialKind(kind: unknown) {
  return kind === "face" ||
    kind === "face_sdf" ||
    isFaceLayerMaterialKind(kind);
}

function isEyeThroughHairSourceAllowed(sourceKind: string, mode: RenderIsolationMode) {
  switch (mode) {
    case "eye_through_hair_eye_only":
      return sourceKind === "eye";
    case "eye_through_hair_eyebrow_only":
      return sourceKind === "eyebrow";
    case "eye_through_hair_eyelash_only":
      return sourceKind === "eyelash";
    case "no_eye_through_hair_eye":
      return sourceKind !== "eye";
    case "no_eye_through_hair_eyebrow":
      return sourceKind !== "eyebrow";
    case "no_eye_through_hair_eyelash":
      return sourceKind !== "eyelash";
    default:
      return true;
  }
}

function isEyeThroughHairPassAllowed(
  sourceKind: string,
  passKind: string,
  mode: RenderIsolationMode
) {
  if (mode === "no_eye_through_hair_eyelash_overlay") {
    return sourceKind !== "eyelash" || passKind !== "overlay";
  }
  if (mode === "no_eye_through_hair_eyelash_prepass") {
    return sourceKind !== "eyelash" || passKind !== "stencil_prepass";
  }
  return true;
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

function isOutlineHiddenByIsolation(kind: string, mode: RenderIsolationMode) {
  switch (mode) {
    case "no_body_outline":
      return kind === "body";
    case "no_hair_outline":
      return kind === "hair";
    case "no_face_layers":
    case "no_face_outline":
      return isFaceOrFaceLayerMaterialKind(kind);
    default:
      return false;
  }
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

function bodyDebugModeToUniform(mode: BodyDebugMode) {
  switch (mode) {
    case "skin":
      return 1;
    case "h_r":
      return 4;
    case "h_g":
      return 5;
    case "h_b":
      return 6;
    case "h_a":
      return 7;
    case "vertex_r":
      return 8;
    case "vertex_g":
      return 9;
    case "base_shadow":
      return 10;
    case "ndotl_raw":
      return 11;
    case "h_b_adjusted_shadow":
      return 12;
    case "ambient_target":
      return 13;
    case "ambient_weight":
      return 14;
    case "ambient_tint":
      return 15;
    case "specular":
      return 16;
    case "specular_mask":
      return 22;
    case "specular_add":
      return 23;
    case "rim_raw":
      return 17;
    case "rim_add":
      return 18;
    case "rim_gate":
      return 19;
    case "rim_color":
      return 20;
    case "rim_scalar":
      return 21;
    case "toon_luma":
      return 24;
    case "shadow_mask":
      return 25;
    case "shadow_target":
      return 26;
    default:
      return 0;
  }
}

function isMorphMesh(node: THREE.Object3D): node is THREE.Mesh {
  const mesh = node as THREE.Mesh;
  return !!mesh.isMesh && Array.isArray(mesh.morphTargetInfluences);
}

function faceSdfDebugModeToUniform(mode: FaceSdfDebugMode) {
  switch (mode) {
    case "sdf":
      return 1;
    case "mask":
      return 2;
    case "limit":
      return 3;
    case "basis":
      return 4;
    case "range":
      return 5;
    default:
      return 0;
  }
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
  private currentAnimationUrl: string | null = null;
  private currentAnimationKind: BodyAnimationKind | null = null;
  private currentAnimationLoopUrl: string | null = null;
  private currentAnimationLoopKind: BodyAnimationKind | null = null;
  private currentAnimationClipName: string | null = null;
  private currentAnimationDuration = 0;
  private currentAnimationAction: THREE.AnimationAction | null = null;
  private currentLoopAction: THREE.AnimationAction | null = null;
  private currentAnimationMixer: THREE.AnimationMixer | null = null;
  private currentAnimationFinishedHandler: THREE.EventListener<any, any, any> | null = null;
  private currentAnimationError: string | null = null;
  private currentAnimationRetargetDebug: AnimationRetargetDebug | null = null;
  private controllerOutlineColor: THREE.Color | null = null;
  private controllerOutlineBlending = 0;
  private queuedLoopClipName: string | null = null;
  private currentFaceMotionSet: FaceMotionSet | null = null;
  private currentFaceMotionClip: FaceMotionClip | null = null;
  private currentFaceMotionLoopClip: FaceMotionClip | null = null;
  private currentFaceMotionTime = 0;
  private currentFaceMotionError: string | null = null;
  private readonly currentHeadMorphRuntimes: HeadMorphRuntime[] = [];
  private currentRuntimeExtension: unknown = null;
  private currentSpringRuntime: SpringRuntimeController | null = null;
  private currentExtraBoneRuntime: SekaiExtraBoneRuntime | null = null;
  private currentPrefabSourceGraph: UnityPrefabSourceGraph | null = null;
  private currentPrefabHeadFollowDebug: PrefabHeadFollowDebug = {
    active: false,
    sourcePath: null,
    targetPath: null,
    reason: null,
  };
  private readonly animationClipCache = new Map<string, THREE.AnimationClip[]>();
  private readonly smoothedLoopClipCache = new WeakMap<THREE.AnimationClip, THREE.AnimationClip>();
  private animationPlaybackSpeed = 1;
  private animationPaused = false;
  private faceMotionEnabled = true;
  private bodyHeadTracksEnabled = true;
  private springRuntimeMode: SpringRuntimeMode = "unity-prefab";
  private animationRevision = 0;
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
  private hairShadowMode: HairShadowMode = "sekai_head_position";
  private bodyDebugMode: BodyDebugMode = "off";
  private toonShadowWidthOverride: number | null = null;
  private toonValueShadowInfluence = COSTUME_SHOP_BODY_VALUE_SHADOW_INFLUENCE;
  private currentCameraPreset: PjskCameraPreset = "default";
  private currentCameraProfile: PjskCameraProfile | null = null;
  private faceSdfEnabled = false;
  private faceSdfDebugMode: FaceSdfDebugMode = "off";
  private faceSdfDebugLightMode: FaceSdfDebugLightMode = "scene";
  private renderIsolationMode: RenderIsolationMode = "normal";
  private cameraDebugChangeCallback: (() => void) | null = null;
  private currentLoadedRuntimePackage: RuntimePackageLoadResult | null = null;
  private lastNativeMeshInstallDiagnostics: NativeMeshInstallDiagnostics | null = null;
  private lastConstraintSetupDiagnostics: RuntimeConstraintDebug | null = null;
  private readonly runtimeDebug: RuntimeDebugSnapshot = {
    materialBindingMode: "manifest",
    hairShadowMode: this.hairShadowMode,
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
      valueShadowInfluence: this.toonValueShadowInfluence,
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
      valueShadowInfluence: this.toonValueShadowInfluence,
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
      ? {
          activeClipName: this.currentAnimationClipName,
          currentTime: this.currentAnimationAction?.time ?? 0,
        }
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
    this.currentBodyAttachNode = null;
    this.currentHeadAttachOriginNode = null;
    this.runtimeDebug.headMorphs = [];
    this.currentHeadMorphRuntimes.length = 0;
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
    this.bindHeadMorphTargets(loaded.root, characterAsset.headAsset);
    this.prepareCombinedComposition();
    this.currentExtraBoneRuntime = SekaiExtraBoneRuntime.fromPjskRuntimeExtension(
      this.currentRuntimeExtension,
      loaded.prefabSourceGraph.root
    );
    this.currentSpringRuntime = this.createSpringRuntime(loaded.prefabSourceGraph.root);
    this.syncUnityPrefabSourceGraph();
    await this.refreshAnimationPlayback({
      resetSpring: preservedAnimation === null,
    });
    if (preservedAnimation) {
      if (this.currentAnimationAction) {
        const restoreLoop = Boolean(
          this.currentAnimationLoopUrl &&
          preservedAnimation.activeClipName &&
          (
            preservedAnimation.activeClipName === this.queuedLoopClipName ||
            isLoopClipName(
              preservedAnimation.activeClipName,
              this.currentAnimationLoopUrl
            )
          )
        );
        if (restoreLoop) {
          this.activateQueuedLoopForSeek();
        }
        const duration = Math.max(this.currentAnimationDuration, 0);
        this.currentAnimationAction.time = duration > 0
          ? restoreLoop
            ? THREE.MathUtils.euclideanModulo(preservedAnimation.currentTime, duration)
            : THREE.MathUtils.clamp(preservedAnimation.currentTime, 0, duration)
          : Math.max(preservedAnimation.currentTime, 0);
        this.currentAnimationMixer?.update(0);
      }
      this.applyCurrentFaceMotionFrame();
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
    this.applyRenderIsolationMode();
    return snapshot;
  }

  setHairShadowMode(mode: HairShadowMode) {
    this.hairShadowMode = normalizeHairShadowMode(mode);
    this.runtimeDebug.hairShadowMode = this.hairShadowMode;
    this.applyHairShadowModeUniforms();
  }

  setProjectedShadowSettings(settings: ProjectedShadowSettingsInput = {}) {
    this.projectedShadow.setSettings(settings);
  }

  setFaceSdfDebugMode(mode: FaceSdfDebugMode) {
    this.faceSdfDebugMode = mode;
    this.applyFaceSdfDebugUniforms();
  }

  setFaceSdfEnabled(enabled: boolean) {
    this.faceSdfEnabled = enabled;
    this.applyFaceSdfRuntimeUniforms();
  }

  setBodyDebugMode(mode: BodyDebugMode) {
    this.bodyDebugMode = mode;
    this.applyBodyDebugUniforms();
  }

  setToonShadowPreview(shadowWidthOverride: number | null, valueShadowInfluence: number) {
    this.toonShadowWidthOverride =
      shadowWidthOverride === null ? null : Math.max(0.0, shadowWidthOverride);
    this.toonValueShadowInfluence = THREE.MathUtils.clamp(valueShadowInfluence, 0.0, 1.0);
    this.applyToonShadowPreviewUniforms();
  }

  setFaceSdfDebugLightMode(mode: FaceSdfDebugLightMode) {
    this.faceSdfDebugLightMode = mode;
    this.updateShaderFaceBasis();
    this.applyFaceSdfDebugUniforms();
  }

  setRenderIsolationMode(mode: RenderIsolationMode) {
    this.renderIsolationMode = mode;
    this.applyRenderIsolationMode();
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

  private applyRenderIsolationMode() {
    const faceSdfEnabled = this.shouldEnableFaceSdfForCurrentView();
    const eyelightOnly = this.renderIsolationMode === "eyelight_only";
    const noEyelight = this.renderIsolationMode === "no_eyelight";
    const faceLayersVisible = this.renderIsolationMode !== "no_face_layers";
    const outlineOnly = this.renderIsolationMode === "outline_only";
    const outlineVisible = this.renderIsolationMode !== "no_outline";
    const noEyeThroughHair = this.renderIsolationMode === "no_eye_through_hair";
    const eyeThroughHairOnly =
      this.renderIsolationMode === "eye_through_hair_only" ||
      this.renderIsolationMode === "eye_through_hair_eye_only" ||
      this.renderIsolationMode === "eye_through_hair_eyebrow_only" ||
      this.renderIsolationMode === "eye_through_hair_eyelash_only";
    const apply = (node: THREE.Object3D) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) {
        return;
      }
      if (
        mesh.userData.pjskEyeThroughHairOverlay ||
        mesh.userData.pjskEyeThroughHairStencilPrepass
      ) {
        const source = mesh.userData.pjskEyeThroughHairSource;
        const sourceKind = typeof mesh.userData.pjskEyeThroughHairSourceKind === "string"
          ? mesh.userData.pjskEyeThroughHairSourceKind
          : "";
        const passKind = typeof mesh.userData.pjskEyeThroughHairPassKind === "string"
          ? mesh.userData.pjskEyeThroughHairPassKind
          : "";
        const sourceVisible = source instanceof THREE.Object3D
          ? source.visible
          : true;
        if (source instanceof THREE.Object3D) {
          mesh.layers.mask = source.layers.mask;
        }
        mesh.visible =
          sourceVisible &&
          !outlineOnly &&
          !eyelightOnly &&
          !noEyeThroughHair &&
          isEyeThroughHairSourceAllowed(sourceKind, this.renderIsolationMode) &&
          isEyeThroughHairPassAllowed(sourceKind, passKind, this.renderIsolationMode) &&
          faceLayersVisible &&
          (!noEyelight || sourceKind !== "eyelight");
        mesh.userData.pjskEyeThroughHairBaseVisible = mesh.visible;
        return;
      }
      if (mesh.userData.pjskOutlineShell) {
        const sourceKind = typeof mesh.userData.pjskSourceMaterialKind === "string"
          ? mesh.userData.pjskSourceMaterialKind
          : "";
        const isFaceLayerOutline = isFaceOrFaceLayerMaterialKind(sourceKind);
        if (eyelightOnly) {
          mesh.visible = sourceKind === "eye" || sourceKind === "eyelight";
          return;
        }
        mesh.visible =
          !eyeThroughHairOnly &&
          outlineVisible &&
          !isOutlineHiddenByIsolation(sourceKind, this.renderIsolationMode) &&
          (!noEyelight || sourceKind !== "eyelight") &&
          (!isFaceLayerOutline || faceLayersVisible);
        return;
      }
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      let isFaceLayer = false;
      let isEyelightLayer = false;
      for (const material of materials) {
        if (material instanceof THREE.ShaderMaterial) {
          const materialDraws = material.visible !== false && material.colorWrite !== false;
          if (material.uniforms.uFaceSdfEnabled) {
            material.uniforms.uFaceSdfEnabled.value =
              faceSdfEnabled && this.isFaceSdfCapableMaterial(material) ? 1.0 : 0.0;
            isFaceLayer = true;
          }
          if (material.uniforms.uMode && !material.uniforms.uFaceSdfEnabled) {
            isFaceLayer = true;
            isEyelightLayer = isEyelightLayer || (materialDraws && material.uniforms.uMode.value > 1.5);
          }
        }
      }
      if (outlineOnly) {
        mesh.visible = false;
      } else if (eyeThroughHairOnly) {
        mesh.visible = false;
      } else if (eyelightOnly) {
        mesh.visible = isFaceLayer && materials.some((material) => {
          const kind = material.userData.pjskMaterialKind;
          return kind === "eye" || kind === "eyelight";
        });
      } else if (isFaceLayer) {
        mesh.visible = faceLayersVisible && (!noEyelight || !isEyelightLayer);
      } else {
        mesh.visible = !eyelightOnly;
      }
      const source = mesh.userData.pjskEyeThroughHairSource;
      if (source instanceof THREE.Object3D) {
        mesh.visible = mesh.visible && source.visible;
        mesh.layers.mask = source.layers.mask;
      }
    };
    for (const slot of [this.bodySlot, this.headSlot]) {
      slot.traverse(apply);
    }
    for (const entries of [this.runtimeDebug.body, this.runtimeDebug.head]) {
      for (const entry of entries) {
        if (entry.shaderFaceSdfEnabled !== undefined || entry.resolvedKind === "face_sdf") {
          const capable = entry.faceSdfCapable === true;
          entry.shaderFaceSdfEnabled = faceSdfEnabled && capable ? 1.0 : 0.0;
        }
      }
    }
  }

  private shouldEnableFaceSdfForCurrentView() {
    if (this.renderIsolationMode === "no_face_sdf") {
      return false;
    }
    return this.faceSdfEnabled || this.renderIsolationMode === "face_sdf";
  }

  private isFaceSdfCapableMaterial(material: THREE.ShaderMaterial) {
    return material.userData.pjskFaceSdfCapable === true;
  }

  private applyFaceSdfRuntimeUniforms() {
    const enabled = this.shouldEnableFaceSdfForCurrentView();
    for (const slot of [this.bodySlot, this.headSlot]) {
      slot.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh) {
          return;
        }
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of materials) {
          if (material instanceof THREE.ShaderMaterial && material.uniforms.uFaceSdfEnabled) {
            material.uniforms.uFaceSdfEnabled.value =
              enabled && this.isFaceSdfCapableMaterial(material) ? 1.0 : 0.0;
          }
        }
      });
    }
    for (const entries of [this.runtimeDebug.body, this.runtimeDebug.head]) {
      for (const entry of entries) {
        if (entry.shaderFaceSdfEnabled !== undefined || entry.resolvedKind === "face_sdf") {
          entry.shaderFaceSdfEnabled = enabled && entry.faceSdfCapable === true ? 1.0 : 0.0;
        }
      }
    }
  }

  private updateEyeThroughHairViewGate() {
    this.tempVector.copy(this.camera.position).sub(this.faceHeadWorldPosition);
    const cameraSideValid = this.tempVector.lengthSq() > 0.000001;
    const cameraDirection = cameraSideValid
      ? this.tempVector.normalize()
      : this.tempVector.set(0, 0, 1);
    const faceCameraDot = cameraSideValid
      ? cameraDirection.dot(this.faceForwardWorld)
      : 1.0;
    for (const slot of [this.bodySlot, this.headSlot]) {
      slot.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (
          !mesh.isMesh ||
          (
            !mesh.userData.pjskEyeThroughHairOverlay &&
            !mesh.userData.pjskEyeThroughHairStencilPrepass
          )
        ) {
          return;
        }
        const baseVisible = mesh.userData.pjskEyeThroughHairBaseVisible;
        const sourceVisible = typeof baseVisible === "boolean" ? baseVisible : mesh.visible;
        if (mesh.userData.pjskEyeThroughHairStencilPrepass) {
          mesh.visible = sourceVisible;
          return;
        }
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        let passVisible = false;
        for (const material of materials) {
          const alpha = updateSekaiEyelashPassView(material, faceCameraDot);
          passVisible ||= alpha === null || alpha > 0.001;
        }
        mesh.visible = sourceVisible && passVisible;
      });
    }
  }

  private applyFaceSdfDebugUniforms() {
    const debugUniform = faceSdfDebugModeToUniform(this.faceSdfDebugMode);
    this.faceMaterial.uniforms.uFaceDebugMode.value = debugUniform;
    for (const slot of [this.bodySlot, this.headSlot]) {
      slot.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh) {
          return;
        }
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of materials) {
          if (material instanceof THREE.ShaderMaterial && material.uniforms.uFaceDebugMode) {
            material.uniforms.uFaceDebugMode.value = debugUniform;
          }
        }
      });
    }
    for (const entries of [this.runtimeDebug.body, this.runtimeDebug.head]) {
      for (const entry of entries) {
        if (entry.resolvedKind === "face_sdf" || entry.shaderFaceDebugMode !== undefined) {
          entry.shaderFaceDebugMode = debugUniform;
        }
      }
    }
  }

  private applyBodyDebugUniforms() {
    const debugUniform = bodyDebugModeToUniform(this.bodyDebugMode);
    for (const slot of [this.bodySlot, this.headSlot]) {
      slot.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh) {
          return;
        }
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of materials) {
          if (material instanceof THREE.ShaderMaterial && material.uniforms.uBodyDebugMode) {
            material.uniforms.uBodyDebugMode.value = debugUniform;
          }
        }
      });
    }
    for (const entries of [this.runtimeDebug.body, this.runtimeDebug.head]) {
      for (const entry of entries) {
        if (entry.shaderBodyDebugMode !== undefined || entry.resolvedKind === "body") {
          entry.shaderBodyDebugMode = debugUniform;
        }
      }
    }
  }

  private applyToonShadowPreviewUniforms() {
    const shadowWidthUniform = this.toonShadowWidthOverride ?? -1.0;
    const applyUniforms = (material: THREE.Material) => {
      if (!(material instanceof THREE.ShaderMaterial)) {
        return;
      }
      if (material.uniforms.uShadowWidthOverride) {
        material.uniforms.uShadowWidthOverride.value = shadowWidthUniform;
      }
      if (material.uniforms.uValueShadowInfluence) {
        material.uniforms.uValueShadowInfluence.value = this.toonValueShadowInfluence;
      }
    };

    applyUniforms(this.bodyMaterial);
    applyUniforms(this.hairMaterial);
    for (const slot of [this.bodySlot, this.headSlot]) {
      slot.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh) {
          return;
        }
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of materials) {
          applyUniforms(material);
        }
      });
    }

    for (const entries of [this.runtimeDebug.body, this.runtimeDebug.head]) {
      for (const entry of entries) {
        const hasToonShadowPreviewUniforms =
          entry.shaderShadowWidthOverride !== undefined &&
          entry.shaderShadowWidthOverride !== null &&
          entry.shaderValueShadowInfluence !== undefined &&
          entry.shaderValueShadowInfluence !== null;
        if (hasToonShadowPreviewUniforms) {
          entry.shaderShadowWidthOverride = shadowWidthUniform;
          entry.shaderValueShadowInfluence = this.toonValueShadowInfluence;
        }
      }
    }
  }

  private isHeadProximityHairShadowEnabled() {
    return this.hairShadowMode === "sekai_head_position";
  }

  private applyHairShadowModeUniforms() {
    const enabled = this.isHeadProximityHairShadowEnabled() ? 1.0 : 0.0;
    if (this.hairMaterial.uniforms.uHairShadowEnabled) {
      this.hairMaterial.uniforms.uHairShadowEnabled.value = enabled;
    }
    for (const slot of [this.bodySlot, this.headSlot]) {
      slot.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh) {
          return;
        }
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of materials) {
          if (
            material instanceof THREE.ShaderMaterial &&
            material.userData.pjskMaterialKind === "hair" &&
            material.uniforms.uHairShadowEnabled
          ) {
            material.uniforms.uHairShadowEnabled.value = enabled;
          }
        }
      });
    }
    for (const entry of this.runtimeDebug.head) {
      if (entry.resolvedKind === "hair" && entry.shaderHairShadowEnabled !== undefined) {
        entry.shaderHairShadowEnabled = enabled;
      }
    }
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
    const lightDirection = this.getFaceShadowLightDirection();
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
    const prefabHeadFollow = this.getPrefabHeadFollowDebugSnapshot();
    const bodyRetargetDebug = this.currentAnimationRetargetDebug
      ? {
          ...this.currentAnimationRetargetDebug,
          prefabHeadFollow,
        }
      : this.currentPrefabSourceGraph
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
      selectedUrl: this.currentAnimationUrl,
      selectedLoopUrl: this.currentAnimationLoopUrl,
      activeClipName: this.currentAnimationClipName,
      queuedLoopClipName: this.queuedLoopClipName,
      currentTime: this.currentAnimationAction?.time ?? 0,
      duration: this.currentAnimationDuration,
      paused: this.animationPaused,
      speed: this.animationPlaybackSpeed,
      faceMotionEnabled: this.faceMotionEnabled,
      bodyHeadTracksEnabled: this.bodyHeadTracksEnabled,
      bodyTrackDebug: makeAnimationTrackDebug(
        this.currentAnimationAction?.getClip() ?? null,
        utjControlledNodeNames
      ),
      bodyLoopTrackDebug: makeAnimationTrackDebug(
        this.currentLoopAction?.getClip() ?? null,
        utjControlledNodeNames
      ),
      bodyRetargetDebug,
      error: this.currentAnimationError,
    };
  }

  getFaceMotionSnapshot(): FaceMotionPlaybackSnapshot {
    return {
      activeClipName: this.currentFaceMotionClip?.name ?? null,
      queuedLoopClipName: this.currentFaceMotionLoopClip?.name ?? null,
      error: this.currentFaceMotionError,
      currentTime: this.currentFaceMotionTime,
      mappedMeshCount: this.currentHeadMorphRuntimes.length,
      mappedCurveCount: this.currentHeadMorphRuntimes.reduce(
        (sum, runtime) => sum + runtime.curveIndexByHash.size,
        0
      ),
    };
  }

  setAnimationPaused(paused: boolean) {
    this.animationPaused = paused;
    this.applyAnimationPlaybackSettings();
  }

  setAnimationSpeed(speed: number) {
    this.animationPlaybackSpeed = speed;
    this.applyAnimationPlaybackSettings();
  }

  setFaceMotionEnabled(enabled: boolean) {
    this.faceMotionEnabled = enabled;
    if (enabled) {
      this.applyCurrentFaceMotionFrame();
    } else {
      this.clearFaceMotionInfluences();
    }
  }

  setBodyHeadTracksEnabled(enabled: boolean) {
    if (this.bodyHeadTracksEnabled === enabled) {
      return;
    }
    this.bodyHeadTracksEnabled = enabled;
    void this.refreshAnimationPlayback();
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
      return UnityPrefabSpringRuntime.fromPjskRuntimeExtension(
        this.currentRuntimeExtension,
        root
      );
    }

    return null;
  }

  seekAnimation(time: number) {
    const duration = Math.max(this.currentAnimationDuration, 0);
    const nextTime = duration > 0
      ? THREE.MathUtils.clamp(time, 0, duration)
      : Math.max(time, 0);
    this.animationPaused = true;
    this.applyAnimationPlaybackSettings();
    if (this.currentAnimationAction) {
      this.currentAnimationAction.paused = false;
      this.currentAnimationAction.time = nextTime;
    }
    this.currentAnimationMixer?.update(0);
    this.currentFaceMotionTime = nextTime;
    this.applyCurrentFaceMotionFrame();
    this.syncOfficialModelCombineSetup();
    this.resetCurrentSpringRuntimeState();
    this.applyAnimationPlaybackSettings();
  }

  seekAnimationPhase(phase: number) {
    const duration = Math.max(this.currentAnimationDuration, 0);
    const clampedPhase = THREE.MathUtils.clamp(
      Number.isFinite(phase) ? phase : 0,
      0,
      1
    );
    this.seekAnimation(duration * clampedPhase);
    return this.getAnimationSnapshot();
  }

  seekAnimationLoopPhase(phase: number) {
    this.activateQueuedLoopForSeek();
    return this.seekAnimationPhase(phase);
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
      this.currentAnimationMixer?.update(stepDelta);
      this.updateFaceMotion(stepDelta);
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
    this.updateEyeThroughHairViewGate();
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
      this.currentAnimationUrl === nextAnimationUrl &&
      this.currentAnimationLoopUrl === nextLoopUrl;
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
    if (faceMotion && (force || !this.currentFaceMotionSet)) {
      this.setFaceMotionSet(
        faceMotion,
        "face",
        defaultLoopUrl ? "face_loop" : null
      );
    }
    if (animationUrl && (force || !this.currentAnimationUrl)) {
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
    this.currentFaceMotionSet = data;
    this.currentFaceMotionError = null;
    this.currentFaceMotionTime = 0;
    this.currentFaceMotionClip = null;
    this.currentFaceMotionLoopClip = null;

    if (!data || !data.clips.length) {
      this.clearFaceMotionInfluences();
      return;
    }

    const selected = data.clips.find((clip) => clip.name === preferredClipName)
      ?? data.clips[0]
      ?? null;
    this.currentFaceMotionClip = selected;
    if (!selected) {
      return;
    }

    if (preferredLoopClipName && preferredLoopClipName !== selected.name) {
      this.currentFaceMotionLoopClip =
        data.clips.find((clip) => clip.name === preferredLoopClipName) ?? null;
    }

    this.applyCurrentFaceMotionFrame();
  }

  async setAnimationSelection(selection: BodyAnimationSelection | null) {
    this.currentAnimationUrl = selection?.motionUrl ?? null;
    this.currentAnimationKind = inferBodyAnimationKind(
      this.currentAnimationUrl,
      selection?.motionKind
    );
    this.currentAnimationLoopUrl = selection?.loopUrl ?? null;
    this.currentAnimationLoopKind = inferBodyAnimationKind(
      this.currentAnimationLoopUrl,
      selection?.loopKind
    );
    await this.refreshAnimationPlayback();
    return this.getAnimationSnapshot();
  }

  updatePreviewLight(next: PreviewLightState) {
    this.applyCharacterHeight(next.characterHeight);
    this.directionalLight.position.set(
      next.x,
      next.y,
      next.z
    );
    this.directionalLight.intensity = next.intensity;
    this.fillLight.intensity = next.ambient;
    updateSekaiBodyMaterial(this.bodyMaterial, {
      baseColor: this.currentBodyAsset?.proxy.bodyColor ?? "#f5d6d0",
      shadowColor: this.currentBodyAsset?.proxy.shadowColor ?? "#c79b95",
      skinColorDefault:
        this.currentHeadAsset?.proxy.skinColorDefault ??
        this.currentHeadAsset?.proxy.faceColor ??
        this.currentBodyAsset?.proxy.bodyColor ??
        "#f5d6d0",
      skinColor1:
        this.currentHeadAsset?.proxy.skinColor1 ??
        this.currentHeadAsset?.proxy.faceShadeColor ??
        this.currentBodyAsset?.proxy.shadowColor ??
        "#c79b95",
      skinColor2:
        this.currentHeadAsset?.proxy.skinColor2 ??
        this.currentHeadAsset?.proxy.faceShadeColor ??
        this.currentBodyAsset?.proxy.shadowColor ??
        "#c79b95",
      lightDirection: this.directionalLight.position.clone(),
      lightIntensity: next.intensity,
      ambientIntensity: next.ambient,
      shadowThreshold: next.shadowThreshold,
      shadowWeight: next.shadowWeight,
      characterAmbientIntensity: next.characterAmbient,
      rimIntensity: next.rimIntensity,
      controllerRimThreshold: next.rimThreshold,
      rimDirectionality: next.rimDirectionality,
      rimDirection: getSekaiPreviewRimDirection(),
      specularPower: this.bodyMaterial.uniforms.uSpecularPower.value,
      rimThreshold: this.bodyMaterial.uniforms.uRimThreshold.value,
      shadowTexWeight: this.bodyMaterial.uniforms.uShadowTexWeight.value,
      shadowWidthOverride: this.toonShadowWidthOverride,
      valueShadowInfluence: this.toonValueShadowInfluence,
      saturation: this.bodyMaterial.uniforms.uSaturation.value,
      partsAmbientColor: `#${this.bodyMaterial.uniforms.uPartsAmbientColor.value.getHexString()}`,
      reflectionBlendColor: `#${this.bodyMaterial.uniforms.uReflectionBlendColor.value.getHexString()}`,
      globalShadowColor: `#${this.bodyMaterial.uniforms.uGlobalShadowColor.value.getHexString()}`,
      controllerAmbientColor: `#${this.bodyMaterial.uniforms.uControllerAmbientColor.value.getHexString()}`,
      controllerRimColor: `#${this.bodyMaterial.uniforms.uControllerRimColor.value.getHexString()}`,
      controllerShadowRimColor: `#${this.bodyMaterial.uniforms.uControllerShadowRimColor.value.getHexString()}`,
      controllerRimColorWeight: this.bodyMaterial.uniforms.uControllerRimColorWeight.value,
      controllerShadowRimColorWeight: this.bodyMaterial.uniforms.uControllerShadowRimColorWeight.value,
      controllerRimEdgeSmoothness: this.bodyMaterial.uniforms.uControllerRimEdgeSmoothness.value,
      controllerRimShadowSharpness: this.bodyMaterial.uniforms.uControllerRimShadowSharpness.value,
      bodyDebugMode: bodyDebugModeToUniform(this.bodyDebugMode),
      skinTintEnabled: true,
    });
    updateSekaiBodyMaterial(this.hairMaterial, {
      baseColor: this.currentHeadAsset?.proxy.hairColor ?? "#7b5b4a",
      shadowColor: this.currentHeadAsset?.proxy.hairShadowColor ?? "#513d33",
      lightDirection: this.directionalLight.position.clone(),
      lightIntensity: next.intensity,
      ambientIntensity: next.ambient,
      shadowThreshold: next.shadowThreshold,
      shadowWeight: next.shadowWeight,
      characterAmbientIntensity: next.characterAmbient,
      rimIntensity: next.rimIntensity,
      controllerRimThreshold: next.rimThreshold,
      rimDirectionality: next.rimDirectionality,
      rimDirection: getSekaiPreviewRimDirection(),
      specularPower: this.hairMaterial.uniforms.uSpecularPower.value,
      rimThreshold: this.hairMaterial.uniforms.uRimThreshold.value,
      shadowTexWeight: this.hairMaterial.uniforms.uShadowTexWeight.value,
      shadowWidthOverride: this.toonShadowWidthOverride,
      valueShadowInfluence: this.toonValueShadowInfluence,
      saturation: this.hairMaterial.uniforms.uSaturation.value,
      partsAmbientColor: `#${this.hairMaterial.uniforms.uPartsAmbientColor.value.getHexString()}`,
      reflectionBlendColor: `#${this.hairMaterial.uniforms.uReflectionBlendColor.value.getHexString()}`,
      globalShadowColor: `#${this.hairMaterial.uniforms.uGlobalShadowColor.value.getHexString()}`,
      controllerAmbientColor: `#${this.hairMaterial.uniforms.uControllerAmbientColor.value.getHexString()}`,
      controllerRimColor: `#${this.hairMaterial.uniforms.uControllerRimColor.value.getHexString()}`,
      controllerShadowRimColor: `#${this.hairMaterial.uniforms.uControllerShadowRimColor.value.getHexString()}`,
      controllerRimColorWeight: this.hairMaterial.uniforms.uControllerRimColorWeight.value,
      controllerShadowRimColorWeight: this.hairMaterial.uniforms.uControllerShadowRimColorWeight.value,
      controllerRimEdgeSmoothness: this.hairMaterial.uniforms.uControllerRimEdgeSmoothness.value,
      controllerRimShadowSharpness: this.hairMaterial.uniforms.uControllerRimShadowSharpness.value,
      skinTintEnabled: false,
      hairShadowEnabled: false,
    });
    updateSekaiFaceMaterial(this.faceMaterial, {
      baseColor: this.currentHeadAsset?.proxy.faceColor ?? "#ffe4dc",
      warmColor: this.currentHeadAsset?.proxy.faceShadeColor ?? "#ffd4c8",
      skinColorDefault:
        this.currentHeadAsset?.proxy.skinColorDefault ??
        this.currentHeadAsset?.proxy.faceColor ??
        "#ffe4dc",
      skinColor1:
        this.currentHeadAsset?.proxy.skinColor1 ??
        this.currentHeadAsset?.proxy.faceShadeColor ??
        "#ffd4c8",
      skinColor2:
        this.currentHeadAsset?.proxy.skinColor2 ??
        this.currentHeadAsset?.proxy.faceShadeColor ??
        "#ffd4c8",
      lightDirection: COSTUME_SHOP_FACE_SHADOW_LIGHT_DIRECTION.clone(),
      lightIntensity: next.intensity,
      ambientIntensity: next.ambient,
      headDotDirectionalLight: this.headDotDirectionalLight,
      useFaceShadowLimiter: COSTUME_SHOP_USE_FACE_SHADOW_LIMITER,
      faceShadowLimitRange: COSTUME_SHOP_FACE_SHADOW_LIMIT_RANGE,
    });
    this.updateLoadedMaterialLight(next);
  }

  updateGlobalShadowColor(color: THREE.ColorRepresentation) {
    const nextColor = new THREE.Color(color);
    for (const material of [this.bodyMaterial, this.hairMaterial]) {
      material.uniforms.uGlobalShadowColor?.value.copy(nextColor);
    }
    for (const slot of [this.bodySlot, this.headSlot]) {
      slot.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh) {
          return;
        }
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of materials) {
          if (material instanceof THREE.ShaderMaterial) {
            material.uniforms.uGlobalShadowColor?.value.copy(nextColor);
          }
        }
      });
    }
  }

  updateLightControllerColors(colors: {
    ambientColor?: THREE.ColorRepresentation | null;
    rimColor?: THREE.ColorRepresentation | null;
    shadowRimColor?: THREE.ColorRepresentation | null;
  }) {
    const ambientColor = new THREE.Color(colors.ambientColor ?? "#ffffff");
    const rimColor = new THREE.Color(colors.rimColor ?? "#e6edf9");
    const shadowRimColor = new THREE.Color(colors.shadowRimColor ?? "#ffffff");
    const rimColorWeight = colors.rimColor ? 1.0 : 0.0;
    const shadowRimColorWeight = colors.shadowRimColor ? 1.0 : 0.0;
    const applyUniforms = (material: THREE.ShaderMaterial) => {
      material.uniforms.uControllerAmbientColor?.value.copy(ambientColor);
      material.uniforms.uControllerRimColor?.value.copy(rimColor);
      material.uniforms.uControllerShadowRimColor?.value.copy(shadowRimColor);
      if (material.uniforms.uControllerRimColorWeight) {
        material.uniforms.uControllerRimColorWeight.value = rimColorWeight;
      }
      if (material.uniforms.uControllerShadowRimColorWeight) {
        material.uniforms.uControllerShadowRimColorWeight.value = shadowRimColorWeight;
      }
    };
    for (const material of [this.bodyMaterial, this.hairMaterial]) {
      applyUniforms(material);
    }
    for (const slot of [this.bodySlot, this.headSlot]) {
      slot.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh) {
          return;
        }
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of materials) {
          if (material instanceof THREE.ShaderMaterial) {
            applyUniforms(material);
          }
        }
      });
    }
  }

  updateLightControllerRimShape(shape: {
    edgeSmoothness?: number | null;
    shadowSharpness?: number | null;
  }) {
    const edgeSmoothness = THREE.MathUtils.clamp(
      shape.edgeSmoothness ?? 0.38,
      0.02,
      1.0
    );
    const shadowSharpness = THREE.MathUtils.clamp(
      shape.shadowSharpness ?? 0.0,
      0.0,
      1.0
    );
    const applyUniforms = (material: THREE.ShaderMaterial) => {
      if (material.uniforms.uControllerRimEdgeSmoothness) {
        material.uniforms.uControllerRimEdgeSmoothness.value = edgeSmoothness;
      }
      if (material.uniforms.uControllerRimShadowSharpness) {
        material.uniforms.uControllerRimShadowSharpness.value = shadowSharpness;
      }
    };
    for (const material of [this.bodyMaterial, this.hairMaterial]) {
      applyUniforms(material);
    }
    for (const slot of [this.bodySlot, this.headSlot]) {
      slot.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh) {
          return;
        }
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of materials) {
          if (material instanceof THREE.ShaderMaterial) {
            applyUniforms(material);
          }
        }
      });
    }
  }

  updateLightControllerOutline(outline: {
    color?: THREE.ColorRepresentation | null;
    blending?: number | null;
  }) {
    this.controllerOutlineColor = outline.color ? new THREE.Color(outline.color) : null;
    this.controllerOutlineBlending = THREE.MathUtils.clamp(
      outline.blending ?? (this.controllerOutlineColor ? 1.0 : 0.0),
      0.0,
      1.0
    );
    for (const slot of [this.bodySlot, this.headSlot]) {
      slot.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh || !mesh.userData.pjskOutlineShell) {
          return;
        }
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of materials) {
          if (material instanceof THREE.MeshBasicMaterial) {
            this.applyLightControllerOutlineMaterial(material);
          }
        }
      });
    }
  }

  private applyLightControllerOutlineMaterial(material: THREE.MeshBasicMaterial) {
    if (material.name !== "pjsk_shell_outline") {
      return;
    }
    const baseColor = new THREE.Color(
      typeof material.userData.pjskBaseOutlineColor === "string"
        ? material.userData.pjskBaseOutlineColor
        : "#1f1b1b"
    );
    if (!this.controllerOutlineColor) {
      material.color.copy(baseColor);
      material.opacity = typeof material.userData.pjskBaseOutlineOpacity === "number"
        ? material.userData.pjskBaseOutlineOpacity
        : 0.5;
      return;
    }
    material.color.copy(baseColor.lerp(this.controllerOutlineColor, this.controllerOutlineBlending));
    material.opacity = typeof material.userData.pjskBaseOutlineOpacity === "number"
      ? material.userData.pjskBaseOutlineOpacity
      : 0.5;
  }

  private updateLoadedMaterialLight(next: PreviewLightState) {
    const lightDirection = this.directionalLight.position.clone().normalize();
    const faceShadowLightDirection = COSTUME_SHOP_FACE_SHADOW_LIGHT_DIRECTION.clone();
    const rimDirection = getSekaiPreviewRimDirection();
    for (const slot of [this.bodySlot, this.headSlot]) {
      slot.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh) {
          return;
        }
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of materials) {
          if (!(material instanceof THREE.ShaderMaterial)) {
            continue;
          }
          const uniforms = material.uniforms;
          const lighting = material.userData.pjskLighting as MaterialLightingSettings | undefined;
          const isFaceShadowMaterial = Boolean(uniforms.uFaceShadowTex || uniforms.uHeadDotDirectionalLight);
          uniforms.uLightDirection?.value.copy(
            isFaceShadowMaterial ? faceShadowLightDirection : lightDirection
          );
          if (uniforms.uLightIntensity) {
            uniforms.uLightIntensity.value = next.intensity;
          }
          if (uniforms.uAmbientIntensity) {
            uniforms.uAmbientIntensity.value = next.ambient;
          }
          if (uniforms.uShadowThreshold) {
            uniforms.uShadowThreshold.value =
              lighting?.sekaiShadowThreshold ?? next.shadowThreshold;
          }
          if (uniforms.uShadowWeight) {
            uniforms.uShadowWeight.value = next.shadowWeight;
          }
          if (uniforms.uCharacterAmbientIntensity) {
            uniforms.uCharacterAmbientIntensity.value = next.characterAmbient;
          }
          if (uniforms.uRimIntensity) {
            uniforms.uRimIntensity.value = next.rimIntensity;
          }
          if (uniforms.uControllerRimThreshold) {
            uniforms.uControllerRimThreshold.value = next.rimThreshold;
          }
          if (uniforms.uRimDirectionality) {
            uniforms.uRimDirectionality.value = next.rimDirectionality;
          }
          uniforms.uRimDirection?.value.copy(rimDirection);
        }
      });
    }
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
    this.stopAnimationPlayback();
    if (!options.preserveAnimationSelection) {
      this.currentAnimationUrl = null;
      this.currentAnimationKind = null;
      this.currentAnimationLoopUrl = null;
      this.currentAnimationLoopKind = null;
      this.currentFaceMotionSet = null;
      this.currentFaceMotionClip = null;
      this.currentFaceMotionLoopClip = null;
      this.currentFaceMotionTime = 0;
      this.currentFaceMotionError = null;
    }
    if (options.clearAnimationCache) {
      this.animationClipCache.clear();
    }
    this.currentSpringRuntime?.resetPose();
    this.currentSpringRuntime = null;
    this.currentExtraBoneRuntime = null;
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
    this.currentHeadMorphRuntimes.length = 0;
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
      this.applyLightControllerOutlineMaterial(outlineMaterial);
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
    await bindBodyRuntimeMaterials({
      root,
      bodyAsset,
      headAsset: this.currentHeadAsset,
      textureLoader: this.textureLoader,
      template: this.bodyMaterial,
      bodyDebugMode: bodyDebugModeToUniform(this.bodyDebugMode),
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
        bodyDebugMode: bodyDebugModeToUniform(this.bodyDebugMode),
        faceDebugMode: faceSdfDebugModeToUniform(this.faceSdfDebugMode),
        faceSdfEnabled: this.shouldEnableFaceSdfForCurrentView(),
      },
      hair: {
        controllerPresent: Boolean(options.hairController),
        proximityShadowEnabled: this.isHeadProximityHairShadowEnabled(),
        headPosition: this.hairHeadPosition,
      },
      eyeController: options.eyeController,
      debug: this.runtimeDebug.head,
    });
  }

  private bindHeadMorphTargets(
    root: THREE.Object3D,
    headAsset: HeadAssetManifest
  ) {
    const manifestChannels = headAsset.morphChannels ?? [];
    const bindings = headAsset.morphChannelBindings ?? [];
    this.currentHeadMorphRuntimes.length = 0;

    root.traverse((node) => {
      if (
        node.userData.pjskEyeThroughHairOverlay ||
        node.userData.pjskEyeThroughHairStencilPrepass
      ) {
        return;
      }
      if (!isMorphMesh(node)) {
        return;
      }

      const mesh = node;
      const count = mesh.morphTargetInfluences?.length ?? 0;
      if (!count) {
        return;
      }

      if (
        (!mesh.morphTargetDictionary || !Object.keys(mesh.morphTargetDictionary).length) &&
        manifestChannels.length === count
      ) {
        mesh.morphTargetDictionary = Object.fromEntries(
          manifestChannels.map((channel, index) => [channel, index])
        );
      }

      const dictionary = mesh.morphTargetDictionary ?? {};
      const curveIndexByHash = new Map<number, number>();
      const controlledIndices: number[] = [];
      for (const binding of bindings) {
        const index = dictionary[binding.name];
        if (typeof index !== 'number') {
          continue;
        }
        curveIndexByHash.set(binding.curveHash, index);
        controlledIndices.push(index);
      }

      mesh.morphTargetInfluences?.fill(0);
      this.currentHeadMorphRuntimes.push({
        mesh,
        curveIndexByHash,
        controlledIndices: [...new Set(controlledIndices)],
      });

      const channelNames = Object.entries(dictionary)
        .sort((a, b) => a[1] - b[1])
        .map(([name]) => name);

      this.runtimeDebug.headMorphs.push({
        meshName: mesh.name,
        morphTargetCount: count,
        mappedChannelCount: curveIndexByHash.size,
        sampleChannels: channelNames.slice(0, 12),
      });
    });
  }

  private updateFaceMotion(delta: number) {
    if (
      this.animationPaused ||
      !this.faceMotionEnabled ||
      !this.currentFaceMotionClip ||
      this.currentHeadMorphRuntimes.length === 0
    ) {
      return;
    }

    this.currentFaceMotionTime += delta * this.animationPlaybackSpeed;
    const duration = this.currentFaceMotionClip.duration;
    if (duration > 0 && this.currentFaceMotionTime > duration) {
      if (this.currentFaceMotionLoopClip) {
        const loopTime = this.currentFaceMotionTime - duration;
        this.currentFaceMotionClip = this.currentFaceMotionLoopClip;
        this.currentFaceMotionLoopClip = null;
        this.currentFaceMotionTime = this.currentFaceMotionClip.duration > 0
          ? loopTime % this.currentFaceMotionClip.duration
          : 0;
      } else {
        this.currentFaceMotionTime %= duration;
      }
    }

    this.applyCurrentFaceMotionFrame();
  }

  private promoteFaceMotionLoop() {
    if (!this.currentFaceMotionLoopClip) {
      return;
    }

    this.currentFaceMotionClip = this.currentFaceMotionLoopClip;
    this.currentFaceMotionLoopClip = null;
    this.currentFaceMotionTime = 0;
    this.applyCurrentFaceMotionFrame();
  }

  private applyCurrentFaceMotionFrame() {
    if (!this.faceMotionEnabled || !this.currentFaceMotionClip) {
      return;
    }

    for (const runtime of this.currentHeadMorphRuntimes) {
      const influences = runtime.mesh.morphTargetInfluences;
      if (!influences) {
        continue;
      }
      for (const index of runtime.controlledIndices) {
        influences[index] = 0;
      }
      for (const curve of this.currentFaceMotionClip.curves) {
        const index = runtime.curveIndexByHash.get(curve.curveHash);
        if (index === undefined) {
          continue;
        }
        influences[index] = this.sampleFaceCurve(curve.keyframes, this.currentFaceMotionTime) / 100;
      }
    }
  }

  private clearFaceMotionInfluences() {
    for (const runtime of this.currentHeadMorphRuntimes) {
      const influences = runtime.mesh.morphTargetInfluences;
      if (!influences) {
        continue;
      }
      for (const index of runtime.controlledIndices) {
        influences[index] = 0;
      }
    }
  }

  private sampleFaceCurve(keyframes: FaceMotionKeyframe[], time: number) {
    if (!keyframes.length) {
      return 0;
    }
    if (time <= keyframes[0].time) {
      return keyframes[0].value;
    }
    for (let i = 1; i < keyframes.length; i += 1) {
      const prev = keyframes[i - 1];
      const next = keyframes[i];
      if (time <= next.time) {
        const span = next.time - prev.time;
        if (span <= 1e-6) {
          return next.value;
        }
        const t = (time - prev.time) / span;
        return prev.value + (next.value - prev.value) * t;
      }
    }
    return keyframes[keyframes.length - 1].value;
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
    const cameraPosition = this.camera.position;
    updateSekaiBodyCamera(this.bodyMaterial, cameraPosition);
    updateSekaiBodyCamera(this.hairMaterial, cameraPosition);
    for (const slot of [this.bodySlot, this.headSlot]) {
      slot.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh) {
          return;
        }
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of materials) {
          if (material instanceof THREE.ShaderMaterial && material.uniforms.uCameraPosition) {
            updateSekaiBodyCamera(material, cameraPosition);
          }
        }
      });
    }
  }

  private getFaceShadowLightDirection() {
    switch (this.faceSdfDebugLightMode) {
      case "front":
        return this.faceForwardWorld.clone();
      case "left":
        return this.faceRightWorld.clone().negate();
      case "right":
        return this.faceRightWorld.clone();
      case "back":
        return this.faceForwardWorld.clone().negate();
      default:
        return COSTUME_SHOP_FACE_SHADOW_LIGHT_DIRECTION.clone();
    }
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
    const faceShadowLightDirection = this.getFaceShadowLightDirection();
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
    updateSekaiFaceShadowParameters(
      this.faceMaterial,
      faceShadowLightDirection,
      this.headDotDirectionalLight,
      COSTUME_SHOP_USE_FACE_SHADOW_LIMITER,
      COSTUME_SHOP_FACE_SHADOW_LIMIT_RANGE
    );
    for (const slot of [this.bodySlot, this.headSlot]) {
      slot.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh) {
          return;
        }
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of materials) {
          if (!(material instanceof THREE.ShaderMaterial)) {
            continue;
          }
          if (material.uniforms.uHeadDotDirectionalLight) {
            updateSekaiFaceShadowParameters(
              material,
              faceShadowLightDirection,
              this.headDotDirectionalLight,
              (material.uniforms.uUseFaceShadowLimiter?.value ?? 1.0) > 0.5,
              material.uniforms.uFaceShadowLimitRange?.value ?? 0.0
            );
          }
          if (material.uniforms.uHeadPosition) {
            material.uniforms.uHeadPosition.value.copy(this.hairHeadPosition);
          }
        }
      });
    }
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

  private applyAnimationPlaybackSettings() {
    const actions = [this.currentAnimationAction, this.currentLoopAction];
    for (const action of actions) {
      if (!action) {
        continue;
      }
      action.paused = this.animationPaused;
      action.enabled = true;
      action.setEffectiveTimeScale(
        this.animationPaused ? 0 : this.animationPlaybackSpeed
      );
    }
  }

  private configureAnimationAction(action: THREE.AnimationAction) {
    action.zeroSlopeAtStart = false;
    action.zeroSlopeAtEnd = false;
  }

  private getSmoothedLoopClip(
    clip: THREE.AnimationClip,
    sourceUrl: string | null
  ) {
    void sourceUrl;
    const cached = this.smoothedLoopClipCache.get(clip);
    if (cached) {
      return cached;
    }
    const smoothed = createSmoothedLoopClip(clip, 60);
    if (smoothed === clip) {
      return clip;
    }
    this.smoothedLoopClipCache.set(clip, smoothed);
    return smoothed;
  }

  private stopAnimationPlayback() {
    if (this.currentAnimationMixer && this.currentAnimationFinishedHandler) {
      this.currentAnimationMixer.removeEventListener(
        "finished",
        this.currentAnimationFinishedHandler
      );
    }
    this.currentAnimationAction?.stop();
    this.currentLoopAction?.stop();
    this.currentAnimationMixer?.stopAllAction();
    this.currentAnimationAction = null;
    this.currentLoopAction = null;
    this.currentAnimationMixer = null;
    this.currentAnimationFinishedHandler = null;
    this.currentAnimationClipName = null;
    this.currentAnimationDuration = 0;
    this.currentAnimationRetargetDebug = null;
    this.queuedLoopClipName = null;
  }

  private preparePlayableBodyAnimationClip(
    sourceClip: THREE.AnimationClip,
    updateRetargetDebug = true
  ): THREE.AnimationClip | null {
    const clip = prepareRuntimeAnimationClip(
      sourceClip,
      this.bodyHeadTracksEnabled
    );
    if (!this.currentPrefabSourceGraph) {
      if (updateRetargetDebug) {
        this.currentAnimationRetargetDebug = {
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
          prefabHeadFollow: this.currentPrefabHeadFollowDebug,
        };
      }
      return clip;
    }

    if (!this.currentBodyAnimationRoot) {
      this.currentAnimationError = "Unity Prefab animation requires a loaded prefab root.";
      return null;
    }

    const retargeted = retargetUnityPrefabAnimationClip(
      clip,
      this.currentBodyAnimationRoot,
      this.currentRuntimeExtension
    );
    if (updateRetargetDebug) {
      this.currentAnimationRetargetDebug = {
        ...retargeted.debug,
        prefabHeadFollow: this.currentPrefabHeadFollowDebug,
      };
    }
    if (retargeted.error) {
      this.currentAnimationError = retargeted.error;
      return null;
    }
    return retargeted.clip;
  }

  private async refreshAnimationPlayback(
    options: { resetSpring?: boolean } = {}
  ) {
    const revision = ++this.animationRevision;
    const resetSpring = options.resetSpring ?? true;
    this.stopAnimationPlayback();
    this.currentAnimationError = null;

    if (!this.currentAnimationUrl || !this.currentBodyAnimationRoot) {
      this.syncOfficialModelCombineSetup();
      this.currentExtraBoneRuntime?.update();
      if (resetSpring) {
        this.resetCurrentSpringRuntimeState();
      }
      return;
    }

    const clipCacheKey = animationClipCacheKey(
      this.currentAnimationUrl,
      this.currentAnimationKind
    );
    let clips = this.animationClipCache.get(clipCacheKey);
    if (!clips) {
      if (this.currentAnimationKind !== "unity-json") {
        this.currentAnimationError = `Unity motion .msgpack.br is required for ${this.currentAnimationUrl}.`;
        return;
      }
      try {
        clips = decodeUnityMotionClips(
          await fetchRuntimeMessagePack(this.currentAnimationUrl)
        );
        this.animationClipCache.set(clipCacheKey, clips);
      } catch (error) {
        if (revision !== this.animationRevision) {
          return;
        }
        this.currentAnimationError = getErrorMessage(error);
        return;
      }
    }

    if (revision !== this.animationRevision) {
      return;
    }

    if (!clips.length) {
      this.currentAnimationError = `No clips found in ${this.currentAnimationUrl}`;
      return;
    }

    this.currentAnimationMixer = new THREE.AnimationMixer(
      this.currentBodyAnimationRoot
    );
    const sourceClip = clips.find((candidate) => !isLoopClipName(candidate.name, this.currentAnimationUrl))
      ?? clips[0];
    const clip = this.preparePlayableBodyAnimationClip(
      sourceClip
    );
    if (!clip) {
      return;
    }
    const clipName = clip.name || this.currentAnimationUrl;
    this.currentAnimationClipName = clipName;
    this.currentAnimationDuration = clip.duration;
    this.currentAnimationAction = this.currentAnimationMixer.clipAction(
      clip,
      this.currentBodyAnimationRoot
    );
    this.configureAnimationAction(this.currentAnimationAction);
    this.currentAnimationAction.reset();

    let loopClip: THREE.AnimationClip | null = null;
    const loopUrl = this.currentAnimationLoopUrl;
    if (loopUrl === this.currentAnimationUrl) {
      const sourceLoopClip = clips.find((candidate) => isLoopClipName(candidate.name, loopUrl))
        ?? clips.find((candidate) => candidate !== sourceClip)
        ?? null;
      loopClip = sourceLoopClip
        ? this.preparePlayableBodyAnimationClip(
          sourceLoopClip,
          false
        )
        : null;
    } else if (loopUrl) {
      const loopClipCacheKey = animationClipCacheKey(
        loopUrl,
        this.currentAnimationLoopKind
      );
      let loopClips = this.animationClipCache.get(loopClipCacheKey);
      if (!loopClips) {
        if (this.currentAnimationLoopKind === "unity-json") {
          try {
            loopClips = decodeUnityMotionClips(
              await fetchRuntimeMessagePack(loopUrl)
            );
            this.animationClipCache.set(loopClipCacheKey, loopClips);
          } catch {
            loopClips = undefined;
          }
        }
      }
      const sourceLoopClip = loopClips?.[0] ?? null;
      loopClip = sourceLoopClip
        ? this.preparePlayableBodyAnimationClip(
          sourceLoopClip,
          false
        )
        : null;
    }

    if (loopClip) {
      const playableLoopClip = this.getSmoothedLoopClip(loopClip, loopUrl);
      this.currentLoopAction = this.currentAnimationMixer.clipAction(
        playableLoopClip,
        this.currentBodyAnimationRoot
      );
      this.configureAnimationAction(this.currentLoopAction);
      this.currentLoopAction.reset();
      this.currentLoopAction.enabled = false;
      this.currentLoopAction.loop = THREE.LoopRepeat;
      this.currentLoopAction.clampWhenFinished = false;
      this.currentAnimationAction.loop = THREE.LoopOnce;
      this.currentAnimationAction.clampWhenFinished = true;
      this.queuedLoopClipName = playableLoopClip.name || loopUrl || `${clipName}_loop`;

      this.currentAnimationFinishedHandler = (event) => {
        if (
          event.action !== this.currentAnimationAction ||
          !this.currentLoopAction ||
          !this.currentAnimationMixer
        ) {
          return;
        }

        if (this.currentAnimationFinishedHandler) {
          this.currentAnimationMixer.removeEventListener(
            "finished",
            this.currentAnimationFinishedHandler
          );
          this.currentAnimationFinishedHandler = null;
        }

        this.currentAnimationAction?.stop();
        this.currentLoopAction.enabled = true;
        this.currentLoopAction.reset();
        this.currentLoopAction.play();
        this.currentAnimationAction = this.currentLoopAction;
        this.currentLoopAction = null;
        this.currentAnimationClipName = this.queuedLoopClipName;
        this.currentAnimationDuration = playableLoopClip.duration;
        this.queuedLoopClipName = null;
        this.promoteFaceMotionLoop();
        this.applyAnimationPlaybackSettings();
      };

      this.currentAnimationMixer.addEventListener(
        "finished",
        this.currentAnimationFinishedHandler
      );
      this.currentAnimationAction.play();
    } else {
      this.currentAnimationAction.loop = THREE.LoopRepeat;
      this.currentAnimationAction.clampWhenFinished = false;
      this.currentAnimationAction.play();
      this.queuedLoopClipName = null;
    }

    this.applyAnimationPlaybackSettings();
    this.currentAnimationMixer.update(0);
    this.syncOfficialModelCombineSetup();
    this.currentExtraBoneRuntime?.update();
    if (resetSpring) {
      this.resetCurrentSpringRuntimeState();
    }
  }

  private activateQueuedLoopForSeek() {
    if (
      !this.currentLoopAction ||
      !this.currentAnimationMixer ||
      !this.currentAnimationAction
    ) {
      return;
    }

    if (this.currentAnimationFinishedHandler) {
      this.currentAnimationMixer.removeEventListener(
        "finished",
        this.currentAnimationFinishedHandler
      );
      this.currentAnimationFinishedHandler = null;
    }

    this.currentAnimationAction.stop();
    this.currentLoopAction.enabled = true;
    this.currentLoopAction.reset();
    this.currentLoopAction.play();
    this.currentAnimationAction = this.currentLoopAction;
    this.currentLoopAction = null;
    this.currentAnimationClipName =
      this.queuedLoopClipName ?? this.currentAnimationAction.getClip().name;
    this.currentAnimationDuration = this.currentAnimationAction.getClip().duration;
    this.queuedLoopClipName = null;
    this.promoteFaceMotionLoop();
    this.applyAnimationPlaybackSettings();
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
      this.characterHeight
    );
  }

  private syncOfficialModelCombineSetup() {
    this.syncUnityPrefabSourceGraph();
  }

}

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  ensureRoleRuntimePackage,
  fetchRuntimeJson,
  loadRuntimePackageFromBaseUrl,
  type RuntimePackageLoadOptions,
  type RuntimePackageLoadResult,
} from "../runtime/runtimePackageLoader";
import type {
  BodyAssetManifest,
  CharacterAssemblyState,
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
  updateSekaiFaceBasis,
  updateSekaiFaceMaterial,
  updateSekaiFaceShadowParameters,
} from "../materials/sekaiFaceMaterial";
import {
  createSekaiLayerMaterial,
  type SekaiLayerAtlas,
} from "../materials/sekaiLayerMaterial";
import {
  type UtjSpringBoneDebugOptions,
  type UtjSpringBoneRuntimeSnapshot,
  type UtjSpringBoneTraceSnapshot,
} from "./utjSpringBoneRuntimeAdapter";
import { UnityPrefabSpringRuntime } from "./unityPrefabSpringRuntimeAdapter";
import { SekaiExtraBoneRuntime } from "./sekaiExtraBoneRuntime";
import {
  applyUnityRuntimeConstraints,
  type RuntimeConstraintDebug,
  type RuntimeConstraintSetupSource,
} from "./unityConstraintRuntime";
import {
  convertUnityPositionToThree,
  convertUnityDirectionToThree,
  convertUnityQuaternionToThree,
  readUnityQuaternion,
  readUnityVector3,
} from "./unityCoordinateConversion";
import type { SpringRuntimeMode } from "../config/viewerConfig";
import type {
  CustomPartSelection,
  RuntimePartType,
} from "../parts/runtimePartComposer";
import { runtimeRoleId } from "../parts/runtimePartComposer";

const DEFAULT_CAMERA_TARGET_SCALE = new THREE.Vector3(0.04835, 0.48222, 0.07241);
const DEFAULT_CAMERA_OFFSET_SCALE = new THREE.Vector3(-0.08532, 0.12848, 1.93551);
const DEFAULT_CAMERA_FOV = 35;
type CostumeShopCameraState = {
  cameraRootYawDegrees: number;
  zoomValue: number;
  zoomMoveValue: number;
};
const COSTUME_SHOP_CAMERA = {
  zoomDuration: 0.35,
  bottomLowerLimitPosition: 0.4,
  bottomUpperLimitPosition: 0.85,
  topLowerLimitPosition: 1.25,
  topUpperLimitPosition: 0.85,
  nearZ: 2.3,
  farZ: 4.5,
  fov: 25,
} as const;
const COSTUME_SHOP_CAMERA_OFFICIAL_DEFAULT_STATE = {
  cameraRootYawDegrees: 0,
  zoomValue: 0,
  zoomMoveValue: 1,
} as const;
const COSTUME_SHOP_CAMERA_FULL_BODY_STATE = {
  cameraRootYawDegrees: 0,
  zoomValue: COSTUME_SHOP_CAMERA.zoomDuration,
  zoomMoveValue: 0,
} as const;
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
const CAPTURE_CAMERA_LATERAL_SHIFT_SCALE = -0.0245;
const CHARACTER_EYE_STENCIL_BIT = 0x01;
const CHARACTER_EYELASH_STENCIL_BIT = 0x02;
const CHARACTER_EYEBROW_STENCIL_BIT = 0x04;
const CHARACTER_FACE_LAYER_STENCIL_MASK =
  CHARACTER_EYE_STENCIL_BIT |
  CHARACTER_EYELASH_STENCIL_BIT |
  CHARACTER_EYEBROW_STENCIL_BIT;
const NON_CHARACTER_FACE_LAYER_STENCIL_MASK =
  0xff & ~CHARACTER_FACE_LAYER_STENCIL_MASK;
const EYE_THROUGH_HAIR_FRONT_FADE_MIN = 0.45;
const EYE_THROUGH_HAIR_FRONT_FADE_MAX = 0.94;
const EYE_THROUGH_HAIR_SIDE_FADE_MIN = 0.18;
const EYE_THROUGH_HAIR_SIDE_FADE_MAX = 0.80;
const HAIR_ALPHA_CUTOFF = 0.02;
const ACCESSORY_ALPHA_CUTOFF = 0.02;
const EYE_THROUGH_HAIR_ALPHA = 0.42;
const EYELASH_THROUGH_HAIR_ALPHA = 0.55;
const EYELASH_THROUGH_HAIR_ALPHA_CUTOFF = 0.25;
const EYEBROW_THROUGH_HAIR_ALPHA = 0.55;
const FACE_SHADOW_HORIZONTAL_EPSILON = 0.00001;
const PROJECTED_SHADOW_BONE_NAMES = ["Left_Toe", "Right_Toe"] as const;
const PROJECTED_CROSS_SHADOW_OFFSET_FLOOR = 0.015;
const PROJECTED_DIRECTIONAL_SHADOW_OFFSET_FLOOR = 0.01;
const PROJECTED_SHADOW_INVISIBLE_HEIGHT = 0.2;

export type ProjectedShadowSettings = {
  width: number;
  height: number;
  opacity: number;
  crossSize: number;
  crossOpacity: number;
  floorY: number;
  adjustShadow: boolean;
  adjustAlpha: boolean;
  invisibleHeight: number;
  directionalShadow: boolean;
};

export type ProjectedShadowSettingsInput = Partial<ProjectedShadowSettings>;

export const defaultProjectedShadowSettings: ProjectedShadowSettings = {
  width: 0.72,
  height: 1.06,
  opacity: 0.28,
  crossSize: 0.46,
  crossOpacity: 0.22,
  floorY: 0,
  adjustShadow: false,
  adjustAlpha: true,
  invisibleHeight: PROJECTED_SHADOW_INVISIBLE_HEIGHT,
  directionalShadow: false,
};

type SpringRuntimeController = UnityPrefabSpringRuntime;

export type PjskPresentationMode = "interactive" | "capture";
export type PjskCameraPreset = "default" | "capture";
export type PjskCameraProfile = "official-default" | "full-body";

export type PjskEngineOptions = {
  container: HTMLElement;
  initialLight: PreviewLightState;
  presentationMode?: PjskPresentationMode;
  cameraPreset?: PjskCameraPreset;
  cameraProfile?: PjskCameraProfile;
  autoRender?: boolean;
  manageResize?: boolean;
};

export type PjskViewerEngineOptions = PjskEngineOptions;
export type Haruki3DEngineOptions = PjskEngineOptions;

export type HarukiRuntimePackageRequest = RuntimePackageLoadOptions & {
  baseUrl: string;
  applyDefaultAnimation?: boolean;
  applyFaceMotion?: boolean;
};

export type HarukiCaptureRolePartsRequest = {
  runtimeBaseUrl?: string;
  region?: string | null;
  roleId: string;
  bodyCostume3dId: number;
  headCostume3dId: number;
  headPackagePath?: string | null;
  hairCostume3dId: number;
  headOptionalCostume3dId?: number | null;
  imageId?: string;
  phase?: number;
  warmupMs?: number;
  warmupFrames?: number;
  warmupMode?: "animation" | "runtime";
  cameraPreset?: PjskCameraPreset;
  cameraProfile?: PjskCameraProfile;
  characterYawMode?: "0" | "45" | "-45" | "90" | "-90" | "180" | "face-camera";
  traceUtjBones?: string[];
  traceUtjMaxEvents?: number;
  springDebugBones?: string[];
  springDebugAllOffsets?: boolean;
  bodyDebugMode?: BodyDebugMode;
  faceSdfEnabled?: boolean;
  faceSdfDebugMode?: FaceSdfDebugMode;
  faceSdfDebugLightMode?: FaceSdfDebugLightMode;
  projectedShadow?: ProjectedShadowSettingsInput;
};

export type HarukiPrepareCaptureFrameRequest = {
  phase?: number;
  clip?: "motion" | "motion_loop";
  warmupMs?: number;
  warmupFrames?: number;
  warmupMode?: "animation" | "runtime";
  cameraPreset?: PjskCameraPreset;
  cameraProfile?: PjskCameraProfile;
  characterYawMode?: "0" | "45" | "-45" | "90" | "-90" | "180" | "face-camera";
  traceUtjBones?: string[];
  traceUtjMaxEvents?: number;
  springDebugBones?: string[];
  springDebugAllOffsets?: boolean;
  bodyDebugMode?: BodyDebugMode;
  faceSdfEnabled?: boolean;
  faceSdfDebugMode?: FaceSdfDebugMode;
  faceSdfDebugLightMode?: FaceSdfDebugLightMode;
  projectedShadow?: ProjectedShadowSettingsInput;
};

export type HarukiCaptureRolePartsResult = {
  selection: CustomPartSelection;
  combinedCharacter: RuntimeCombinedCharacterAsset;
  snapshots: HarukiEngineSnapshots;
};

export type HarukiEngineSnapshots = {
  animation: AnimationPlaybackSnapshot;
  faceMotion: FaceMotionPlaybackSnapshot;
  springBone: SpringBoneRuntimeSnapshot;
  camera: RuntimeCameraDebug;
  runtimeDebug: RuntimeDebugSnapshot;
  utjSpringBoneTrace?: UtjSpringBoneTraceSnapshot | null;
};

export type PartImportMode = "glb" | "proxy";
export type RuntimePartImportMode = PartImportMode | "unity-runtime";
export type CompositionMode =
  | "separate_parts"
  | "node_attached"
  | "bone_linked"
  | "combined_glb"
  | "unity_prefab";

export type PartImportStatus = {
  assetId: string;
  displayName: string;
  sourceMode: RuntimePartImportMode;
  requestedUrl: string;
  meshCount: number;
  boneCount: number;
  skinnedMeshCount: number;
  error?: string;
};

export type CompositionStatus = {
  mode: CompositionMode;
  linkedBoneCount: number;
  missingBodyBones: string[];
  missingHeadBones: string[];
  usingFallbackAttach: boolean;
};

export type MaterialBindingMode = "manifest" | "glb";
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

export type BodyAnimationKind = "unity-json";

export type BodyAnimationSelection = {
  motionUrl: string | null;
  motionKind?: BodyAnimationKind | null;
  loopUrl: string | null;
  loopKind?: BodyAnimationKind | null;
};

type AnimationPlaybackRestoreState = {
  selection: BodyAnimationSelection;
  activeTime: number;
  activeDuration: number;
  activeWasLoop: boolean;
  paused: boolean;
  speed: number;
  faceMotionTime: number;
  faceMotionEnabled: boolean;
  capturedAtMs: number;
};

export type RuntimeMaterialDebug = {
  meshName: string;
  sourceMaterialName: string;
  resolvedKey: string | null;
  resolvedKind: string | null;
  usedOriginalMap: boolean;
  boundMainTex: string | null;
  boundShadowTex: string | null;
  boundValueTex: string | null;
  boundFaceShadowTex: string | null;
  finalMaterialType: string;
  shaderHasMainTex?: number | null;
  shaderHasShadowTex?: number | null;
  shaderHasFaceShadowTex?: number | null;
  shaderHasValueTex?: number | null;
  shaderLightDirectionX?: number | null;
  shaderLightDirectionY?: number | null;
  shaderLightDirectionZ?: number | null;
  shaderShadowThreshold?: number | null;
  shaderShadowWeight?: number | null;
  shaderShadowWidthOverride?: number | null;
  shaderValueShadowInfluence?: number | null;
  shaderHairShadowEnabled?: number | null;
  shaderLambertEnabled?: number | null;
  shaderSpecularPower?: number | null;
  shaderRimThreshold?: number | null;
  shaderControllerRimThreshold?: number | null;
  shaderRimIntensity?: number | null;
  shaderRimDirectionality?: number | null;
  shaderCharacterAmbient?: number | null;
  shaderShadowTexWeight?: number | null;
  shaderSaturation?: number | null;
  shaderSkinTintEnabled?: number | null;
  shaderSkinColorDefault?: string | null;
  shaderSkinColor1?: string | null;
  shaderSkinColor2?: string | null;
  shaderBodyDebugMode?: number | null;
  shaderFaceSoftness?: number | null;
  shaderFaceSdfUseLightDirection?: number | null;
  shaderFaceDebugMode?: number | null;
  shaderFaceDebugLightMode?: number | null;
  shaderFaceSdfEnabled?: number | null;
  faceSdfCapable?: boolean | null;
  faceSdfUv1Available?: boolean | null;
  shaderAtlasTileX?: number | null;
  shaderAtlasTileY?: number | null;
  shaderAtlasSample?: number | null;
  shaderUseAtlas?: number | null;
  shaderAlphaScale?: number | null;
  shaderAlphaCutoff?: number | null;
  shaderStrictAlpha?: number | null;
  shaderStencilWrite?: boolean | null;
  shaderStencilRef?: number | null;
  shaderStencilFunc?: number | null;
  shaderStencilFuncMask?: number | null;
  shaderStencilWriteMask?: number | null;
  shaderStencilZPass?: number | null;
  shaderDepthFunc?: number | null;
  shaderDepthWrite?: boolean | null;
  shaderTransparent?: boolean | null;
  renderOrder?: number;
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

export type RuntimeCameraDebug = {
  preset: PjskCameraPreset;
  profile: PjskCameraProfile | null;
  costumeShopState: {
    cameraRootYawDegrees: number;
    zoomValue: number;
    zoomMoveValue: number;
    zoomRatio: number;
    localCameraPosition: { x: number; y: number; z: number };
    localCameraRotationYDegrees: number;
  } | null;
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
  offset: { x: number; y: number; z: number };
  distance: number;
  polarDegrees: number;
  azimuthDegrees: number;
  fovDegrees: number;
  aspect: number;
  zoom: number;
  minPolarDegrees: number;
  maxPolarDegrees: number;
  characterHeight: number;
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

export type RuntimeProjectedShadowDebug = {
  visible: boolean;
  floorY: number;
  characterHeight: number;
  settings: ProjectedShadowSettings;
  targetPosition: { x: number; y: number; z: number };
  targetPositions: Array<{ x: number; y: number; z: number }>;
  directional: {
    position: { x: number; y: number; z: number };
    forward: { x: number; y: number; z: number };
    scale: { x: number; y: number; z: number };
    opacity: number;
    alpha: number;
  };
  cross: {
    position: { x: number; y: number; z: number };
    scale: { x: number; y: number; z: number };
    opacity: number;
  };
};

export type RuntimeDebugSnapshot = {
  materialBindingMode: MaterialBindingMode;
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

export type RuntimeCombinedCharacterAsset = {
  id: string;
  displayName: string;
  meshUrl: string;
  prefabRuntimeMeshUrl?: string;
  unityRuntimeJsonUrl?: string;
  unityRuntimeJsonPath?: string;
  unityMotionJsonUrl?: string;
  unityMotionJsonPath?: string;
  bodyAsset: BodyAssetManifest;
  headAsset: HeadAssetManifest;
  runtimeExtension?: unknown;
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

export type AnimationRetargetDebug = {
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
  prefabHeadFollow?: PrefabHeadFollowDebug;
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
  times: number[];
  values: number[];
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
  root: THREE.Group | null;
  sourceMode: RuntimePartImportMode;
  requestedUrl: string;
  meshCount: number;
  boneCount: number;
  skinnedMeshCount: number;
  error?: string;
  userData?: Record<string, unknown>;
  vrm?: unknown;
  springBoneManager?: unknown;
  prefabSourceGraph?: UnityPrefabSourceGraph | null;
};

type BoneLink = {
  bodyBone: THREE.Bone;
  headBone: THREE.Bone;
  bodyName: string;
  headName: string;
};

type PrefabHeadFollowConstraint = {
  source: THREE.Object3D;
  targets: PrefabHeadFollowTarget[];
  sourcePath: string;
};

type PrefabHeadFollowTarget = {
  node: THREE.Object3D;
  restOffset: THREE.Matrix4;
  path: string;
};

type PrefabHeadFollowDebug = {
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

type PrefabHeadFollowNodeDebug = {
  path: string;
  canonicalPath: string;
  parentPath: string | null;
  localPosition: { x: number; y: number; z: number };
  localQuaternion: { x: number; y: number; z: number; w: number };
  worldPosition: { x: number; y: number; z: number };
  worldQuaternion: { x: number; y: number; z: number; w: number };
  worldForward: { x: number; y: number; z: number };
};

type RuntimePrefabTransformSource = {
  pathId?: number;
  name?: string | null;
  transformPath?: string | null;
  poseRoot?: string | null;
  runtimePartIndex?: number;
  parentPathId?: number | null;
  childPathIds?: number[];
  localPosition?: {
    x?: number;
    y?: number;
    z?: number;
    X?: number;
    Y?: number;
    Z?: number;
  };
  localRotation?: {
    x?: number;
    y?: number;
    z?: number;
    w?: number;
    X?: number;
    Y?: number;
    Z?: number;
    W?: number;
  };
  localScale?: {
    x?: number;
    y?: number;
    z?: number;
    X?: number;
    Y?: number;
    Z?: number;
  };
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
  activeRootProfile?: {
    defaultBodyRoot?: string;
    activeRoots?: string[];
  };
};

type RuntimeUnityBodyHeadAssemblySource = {
  version?: string | number;
  sourceKind?: string;
  parentRootPath?: string | null;
  parentAttachPath?: string | null;
  childRootPath?: string | null;
  childOriginPath?: string | null;
  runtimeMountPath?: string | null;
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
  boneInverseBindMatrices?: number[];
  submeshes?: RuntimeNativeSubmeshSource[];
  positions?: number[];
  normals?: number[];
  uv0?: number[];
  uv1?: number[];
  colors?: number[];
  skinIndices?: number[];
  skinWeights?: number[];
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
  indices?: number[];
};

type RuntimeNativeMorphTargetSource = {
  name?: string;
  indices?: number[];
  positionDeltas?: number[];
  normalDeltas?: number[];
};

type UnityPrefabSourceGraph = {
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
  assemblyMount: THREE.Object3D | null;
  assemblyMountPath: string | null;
  usesModelCombineSetup: boolean;
  headOriginRestLocalToHeadRoot: THREE.Matrix4 | null;
  headRootMounts: Array<{
    root: THREE.Object3D;
    rootPath: string | null;
    origin: THREE.Object3D | null;
    originPath: string | null;
    originRestLocalToRoot: THREE.Matrix4 | null;
  }>;
  debug: PrefabHeadFollowDebug;
};

type HeadMorphRuntime = {
  mesh: THREE.Mesh;
  curveIndexByHash: Map<number, number>;
  controlledIndices: number[];
};

type CharacterEyeMaterialController = {
  lightInfluence: number | null;
  lightInfluenceForEyeHighlight: number | null;
  tintColor: string | null;
  emissionColor: string | null;
  baseTiling: SekaiLayerAtlas | null;
  highlightTiling: SekaiLayerAtlas | null;
};

type CharacterHairMaterialController = {
  offset: THREE.Vector3;
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

function disposeReplacedMaterials(
  originalMaterials: THREE.Material[],
  reboundMaterials: THREE.Material[]
) {
  const preserved = new Set(reboundMaterials);
  for (const original of originalMaterials) {
    if (!preserved.has(original)) {
      disposeMaterial(original, false);
    }
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

function createOpaqueTexturedMaterial(texture: THREE.Texture | null) {
  return new THREE.MeshBasicMaterial({
    map: texture,
    transparent: false,
    side: THREE.DoubleSide,
    color: "#ffffff",
  });
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

function normalizeHeadRuntimeMaterialKind(
  materialKind: string,
  meshName: string | null | undefined,
  materialName: string | null | undefined
) {
  const meshNameLower = (meshName ?? "").toLowerCase();
  const materialNameLower = (materialName ?? "").toLowerCase();
  if (
    materialNameLower.includes("_hair_") ||
    meshNameLower.includes("hair")
  ) {
    return "hair";
  }
  if (
    materialNameLower.includes("_acc_") ||
    meshNameLower === "acc" ||
    meshNameLower.endsWith("/acc")
  ) {
    return "accessory";
  }
  return materialKind;
}

function getEyeThroughHairSourceKind(kind: unknown) {
  switch (kind) {
    case "eye_through_hair":
    case "eye_stencil_prepass":
      return "eye";
    case "eyelash_through_hair":
    case "eyelash_stencil_prepass":
      return "eyelash";
    case "eyebrow_through_hair":
    case "eyebrow_stencil_prepass":
      return "eyebrow";
    case "eyelight_through_hair":
      return "eyelight";
    default:
      return "";
  }
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
        COSTUME_SHOP_CAMERA.fov / COSTUME_SHOP_CAMERA.fov
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

function getSekaiPreviewRimDirection() {
  return new THREE.Vector3(0, 0, -1)
    .applyEuler(new THREE.Euler(THREE.MathUtils.degToRad(135), 0, THREE.MathUtils.degToRad(-90)))
    .normalize();
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

function getDefaultCameraTarget(characterHeight: number) {
  return DEFAULT_CAMERA_TARGET_SCALE.clone().multiplyScalar(characterHeight);
}

function getDefaultCameraPosition(characterHeight: number) {
  return getDefaultCameraTarget(characterHeight)
    .add(DEFAULT_CAMERA_OFFSET_SCALE.clone().multiplyScalar(characterHeight));
}

function calculateCostumeShopCameraPose(
  state: CostumeShopCameraState = COSTUME_SHOP_CAMERA_FULL_BODY_STATE
) {
  const zoomValue = THREE.MathUtils.clamp(
    state.zoomValue,
    0,
    COSTUME_SHOP_CAMERA.zoomDuration
  );
  const zoomRatio = COSTUME_SHOP_CAMERA.zoomDuration > 0
    ? zoomValue / COSTUME_SHOP_CAMERA.zoomDuration
    : 0;
  const bottomY = THREE.MathUtils.lerp(
    COSTUME_SHOP_CAMERA.bottomLowerLimitPosition,
    COSTUME_SHOP_CAMERA.bottomUpperLimitPosition,
    zoomRatio
  );
  const topY = THREE.MathUtils.lerp(
    COSTUME_SHOP_CAMERA.topLowerLimitPosition,
    COSTUME_SHOP_CAMERA.topUpperLimitPosition,
    zoomRatio
  );
  const y = THREE.MathUtils.lerp(
    bottomY,
    topY,
    THREE.MathUtils.clamp(state.zoomMoveValue, 0, 1)
  );
  const z = THREE.MathUtils.lerp(
    COSTUME_SHOP_CAMERA.nearZ,
    COSTUME_SHOP_CAMERA.farZ,
    zoomRatio
  );
  const cameraRootYawDegrees = Number.isFinite(state.cameraRootYawDegrees)
    ? state.cameraRootYawDegrees
    : 0;
  const rotationY = THREE.MathUtils.degToRad(cameraRootYawDegrees);
  const localCameraPosition = new THREE.Vector3(0, y, z);
  const position = localCameraPosition.clone()
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), rotationY);
  return {
    target: new THREE.Vector3(0, y, 0),
    position,
    state: {
      cameraRootYawDegrees,
      zoomValue,
      zoomMoveValue: THREE.MathUtils.clamp(state.zoomMoveValue, 0, 1),
      zoomRatio,
      localCameraPosition,
      localCameraRotationYDegrees: 180,
    },
  };
}

function getCostumeShopCameraState(profile: PjskCameraProfile) {
  return profile === "official-default"
    ? COSTUME_SHOP_CAMERA_OFFICIAL_DEFAULT_STATE
    : COSTUME_SHOP_CAMERA_FULL_BODY_STATE;
}

function makeSeededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function drawCaptureTriangleBackground(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    return canvas;
  }

  const primary = context.createLinearGradient(0, height, width, 0);
  primary.addColorStop(0, "#f9fffe");
  primary.addColorStop(0.52, "#edfaff");
  primary.addColorStop(1, "#fff8fe");
  context.fillStyle = primary;
  context.fillRect(0, 0, width, height);

  const overlay = context.createLinearGradient(0, 0, width, height);
  overlay.addColorStop(0, "rgba(255, 246, 252, 0.34)");
  overlay.addColorStop(1, "rgba(219, 246, 255, 0.40)");
  context.fillStyle = overlay;
  context.fillRect(0, 0, width, height);
  context.fillStyle = "rgba(255, 255, 255, 0.48)";
  context.fillRect(0, 0, width, height);

  const random = makeSeededRandom(width * 73856093 ^ height * 19349663);
  const colors = [
    [166, 236, 255],
    [214, 206, 255],
    [255, 204, 238],
    [255, 237, 182],
  ] as const;
  const aspect = width / Math.max(height, 1);
  const wideShift = Math.min(0.12, Math.max(0, (aspect - 1) * 0.08));

  const drawTriangle = (
    x: number,
    y: number,
    rotation: number,
    size: number,
    color: readonly number[],
    alpha: number
  ) => {
    context.save();
    context.translate(x, y);
    context.rotate(rotation);
    context.beginPath();
    for (let index = 0; index < 3; index += 1) {
      const angle = -Math.PI / 2 + index * Math.PI * 2 / 3;
      const px = Math.cos(angle) * size * 0.56;
      const py = Math.sin(angle) * size * 0.56;
      if (index === 0) {
        context.moveTo(px, py);
      } else {
        context.lineTo(px, py);
      }
    }
    context.closePath();
    context.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`;
    context.fill();
    context.restore();
  };

  const drawRandomTriangles = (count: number, baseSize: number) => {
    for (let index = 0; index < count; index += 1) {
      const edgeRoll = random();
      let x: number;
      let y: number;
      if (edgeRoll < 0.78) {
        const edge = random();
        if (edge < 0.26) {
          x = (-0.04 + random() * 0.22) * width;
          y = random() * height;
        } else if (edge < 0.50) {
          x = (0.82 - wideShift + random() * (0.21 + wideShift)) * width;
          y = random() * height;
        } else if (edge < 0.78) {
          x = random() * width;
          y = (-0.04 + random() * (0.24 + wideShift * 0.5)) * height;
        } else {
          x = random() * width;
          y = (0.80 - wideShift * 0.8 + random() * (0.23 + wideShift * 0.8)) * height;
        }
      } else {
        x = (0.12 + random() * 0.76) * width;
        y = (0.12 + random() * 0.76) * height;
      }
      const dx = (x - width * 0.5) / width * 2;
      const dy = (y - height * 0.5) / height * 2;
      const edgeDistance = Math.max(0.28, dx * dx + dy * dy);
      const size = baseSize * (0.72 + random() * 0.46) * edgeDistance;
      const alpha = (0.08 + random() * 0.13) * Math.min(1.25, edgeDistance + 0.25);
      drawTriangle(
        x,
        y,
        random() * Math.PI * 2,
        size,
        colors[Math.floor(random() * colors.length)],
        alpha
      );
    }
  };

  const scale = Math.min(width, height) / 1000;
  drawRandomTriangles(Math.max(8, Math.round(18 * scale)), 150 * scale);
  drawRandomTriangles(Math.max(24, Math.round(80 * scale)), 72 * scale);
  return canvas;
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

function cloneBodyShaderMaterial(
  source: THREE.ShaderMaterial,
  params: {
    mainTex?: THREE.Texture | null;
    shadowTex?: THREE.Texture | null;
    valueTex?: THREE.Texture | null;
    baseColor?: THREE.ColorRepresentation;
    shadowColor?: THREE.ColorRepresentation;
    skinColorDefault?: THREE.ColorRepresentation;
    skinColor1?: THREE.ColorRepresentation;
    skinColor2?: THREE.ColorRepresentation;
    lighting?: MaterialLightingSettings;
    skinTintEnabled?: boolean;
    bodyDebugMode?: number;
    shadowWidthOverride?: number | null;
    valueShadowInfluence?: number;
    hairShadowEnabled?: boolean;
    lambertEnabled?: boolean;
    headPosition?: THREE.Vector3;
    alphaCutoff?: number;
  }
) {
  const material = source.clone();
  updateSekaiBodyMaterial(material, {
    baseColor:
      params.baseColor ??
      `#${source.uniforms.uBaseColor.value.getHexString()}`,
    shadowColor:
      params.shadowColor ??
      `#${source.uniforms.uShadowColor.value.getHexString()}`,
    skinColorDefault:
      params.skinColorDefault ??
      `#${source.uniforms.uSkinColorDefault.value.getHexString()}`,
    skinColor1:
      params.skinColor1 ??
      `#${source.uniforms.uSkinColor1.value.getHexString()}`,
    skinColor2:
      params.skinColor2 ??
      `#${source.uniforms.uSkinColor2.value.getHexString()}`,
    mainTex: params.mainTex ?? null,
    shadowTex: params.shadowTex ?? null,
    valueTex: params.valueTex ?? null,
    lightDirection: source.uniforms.uLightDirection.value.clone(),
    lightIntensity: source.uniforms.uLightIntensity.value,
    ambientIntensity: source.uniforms.uAmbientIntensity.value,
    shadowThreshold: source.uniforms.uShadowThreshold.value,
    shadowWeight: source.uniforms.uShadowWeight.value,
    characterAmbientIntensity:
      source.uniforms.uCharacterAmbientIntensity?.value ?? 0.3,
    rimIntensity: source.uniforms.uRimIntensity?.value ?? 0.35,
    controllerRimThreshold:
      source.uniforms.uControllerRimThreshold?.value ?? 0.18,
    rimDirectionality: source.uniforms.uRimDirectionality?.value ?? 0.85,
    rimDirection:
      source.uniforms.uRimDirection?.value.clone() ?? getSekaiPreviewRimDirection(),
    specularPower: params.lighting?.specularPower ?? source.uniforms.uSpecularPower.value,
    rimThreshold: params.lighting?.rimThreshold ?? source.uniforms.uRimThreshold.value,
    shadowTexWeight: params.lighting?.shadowTexWeight ?? source.uniforms.uShadowTexWeight.value,
    fadeMode: params.lighting?.fadeMode ?? source.uniforms.uFadeMode?.value ?? 0,
    hueSinAngle: params.lighting?.hueSinAngle ?? source.uniforms.uHueSinAngle?.value ?? 0,
    hueCosAngle: params.lighting?.hueCosAngle ?? source.uniforms.uHueCosAngle?.value ?? 1,
    shadowWidth: params.lighting?.shadowWidth ?? source.uniforms.uShadowWidth.value,
    shadowWidthOverride:
      params.shadowWidthOverride ??
      ((source.uniforms.uShadowWidthOverride?.value ?? -1) >= 0
        ? source.uniforms.uShadowWidthOverride.value
        : null),
    valueShadowInfluence:
      params.valueShadowInfluence ??
      source.uniforms.uValueShadowInfluence?.value ??
      0,
    hairShadowEnabled:
      params.hairShadowEnabled ??
      ((source.uniforms.uHairShadowEnabled?.value ?? 0.0) > 0.5),
    lambertEnabled:
      params.lambertEnabled ??
      ((source.uniforms.uLambertEnabled?.value ?? 0.0) > 0.5),
    headPosition:
      params.headPosition ??
      source.uniforms.uHeadPosition?.value.clone(),
    saturation: params.lighting?.saturation ?? source.uniforms.uSaturation.value,
    value: params.lighting?.value ?? source.uniforms.uValue?.value ?? 0.5,
    contrast: params.lighting?.contrast ?? source.uniforms.uContrast?.value ?? 0.5,
    partsAmbientColor:
      params.lighting?.partsAmbientColor ??
      `#${source.uniforms.uPartsAmbientColor.value.getHexString()}`,
    reflectionBlendColor:
      params.lighting?.reflectionBlendColor ??
      `#${source.uniforms.uReflectionBlendColor.value.getHexString()}`,
    globalShadowColor:
      source.uniforms.uGlobalShadowColor
        ? `#${source.uniforms.uGlobalShadowColor.value.getHexString()}`
        : "#ffffff",
    controllerAmbientColor:
      source.uniforms.uControllerAmbientColor
        ? `#${source.uniforms.uControllerAmbientColor.value.getHexString()}`
        : "#ffffff",
    controllerRimColor:
      source.uniforms.uControllerRimColor
        ? `#${source.uniforms.uControllerRimColor.value.getHexString()}`
        : "#e6edf9",
    controllerShadowRimColor:
      source.uniforms.uControllerShadowRimColor
        ? `#${source.uniforms.uControllerShadowRimColor.value.getHexString()}`
        : "#ffffff",
    controllerRimColorWeight:
      source.uniforms.uControllerRimColorWeight?.value ?? 0,
    controllerShadowRimColorWeight:
      source.uniforms.uControllerShadowRimColorWeight?.value ?? 0,
    controllerRimEdgeSmoothness:
      source.uniforms.uControllerRimEdgeSmoothness?.value ?? 0.38,
    controllerRimShadowSharpness:
      source.uniforms.uControllerRimShadowSharpness?.value ?? 0,
    bodyDebugMode:
      params.bodyDebugMode ??
      source.uniforms.uBodyDebugMode?.value ??
      0,
    skinTintEnabled:
      params.skinTintEnabled ??
      ((source.uniforms.uSkinTintEnabled?.value ?? 1.0) > 0.5),
    alphaCutoff:
      params.alphaCutoff ??
      source.uniforms.uAlphaCutoff?.value ??
      0.0,
  });
  return material;
}

function cloneFaceShaderMaterial(
  source: THREE.ShaderMaterial,
  params: {
    mainTex?: THREE.Texture | null;
    shadowTex?: THREE.Texture | null;
    faceShadowTex?: THREE.Texture | null;
    baseColor?: THREE.ColorRepresentation;
    warmColor?: THREE.ColorRepresentation;
    skinColorDefault?: THREE.ColorRepresentation;
    skinColor1?: THREE.ColorRepresentation;
    skinColor2?: THREE.ColorRepresentation;
    faceSdfEnabled?: boolean;
  }
) {
  const material = source.clone();
  updateSekaiFaceMaterial(material, {
    baseColor:
      params.baseColor ??
      `#${source.uniforms.uBaseColor.value.getHexString()}`,
    warmColor:
      params.warmColor ??
      `#${source.uniforms.uWarmColor.value.getHexString()}`,
    skinColorDefault:
      params.skinColorDefault ??
      `#${source.uniforms.uSkinColorDefault.value.getHexString()}`,
    skinColor1:
      params.skinColor1 ??
      `#${source.uniforms.uSkinColor1.value.getHexString()}`,
    skinColor2:
      params.skinColor2 ??
      `#${source.uniforms.uSkinColor2.value.getHexString()}`,
    mainTex: params.mainTex ?? null,
    shadowTex: params.shadowTex ?? null,
    faceShadowTex: params.faceShadowTex ?? null,
    lightDirection: source.uniforms.uLightDirection.value.clone(),
    lightIntensity: source.uniforms.uLightIntensity.value,
    ambientIntensity: source.uniforms.uAmbientIntensity.value,
    faceSoftness: source.uniforms.uFaceSoftness.value,
    faceSdfUseLightDirection: source.uniforms.uFaceSdfUseLightDirection?.value ?? 0.5,
    headDotDirectionalLight: source.uniforms.uHeadDotDirectionalLight?.value,
    useFaceShadowLimiter: (source.uniforms.uUseFaceShadowLimiter?.value ?? 1.0) > 0.5,
    faceShadowLimitRange: source.uniforms.uFaceShadowLimitRange?.value ?? 0,
    faceDebugMode: source.uniforms.uFaceDebugMode?.value ?? 0,
    faceDebugLightMode: source.uniforms.uFaceDebugLightMode?.value ?? 0,
    faceSdfEnabled: params.faceSdfEnabled ?? false,
  });
  updateSekaiFaceBasis(
    material,
    source.uniforms.uFaceRight?.value ?? new THREE.Vector3(1, 0, 0),
    source.uniforms.uFaceUp?.value ?? new THREE.Vector3(0, 1, 0),
    source.uniforms.uFaceForward?.value ?? new THREE.Vector3(0, 0, 1)
  );
  return material;
}

function hasFaceSdfUv1Attribute(mesh: THREE.Mesh) {
  return Boolean(mesh.geometry?.getAttribute("uv1"));
}

function isMorphMesh(node: THREE.Object3D): node is THREE.Mesh {
  const mesh = node as THREE.Mesh;
  return !!mesh.isMesh && Array.isArray(mesh.morphTargetInfluences);
}

function hasSkinnedMeshesUsingSkeleton(root: THREE.Object3D, skeletonRoot: THREE.Object3D) {
  let found = false;
  root.traverse((node) => {
    if (found) {
      return;
    }
    const mesh = node as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh || !mesh.skeleton) {
      return;
    }
    found = mesh.skeleton.bones.some((bone) => bone === skeletonRoot);
  });
  return found;
}

function getHeadLayerRenderOrder(kind: string) {
  switch (kind) {
    case "face_sdf":
    case "face":
    case "accessory":
    case "body":
    case "eyelight":
      return 2000;
    case "eye_stencil_prepass":
      return 2001;
    case "eyelash_stencil_prepass":
      return 2001.1;
    case "eyebrow_stencil_prepass":
      return 2001.2;
    case "eyelash":
    case "eyebrow":
      return 2001;
    case "eye":
      return 2002;
    case "hair":
      return 2451;
    case "eye_through_hair":
      return 2452;
    case "eyelash_through_hair":
      return 2453;
    case "eyebrow_through_hair":
      return 2454;
    case "eyelight_through_hair":
      return 2455;
    default:
      return 2000;
  }
}

function configureBaseStencilClear(
  material: THREE.Material,
  writeMask = 0xff
) {
  material.stencilWrite = true;
  material.stencilRef = 0x00;
  material.stencilFunc = THREE.AlwaysStencilFunc;
  material.stencilFuncMask = 0xff;
  material.stencilWriteMask = writeMask;
  material.stencilFail = THREE.KeepStencilOp;
  material.stencilZFail = THREE.KeepStencilOp;
  material.stencilZPass = THREE.ReplaceStencilOp;
}

function configureFaceLayerStencilPrepass(
  material: THREE.Material,
  stencilBit: number
) {
  material.transparent = false;
  material.colorWrite = false;
  material.stencilWrite = true;
  material.stencilRef = 0xff;
  material.stencilFunc = THREE.AlwaysStencilFunc;
  material.stencilFuncMask = 0xff;
  material.stencilWriteMask = stencilBit;
  material.stencilFail = THREE.KeepStencilOp;
  material.stencilZFail = THREE.KeepStencilOp;
  material.stencilZPass = THREE.ReplaceStencilOp;
  material.depthTest = true;
  material.depthWrite = false;
  material.depthFunc = THREE.LessEqualDepth;
}

function configureEyeStencilPrepass(
  material: THREE.Material,
) {
  configureFaceLayerStencilPrepass(material, CHARACTER_EYE_STENCIL_BIT);
}

function configureEyelashStencilPrepass(
  material: THREE.Material,
) {
  configureFaceLayerStencilPrepass(material, CHARACTER_EYELASH_STENCIL_BIT);
}

function configureEyebrowStencilPrepass(
  material: THREE.Material,
) {
  configureFaceLayerStencilPrepass(material, CHARACTER_EYEBROW_STENCIL_BIT);
}

function configureEyeOverlayStencil(
  material: THREE.Material,
  zPass: THREE.StencilOp
) {
  material.stencilWrite = true;
  material.stencilRef = CHARACTER_EYE_STENCIL_BIT;
  material.stencilFunc = THREE.EqualStencilFunc;
  material.stencilFuncMask = CHARACTER_FACE_LAYER_STENCIL_MASK;
  material.stencilWriteMask = CHARACTER_FACE_LAYER_STENCIL_MASK;
  material.stencilFail = THREE.KeepStencilOp;
  material.stencilZFail = THREE.KeepStencilOp;
  material.stencilZPass = zPass;
  material.depthTest = true;
  material.depthWrite = false;
  material.depthFunc = THREE.GreaterDepth;
}

function configureFaceLayerOverlayStencil(
  material: THREE.Material,
  stencilBit: number
) {
  material.stencilWrite = true;
  material.stencilRef = stencilBit;
  material.stencilFunc = THREE.EqualStencilFunc;
  material.stencilFuncMask = stencilBit;
  material.stencilWriteMask = CHARACTER_FACE_LAYER_STENCIL_MASK;
  material.stencilFail = THREE.KeepStencilOp;
  material.stencilZFail = THREE.KeepStencilOp;
  material.stencilZPass = THREE.KeepStencilOp;
  material.depthTest = true;
  material.depthWrite = false;
  material.depthFunc = THREE.GreaterDepth;
}

function configureEyelightThroughHairOverlay(
  material: THREE.Material
) {
  material.stencilWrite = false;
  material.depthTest = true;
  material.depthWrite = false;
  material.depthFunc = THREE.GreaterDepth;
}

function configureHairOccluderStencil(
  material: THREE.Material
) {
  material.stencilWrite = true;
  material.stencilRef = 0x00;
  material.stencilFunc = THREE.AlwaysStencilFunc;
  material.stencilFuncMask = 0xff;
  material.stencilWriteMask = NON_CHARACTER_FACE_LAYER_STENCIL_MASK;
  material.stencilFail = THREE.KeepStencilOp;
  material.stencilZFail = THREE.KeepStencilOp;
  material.stencilZPass = THREE.ReplaceStencilOp;
}

function sortHeadMeshGroupsByMaterialKind(
  mesh: THREE.Mesh,
  materials: THREE.Material[]
) {
  if (materials.length < 2 || mesh.geometry.groups.length < 2) {
    return;
  }

  const orderedGroups = mesh.geometry.groups
    .map((group, index) => {
      const material = materials[group.materialIndex ?? 0];
      const kind = typeof material?.userData.pjskMaterialKind === "string"
        ? material.userData.pjskMaterialKind
        : "";
      return {
        start: group.start,
        count: group.count,
        materialIndex: group.materialIndex ?? 0,
        order: getHeadLayerRenderOrder(kind),
        index,
      };
    })
    .sort((a, b) => a.order - b.order || a.index - b.index);

  mesh.geometry.clearGroups();
  for (const group of orderedGroups) {
    mesh.geometry.addGroup(group.start, group.count, group.materialIndex);
  }
}

function createGroupedLayerMesh(
  source: THREE.Mesh,
  groups: Array<{ start: number; count: number; materialIndex: number }>,
  materials: THREE.Material[],
  nameSuffix: string
) {
  if (groups.length === 0 || materials.length === 0) {
    return null;
  }
  const geometry = source.geometry.clone();
  geometry.clearGroups();
  for (const group of groups) {
    geometry.addGroup(group.start, group.count, group.materialIndex);
  }

  const sourceSkinned = source as THREE.SkinnedMesh;
  const overlay = sourceSkinned.isSkinnedMesh
    ? new THREE.SkinnedMesh(geometry, materials)
    : new THREE.Mesh(geometry, materials);
  overlay.name = `${source.name}_${nameSuffix}`;
  overlay.position.copy(source.position);
  overlay.quaternion.copy(source.quaternion);
  overlay.scale.copy(source.scale);
  overlay.matrix.copy(source.matrix);
  overlay.matrixAutoUpdate = source.matrixAutoUpdate;
  overlay.matrixWorldAutoUpdate = source.matrixWorldAutoUpdate;
  overlay.layers.mask = source.layers.mask;
  overlay.visible = source.visible;
  overlay.renderOrder = Math.min(
    ...materials.map((material) => getHeadLayerRenderOrder(
      typeof material.userData.pjskMaterialKind === "string"
        ? material.userData.pjskMaterialKind
        : ""
    ))
  );
  overlay.frustumCulled = source.frustumCulled;
  overlay.castShadow = false;
  overlay.receiveShadow = false;
  overlay.morphTargetDictionary = source.morphTargetDictionary;
  overlay.morphTargetInfluences = source.morphTargetInfluences;
  sortHeadMeshGroupsByMaterialKind(overlay, materials);
  if ((overlay as THREE.SkinnedMesh).isSkinnedMesh && sourceSkinned.isSkinnedMesh) {
    const skinnedOverlay = overlay as THREE.SkinnedMesh;
    skinnedOverlay.bind(sourceSkinned.skeleton, sourceSkinned.bindMatrix);
    skinnedOverlay.bindMode = sourceSkinned.bindMode;
    skinnedOverlay.bindMatrix.copy(sourceSkinned.bindMatrix);
    skinnedOverlay.bindMatrixInverse.copy(sourceSkinned.bindMatrixInverse);
  }
  return overlay;
}

function createGroupedOverlayMesh(
  source: THREE.Mesh,
  groups: Array<{ start: number; count: number; materialIndex: number }>,
  materials: THREE.Material[]
) {
  const overlay = createGroupedLayerMesh(
    source,
    groups,
    materials,
    "through_hair_overlay"
  );
  if (!overlay) {
    return null;
  }
  const sourceKind = getEyeThroughHairSourceKind(
    typeof materials[0]?.userData.pjskMaterialKind === "string"
      ? materials[0].userData.pjskMaterialKind
      : ""
  );
  overlay.userData.pjskEyeThroughHairSource = source;
  overlay.userData.pjskEyeThroughHairSourceKind = sourceKind;
  overlay.userData.pjskEyeThroughHairPassKind = "overlay";
  overlay.userData.pjskEyeThroughHairOverlay = true;
  return overlay;
}

function normalizeMeshSlotName(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes("face")) {
    return "face";
  }
  if (lower.includes("hair")) {
    return "hair";
  }
  if (lower.includes("acc")) {
    return "acc";
  }
  if (lower.includes("body")) {
    return "body";
  }
  return lower;
}

function tuneShadowTexWeight(kind: string | undefined, weight: number) {
  void kind;
  return weight;
}

function tuneLightingForPreview(
  kind: string | undefined,
  lighting: MaterialLightingSettings | undefined
) {
  return lighting
    ? {
        ...lighting,
        shadowTexWeight: tuneShadowTexWeight(kind, lighting.shadowTexWeight),
      }
    : undefined;
}

function usesSekaiSkinTint(kind: string | undefined) {
  const normalized = (kind ?? "body").toLowerCase();
  return normalized === "body" || normalized === "accessory" || normalized === "acc";
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

function faceSdfDebugLightModeToUniform(mode: FaceSdfDebugLightMode) {
  switch (mode) {
    case "front":
      return 1;
    case "left":
      return 2;
    case "right":
      return 3;
    case "back":
      return 4;
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

function readRuntimeUnitySetup0414ForGraph(extension: unknown): RuntimeUnitySetupSource | null {
  const payload = asRuntimeRecord(extension);
  const springBone = asRuntimeRecord(payload.pjskSpringBone ?? payload.PjskSpringBone);
  const setup = asRuntimeRecord(
    payload.runtimeUnitySetup ?? payload.RuntimeUnitySetup ??
      springBone.runtimeUnitySetup ?? springBone.RuntimeUnitySetup
  ) as RuntimeUnitySetupSource;
  const version = setup.version;
  return version === "0414" || version === 414 ? setup : null;
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

function readRuntimeNativeMeshSet0414(extension: unknown): RuntimeNativeMeshSetSource | null {
  const payload = asRuntimeRecord(extension);
  const nativeMeshes = asRuntimeRecord(
    payload.nativeMeshes ?? payload.NativeMeshes
  ) as RuntimeNativeMeshSetSource;
  const version = nativeMeshes.version;
  return version === "0414" || version === 414 ? nativeMeshes : null;
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
  return {
    offset: readUnityVector3(
      (hair.offset ?? hair.Offset) as RuntimePrefabTransformSource["localPosition"] | undefined,
      new THREE.Vector3()
    ),
  };
}

function findPrefabGraphNodeByName(
  nodeByPath: ReadonlyMap<string, THREE.Object3D>,
  rootName: string,
  nodeName: string | undefined
) {
  if (!nodeName) {
    return null;
  }
  let best: { path: string; node: THREE.Object3D } | null = null;
  for (const [path, node] of nodeByPath.entries()) {
    if (
      path.startsWith(`${rootName}/`) &&
      node.name.toLowerCase() === nodeName.toLowerCase() &&
      (!best || path.length > best.path.length)
    ) {
      best = { path, node };
    }
  }
  return best;
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
  assembly: RuntimeUnityBodyHeadAssemblySource | undefined,
  fallbackOriginPath: string | null | undefined
): { path: string; node: THREE.Object3D } | null {
  const rootPath = getUnityPrefabTransformPath(mountedHeadRoot);
  const absoluteOriginPath = assembly?.childOriginPath ?? fallbackOriginPath ?? null;
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
) {
  return assembly?.parentingMode === "model_combine_setup";
}

function setParentKeepingLocal(child: THREE.Object3D, parent: THREE.Object3D) {
  if (child.parent) {
    child.parent.remove(child);
  }
  parent.add(child);
  child.updateMatrix();
}

function drainChildrenKeepingLocal(sourceParent: THREE.Object3D, destParent: THREE.Object3D) {
  while (sourceParent.children.length > 0) {
    setParentKeepingLocal(sourceParent.children[0], destParent);
  }
}

function resolveModelCombineNode(
  nodeByPath: Map<string, THREE.Object3D>,
  candidates: Array<string | null | undefined>,
  rootPath: string | null | undefined,
  name: string
) {
  const direct = resolvePrefabGraphNode(nodeByPath, candidates);
  if (direct) {
    return direct;
  }
  if (!rootPath) {
    return null;
  }
  let best: { path: string; node: THREE.Object3D } | null = null;
  for (const [path, node] of nodeByPath.entries()) {
    if (
      node.name === name &&
      (path === rootPath || path.startsWith(`${rootPath}/`)) &&
      (!best || path.length < best.path.length)
    ) {
      best = { path, node };
    }
  }
  return best;
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
  defaultBodyRoot: string,
  assembly: RuntimeUnityBodyHeadAssemblySource | undefined
) {
  const combineNodeAName = assembly?.combineNodeAName ?? "Neck";
  const combineNodeBName = assembly?.combineNodeBName ?? "Head";
  const childMoveSuffix = assembly?.childMoveSuffix ?? "_target";
  const parentRootPath = assembly?.parentRootPath ?? defaultBodyRoot;
  const childRootPath = assembly?.childRootPath ?? "face";
  const bodyNodeA = resolveModelCombineNode(
    nodeByPath,
    [
      assembly?.parentCombineNodeAPath,
      assembly?.parentAttachPath,
      `${defaultBodyRoot}/Position/PositionOffset/Hip/Waist/Spine/Chest/${combineNodeAName}`,
      `${defaultBodyRoot}/Position/Hip/Waist/Spine/Chest/${combineNodeAName}`,
    ],
    parentRootPath,
    combineNodeAName
  );
  const bodyNodeB = resolveModelCombineNode(
    nodeByPath,
    [
      assembly?.parentCombineNodeBPath,
      bodyNodeA ? `${bodyNodeA.path}/${combineNodeBName}` : null,
      `${defaultBodyRoot}/Position/PositionOffset/Hip/Waist/Spine/Chest/${combineNodeAName}/${combineNodeBName}`,
      `${defaultBodyRoot}/Position/Hip/Waist/Spine/Chest/${combineNodeAName}/${combineNodeBName}`,
    ],
    bodyNodeA?.path,
    combineNodeBName
  );
  const faceNodeA = resolveModelCombineNode(
    nodeByPath,
    [
      assembly?.childCombineNodeAPath,
      assembly?.childOriginPath,
      `${childRootPath}/Position/Hip/Waist/Spine/Chest/${combineNodeAName}`,
    ],
    childRootPath,
    combineNodeAName
  );
  const faceNodeB = resolveModelCombineNode(
    nodeByPath,
    [
      assembly?.childCombineNodeBPath,
      faceNodeA ? `${faceNodeA.path}/${combineNodeBName}` : null,
      `${childRootPath}/Position/Hip/Waist/Spine/Chest/${combineNodeAName}/${combineNodeBName}`,
    ],
    faceNodeA?.path,
    combineNodeBName
  );

  if (!bodyNodeA || !bodyNodeB || !faceNodeA || !faceNodeB) {
    return {
      active: false,
      reason: "model combine setup nodes were not fully resolved",
      bodyNodeA,
      bodyNodeB,
      faceNodeA,
      faceNodeB,
    };
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
      assembly?.faceRendererName ?? "Face"
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
  if (assembly?.parentAttachPath) {
    nodeByPath.set(assembly.parentAttachPath, faceNodeA.node);
  }
  if (assembly?.parentCombineNodeBPath) {
    nodeByPath.set(assembly.parentCombineNodeBPath, faceNodeB.node);
  }

  detachNode(bodyNodeB.node);
  detachNode(bodyNodeA.node);
  root.updateMatrixWorld(true);

  return {
    active: true,
    reason: null,
    bodyNodeA,
    bodyNodeB,
    faceNodeA,
    faceNodeB,
  };
}

function buildUnityPrefabSourceGraph(
  extension: unknown,
  bodyAsset: BodyAssetManifest,
  headAsset: HeadAssetManifest,
  meshCarrierRoot?: THREE.Object3D | null
): UnityPrefabSourceGraph | null {
  const setup = readRuntimeUnitySetup0414ForGraph(extension);
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
      node.scale.copy(readUnityVector3(transform.localScale, new THREE.Vector3(1, 1, 1)));
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
  const defaultBodyRoot = setup.activeRootProfile?.defaultBodyRoot ?? "body";
  const assembly = setup.bodyHeadAssembly;
  const bodyAttachByName = findPrefabGraphNodeByName(
    nodeByPath,
    defaultBodyRoot,
    bodyAsset.skeleton.neckAttach.nodeName
  );
  const bodyAttach = resolvePrefabGraphNode(nodeByPath, [
    assembly?.parentAttachPath,
  ]) ?? bodyAttachByName ?? resolvePrefabGraphNode(nodeByPath, [
    `${defaultBodyRoot}/Position/PositionOffset/Hip/Waist/Spine/Chest/Neck`,
    `${defaultBodyRoot}/Position/Hip/Waist/Spine/Chest/Neck`,
  ]);
  const headRoot = resolvePrefabGraphNode(nodeByPath, [
    assembly?.childRootPath,
    "face",
    headAsset.assembly.rootNodeName,
  ]);
  const headRoots = collectUnityPrefabHeadRoots(root, headRoot?.node ?? null);
  const headOriginByPath = resolvePrefabGraphNode(nodeByPath, [
    assembly?.childOriginPath,
    "face/Position",
    headRoot?.path ? `${headRoot.path}/Position` : null,
  ]);
  const headOriginByName = findPrefabGraphNodeByName(
    nodeByPath,
    "face",
    headAsset.assembly.attachOrigin.nodeName
  );
  const headOrigin = headOriginByPath ?? headOriginByName;
  const useModelCombineSetup = isModelCombineSetupAssembly(assembly);
  const modelCombine = useModelCombineSetup
    ? applyOfficialModelCombineSetup(root, nodeByPath, defaultBodyRoot, assembly)
    : null;

  let headOriginRestLocalToHeadRoot: THREE.Matrix4 | null = null;
  if (!useModelCombineSetup && headRoot && headOrigin) {
    headRoot.node.updateMatrixWorld(true);
    headOrigin.node.updateMatrixWorld(true);
    headOriginRestLocalToHeadRoot = new THREE.Matrix4()
      .copy(headRoot.node.matrixWorld)
      .invert()
      .multiply(headOrigin.node.matrixWorld);
  }
  const headRootMounts = headRoots.map((mountedHeadRoot) => {
    const rootPath = getUnityPrefabTransformPath(mountedHeadRoot);
    const mountedHeadOrigin = resolveUnityPrefabMountedHeadOrigin(
      mountedHeadRoot,
      assembly,
      headOrigin?.path ?? "face/Position"
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

  let assemblyMount: THREE.Object3D | null = null;
  let assemblyMountPath: string | null = null;
  const runtimeMountPath = assembly?.runtimeMountPath ?? "PJSK_RuntimeMount_face";
  if (!useModelCombineSetup && bodyAttach && headRoot) {
    assemblyMount = new THREE.Object3D();
    assemblyMount.name = runtimeMountPath.split("/").pop() ?? "PJSK_RuntimeMount_face";
    assemblyMount.userData.pjskTransformPath = runtimeMountPath;
    assemblyMount.userData.pjskRuntimeAssemblyMount = true;
    assemblyMountPath = runtimeMountPath;
    bodyAttach.node.add(assemblyMount);

    for (const mounted of headRootMounts) {
      if (mounted.root.parent) {
        mounted.root.parent.remove(mounted.root);
      }
      assemblyMount.add(mounted.root);
      if (mounted.originRestLocalToRoot) {
        const headRootLocal = new THREE.Matrix4()
          .copy(mounted.originRestLocalToRoot)
          .invert();
        headRootLocal.decompose(
          mounted.root.position,
          mounted.root.quaternion,
          mounted.root.scale
        );
      } else {
        mounted.root.position.set(0, 0, 0);
        mounted.root.quaternion.identity();
        mounted.root.scale.set(1, 1, 1);
      }
      mounted.root.updateMatrix();
    }
    nodeByPath.set(runtimeMountPath, assemblyMount);
    root.updateMatrixWorld(true);
  }

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
    active: useModelCombineSetup
      ? Boolean(modelCombine?.active)
      : Boolean(bodyAttach && headRoot && headOrigin && headOriginRestLocalToHeadRoot),
    sourcePath: useModelCombineSetup
      ? modelCombine?.bodyNodeA?.path ?? null
      : bodyAttach?.path ?? null,
    targetPath: useModelCombineSetup
      ? modelCombine?.faceNodeA?.path ?? null
      : headOrigin?.path ?? null,
    reason: useModelCombineSetup
      ? modelCombine?.reason ?? null
      : bodyAttach
      ? headRoot
        ? headOrigin
          ? headOriginRestLocalToHeadRoot
            ? null
            : "head origin rest offset was not computed"
          : "head origin prefab node was not found"
        : "head root prefab node was not found"
      : "body attach prefab node was not found",
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
      runtimeMount: assemblyMount
        ? makePrefabNodeDebug(assemblyMount, root)
        : null,
      modelCombineBodyNeck: modelCombine?.bodyNodeA
        ? makePrefabNodeDebug(modelCombine.bodyNodeA.node, root)
        : null,
      modelCombineFaceNeck: modelCombine?.faceNodeA
        ? makePrefabNodeDebug(modelCombine.faceNodeA.node, root)
        : null,
    },
  };

  return {
    root,
    nodeByPath,
    meshCarrierBindings,
    bodyAttach: bodyAttach?.node ?? null,
    bodyAttachPath: bodyAttach?.path ?? null,
    headRoot: headRoot?.node ?? null,
    headRootPath: headRoot?.path ?? null,
    headOrigin: headOrigin?.node ?? null,
    headOriginPath: headOrigin?.path ?? null,
    assemblyMount,
    assemblyMountPath,
    usesModelCombineSetup: useModelCombineSetup,
    headOriginRestLocalToHeadRoot,
    headRootMounts,
    debug,
  };
}

function resolveUnityPrefabSourceScaleCorrection(extension: unknown) {
  const payload = asRuntimeRecord(extension);
  const character = asRuntimeRecord(payload.character ?? payload.Character);
  const bodyManifest = asRuntimeRecord(payload.bodyManifest ?? payload.BodyManifest);
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

function installUnityRuntimeNativeMeshes(
  graph: UnityPrefabSourceGraph,
  extension: unknown
) {
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
    const meshMaterials = materials.length > 0 ? materials : [new THREE.MeshBasicMaterial({ color: 0xffffff })];
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
    error: meshCount > 0 ? null : "Unity runtime nativeMeshes did not produce any renderable mesh.",
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

function isLoopClipName(name: string | undefined, url: string | null) {
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

function isHeadMotionTrack(track: THREE.KeyframeTrack) {
  return /^(Head|Neck)\.(position|quaternion|scale)$/.test(track.name);
}

function makeAnimationTrackDebug(
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

function prepareRuntimeAnimationClip(
  clip: THREE.AnimationClip,
  includeBodyHeadTracks: boolean,
  utjControlledNodeNames: ReadonlySet<string>
) {
  void utjControlledNodeNames;
  const bodyClip = includeBodyHeadTracks ? clip : filterBodyHeadMotionTracks(clip);
  return bodyClip;
}

function isUnityMotionJsonUrl(url: string) {
  return /(?:^|\/)unity-motion\.(?:json|msgpack\.br)(?:$|[?#])/i.test(url);
}

function inferBodyAnimationKind(
  url: string | null,
  explicitKind?: BodyAnimationKind | null
): BodyAnimationKind | null {
  if (!url) {
    return null;
  }
  return explicitKind ?? (isUnityMotionJsonUrl(url) ? "unity-json" : null);
}

function animationClipCacheKey(url: string, kind: BodyAnimationKind | null) {
  return `${kind ?? "unknown"}:${url}`;
}

function readUnityMotionRuntime0414(value: unknown): UnityMotionRuntime0414 {
  const payload = asRecord(value);
  const version = String(payload.version ?? payload.Version ?? "");
  const rawClips = payload.clips ?? payload.Clips;
  if (version !== "0414" || !Array.isArray(rawClips)) {
    throw new Error("Unity motion JSON must be version 0414 and contain clips.");
  }

  const clips = rawClips.map(readUnityMotionClip0414);
  if (!clips.length) {
    throw new Error("Unity motion JSON contains no clips.");
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

function readNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
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

async function loadUnityMotionClips(url: string): Promise<THREE.AnimationClip[]> {
  const runtime = readUnityMotionRuntime0414(await fetchRuntimeJson(url));
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
  const setup = readRuntimeUnitySetup0414ForGraph(extension);
  if (setup?.bodyHeadAssembly?.parentingMode === "model_combine_setup") {
    return Boolean(
      setup.bodyHeadAssembly.parentAttachPath &&
      setup.bodyHeadAssembly.childRootPath &&
      setup.bodyHeadAssembly.childOriginPath
    );
  }
  return Boolean(
    setup?.bodyHeadAssembly?.parentAttachPath &&
    setup.bodyHeadAssembly.childRootPath &&
    setup.bodyHeadAssembly.childOriginPath &&
    setup.bodyHeadAssembly.runtimeMountPath
  );
}

function stripThreeDuplicateSuffix(name: string) {
  return name.replace(/_\d+$/, "");
}

function buildPrefabNodePathLookup(root: THREE.Object3D) {
  const nodeByPath = new Map<string, THREE.Object3D>();

  root.traverse((node) => {
    if (node === root || !node.name) {
      return;
    }

    const rawSegments: string[] = [];
    const canonicalSegments: string[] = [];
    let current: THREE.Object3D | null = node;
    while (current && current !== root) {
      if (current.name) {
        rawSegments.push(current.name);
        canonicalSegments.push(stripThreeDuplicateSuffix(current.name));
      }
      current = current.parent;
    }
    rawSegments.reverse();
    canonicalSegments.reverse();
    for (let index = 0; index < rawSegments.length; index += 1) {
      const rawPath = rawSegments.slice(index).join("/");
      if (rawPath) {
        nodeByPath.set(rawPath, node);
      }
      const canonicalPath = canonicalSegments.slice(index).join("/");
      if (canonicalPath) {
        nodeByPath.set(canonicalPath, node);
      }
    }
  });

  return nodeByPath;
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

function collectPrefabHeadFollowTargets(root: THREE.Object3D) {
  const targets: Array<{ node: THREE.Object3D; path: string }> = [];
  const seen = new Set<THREE.Object3D>();
  root.traverse((node) => {
    if (node === root || !node.name) {
      return;
    }

    const rawPath = buildObjectPath(node, root);
    const canonicalPath = buildObjectPath(node, root, true);
    const isFaceControlRoot = canonicalPath === "face/Position";
    if (!isFaceControlRoot || seen.has(node)) {
      return;
    }

    seen.add(node);
    targets.push({ node, path: rawPath });
  });
  return targets;
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

function retargetUnityPrefabAnimationClip(
  clip: THREE.AnimationClip,
  root: THREE.Object3D,
  extension: unknown
): { clip: THREE.AnimationClip | null; debug: AnimationRetargetDebug; error: string | null } {
  const bindingSet = readBodyMotionBindings(extension);
  const baseDebug: AnimationRetargetDebug = {
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

function createProjectedShadowTexture(size = 128) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas 2D context is required for projected shadow texture.");
  }
  const gradient = context.createRadialGradient(
    size * 0.5,
    size * 0.5,
    size * 0.05,
    size * 0.5,
    size * 0.5,
    size * 0.5
  );
  gradient.addColorStop(0.0, "rgba(0, 0, 0, 0.72)");
  gradient.addColorStop(0.45, "rgba(0, 0, 0, 0.32)");
  gradient.addColorStop(1.0, "rgba(0, 0, 0, 0.0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

type CharacterProjectedShadowUpdate = {
  targetWorldPositions: THREE.Vector3[];
  lightWorldPosition: THREE.Vector3 | null;
  characterHeight: number;
  visible: boolean;
};

type ProjectedShadowPair = {
  targetWorldPosition: THREE.Vector3;
  initialToeHeight: number | null;
  directionalAnchor: THREE.Group;
  crossAnchor: THREE.Group;
  directionalMaterial: THREE.MeshBasicMaterial;
  crossMaterial: THREE.MeshBasicMaterial;
  directionalAlpha: number;
};

function normalizeProjectedShadowSettings(
  input: ProjectedShadowSettingsInput = {},
  base: ProjectedShadowSettings = defaultProjectedShadowSettings
): ProjectedShadowSettings {
  const positive = (value: number | undefined, fallback: number, min = 0) =>
    Number.isFinite(value) ? Math.max(value!, min) : fallback;
  const unit = (value: number | undefined, fallback: number) =>
    Number.isFinite(value) ? THREE.MathUtils.clamp(value!, 0, 1) : fallback;
  return {
    width: positive(input.width, base.width, 0.001),
    height: positive(input.height, base.height, 0.001),
    opacity: unit(input.opacity, base.opacity),
    crossSize: positive(input.crossSize, base.crossSize, 0.001),
    crossOpacity: unit(input.crossOpacity, base.crossOpacity),
    floorY: Number.isFinite(input.floorY) ? input.floorY! : base.floorY,
    adjustShadow: input.adjustShadow ?? base.adjustShadow,
    adjustAlpha: input.adjustAlpha ?? base.adjustAlpha,
    invisibleHeight: positive(input.invisibleHeight, base.invisibleHeight, 0.001),
    directionalShadow: input.directionalShadow ?? base.directionalShadow,
  };
}

class CharacterProjectedShadowController {
  readonly group = new THREE.Group();

  private readonly defaultDirection = new THREE.Vector3(-0.35, 0, 0.94).normalize();
  private settings = { ...defaultProjectedShadowSettings };
  private readonly pairs: ProjectedShadowPair[] = [];

  constructor() {
    const shadowTexture = createProjectedShadowTexture();
    for (const boneName of PROJECTED_SHADOW_BONE_NAMES) {
      const directionalMaterial = this.createShadowMaterial(shadowTexture, this.settings.opacity);
      const crossMaterial = this.createShadowMaterial(shadowTexture, this.settings.crossOpacity);
      const directionalAnchor = new THREE.Group();
      const crossAnchor = new THREE.Group();

      const directionalMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), directionalMaterial);
      directionalMesh.name = `CharacterDirectionalShadow_${boneName}`;
      directionalMesh.rotation.x = -Math.PI / 2;
      directionalMesh.renderOrder = -100;
      directionalMesh.scale.set(this.settings.width, this.settings.height, 1);
      directionalAnchor.add(directionalMesh);

      const crossMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), crossMaterial);
      crossMesh.name = `CharacterCrossShadow_${boneName}`;
      crossMesh.rotation.x = -Math.PI / 2;
      crossMesh.renderOrder = -99;
      crossMesh.scale.set(this.settings.crossSize, this.settings.crossSize, 1);
      crossAnchor.add(crossMesh);

      directionalAnchor.visible = this.settings.directionalShadow;
      crossAnchor.visible = !this.settings.directionalShadow;
      this.group.add(directionalAnchor);
      this.group.add(crossAnchor);
      this.pairs.push({
        targetWorldPosition: new THREE.Vector3(),
        initialToeHeight: null,
        directionalAnchor,
        crossAnchor,
        directionalMaterial,
        crossMaterial,
        directionalAlpha: this.settings.opacity,
      });
    }

    this.group.name = "CharacterProjectedShadow";
    this.group.visible = false;
  }

  private createShadowMaterial(shadowTexture: THREE.Texture, opacity: number) {
    return new THREE.MeshBasicMaterial({
      color: "#000000",
      map: shadowTexture,
      transparent: true,
      opacity,
      depthWrite: false,
      depthTest: true,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      side: THREE.DoubleSide,
    });
  }

  setSettings(input: ProjectedShadowSettingsInput = {}) {
    this.settings = normalizeProjectedShadowSettings(input, this.settings);
    for (const pair of this.pairs) {
      const directionalMesh = pair.directionalAnchor.children[0];
      if (directionalMesh) {
        directionalMesh.scale.set(this.settings.width, this.settings.height, 1);
      }
      const crossMesh = pair.crossAnchor.children[0];
      if (crossMesh) {
        crossMesh.scale.set(this.settings.crossSize, this.settings.crossSize, 1);
      }
      pair.directionalAnchor.visible = this.settings.directionalShadow;
      pair.crossAnchor.visible = !this.settings.directionalShadow;
    }
  }

  update(state: CharacterProjectedShadowUpdate) {
    const targets = state.targetWorldPositions;
    this.group.visible = state.visible && targets.length > 0;
    if (!this.group.visible) {
      for (const pair of this.pairs) {
        pair.initialToeHeight = null;
        pair.targetWorldPosition.set(0, 0, 0);
      }
      return;
    }

    for (const [index, pair] of this.pairs.entries()) {
      const target = targets[Math.min(index, targets.length - 1)];
      pair.targetWorldPosition.copy(target);
      pair.initialToeHeight ??= target.y;
      pair.directionalAnchor.visible = this.settings.directionalShadow;
      pair.crossAnchor.visible = !this.settings.directionalShadow;

      const direction = this.resolveDirectionalShadowDirection(target, state.lightWorldPosition);
      const effectiveHeight = Math.max(0.001, state.characterHeight);
      const heightRatio = (target.y - this.settings.floorY) / effectiveHeight;
      const distanceToFloor = this.settings.height * heightRatio;
      const directionalX = target.x + direction.x * distanceToFloor;
      const directionalZ = target.z + direction.z * distanceToFloor;
      pair.directionalAnchor.position.set(
        this.settings.adjustShadow ? target.x : directionalX,
        this.settings.floorY + PROJECTED_DIRECTIONAL_SHADOW_OFFSET_FLOOR,
        this.settings.adjustShadow ? target.z : directionalZ
      );
      pair.directionalAnchor.rotation.y = Math.atan2(direction.x, direction.z);
      pair.directionalAlpha = this.calculateDirectionalShadowAlpha(pair, target.y);
      pair.directionalMaterial.opacity = pair.directionalAlpha;

      const crossHeightRatio = (target.y - this.settings.floorY) / this.settings.invisibleHeight;
      const crossAlpha = crossHeightRatio < 0 ? 1 : 1 - Math.min(crossHeightRatio, 1);
      pair.crossAnchor.position.set(
        target.x,
        this.settings.floorY + PROJECTED_CROSS_SHADOW_OFFSET_FLOOR,
        target.z
      );
      pair.crossMaterial.opacity = this.settings.crossOpacity * crossAlpha;
    }
  }

  private calculateDirectionalShadowAlpha(pair: ProjectedShadowPair, targetY: number) {
    if (!this.settings.adjustAlpha) {
      return this.settings.opacity;
    }
    const t = (targetY - (pair.initialToeHeight ?? this.settings.floorY)) / this.settings.invisibleHeight;
    const factor = t < 0 ? 1 : 1 - Math.min(t, 1);
    return this.settings.opacity * factor;
  }

  private resolveDirectionalShadowDirection(
    targetWorldPosition: THREE.Vector3,
    lightWorldPosition: THREE.Vector3 | null
  ) {
    if (!lightWorldPosition) {
      return this.defaultDirection.clone();
    }
    const direction = new THREE.Vector3(
      targetWorldPosition.x - lightWorldPosition.x,
      0,
      targetWorldPosition.z - lightWorldPosition.z
    );
    if (direction.lengthSq() < 0.000001) {
      return this.defaultDirection.clone();
    }
    return direction.normalize();
  }

  getDebugSnapshot(
    characterHeight: number
  ): RuntimeProjectedShadowDebug {
    const pair = this.pairs[0];
    pair.directionalAnchor.updateMatrixWorld(true);
    pair.crossAnchor.updateMatrixWorld(true);
    const directionalForward = new THREE.Vector3(0, 0, 1)
      .applyQuaternion(pair.directionalAnchor.getWorldQuaternion(new THREE.Quaternion()))
      .normalize();
    const targetPosition = this.pairs
      .reduce((sum, current) => sum.add(current.targetWorldPosition), new THREE.Vector3())
      .multiplyScalar(1 / Math.max(this.pairs.length, 1));
    return {
      visible: this.group.visible,
      floorY: Number(this.settings.floorY.toFixed(4)),
      characterHeight: Number(characterHeight.toFixed(4)),
      settings: { ...this.settings },
      targetPosition: vectorDebugSnapshot(targetPosition),
      targetPositions: this.pairs.map((current) => vectorDebugSnapshot(current.targetWorldPosition)),
      directional: {
        position: vectorDebugSnapshot(pair.directionalAnchor.position),
        forward: vectorDebugSnapshot(directionalForward),
        scale: vectorDebugSnapshot(new THREE.Vector3(
          this.settings.width,
          1,
          this.settings.height
        )),
        opacity: Number(pair.directionalMaterial.opacity.toFixed(4)),
        alpha: Number(pair.directionalAlpha.toFixed(4)),
      },
      cross: {
        position: vectorDebugSnapshot(pair.crossAnchor.position),
        scale: vectorDebugSnapshot(new THREE.Vector3(
          this.settings.crossSize,
          1,
          this.settings.crossSize
        )),
        opacity: Number(pair.crossMaterial.opacity.toFixed(4)),
      },
    };
  }
}

export class Haruki3DEngine {
  private readonly container: HTMLElement;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly controls: OrbitControls;
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
  private currentImportIsCombined = false;
  private currentImportSnapshot: PartImportSnapshot | null = null;
  private currentBodyAttachNode: THREE.Object3D | null = null;
  private currentHeadAttachOriginNode: THREE.Object3D | null = null;
  private currentCompositionStatus: CompositionStatus = {
    mode: "separate_parts",
    linkedBoneCount: 0,
    missingBodyBones: [],
    missingHeadBones: [],
    usingFallbackAttach: true,
  };
  private readonly activeBoneLinks: BoneLink[] = [];
  private currentStitchMode: CharacterAssemblyState["stitchMode"] = "stitched";
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
  private currentVrmSpringBoneManager: unknown = null;
  private currentSpringRuntime: SpringRuntimeController | null = null;
  private currentExtraBoneRuntime: SekaiExtraBoneRuntime | null = null;
  private currentPrefabSourceGraph: UnityPrefabSourceGraph | null = null;
  private currentPrefabHeadFollowConstraint: PrefabHeadFollowConstraint | null = null;
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
  private materialBindingMode: MaterialBindingMode = "manifest";
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
  private lastNativeMeshInstallDiagnostics: ReturnType<typeof installUnityRuntimeNativeMeshes> | null = null;
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
    this.container = options.container;
    this.autoRender = options.autoRender ?? true;
    this.manageResize = options.manageResize ?? true;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#7f8d95");
    this.scene.fog = new THREE.Fog("#7f8d95", 5.5, 15);

    const width = Math.max(this.container.clientWidth, 320);
    const height = Math.max(this.container.clientHeight, 320);
    this.camera = new THREE.PerspectiveCamera(DEFAULT_CAMERA_FOV, width / height, 0.1, 100);
    this.camera.position.copy(getDefaultCameraPosition(light.characterHeight));

    this.renderer = new THREE.WebGLRenderer({ antialias: true, stencil: true });
    this.renderer.autoClearStencil = true;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.container.appendChild(this.renderer.domElement);
    this.updateCaptureBackgroundTexture();

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.minPolarAngle = THREE.MathUtils.degToRad(82);
    this.controls.maxPolarAngle = THREE.MathUtils.degToRad(100);
    this.controls.target.copy(getDefaultCameraTarget(light.characterHeight));
    this.controls.addEventListener("change", () => {
      this.cameraDebugChangeCallback?.();
    });
    this.controls.update();

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
      lambertEnabled: false,
      headPosition: this.hairHeadPosition,
    });
    this.faceMaterial = createSekaiFaceMaterial({
      baseColor: "#ffe4dc",
      warmColor: "#ffd4c8",
      lightDirection: COSTUME_SHOP_FACE_SHADOW_LIGHT_DIRECTION.clone(),
      lightIntensity: light.intensity,
      ambientIntensity: light.ambient,
      faceSoftness: light.faceSoftness,
      faceSdfUseLightDirection: light.faceSdfUseLightDirection,
      headDotDirectionalLight: this.headDotDirectionalLight,
      useFaceShadowLimiter: COSTUME_SHOP_USE_FACE_SHADOW_LIMITER,
      faceShadowLimitRange: COSTUME_SHOP_FACE_SHADOW_LIMIT_RANGE,
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

  async importCharacterParts(
    bodyAsset: BodyAssetManifest,
    headAsset: HeadAssetManifest
  ): Promise<PartImportSnapshot> {
    const revision = ++this.importRevision;
    this.runtimeDebug.outlineShells = [];
    this.currentBodyAsset = bodyAsset;
    this.currentHeadAsset = headAsset;
    this.currentImportIsCombined = false;
    this.currentPrefabSourceGraph = null;
    this.currentPrefabHeadFollowConstraint = null;
    this.currentPrefabHeadFollowDebug = {
      active: false,
      sourcePath: null,
      targetPath: null,
      reason: "separate parts import",
    };
    const [loadedBody, loadedHead] = await Promise.all([
      this.loadBodyAsset(bodyAsset),
      this.loadHeadAsset(headAsset),
    ]);

    if (revision !== this.importRevision) {
      return {
        revision,
        body: this.makeImportStatus(bodyAsset, loadedBody),
        head: this.makeImportStatus(headAsset, loadedHead),
        composition: this.currentCompositionStatus,
      };
    }

    const bodyMeshCount = this.applyBodyAsset(bodyAsset, loadedBody);
    const headMeshCount = this.applyHeadAsset(headAsset, loadedHead);
    const composition = this.prepareComposition();
    await this.refreshAnimationPlayback();

    if (revision !== this.importRevision) {
      return {
        revision,
        body: this.makeImportStatus(bodyAsset, loadedBody),
        head: this.makeImportStatus(headAsset, loadedHead),
        composition: this.currentCompositionStatus,
      };
    }
    const snapshot = {
      revision,
      body: {
        ...this.makeImportStatus(bodyAsset, loadedBody),
        meshCount: bodyMeshCount,
        boneCount: loadedBody.boneCount,
        skinnedMeshCount: loadedBody.skinnedMeshCount,
      },
      head: {
        ...this.makeImportStatus(headAsset, loadedHead),
        meshCount: headMeshCount,
        boneCount: loadedHead.boneCount,
        skinnedMeshCount: loadedHead.skinnedMeshCount,
      },
      composition,
    };
    this.currentImportSnapshot = snapshot;
    this.applyRenderIsolationMode();
    return snapshot;
  }

  async importCombinedCharacter(
    characterAsset: RuntimeCombinedCharacterAsset,
    options: CombinedCharacterImportOptions = {}
  ): Promise<PartImportSnapshot> {
    const revision = ++this.importRevision;
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
    this.currentImportIsCombined = true;
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
    this.currentRuntimeExtension = this.resolvePjskRuntimeExtension(
      loaded,
      characterAsset.runtimeExtension
    );
    this.currentVrmSpringBoneManager = loaded.springBoneManager ?? null;
    this.currentSpringRuntime = null;
    this.currentExtraBoneRuntime = null;
    this.currentBodyAttachNode = null;
    this.currentHeadAttachOriginNode = null;
    this.runtimeDebug.headMorphs = [];
    this.currentHeadMorphRuntimes.length = 0;
    this.currentBodyAnimationRoot = null;
    this.currentPrefabSourceGraph = null;
    this.currentPrefabHeadFollowConstraint = null;
    this.currentPrefabHeadFollowDebug = {
      active: false,
      sourcePath: null,
      targetPath: null,
      reason: "not initialized",
    };

    if (loaded.root) {
      this.bodySlot.add(loaded.root);
      const prefabSourceGraph = loaded.prefabSourceGraph ?? (this.springRuntimeMode === "unity-prefab"
        ? buildUnityPrefabSourceGraph(
          this.currentRuntimeExtension,
          characterAsset.bodyAsset,
          characterAsset.headAsset,
          loaded.root
        )
        : null);
      if (prefabSourceGraph) {
        this.currentPrefabSourceGraph = prefabSourceGraph;
        if (prefabSourceGraph.root !== loaded.root) {
          this.bodySlot.add(prefabSourceGraph.root);
        }
        this.currentBodyAnimationRoot = prefabSourceGraph.root;
        this.currentBodyAttachNode = prefabSourceGraph.bodyAttach;
        this.currentHeadAttachOriginNode = prefabSourceGraph.headOrigin;
        this.currentPrefabHeadFollowDebug = prefabSourceGraph.debug;
      } else {
        this.currentBodyAnimationRoot = loaded.root;
        const bodySkeletonRoot = this.findNodeByName(
          loaded.root,
          characterAsset.bodyAsset.skeleton.rootNodeName
        );
        const headSkeletonRoot = this.findNodeByName(
          loaded.root,
          characterAsset.headAsset.assembly.rootNodeName
        );
        this.currentBodyAttachNode = this.findNodeByName(
          bodySkeletonRoot ?? loaded.root,
          characterAsset.bodyAsset.skeleton.neckAttach.nodeName
        );
        this.currentHeadAttachOriginNode = this.findNodeByName(
          headSkeletonRoot ?? loaded.root,
          characterAsset.headAsset.assembly.attachOrigin.nodeName
        );
      }
      this.bindHeadMorphTargets(loaded.root, characterAsset.headAsset);
      const bodySkeletonRoot = this.currentPrefabSourceGraph
        ? this.currentPrefabSourceGraph.nodeByPath.get(
          this.currentPrefabSourceGraph.bodyAttachPath?.split("/").slice(0, 1).join("/") ?? "body"
        ) ?? null
        : this.findNodeByName(
          loaded.root,
          characterAsset.bodyAsset.skeleton.rootNodeName
        );
      this.prepareCombinedComposition(bodySkeletonRoot, loaded.root);
      const runtimeRoot = this.currentBodyAnimationRoot ?? loaded.root;
      this.currentExtraBoneRuntime = SekaiExtraBoneRuntime.fromPjskRuntimeExtension(
        this.currentRuntimeExtension,
        runtimeRoot
      );
      this.currentSpringRuntime = this.createSpringRuntime(
        this.currentPrefabSourceGraph?.root ?? runtimeRoot
      );
      this.currentPrefabHeadFollowConstraint = this.currentPrefabSourceGraph
        ? null
        : this.createPrefabHeadFollowConstraint(loaded.root);
      this.syncUnityPrefabSourceGraph();
    } else {
      this.currentCompositionStatus = {
        mode: "separate_parts",
        linkedBoneCount: 0,
        missingBodyBones: [],
        missingHeadBones: [],
        usingFallbackAttach: true,
      };
    }
    if (options.preserveAnimation) {
      this.resetCurrentSpringRuntimeState();
    } else {
      await this.refreshAnimationPlayback();
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

  setMaterialBindingMode(mode: MaterialBindingMode) {
    this.materialBindingMode = mode;
    this.runtimeDebug.materialBindingMode = mode;
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
    this.syncLinkedHeadBones();
    this.characterRoot.updateMatrixWorld(true);
    this.updateShaderFaceBasis();
  }

  private applyCaptureCharacterYawMode(
    mode: HarukiPrepareCaptureFrameRequest["characterYawMode"]
  ) {
    switch (mode) {
      case "45":
      case "-45":
      case "90":
      case "-90":
      case "180":
      case "0":
        this.setCharacterYawDegrees(Number(mode));
        return;
      case "face-camera":
        this.faceCharacterTowardCamera();
        return;
      case undefined:
      default:
        return;
    }
  }

  private faceCharacterTowardCamera() {
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
    this.syncLinkedHeadBones();
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
    const frontDot = cameraSideValid ? cameraDirection.dot(this.faceForwardWorld) : 1.0;
    const sideDot = cameraSideValid ? Math.abs(cameraDirection.dot(this.faceRightWorld)) : 0.0;
    const frontFade = THREE.MathUtils.smoothstep(
      frontDot,
      EYE_THROUGH_HAIR_FRONT_FADE_MIN,
      EYE_THROUGH_HAIR_FRONT_FADE_MAX
    );
    const sideFade = 1.0 - THREE.MathUtils.smoothstep(
      sideDot,
      EYE_THROUGH_HAIR_SIDE_FADE_MIN,
      EYE_THROUGH_HAIR_SIDE_FADE_MAX
    );
    const viewAlpha = THREE.MathUtils.clamp(frontFade * sideFade, 0.0, 1.0);
    const passVisible = viewAlpha > 0.001;
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
        mesh.visible = (typeof baseVisible === "boolean" ? baseVisible : mesh.visible) && passVisible;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of materials) {
          if (!(material instanceof THREE.ShaderMaterial) || !material.uniforms.uAlphaScale) {
            continue;
          }
          if (typeof material.userData.pjskEyeThroughHairBaseAlphaScale !== "number") {
            material.userData.pjskEyeThroughHairBaseAlphaScale = material.uniforms.uAlphaScale.value;
          }
          material.uniforms.uAlphaScale.value =
            material.userData.pjskEyeThroughHairBaseAlphaScale * viewAlpha;
        }
      });
    }
  }

  private applyFaceSdfDebugUniforms() {
    const debugUniform = faceSdfDebugModeToUniform(this.faceSdfDebugMode);
    const debugLightUniform = faceSdfDebugLightModeToUniform(this.faceSdfDebugLightMode);
    this.faceMaterial.uniforms.uFaceDebugMode.value = debugUniform;
    this.faceMaterial.uniforms.uFaceDebugLightMode.value = debugLightUniform;
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
            material.uniforms.uFaceDebugLightMode.value = debugLightUniform;
          }
        }
      });
    }
    for (const entries of [this.runtimeDebug.body, this.runtimeDebug.head]) {
      for (const entry of entries) {
        if (entry.resolvedKind === "face_sdf" || entry.shaderFaceDebugMode !== undefined) {
          entry.shaderFaceDebugMode = debugUniform;
          entry.shaderFaceDebugLightMode = debugLightUniform;
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
    const lightDirection = COSTUME_SHOP_FACE_SHADOW_LIGHT_DIRECTION.clone();
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
    const faceSdfUseLightDirection =
      this.faceMaterial.uniforms.uFaceSdfUseLightDirection?.value ?? 0.5;
    const faceSdfLimit = THREE.MathUtils.clamp(
      (Math.acos(Math.max(faceFront, 0.0)) / 1.5707963) *
        THREE.MathUtils.clamp(faceSdfUseLightDirection, 0.0, 1.0),
      0.015,
      0.985
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
    const target = this.controls.target;
    const offset = position.clone().sub(target);
    const spherical = new THREE.Spherical().setFromVector3(offset);
    const costumeShopPose = this.currentCameraPreset === "capture"
      ? calculateCostumeShopCameraPose(getCostumeShopCameraState(this.currentCameraProfile ?? "full-body"))
      : null;
    return {
      preset: this.currentCameraPreset,
      profile: this.currentCameraProfile,
      costumeShopState: costumeShopPose === null
        ? null
        : {
            cameraRootYawDegrees: Number(costumeShopPose.state.cameraRootYawDegrees.toFixed(3)),
            zoomValue: Number(costumeShopPose.state.zoomValue.toFixed(4)),
            zoomMoveValue: Number(costumeShopPose.state.zoomMoveValue.toFixed(4)),
            zoomRatio: Number(costumeShopPose.state.zoomRatio.toFixed(4)),
            localCameraPosition: {
              x: Number(costumeShopPose.state.localCameraPosition.x.toFixed(4)),
              y: Number(costumeShopPose.state.localCameraPosition.y.toFixed(4)),
              z: Number(costumeShopPose.state.localCameraPosition.z.toFixed(4)),
            },
            localCameraRotationYDegrees: costumeShopPose.state.localCameraRotationYDegrees,
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
      minPolarDegrees: Number(THREE.MathUtils.radToDeg(this.controls.minPolarAngle).toFixed(3)),
      maxPolarDegrees: Number(THREE.MathUtils.radToDeg(this.controls.maxPolarAngle).toFixed(3)),
      characterHeight: Number(this.characterHeight.toFixed(4)),
    };
  }

  onCameraDebugChange(callback: (() => void) | null) {
    this.cameraDebugChangeCallback = callback;
  }

  getSpringBoneSnapshot(debugOptions?: UtjSpringBoneDebugOptions): SpringBoneRuntimeSnapshot {
    return summarizeSpringBoneMetadata(
      this.currentRuntimeExtension,
      Boolean(this.currentVrmSpringBoneManager),
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
    this.syncLinkedHeadBones();
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

  stepCaptureFrame(delta: number, advanceAnimation: boolean) {
    const stepDelta = Math.max(0, delta);
    if (advanceAnimation) {
      this.currentAnimationMixer?.update(stepDelta);
      this.updateFaceMotion(stepDelta);
    }
    this.syncLinkedHeadBones();
    this.currentExtraBoneRuntime?.update();
    if (this.isSpringRuntimeEnabled()) {
      this.currentSpringRuntime?.update(stepDelta);
    } else {
      this.currentSpringRuntime?.resetPose();
    }
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
    const toePositions = PROJECTED_SHADOW_BONE_NAMES
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
    const nextWidth = Math.max(Math.trunc(width) || 0, 320);
    const nextHeight = Math.max(Math.trunc(height) || 0, 320);
    this.camera.aspect = nextWidth / nextHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(nextWidth, nextHeight);
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
    const previousRoleId = wardrobe.getActiveRoleId();
    const previousCombinedId = wardrobe.getCombinedCharacter()?.id ?? null;
    const previousAnimation = this.captureAnimationPlaybackState();
    const combined = await wardrobe.setCustomSelection(selection);
    const roleChanged = previousRoleId !== wardrobe.getActiveRoleId();
    const sameResolvedSelection = !roleChanged &&
      previousCombinedId !== null &&
      previousCombinedId === combined.id &&
      this.currentImportIsCombined;
    if (!sameResolvedSelection) {
      // FUnit-style hot replacement keeps same-role motion state while the prefab/spring graph is rebuilt.
      await this.importCombinedCharacter(combined, {
        preserveAnimation: !roleChanged,
        disposeBeforeLoad: true,
        clearAnimationCache: roleChanged,
      });
    }
    if (!roleChanged && previousAnimation.selection.motionUrl) {
      await this.continueAnimationPlaybackState(previousAnimation);
    } else {
      await this.applyCustomRoleDefaultMotion(combined, roleChanged);
    }
    return combined;
  }

  async captureRoleParts(
    request: HarukiCaptureRolePartsRequest
  ): Promise<HarukiCaptureRolePartsResult> {
    return this.enqueueCustomSelectionMutation(() =>
      this.captureRolePartsInternal(request)
    );
  }

  private async captureRolePartsInternal(
    request: HarukiCaptureRolePartsRequest
  ): Promise<HarukiCaptureRolePartsResult> {
    const wardrobe = this.currentLoadedRuntimePackage?.wardrobe;
    if (!wardrobe) {
      throw new Error("No custom part package is loaded.");
    }
    const role = parseRuntimeRoleId(request.roleId);
    const activeRoleId = wardrobe.getActiveRoleId();
    const nextRoleId = runtimeRoleId(role.characterId, role.unit);
    const partSet = wardrobe.getPartPackageSet();
    const roleChanged = activeRoleId !== nextRoleId;
    if (roleChanged) {
      partSet?.packages.clear();
      partSet?.roleRuntimes.clear();
      this.releaseCurrentCharacterResources({
        preserveAnimationSelection: false,
        clearAnimationCache: true,
      });
      wardrobe.selectRole(role.characterId, role.unit);
      await this.setAnimationSelection(null);
      this.setFaceMotionSet(null, null, null);
    }
    if (partSet) {
      await ensureRoleRuntimePackage(partSet, role.characterId, role.unit);
    }
    const selection: CustomPartSelection = {
      characterId: role.characterId,
      unit: role.unit,
      bodyCostume3dId: request.bodyCostume3dId,
      headCostume3dId: request.headCostume3dId,
      headPackagePath: request.headPackagePath ?? null,
      hairCostume3dId: request.hairCostume3dId,
      headOptionalCostume3dId: request.headOptionalCostume3dId ?? null,
      origin: "custom",
    };
    const combinedCharacter = await this.applyCustomSelection(selection);
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
      snapshots: this.getSnapshots({
        springDebugBones: request.springDebugBones,
        springDebugAllOffsets: request.springDebugAllOffsets,
      }),
    };
  }

  async prepareCaptureFrame(request: HarukiPrepareCaptureFrameRequest = {}) {
    this.setPresentationMode("capture");
    this.setSpringRuntimeMode("unity-prefab");
    if (request.bodyDebugMode !== undefined) {
      this.setBodyDebugMode(request.bodyDebugMode);
    }
    if (request.faceSdfEnabled !== undefined) {
      this.setFaceSdfEnabled(request.faceSdfEnabled);
    }
    if (request.faceSdfDebugMode !== undefined) {
      this.setFaceSdfDebugMode(request.faceSdfDebugMode);
    }
    if (request.faceSdfDebugLightMode !== undefined) {
      this.setFaceSdfDebugLightMode(request.faceSdfDebugLightMode);
    }
    if (request.projectedShadow !== undefined) {
      this.setProjectedShadowSettings(request.projectedShadow);
    }
    this.setUtjSpringBoneTraceFilters(
      request.traceUtjBones ?? [],
      request.traceUtjMaxEvents
    );
    this.setAnimationPaused(true);

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
    const duration = Math.max(this.currentAnimationDuration, 0);
    const seekTargetPhase = (targetPhase: number) => clip === "motion"
      ? this.seekAnimationPhase(targetPhase)
      : this.seekAnimationLoopPhase(targetPhase);
    const startPhase = advanceWarmupAnimation && warmupFrames > 0 && duration > 0
      ? THREE.MathUtils.euclideanModulo(
        phase - warmupFrames / (60 * duration),
        1
      )
      : phase;

    seekTargetPhase(startPhase);

    if (warmupFrames > 0) {
      this.setAnimationPaused(!advanceWarmupAnimation);
      for (let index = 0; index < warmupFrames; index += 1) {
        this.stepCaptureFrame(1 / 60, advanceWarmupAnimation);
      }
      this.setAnimationPaused(true);
    } else if (warmupMs > 0) {
      this.setAnimationPaused(warmupMode === "runtime");
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, warmupMs);
      });
      this.setAnimationPaused(true);
    }

    this.applyCameraPreset(request.cameraPreset ?? "capture", request.cameraProfile);
    this.applyCaptureCharacterYawMode(request.characterYawMode);
    this.stepCaptureFrame(0, false);
    this.renderFrame();
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
    if (faceMotion) {
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

  private captureAnimationPlaybackState(): AnimationPlaybackRestoreState {
    return {
      selection: {
        motionUrl: this.currentAnimationUrl,
        motionKind: this.currentAnimationKind,
        loopUrl: this.currentAnimationLoopUrl,
        loopKind: this.currentAnimationLoopKind,
      },
      activeTime: this.currentAnimationAction?.time ?? 0,
      activeDuration: this.currentAnimationDuration,
      activeWasLoop: Boolean(
        this.currentAnimationLoopUrl &&
        this.currentAnimationAction &&
        !this.currentLoopAction &&
        !this.queuedLoopClipName
      ),
      paused: this.animationPaused,
      speed: this.animationPlaybackSpeed,
      faceMotionTime: this.currentFaceMotionTime,
      faceMotionEnabled: this.faceMotionEnabled,
      capturedAtMs: performance.now(),
    };
  }

  private async continueAnimationPlaybackState(
    state: AnimationPlaybackRestoreState
  ): Promise<void> {
    await this.setAnimationSelection(state.selection);
    if (state.activeWasLoop) {
      this.activateQueuedLoopForSeek();
    }
    const elapsedSeconds = state.paused
      ? 0
      : Math.max(0, (performance.now() - state.capturedAtMs) / 1000) * state.speed;
    const rawTargetTime = state.activeTime + elapsedSeconds;
    const targetTime = state.activeWasLoop && state.activeDuration > 0
      ? rawTargetTime % state.activeDuration
      : rawTargetTime;
    const phase = state.activeDuration > 0
      ? targetTime / state.activeDuration
      : 0;
    if (state.selection.motionUrl) {
      this.seekAnimationPhase(phase);
    }
    this.animationPlaybackSpeed = state.speed;
    this.animationPaused = state.paused;
    this.faceMotionEnabled = state.faceMotionEnabled;
    this.currentFaceMotionTime = state.faceMotionTime + elapsedSeconds;
    this.applyCurrentFaceMotionFrame();
    this.applyAnimationPlaybackSettings();
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

  updateAssembly(assembly: CharacterAssemblyState) {
    if (!this.currentBodyAsset || !this.currentHeadAsset) {
      return;
    }
    if (this.currentImportIsCombined) {
      this.currentStitchMode = assembly.stitchMode;
      this.bodySlot.parent?.remove(this.bodySlot);
      this.headSlot.parent?.remove(this.headSlot);
      this.characterRoot.add(this.bodySlot);
      this.characterRoot.add(this.headSlot);
      this.bodySlot.position.set(0, 0, 0);
      this.headSlot.position.set(0, 0, 0);
      this.bodySlot.scale.setScalar(1);
      this.headSlot.scale.setScalar(1);
      return;
    }

    const bodyNeckAnchor = new THREE.Vector3(
      this.currentBodyAsset.skeleton.neckAttach.fallbackPosition.x,
      this.currentBodyAsset.skeleton.neckAttach.fallbackPosition.y,
      this.currentBodyAsset.skeleton.neckAttach.fallbackPosition.z
    );
    const rawHeadPosition = new THREE.Vector3(
      this.currentHeadAsset.rawImportOffset.x,
      this.currentHeadAsset.rawImportOffset.y,
      this.currentHeadAsset.rawImportOffset.z
    );
    const userOffset = new THREE.Vector3(
      assembly.headOffset.x,
      assembly.headOffset.y,
      assembly.headOffset.z
    );
    this.currentStitchMode = assembly.stitchMode;

    this.bodySlot.parent?.remove(this.bodySlot);
    this.headSlot.parent?.remove(this.headSlot);
    this.characterRoot.add(this.bodySlot);
    this.characterRoot.add(this.headSlot);
    this.bodySlot.position.set(0, 0, 0);
    this.headSlot.position.set(0, 0, 0);
    this.headSlot.scale.setScalar(assembly.headScale);

    const headOriginOffset = this.resolveHeadOriginOffset(assembly.headScale);
    const stitchedParent = this.currentBodyAttachNode ?? this.bodySlot;
    const actualBodyAttach = new THREE.Vector3();
    if (this.currentBodyAttachNode) {
      this.currentBodyAttachNode.getWorldPosition(actualBodyAttach);
      this.characterRoot.worldToLocal(actualBodyAttach);
    } else {
      actualBodyAttach.copy(bodyNeckAnchor);
    }

    switch (assembly.stitchMode) {
      case "stitched":
        this.characterRoot.add(this.bodySlot);
        if (this.currentCompositionStatus.mode === "bone_linked") {
          this.characterRoot.add(this.headSlot);
          this.headSlot.position
            .copy(actualBodyAttach)
            .add(userOffset)
            .sub(headOriginOffset);
        } else {
          stitchedParent.add(this.headSlot);
        }
        this.bodySlot.position.set(0, 0, 0);
        if (this.currentCompositionStatus.mode === "bone_linked") {
        } else if (this.currentBodyAttachNode) {
          this.headSlot.position.copy(userOffset).sub(headOriginOffset);
        } else {
          this.headSlot.position.copy(bodyNeckAnchor).add(userOffset).sub(headOriginOffset);
        }
        break;
      case "manual":
        this.characterRoot.add(this.bodySlot);
        this.characterRoot.add(this.headSlot);
        this.bodySlot.position.set(0, 0, 0);
        this.headSlot.position.copy(rawHeadPosition).add(userOffset).sub(headOriginOffset);
        break;
      case "split":
        this.characterRoot.add(this.bodySlot);
        this.characterRoot.add(this.headSlot);
        this.bodySlot.position.set(-assembly.splitDistance * 0.5, 0, 0);
        this.headSlot.position.set(
          assembly.splitDistance * 0.5 + assembly.headOffset.x - headOriginOffset.x,
          1.25 + assembly.headOffset.y - headOriginOffset.y,
          assembly.headOffset.z - headOriginOffset.z
        );
        break;
    }
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
      hairShadowEnabled: this.isHeadProximityHairShadowEnabled(),
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
      faceSoftness: next.faceSoftness,
      faceSdfUseLightDirection: next.faceSdfUseLightDirection,
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
            uniforms.uShadowThreshold.value = next.shadowThreshold;
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
          if (uniforms.uFaceSoftness) {
            uniforms.uFaceSoftness.value = next.faceSoftness;
          }
          if (uniforms.uFaceSdfUseLightDirection) {
            uniforms.uFaceSdfUseLightDirection.value = next.faceSdfUseLightDirection;
          }
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
    this.controls.dispose();
    this.captureBackgroundTexture?.dispose();
    this.renderer.dispose();
    this.container.replaceChildren();
  }

  private addSceneReference() {
  }

  private applyCharacterHeight(height: number) {
    const nextHeight = THREE.MathUtils.clamp(height || 1, 0.5, 2);
    if (Math.abs(nextHeight - this.characterHeight) < 0.0001) {
      return;
    }
    this.characterHeight = nextHeight;
    this.characterRoot.scale.setScalar(nextHeight);
    this.controls.target.copy(getDefaultCameraTarget(nextHeight));
    this.camera.position.copy(getDefaultCameraPosition(nextHeight));
    this.controls.update();
  }

  applyCameraPreset(preset: PjskCameraPreset, profile: PjskCameraProfile = "full-body") {
    this.currentCameraPreset = preset;
    if (preset === "capture") {
      this.currentCameraProfile = profile;
      const pose = calculateCostumeShopCameraPose(getCostumeShopCameraState(profile));
      this.controls.target.copy(pose.target);
      this.camera.position.copy(pose.position);
      this.camera.fov = COSTUME_SHOP_CAMERA.fov;
    } else {
      this.currentCameraProfile = null;
      const target = getDefaultCameraTarget(this.characterHeight);
      const offset = DEFAULT_CAMERA_OFFSET_SCALE.clone().multiplyScalar(this.characterHeight);
      this.controls.target.copy(target);
      this.camera.position.copy(target).add(offset);
      this.camera.fov = DEFAULT_CAMERA_FOV;
    }
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.cameraDebugChangeCallback?.();
  }

  shiftCameraRight(amount = 1) {
    if (!Number.isFinite(amount) || amount === 0) {
      return;
    }
    const offset = this.camera.position.clone().sub(this.controls.target);
    const forward = this.controls.target.clone().sub(this.camera.position).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(forward, up).normalize();
    const shift = right.multiplyScalar(CAPTURE_CAMERA_LATERAL_SHIFT_SCALE * amount * this.characterHeight);
    this.controls.target.add(shift);
    this.camera.position.add(shift);
    this.controls.update();
    this.cameraDebugChangeCallback?.();
    void offset;
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
      error: loaded.error,
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
    this.currentVrmSpringBoneManager = null;
    this.currentRuntimeExtension = null;
    this.currentBodyAttachNode = null;
    this.currentHeadAttachOriginNode = null;
    this.currentBodyAnimationRoot = null;
    this.currentPrefabSourceGraph = null;
    this.currentPrefabHeadFollowConstraint = null;
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

  private collectBones(root: THREE.Object3D) {
    const bones = new Map<string, THREE.Bone>();
    root.traverse((node) => {
      const bone = node as THREE.Bone;
      if (bone.isBone) {
        bones.set(bone.name, bone);
      }
    });
    return bones;
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

  private prepareCombinedComposition(
    bodySkeletonRoot: THREE.Object3D | null,
    combinedRoot: THREE.Object3D | null
  ): CompositionStatus {
    this.activeBoneLinks.length = 0;
    const missingBodyBones: string[] = [];
    const missingHeadBones: string[] = [];
    const usingFallbackAttach =
      !this.currentBodyAttachNode;

    if (!this.currentBodyAsset || !this.currentHeadAsset) {
      this.currentCompositionStatus = {
        mode: "combined_glb",
        linkedBoneCount: 0,
        missingBodyBones,
        missingHeadBones,
        usingFallbackAttach,
      };
      return this.currentCompositionStatus;
    }

    if (this.currentPrefabSourceGraph) {
      this.currentCompositionStatus = {
        mode: "unity_prefab",
        linkedBoneCount: 0,
        missingBodyBones: this.currentPrefabSourceGraph.bodyAttach ? [] : ["Unity prefab body attach unresolved"],
        missingHeadBones:
          this.currentPrefabSourceGraph.headRoot && this.currentPrefabSourceGraph.headOrigin
            ? []
            : ["Unity prefab head root/origin unresolved"],
        usingFallbackAttach:
          !this.currentPrefabSourceGraph.bodyAttach || !this.currentPrefabSourceGraph.headOrigin,
      };
      return this.currentCompositionStatus;
    }

    if (!bodySkeletonRoot) {
      missingBodyBones.push(
        this.currentBodyAsset.skeleton.rootNodeName ?? "<body-root>"
      );
    }

    if (
      bodySkeletonRoot &&
      combinedRoot &&
      this.currentBodyAsset.skeleton.skeletonId ===
        this.currentHeadAsset.assembly.expectedSkeletonId
    ) {
      if (!hasSkinnedMeshesUsingSkeleton(combinedRoot, bodySkeletonRoot)) {
        missingBodyBones.push("Combined skin does not use body skeleton root");
      }
    } else if (
      bodySkeletonRoot &&
      this.currentBodyAsset.skeleton.skeletonId !==
        this.currentHeadAsset.assembly.expectedSkeletonId
    ) {
      missingBodyBones.push(
        `Skeleton mismatch: ${this.currentBodyAsset.skeleton.skeletonId} != ${this.currentHeadAsset.assembly.expectedSkeletonId}`
      );
    }

    this.currentCompositionStatus = {
      mode: "combined_glb",
      linkedBoneCount: this.activeBoneLinks.length,
      missingBodyBones,
      missingHeadBones,
      usingFallbackAttach,
    };
    return this.currentCompositionStatus;
  }

  private prepareComposition(): CompositionStatus {
    this.activeBoneLinks.length = 0;
    if (!this.currentBodyAsset || !this.currentHeadAsset) {
      this.currentCompositionStatus = {
        mode: "separate_parts",
        linkedBoneCount: 0,
        missingBodyBones: [],
        missingHeadBones: [],
        usingFallbackAttach: true,
      };
      return this.currentCompositionStatus;
    }

    const usingFallbackAttach =
      !this.currentBodyAttachNode || !this.currentHeadAttachOriginNode;
    const missingBodyBones: string[] = [];
    const missingHeadBones: string[] = [];

    if (
      this.currentBodyAsset.skeleton.skeletonId !==
      this.currentHeadAsset.assembly.expectedSkeletonId
    ) {
      this.currentCompositionStatus = {
        mode: this.currentBodyAttachNode ? "node_attached" : "separate_parts",
        linkedBoneCount: 0,
        missingBodyBones: [
          `Skeleton mismatch: ${this.currentBodyAsset.skeleton.skeletonId} != ${this.currentHeadAsset.assembly.expectedSkeletonId}`,
        ],
        missingHeadBones,
        usingFallbackAttach,
      };
      return this.currentCompositionStatus;
    }

    const bodyBones = this.collectBones(this.bodySlot);
    const headBones = this.collectBones(this.headSlot);
    const remapEntries = Object.entries(
      this.currentHeadAsset.assembly.boneRemap ?? {}
    );

    for (const [headName, bodyName] of remapEntries) {
      const headBone = headBones.get(headName);
      if (!headBone) {
        missingHeadBones.push(headName);
        continue;
      }
      const bodyBone = bodyBones.get(bodyName);
      if (!bodyBone) {
        missingBodyBones.push(bodyName);
        continue;
      }
      this.activeBoneLinks.push({
        bodyBone,
        headBone,
        bodyName,
        headName,
      });
    }

    this.currentCompositionStatus = {
      mode: this.activeBoneLinks.length
        ? "bone_linked"
        : this.currentBodyAttachNode
          ? "node_attached"
          : "separate_parts",
      linkedBoneCount: this.activeBoneLinks.length,
      missingBodyBones,
      missingHeadBones,
      usingFallbackAttach,
    };
    return this.currentCompositionStatus;
  }

  private resolveHeadOriginOffset(headScale: number) {
    if (this.currentHeadAttachOriginNode) {
      const world = new THREE.Vector3();
      this.currentHeadAttachOriginNode.getWorldPosition(world);
      const local = this.headSlot.worldToLocal(world);
      return local.multiplyScalar(headScale);
    }
    if (!this.currentHeadAsset) {
      return new THREE.Vector3();
    }
    return new THREE.Vector3(
      this.currentHeadAsset.assembly.attachOrigin.fallbackPosition.x,
      this.currentHeadAsset.assembly.attachOrigin.fallbackPosition.y,
      this.currentHeadAsset.assembly.attachOrigin.fallbackPosition.z
    ).multiplyScalar(headScale);
  }

  private async loadBodyAsset(
    bodyAsset: BodyAssetManifest
  ): Promise<LoadedPartResult> {
    const message = "Legacy body GLB import is disabled; export a prefab native runtime package with container.unityRuntimeJson.";
    this.runtimeDebug.body = [
      {
        meshName: "<body-load-failed>",
        sourceMaterialName: bodyAsset.displayName,
        resolvedKey: "glb_disabled",
        resolvedKind: "body",
        usedOriginalMap: false,
        boundMainTex: null,
        boundShadowTex: null,
        boundValueTex: null,
        boundFaceShadowTex: null,
        finalMaterialType: message,
      },
    ];
    return {
      root: null,
      sourceMode: "proxy",
      requestedUrl: bodyAsset.source.meshUrl,
      meshCount: 0,
      boneCount: 0,
      skinnedMeshCount: 0,
      error: message,
    };
  }

  private async loadHeadAsset(
    headAsset: HeadAssetManifest
  ): Promise<LoadedPartResult> {
    const message = "Legacy head GLB import is disabled; export a prefab native runtime package with container.unityRuntimeJson.";
    this.runtimeDebug.head = [
      {
        meshName: "<head-load-failed>",
        sourceMaterialName: headAsset.displayName,
        resolvedKey: "glb_disabled",
        resolvedKind: "head",
        usedOriginalMap: false,
        boundMainTex: null,
        boundShadowTex: null,
        boundValueTex: null,
        boundFaceShadowTex: null,
        finalMaterialType: message,
      },
    ];
    return {
      root: null,
      sourceMode: "proxy",
      requestedUrl: headAsset.source.meshUrl,
      meshCount: 0,
      boneCount: 0,
      skinnedMeshCount: 0,
      error: message,
    };
  }

  private async loadCombinedCharacterAsset(
    characterAsset: RuntimeCombinedCharacterAsset
  ): Promise<LoadedPartResult> {
    if (characterAsset.unityRuntimeJsonUrl) {
      const prefabSourceGraph = buildUnityPrefabSourceGraph(
        characterAsset.runtimeExtension,
        characterAsset.bodyAsset,
        characterAsset.headAsset,
        null
      );
      if (!prefabSourceGraph) {
        const message = "Unity Prefab runtime requires runtimeUnitySetup version 0414 in unity-runtime.json.";
        this.runtimeDebug.body = [
          {
            meshName: "<unity-runtime-load-failed>",
            sourceMaterialName: characterAsset.displayName,
            resolvedKey: "missing_runtime_unity_setup",
            resolvedKind: "body",
            usedOriginalMap: false,
            boundMainTex: null,
            boundShadowTex: null,
            boundValueTex: null,
            boundFaceShadowTex: null,
            finalMaterialType: message,
          },
        ];
        this.runtimeDebug.head = [
          {
            meshName: "<unity-runtime-load-failed>",
            sourceMaterialName: characterAsset.displayName,
            resolvedKey: "missing_runtime_unity_setup",
            resolvedKind: "head",
            usedOriginalMap: false,
            boundMainTex: null,
            boundShadowTex: null,
            boundValueTex: null,
            boundFaceShadowTex: null,
            finalMaterialType: message,
          },
        ];
        return {
          root: null,
          sourceMode: "proxy",
          requestedUrl: characterAsset.unityRuntimeJsonUrl ?? "",
          meshCount: 0,
          boneCount: 0,
          skinnedMeshCount: 0,
          error: message,
        };
      }

      this.currentPrefabSourceGraph = prefabSourceGraph;
      this.syncUnityPrefabSourceGraph();
      const nativeResult = installUnityRuntimeNativeMeshes(
        prefabSourceGraph,
        characterAsset.runtimeExtension
      );
      this.lastNativeMeshInstallDiagnostics = nativeResult;
      if (nativeResult.error) {
        const message = nativeResult.error;
        this.runtimeDebug.body = [
          {
            meshName: "<unity-runtime-load-failed>",
            sourceMaterialName: characterAsset.displayName,
            resolvedKey: "missing_native_meshes",
            resolvedKind: "body",
            usedOriginalMap: false,
            boundMainTex: null,
            boundShadowTex: null,
            boundValueTex: null,
            boundFaceShadowTex: null,
            finalMaterialType: message,
          },
        ];
        this.runtimeDebug.head = [
          {
            meshName: "<unity-runtime-load-failed>",
            sourceMaterialName: characterAsset.displayName,
            resolvedKey: "missing_native_meshes",
            resolvedKind: "head",
            usedOriginalMap: false,
            boundMainTex: null,
            boundShadowTex: null,
            boundValueTex: null,
            boundFaceShadowTex: null,
            finalMaterialType: message,
          },
        ];
        return {
          root: null,
          sourceMode: "proxy",
          requestedUrl: characterAsset.unityRuntimeJsonUrl ?? "",
          meshCount: 0,
          boneCount: nativeResult.boneCount,
          skinnedMeshCount: 0,
          error: `${message}${nativeResult.warnings.length ? ` ${nativeResult.warnings.slice(0, 3).join(" ")}` : ""}`,
        };
      }

      this.syncUnityPrefabSourceGraph();
      if (this.materialBindingMode === "manifest") {
        await this.overrideBodyMaterials(prefabSourceGraph.root, characterAsset.bodyAsset);
        await this.overrideHeadMaterials(prefabSourceGraph.root, characterAsset.headAsset, {
          eyeController: readCharacterEyeMaterialController(characterAsset.runtimeExtension),
          hairController: readCharacterHairMaterialController(characterAsset.runtimeExtension),
        });
      } else {
        this.runtimeDebug.body = [];
        this.runtimeDebug.head = [];
      }
      this.installSekaiOutlineShells(prefabSourceGraph.root);
      return {
        root: prefabSourceGraph.root,
        sourceMode: "unity-runtime",
        requestedUrl: characterAsset.unityRuntimeJsonUrl ?? "",
        meshCount: nativeResult.meshCount,
        boneCount: nativeResult.boneCount,
        skinnedMeshCount: nativeResult.skinnedMeshCount,
        userData: { pjskUnityRuntimeNativeMeshWarnings: nativeResult.warnings },
        vrm: null,
        springBoneManager: null,
        prefabSourceGraph,
      };
    }

    const message = "Pure Unity runtime requires container.unityRuntimeJson; combined GLB fallback is disabled.";
    this.runtimeDebug.body = [
      {
        meshName: "<combined-load-failed>",
        sourceMaterialName: characterAsset.displayName,
        resolvedKey: "missing_unity_runtime_json",
        resolvedKind: "body",
        usedOriginalMap: false,
        boundMainTex: null,
        boundShadowTex: null,
        boundValueTex: null,
        boundFaceShadowTex: null,
        finalMaterialType: message,
      },
    ];
    this.runtimeDebug.head = [
      {
        meshName: "<combined-load-failed>",
        sourceMaterialName: characterAsset.displayName,
        resolvedKey: "missing_unity_runtime_json",
        resolvedKind: "head",
        usedOriginalMap: false,
        boundMainTex: null,
        boundShadowTex: null,
        boundValueTex: null,
        boundFaceShadowTex: null,
        finalMaterialType: message,
      },
    ];
    return {
      root: null,
      sourceMode: "proxy",
      requestedUrl: characterAsset.meshUrl ?? "",
      meshCount: 0,
      boneCount: 0,
      skinnedMeshCount: 0,
      error: message,
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

  private async loadTexture(
    url: string | undefined,
    colorSpace: THREE.ColorSpace = THREE.SRGBColorSpace
  ) {
    if (!url) {
      return null;
    }
    try {
      const texture = await this.textureLoader.loadAsync(url);
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.flipY = false;
      texture.colorSpace = colorSpace;
      texture.needsUpdate = true;
      return texture;
    } catch {
      return null;
    }
  }

  private extractColorMap(material: THREE.Material) {
    const candidate = material as THREE.Material & { map?: THREE.Texture | null };
    return candidate.map ?? null;
  }

  private syncReplacementTextureFromOriginal(
    material: THREE.Material,
    originalMap: THREE.Texture | null
  ) {
    if (!originalMap) {
      return;
    }

    const sync = (texture: THREE.Texture | null | undefined) => {
      if (!texture) {
        return;
      }
      texture.wrapS = originalMap.wrapS;
      texture.wrapT = originalMap.wrapT;
      texture.offset.copy(originalMap.offset);
      texture.repeat.copy(originalMap.repeat);
      texture.center.copy(originalMap.center);
      texture.rotation = originalMap.rotation;
      texture.magFilter = originalMap.magFilter;
      texture.minFilter = originalMap.minFilter;
      texture.anisotropy = originalMap.anisotropy;
      texture.flipY = originalMap.flipY;
      texture.colorSpace = originalMap.colorSpace;
      texture.needsUpdate = true;
    };

    if (material instanceof THREE.MeshBasicMaterial) {
      sync(material.map);
      return;
    }

    if (material instanceof THREE.ShaderMaterial) {
      const mainTex = material.uniforms.uMainTex?.value as
        | THREE.Texture
        | null
        | undefined;
      sync(mainTex);
    }
  }

  private async overrideBodyMaterials(
    root: THREE.Object3D,
    bodyAsset: BodyAssetManifest,
    options: { exactMaterialNameOnly?: boolean } = {}
  ) {
    this.runtimeDebug.body = [];
    const slotEntries: Array<{
      key: string;
      meshKey: string;
      materialKey: string;
      materialName: string | null;
      materialKind: string;
      mainTex: string | null;
      shadowTex: string | null;
      valueTex: string | null;
      faceShadowTex: string | null;
      material: THREE.Material;
    }> = [];
    for (const slot of bodyAsset.bodyMaterials) {
      const mainTex = await this.loadTexture(slot.mainTex);
      const shadowTex = await this.loadTexture(slot.shadowTex);
      const valueTex = await this.loadTexture(slot.valueTex, THREE.NoColorSpace);
      const materialKind = slot.materialKind ?? "body";
      const lighting = tuneLightingForPreview(slot.materialKind, slot.lighting);
      const material = cloneBodyShaderMaterial(this.bodyMaterial, {
        mainTex,
        shadowTex,
        valueTex,
        baseColor: bodyAsset.proxy.bodyColor,
        shadowColor: bodyAsset.proxy.shadowColor,
        skinColorDefault:
          this.currentHeadAsset?.proxy.skinColorDefault ??
          this.currentHeadAsset?.proxy.faceColor ??
          bodyAsset.proxy.bodyColor,
        skinColor1:
          this.currentHeadAsset?.proxy.skinColor1 ??
          this.currentHeadAsset?.proxy.faceShadeColor ??
          bodyAsset.proxy.shadowColor,
        skinColor2:
          this.currentHeadAsset?.proxy.skinColor2 ??
          this.currentHeadAsset?.proxy.faceShadeColor ??
          bodyAsset.proxy.shadowColor,
        lighting,
        skinTintEnabled: usesSekaiSkinTint(materialKind),
        bodyDebugMode: bodyDebugModeToUniform(this.bodyDebugMode),
      });
      material.userData.pjskLighting = lighting;
      material.userData.pjskMaterialKind = materialKind;
      material.userData.pjskMaterialKey = slot.materialKey;
      material.userData.pjskMaterialSlotIndex = slot.slotIndex;
      const meshKey = normalizeMeshSlotName(slot.meshName);
      slotEntries.push({
        key: slot.materialKey,
        meshKey,
        materialKey: slot.materialKey,
        materialName: slot.materialName?.toLowerCase() ?? null,
        materialKind,
        mainTex: slot.mainTex ?? null,
        shadowTex: slot.shadowTex ?? null,
        valueTex: slot.valueTex ?? null,
        faceShadowTex: null,
        material,
      });
    }

    root.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) {
        return;
      }
      const originalMaterials = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      const meshKey = normalizeMeshSlotName(mesh.name);
      const meshSlots = slotEntries.filter((entry) => entry.meshKey === meshKey);
      if (meshSlots.length === 0) {
        return;
      }
      const resolvedEntriesByIndex: Array<typeof slotEntries[number] | null> = [];
      const rebound = originalMaterials.map((original, index) => {
        const originalMaterialKey = typeof original.userData.pjskMaterialKey === "string"
          ? original.userData.pjskMaterialKey
          : "";
        const resolvedByMaterialKey = meshSlots.find(
          (entry) => entry.materialKey === originalMaterialKey
        );
        const resolvedEntry = resolvedByMaterialKey ?? null;
        if (!originalMaterialKey) {
          throw new Error(
            `Body mesh '${mesh.name}' material '${original.name}' is missing pjskMaterialKey; regenerate it with Haruki-3D-Exporter materialKey runtime support.`
          );
        }
        if (!resolvedEntry) {
          throw new Error(
            `Body mesh '${mesh.name}' material key '${originalMaterialKey}' was not found in body material slots.`
          );
        }
        if (resolvedEntry) {
          const mainMap = this.extractColorMap(original);
          this.syncReplacementTextureFromOriginal(resolvedEntry.material, mainMap);
          mesh.userData.pjskMaterialKind = resolvedEntry.materialKind;
          let usedOriginalMap = false;
          if (
            resolvedEntry.material instanceof THREE.ShaderMaterial &&
            !resolvedEntry.material.uniforms.uMainTex.value &&
            mainMap
          ) {
            resolvedEntry.material.uniforms.uMainTex.value = mainMap;
            resolvedEntry.material.uniforms.uUseMainTex.value = 1.0;
            resolvedEntry.material.uniforms.uBaseColor.value.set("#ffffff");
            usedOriginalMap = true;
          }
          const shaderUniforms =
            resolvedEntry.material instanceof THREE.ShaderMaterial
              ? resolvedEntry.material.uniforms
              : null;
          this.runtimeDebug.body.push({
            meshName: mesh.name,
            sourceMaterialName: original.name,
            resolvedKey: resolvedEntry?.key ?? null,
            resolvedKind: resolvedEntry?.materialKind ?? null,
            usedOriginalMap,
            boundMainTex: resolvedEntry?.mainTex ?? null,
            boundShadowTex: resolvedEntry?.shadowTex ?? null,
            boundValueTex: resolvedEntry?.valueTex ?? null,
            boundFaceShadowTex: null,
            finalMaterialType: resolvedEntry.material.type,
            shaderHasMainTex: shaderUniforms?.uUseMainTex?.value ?? null,
            shaderHasShadowTex: shaderUniforms?.uUseShadowTex?.value ?? null,
            shaderHasValueTex: shaderUniforms?.uUseValueTex?.value ?? null,
            shaderLightDirectionX: shaderUniforms?.uLightDirection?.value?.x ?? null,
            shaderLightDirectionY: shaderUniforms?.uLightDirection?.value?.y ?? null,
            shaderLightDirectionZ: shaderUniforms?.uLightDirection?.value?.z ?? null,
            shaderShadowThreshold: shaderUniforms?.uShadowThreshold?.value ?? null,
            shaderShadowWeight: shaderUniforms?.uShadowWeight?.value ?? null,
            shaderShadowWidthOverride:
              shaderUniforms?.uShadowWidthOverride?.value ?? null,
            shaderValueShadowInfluence:
              shaderUniforms?.uValueShadowInfluence?.value ?? null,
            shaderLambertEnabled: shaderUniforms?.uLambertEnabled?.value ?? null,
            shaderSpecularPower: shaderUniforms?.uSpecularPower?.value ?? null,
            shaderRimThreshold: shaderUniforms?.uRimThreshold?.value ?? null,
            shaderControllerRimThreshold:
              shaderUniforms?.uControllerRimThreshold?.value ?? null,
            shaderRimIntensity: shaderUniforms?.uRimIntensity?.value ?? null,
            shaderRimDirectionality:
              shaderUniforms?.uRimDirectionality?.value ?? null,
            shaderCharacterAmbient:
              shaderUniforms?.uCharacterAmbientIntensity?.value ?? null,
            shaderShadowTexWeight: shaderUniforms?.uShadowTexWeight?.value ?? null,
            shaderSaturation: shaderUniforms?.uSaturation?.value ?? null,
            shaderSkinTintEnabled: shaderUniforms?.uSkinTintEnabled?.value ?? null,
            shaderSkinColorDefault: shaderUniforms?.uSkinColorDefault?.value
              ? `#${shaderUniforms.uSkinColorDefault.value.getHexString()}`
              : null,
            shaderSkinColor1: shaderUniforms?.uSkinColor1?.value
              ? `#${shaderUniforms.uSkinColor1.value.getHexString()}`
              : null,
            shaderSkinColor2: shaderUniforms?.uSkinColor2?.value
              ? `#${shaderUniforms.uSkinColor2.value.getHexString()}`
              : null,
            shaderBodyDebugMode:
              shaderUniforms?.uBodyDebugMode?.value ?? null,
          });
          return resolvedEntry.material;
        }
        throw new Error("Unreachable body material identity resolution state.");
      });
      disposeReplacedMaterials(originalMaterials, rebound);
      mesh.material = Array.isArray(mesh.material) ? rebound : rebound[0];
      mesh.castShadow = false;
      mesh.receiveShadow = false;
    });
  }

  private async overrideHeadMaterials(
    root: THREE.Object3D,
    headAsset: HeadAssetManifest,
    options: {
      exactMaterialNameOnly?: boolean;
      eyeController?: CharacterEyeMaterialController | null;
      hairController?: CharacterHairMaterialController | null;
    } = {}
  ) {
    this.runtimeDebug.head = [];
    this.currentHairOffset.copy(options.hairController?.offset ?? new THREE.Vector3());
    const slotEntries: Array<{
      key: string;
      meshKey: string;
      materialKey: string;
      materialName: string | null;
      materialKind: string;
      isAccessory: boolean;
      mainTex: string | null;
      shadowTex: string | null;
      valueTex: string | null;
      faceShadowTex: string | null;
      material: THREE.Material;
      overlayMaterial: THREE.Material | null;
      stencilPrepassMaterial: THREE.Material | null;
      topLayerMaterial: THREE.Material | null;
    }> = [];
    const overlayMeshesToAttach: Array<{
      parent: THREE.Object3D;
      mesh: THREE.Mesh;
    }> = [];
    const stencilPrepassMeshesToAttach: Array<{
      parent: THREE.Object3D;
      mesh: THREE.Mesh;
    }> = [];
    const topLayerMeshesToAttach: Array<{
      parent: THREE.Object3D;
      mesh: THREE.Mesh;
    }> = [];
    for (const slot of headAsset.faceMaterials) {
      const mainTex = await this.loadTexture(slot.mainTex);
      const shadowTex = await this.loadTexture(slot.shadowTex);
      const valueTex = await this.loadTexture(slot.valueTex, THREE.NoColorSpace);
      const faceShadowTex = await this.loadTexture(slot.faceShadowTex);
      const kind = normalizeHeadRuntimeMaterialKind(slot.materialKind ?? "face", slot.meshName, slot.materialName);
      const isAccessory = Boolean(slot.isAccessory) || kind === "accessory";
      const lighting = tuneLightingForPreview(kind, slot.lighting);
      let material: THREE.Material;
      let topLayerMaterial: THREE.Material | null = null;
      if (kind === "eye") {
        material = createSekaiLayerMaterial(
          mainTex,
          "eye",
          options.eyeController?.baseTiling,
          {
            tintColor: options.eyeController?.tintColor,
            emissionColor: options.eyeController?.emissionColor,
            lightInfluence: options.eyeController?.lightInfluence ?? lighting?.lightInfluence,
            distortionFps: lighting?.distortionFps,
            distortionIntensity: lighting?.distortionIntensity,
            distortionIntensityX: lighting?.distortionIntensityX,
            distortionIntensityY: lighting?.distortionIntensityY,
            distortionOffsetX: lighting?.distortionOffsetX,
            distortionOffsetY: lighting?.distortionOffsetY,
            distortionScrollSpeed: lighting?.distortionScrollSpeed,
            distortionScrollX: lighting?.distortionScrollX,
            distortionScrollY: lighting?.distortionScrollY,
            distortionTexTilingX: lighting?.distortionTexTilingX,
            distortionTexTilingY: lighting?.distortionTexTilingY,
            threshold: lighting?.threshold,
            strictAlpha: true,
          }
        );
        material.side = THREE.FrontSide;
        const stencilPrepassMaterial = createSekaiLayerMaterial(
          mainTex,
          "eye",
          options.eyeController?.baseTiling,
          {
            tintColor: options.eyeController?.tintColor,
            emissionColor: options.eyeController?.emissionColor,
            lightInfluence: options.eyeController?.lightInfluence ?? lighting?.lightInfluence,
            distortionFps: lighting?.distortionFps,
            distortionIntensity: lighting?.distortionIntensity,
            distortionIntensityX: lighting?.distortionIntensityX,
            distortionIntensityY: lighting?.distortionIntensityY,
            distortionOffsetX: lighting?.distortionOffsetX,
            distortionOffsetY: lighting?.distortionOffsetY,
            distortionScrollSpeed: lighting?.distortionScrollSpeed,
            distortionScrollX: lighting?.distortionScrollX,
            distortionScrollY: lighting?.distortionScrollY,
            distortionTexTilingX: lighting?.distortionTexTilingX,
            distortionTexTilingY: lighting?.distortionTexTilingY,
            threshold: lighting?.threshold,
          }
        );
        stencilPrepassMaterial.side = THREE.FrontSide;
        configureEyeStencilPrepass(stencilPrepassMaterial);
        stencilPrepassMaterial.userData.pjskMaterialKind = "eye_stencil_prepass";
        const overlayMaterial = createSekaiLayerMaterial(
          mainTex,
          "eye",
          options.eyeController?.baseTiling,
          {
            tintColor: options.eyeController?.tintColor,
            emissionColor: options.eyeController?.emissionColor,
            lightInfluence: options.eyeController?.lightInfluence ?? lighting?.lightInfluence,
            distortionFps: lighting?.distortionFps,
            distortionIntensity: lighting?.distortionIntensity,
            distortionIntensityX: lighting?.distortionIntensityX,
            distortionIntensityY: lighting?.distortionIntensityY,
            distortionOffsetX: lighting?.distortionOffsetX,
            distortionOffsetY: lighting?.distortionOffsetY,
            distortionScrollSpeed: lighting?.distortionScrollSpeed,
            distortionScrollX: lighting?.distortionScrollX,
            distortionScrollY: lighting?.distortionScrollY,
            distortionTexTilingX: lighting?.distortionTexTilingX,
            distortionTexTilingY: lighting?.distortionTexTilingY,
            threshold: lighting?.threshold,
            alphaScale: EYE_THROUGH_HAIR_ALPHA,
            strictAlpha: true,
          }
        );
        overlayMaterial.side = THREE.FrontSide;
        configureEyeOverlayStencil(overlayMaterial, THREE.KeepStencilOp);
        overlayMaterial.userData.pjskMaterialKind = "eye_through_hair";
        material.userData.pjskOverlayMaterial = overlayMaterial;
        material.userData.pjskStencilPrepassMaterial = stencilPrepassMaterial;
      } else if (kind === "eyelight") {
        topLayerMaterial = createSekaiLayerMaterial(
          mainTex,
          "eyelight",
          options.eyeController?.highlightTiling,
          {
            tintColor: options.eyeController?.tintColor,
            emissionColor: options.eyeController?.emissionColor,
            lightInfluence: options.eyeController?.lightInfluence ?? lighting?.lightInfluence,
            highlightInfluence: options.eyeController?.lightInfluenceForEyeHighlight ?? lighting?.lightInfluenceForEyeHighlight,
            distortionFps: lighting?.distortionFps,
            distortionIntensity: lighting?.distortionIntensity,
            distortionIntensityX: lighting?.distortionIntensityX,
            distortionIntensityY: lighting?.distortionIntensityY,
            distortionOffsetX: lighting?.distortionOffsetX,
            distortionOffsetY: lighting?.distortionOffsetY,
            distortionScrollSpeed: lighting?.distortionScrollSpeed,
            distortionScrollX: lighting?.distortionScrollX,
            distortionScrollY: lighting?.distortionScrollY,
            distortionTexTilingX: lighting?.distortionTexTilingX,
            distortionTexTilingY: lighting?.distortionTexTilingY,
            threshold: lighting?.threshold,
          }
        );
        topLayerMaterial.side = THREE.FrontSide;
        material = topLayerMaterial.clone();
        material.visible = false;
        material.colorWrite = false;
        material.depthWrite = false;
        const overlayMaterial = createSekaiLayerMaterial(
          mainTex,
          "eyelight",
          options.eyeController?.highlightTiling,
          {
            tintColor: options.eyeController?.tintColor,
            emissionColor: options.eyeController?.emissionColor,
            lightInfluence: options.eyeController?.lightInfluence ?? lighting?.lightInfluence,
            highlightInfluence: options.eyeController?.lightInfluenceForEyeHighlight ?? lighting?.lightInfluenceForEyeHighlight,
            distortionFps: lighting?.distortionFps,
            distortionIntensity: lighting?.distortionIntensity,
            distortionIntensityX: lighting?.distortionIntensityX,
            distortionIntensityY: lighting?.distortionIntensityY,
            distortionOffsetX: lighting?.distortionOffsetX,
            distortionOffsetY: lighting?.distortionOffsetY,
            distortionScrollSpeed: lighting?.distortionScrollSpeed,
            distortionScrollX: lighting?.distortionScrollX,
            distortionScrollY: lighting?.distortionScrollY,
            distortionTexTilingX: lighting?.distortionTexTilingX,
            distortionTexTilingY: lighting?.distortionTexTilingY,
            threshold: lighting?.threshold,
            alphaScale: EYE_THROUGH_HAIR_ALPHA,
          }
        );
        overlayMaterial.side = THREE.FrontSide;
        configureEyelightThroughHairOverlay(overlayMaterial);
        overlayMaterial.userData.pjskMaterialKind = "eyelight_through_hair";
        material.userData.pjskOverlayMaterial = overlayMaterial;
      } else if (kind === "eyelash" || kind === "eyebrow") {
        material = createSekaiLayerMaterial(mainTex, "alpha", null, {
          vertexBViewOffset: 0.015,
        });
        material.side = THREE.FrontSide;
        const stencilPrepassMaterial = createSekaiLayerMaterial(mainTex, "alpha", null, {
          alphaCutoff:
            kind === "eyelash" ? EYELASH_THROUGH_HAIR_ALPHA_CUTOFF : undefined,
          strictAlpha: true,
        });
        stencilPrepassMaterial.side = THREE.FrontSide;
        if (kind === "eyelash") {
          configureEyelashStencilPrepass(stencilPrepassMaterial);
        } else {
          configureEyebrowStencilPrepass(stencilPrepassMaterial);
        }
        stencilPrepassMaterial.userData.pjskMaterialKind = kind === "eyelash"
          ? "eyelash_stencil_prepass"
          : "eyebrow_stencil_prepass";
        {
          const overlayMaterial = createSekaiLayerMaterial(mainTex, "alpha", null, {
            alphaScale: kind === "eyelash"
              ? EYELASH_THROUGH_HAIR_ALPHA
              : EYEBROW_THROUGH_HAIR_ALPHA,
            alphaCutoff:
              kind === "eyelash" ? EYELASH_THROUGH_HAIR_ALPHA_CUTOFF : undefined,
            strictAlpha: true,
          });
          overlayMaterial.side = THREE.FrontSide;
          configureFaceLayerOverlayStencil(
            overlayMaterial,
            kind === "eyelash"
              ? CHARACTER_EYELASH_STENCIL_BIT
              : CHARACTER_EYEBROW_STENCIL_BIT
          );
          overlayMaterial.userData.pjskMaterialKind = kind === "eyelash"
            ? "eyelash_through_hair"
            : "eyebrow_through_hair";
          material.userData.pjskOverlayMaterial = overlayMaterial;
        }
        material.userData.pjskStencilPrepassMaterial = stencilPrepassMaterial;
      } else if (kind === "hair") {
        material = cloneBodyShaderMaterial(this.hairMaterial, {
          mainTex,
          shadowTex,
          valueTex,
          baseColor: headAsset.proxy.hairColor,
          shadowColor: headAsset.proxy.hairShadowColor,
          lighting,
          skinTintEnabled: false,
          hairShadowEnabled: this.isHeadProximityHairShadowEnabled(),
          lambertEnabled: false,
          headPosition: this.hairHeadPosition,
          bodyDebugMode: bodyDebugModeToUniform(this.bodyDebugMode),
          alphaCutoff: HAIR_ALPHA_CUTOFF,
        });
        configureHairOccluderStencil(material);
      } else if (kind === "accessory" || kind === "body") {
        material = cloneBodyShaderMaterial(this.bodyMaterial, {
          mainTex,
          shadowTex,
          valueTex,
          baseColor: headAsset.proxy.skinColorDefault ?? headAsset.proxy.faceColor,
          shadowColor: headAsset.proxy.skinColor1 ?? headAsset.proxy.faceShadeColor,
          skinColorDefault: headAsset.proxy.skinColorDefault ?? headAsset.proxy.faceColor,
          skinColor1: headAsset.proxy.skinColor1 ?? headAsset.proxy.faceShadeColor,
          skinColor2: headAsset.proxy.skinColor2 ?? headAsset.proxy.faceShadeColor,
          lighting,
          skinTintEnabled: usesSekaiSkinTint(kind),
          bodyDebugMode: bodyDebugModeToUniform(this.bodyDebugMode),
          alphaCutoff: kind === "accessory" ? ACCESSORY_ALPHA_CUTOFF : 0.0,
        });
        configureBaseStencilClear(material);
      } else {
        material = cloneFaceShaderMaterial(this.faceMaterial, {
          mainTex,
          shadowTex,
          faceShadowTex,
          baseColor: headAsset.proxy.faceColor,
          warmColor: headAsset.proxy.faceShadeColor,
          skinColorDefault: headAsset.proxy.skinColorDefault ?? headAsset.proxy.faceColor,
          skinColor1: headAsset.proxy.skinColor1 ?? headAsset.proxy.faceShadeColor,
          skinColor2: headAsset.proxy.skinColor2 ?? headAsset.proxy.faceShadeColor,
          faceSdfEnabled: false,
        });
        if (material instanceof THREE.ShaderMaterial && material.uniforms.uFaceDebugMode) {
          material.uniforms.uFaceDebugMode.value = faceSdfDebugModeToUniform(this.faceSdfDebugMode);
          material.uniforms.uFaceDebugLightMode.value = faceSdfDebugLightModeToUniform(this.faceSdfDebugLightMode);
        }
        material.side = THREE.FrontSide;
        configureBaseStencilClear(material);
      }
      material.userData.pjskLighting = lighting;
      material.userData.pjskMaterialKind = kind;
      material.userData.pjskIsAccessory = isAccessory;
      material.userData.pjskMaterialKey = slot.materialKey;
      material.userData.pjskMaterialSlotIndex = slot.slotIndex;
      if (topLayerMaterial) {
        topLayerMaterial.userData.pjskLighting = lighting;
        topLayerMaterial.userData.pjskMaterialKind = kind;
        topLayerMaterial.userData.pjskIsAccessory = isAccessory;
        topLayerMaterial.userData.pjskMaterialKey = slot.materialKey;
        topLayerMaterial.userData.pjskMaterialSlotIndex = slot.slotIndex;
      }
      slotEntries.push({
        key: slot.materialKey,
        meshKey: normalizeMeshSlotName(slot.meshName),
        materialKey: slot.materialKey,
        materialName: slot.materialName?.toLowerCase() ?? null,
        materialKind: kind,
        isAccessory,
        mainTex: slot.mainTex ?? null,
        shadowTex: slot.shadowTex ?? null,
        valueTex: slot.valueTex ?? null,
        faceShadowTex: slot.faceShadowTex ?? null,
        material,
        overlayMaterial: material.userData.pjskOverlayMaterial instanceof THREE.Material
          ? material.userData.pjskOverlayMaterial
          : null,
        stencilPrepassMaterial: material.userData.pjskStencilPrepassMaterial instanceof THREE.Material
          ? material.userData.pjskStencilPrepassMaterial
          : null,
        topLayerMaterial,
      });
    }

    root.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (
        !mesh.isMesh ||
        mesh.userData.pjskEyeThroughHairOverlay ||
        mesh.userData.pjskEyeThroughHairStencilPrepass
      ) {
        return;
      }
      const originalMaterials = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      const meshKey = normalizeMeshSlotName(mesh.name);
      const meshSlots = slotEntries.filter((entry) => entry.meshKey === meshKey);
      if (meshSlots.length === 0) {
        return;
      }
      const resolvedEntriesByIndex: Array<typeof slotEntries[number] | null> = [];
      const rebound = originalMaterials.map((original, index) => {
        const originalMaterialKey = typeof original.userData.pjskMaterialKey === "string"
          ? original.userData.pjskMaterialKey
          : "";
        const resolvedByMaterialKey = meshSlots.find(
          (entry) => entry.materialKey === originalMaterialKey
        );
        const resolvedEntry = resolvedByMaterialKey ?? null;
        if (!originalMaterialKey) {
          throw new Error(
            `Head mesh '${mesh.name}' material '${original.name}' is missing pjskMaterialKey; regenerate it with Haruki-3D-Exporter materialKey runtime support.`
          );
        }
        if (!resolvedEntry) {
          throw new Error(
            `Head mesh '${mesh.name}' material key '${originalMaterialKey}' was not found in head material slots.`
          );
        }
        if (resolvedEntry) {
          const mainMap = this.extractColorMap(original);
          this.syncReplacementTextureFromOriginal(resolvedEntry.material, mainMap);
          if (resolvedEntry.overlayMaterial) {
            this.syncReplacementTextureFromOriginal(resolvedEntry.overlayMaterial, mainMap);
          }
          if (resolvedEntry.stencilPrepassMaterial) {
            this.syncReplacementTextureFromOriginal(resolvedEntry.stencilPrepassMaterial, mainMap);
          }
          if (resolvedEntry.topLayerMaterial) {
            this.syncReplacementTextureFromOriginal(resolvedEntry.topLayerMaterial, mainMap);
          }
          let usedOriginalMap = false;
          if (resolvedEntry.material instanceof THREE.ShaderMaterial && !resolvedEntry.material.uniforms.uMainTex.value && mainMap) {
            resolvedEntry.material.uniforms.uMainTex.value = mainMap;
            resolvedEntry.material.uniforms.uUseMainTex.value = 1.0;
            if (resolvedEntry.overlayMaterial instanceof THREE.ShaderMaterial) {
              resolvedEntry.overlayMaterial.uniforms.uMainTex.value = mainMap;
              resolvedEntry.overlayMaterial.uniforms.uUseMainTex.value = 1.0;
            }
            if (resolvedEntry.stencilPrepassMaterial instanceof THREE.ShaderMaterial) {
              resolvedEntry.stencilPrepassMaterial.uniforms.uMainTex.value = mainMap;
              resolvedEntry.stencilPrepassMaterial.uniforms.uUseMainTex.value = 1.0;
            }
            if (resolvedEntry.topLayerMaterial instanceof THREE.ShaderMaterial) {
              resolvedEntry.topLayerMaterial.uniforms.uMainTex.value = mainMap;
              resolvedEntry.topLayerMaterial.uniforms.uUseMainTex.value = 1.0;
            }
            if ("uBaseColor" in resolvedEntry.material.uniforms) {
              resolvedEntry.material.uniforms.uBaseColor.value.set("#ffffff");
            }
            usedOriginalMap = true;
          }
          if (resolvedEntry.material instanceof THREE.MeshBasicMaterial && !resolvedEntry.material.map && mainMap) {
            resolvedEntry.material.map = mainMap;
            resolvedEntry.material.needsUpdate = true;
            usedOriginalMap = true;
          }
          mesh.renderOrder = getHeadLayerRenderOrder(resolvedEntry.materialKind);
          mesh.userData.pjskMaterialKind = resolvedEntry.materialKind;
          const shaderUniforms =
            resolvedEntry.material instanceof THREE.ShaderMaterial
              ? resolvedEntry.material.uniforms
              : null;
          const faceSdfUv1Available = hasFaceSdfUv1Attribute(mesh);
          const faceSdfCapable =
            resolvedEntry.materialKind === "face_sdf" &&
            Boolean(resolvedEntry.faceShadowTex) &&
            faceSdfUv1Available;
          if (resolvedEntry.material instanceof THREE.ShaderMaterial && shaderUniforms?.uFaceShadowTex) {
            resolvedEntry.material.userData.pjskFaceSdfCapable = faceSdfCapable;
            resolvedEntry.material.userData.pjskFaceSdfUv1Available = faceSdfUv1Available;
            shaderUniforms.uFaceSdfEnabled.value =
              this.shouldEnableFaceSdfForCurrentView() && faceSdfCapable ? 1.0 : 0.0;
          }
          resolvedEntriesByIndex[index] = resolvedEntry;
          this.runtimeDebug.head.push({
            meshName: mesh.name,
            sourceMaterialName: original.name,
            resolvedKey: resolvedEntry.key,
            resolvedKind: resolvedEntry.materialKind,
            usedOriginalMap,
            boundMainTex: resolvedEntry.mainTex,
            boundShadowTex: resolvedEntry.shadowTex,
            boundValueTex: resolvedEntry.valueTex,
            boundFaceShadowTex: resolvedEntry.faceShadowTex,
            finalMaterialType: resolvedEntry.material.type,
            shaderHasMainTex: shaderUniforms?.uUseMainTex?.value ?? null,
            shaderHasShadowTex: shaderUniforms?.uUseShadowTex?.value ?? null,
            shaderHasFaceShadowTex: shaderUniforms?.uUseFaceShadowTex?.value ?? null,
            shaderHasValueTex: shaderUniforms?.uUseValueTex?.value ?? null,
            shaderLightDirectionX: shaderUniforms?.uLightDirection?.value?.x ?? null,
            shaderLightDirectionY: shaderUniforms?.uLightDirection?.value?.y ?? null,
            shaderLightDirectionZ: shaderUniforms?.uLightDirection?.value?.z ?? null,
            shaderShadowThreshold: shaderUniforms?.uShadowThreshold?.value ?? null,
            shaderShadowWeight: shaderUniforms?.uShadowWeight?.value ?? null,
            shaderShadowWidthOverride:
              shaderUniforms?.uShadowWidthOverride?.value ?? null,
            shaderValueShadowInfluence:
              shaderUniforms?.uValueShadowInfluence?.value ?? null,
            shaderHairShadowEnabled:
              resolvedEntry.materialKind === "hair"
                ? shaderUniforms?.uHairShadowEnabled?.value ?? null
                : null,
            shaderLambertEnabled: shaderUniforms?.uLambertEnabled?.value ?? null,
            shaderBodyDebugMode:
              shaderUniforms?.uBodyDebugMode?.value ?? null,
            shaderSpecularPower: shaderUniforms?.uSpecularPower?.value ?? null,
            shaderRimThreshold: shaderUniforms?.uRimThreshold?.value ?? null,
            shaderControllerRimThreshold:
              shaderUniforms?.uControllerRimThreshold?.value ?? null,
            shaderRimIntensity: shaderUniforms?.uRimIntensity?.value ?? null,
            shaderRimDirectionality:
              shaderUniforms?.uRimDirectionality?.value ?? null,
            shaderCharacterAmbient:
              shaderUniforms?.uCharacterAmbientIntensity?.value ?? null,
            shaderShadowTexWeight: shaderUniforms?.uShadowTexWeight?.value ?? null,
            shaderSaturation: shaderUniforms?.uSaturation?.value ?? null,
            shaderSkinTintEnabled: shaderUniforms?.uSkinTintEnabled?.value ?? null,
            shaderSkinColorDefault: shaderUniforms?.uSkinColorDefault?.value
              ? `#${shaderUniforms.uSkinColorDefault.value.getHexString()}`
              : null,
            shaderSkinColor1: shaderUniforms?.uSkinColor1?.value
              ? `#${shaderUniforms.uSkinColor1.value.getHexString()}`
              : null,
            shaderSkinColor2: shaderUniforms?.uSkinColor2?.value
              ? `#${shaderUniforms.uSkinColor2.value.getHexString()}`
              : null,
            shaderFaceSoftness: shaderUniforms?.uFaceSoftness?.value ?? null,
            shaderFaceSdfUseLightDirection:
              shaderUniforms?.uFaceSdfUseLightDirection?.value ?? null,
            shaderFaceDebugMode: shaderUniforms?.uFaceDebugMode?.value ?? null,
            shaderFaceDebugLightMode: shaderUniforms?.uFaceDebugLightMode?.value ?? null,
            shaderFaceSdfEnabled: shaderUniforms?.uFaceSdfEnabled?.value ?? null,
            faceSdfCapable,
            faceSdfUv1Available,
            shaderAtlasTileX: shaderUniforms?.uAtlasTile?.value?.x ?? null,
            shaderAtlasTileY: shaderUniforms?.uAtlasTile?.value?.y ?? null,
            shaderAtlasSample: shaderUniforms?.uAtlasSample?.value ?? null,
            shaderUseAtlas: shaderUniforms?.uUseAtlas?.value ?? null,
            shaderAlphaScale: shaderUniforms?.uAlphaScale?.value ?? null,
            shaderAlphaCutoff: shaderUniforms?.uAlphaCutoff?.value ?? null,
            shaderStrictAlpha: shaderUniforms?.uStrictAlpha?.value ?? null,
            shaderStencilWrite: resolvedEntry.material.stencilWrite ?? null,
            shaderStencilRef: resolvedEntry.material.stencilRef ?? null,
            shaderStencilFunc: resolvedEntry.material.stencilFunc ?? null,
            shaderStencilFuncMask: resolvedEntry.material.stencilFuncMask ?? null,
            shaderStencilWriteMask: resolvedEntry.material.stencilWriteMask ?? null,
            shaderStencilZPass: resolvedEntry.material.stencilZPass ?? null,
            shaderDepthFunc: resolvedEntry.material.depthFunc ?? null,
            shaderDepthWrite: resolvedEntry.material.depthWrite ?? null,
            shaderTransparent: resolvedEntry.material.transparent ?? null,
            renderOrder: mesh.renderOrder,
          });
          return resolvedEntry.material;
        }
        throw new Error("Unreachable head material identity resolution state.");
      });
      const meshRenderOrder = resolvedEntriesByIndex.reduce((minimum, entry) => {
        if (!entry) {
          return minimum;
        }
        return Math.min(minimum, getHeadLayerRenderOrder(entry.materialKind));
      }, Number.POSITIVE_INFINITY);
      if (Number.isFinite(meshRenderOrder)) {
        mesh.renderOrder = meshRenderOrder;
      }
      const originalGroups = mesh.geometry.groups.length > 0
        ? mesh.geometry.groups.map((group) => ({
          start: group.start,
          count: group.count,
          materialIndex: group.materialIndex ?? 0,
        }))
        : [{
          start: 0,
          count: mesh.geometry.index?.count ?? mesh.geometry.getAttribute("position")?.count ?? 0,
          materialIndex: 0,
        }];
      const overlayMaterials: THREE.Material[] = [];
      const overlayGroups: Array<{ start: number; count: number; materialIndex: number }> = [];
      const stencilPrepassMaterials: THREE.Material[] = [];
      const stencilPrepassGroups: Array<{ start: number; count: number; materialIndex: number }> = [];
      const topLayerMaterials: THREE.Material[] = [];
      const topLayerGroups: Array<{ start: number; count: number; materialIndex: number }> = [];
      for (const group of originalGroups) {
        const topLayerMaterial = resolvedEntriesByIndex[group.materialIndex]?.topLayerMaterial ?? null;
        if (topLayerMaterial) {
          const materialIndex = topLayerMaterials.length;
          topLayerMaterials.push(topLayerMaterial);
          topLayerGroups.push({
            start: group.start,
            count: group.count,
            materialIndex,
          });
          const topLayerUniforms = topLayerMaterial instanceof THREE.ShaderMaterial
            ? topLayerMaterial.uniforms
            : null;
          this.runtimeDebug.head.push({
            meshName: mesh.name,
            sourceMaterialName: originalMaterials[group.materialIndex]?.name ?? "",
            resolvedKey: null,
            resolvedKind: typeof topLayerMaterial.userData.pjskMaterialKind === "string"
              ? topLayerMaterial.userData.pjskMaterialKind
              : null,
            usedOriginalMap: false,
            boundMainTex: null,
            boundShadowTex: null,
            boundValueTex: null,
            boundFaceShadowTex: null,
            finalMaterialType: topLayerMaterial.type,
            shaderHasMainTex: topLayerUniforms?.uUseMainTex?.value ?? null,
            shaderAtlasTileX: topLayerUniforms?.uAtlasTile?.value?.x ?? null,
            shaderAtlasTileY: topLayerUniforms?.uAtlasTile?.value?.y ?? null,
            shaderAtlasSample: topLayerUniforms?.uAtlasSample?.value ?? null,
            shaderUseAtlas: topLayerUniforms?.uUseAtlas?.value ?? null,
            shaderAlphaScale: topLayerUniforms?.uAlphaScale?.value ?? null,
            shaderAlphaCutoff: topLayerUniforms?.uAlphaCutoff?.value ?? null,
            shaderStrictAlpha: topLayerUniforms?.uStrictAlpha?.value ?? null,
            shaderStencilWrite: topLayerMaterial.stencilWrite ?? null,
            shaderStencilRef: topLayerMaterial.stencilRef ?? null,
            shaderStencilFunc: topLayerMaterial.stencilFunc ?? null,
            shaderStencilFuncMask: topLayerMaterial.stencilFuncMask ?? null,
            shaderStencilWriteMask: topLayerMaterial.stencilWriteMask ?? null,
            shaderStencilZPass: topLayerMaterial.stencilZPass ?? null,
            shaderDepthFunc: topLayerMaterial.depthFunc ?? null,
            shaderDepthWrite: topLayerMaterial.depthWrite ?? null,
            shaderTransparent: topLayerMaterial.transparent ?? null,
            renderOrder: getHeadLayerRenderOrder(
              typeof topLayerMaterial.userData.pjskMaterialKind === "string"
                ? topLayerMaterial.userData.pjskMaterialKind
                : ""
            ),
          });
        }

        const overlayMaterial = resolvedEntriesByIndex[group.materialIndex]?.overlayMaterial ?? null;
        if (overlayMaterial) {
          const materialIndex = overlayMaterials.length;
          overlayMaterials.push(overlayMaterial);
          overlayGroups.push({
            start: group.start,
            count: group.count,
            materialIndex,
          });
        }

        const stencilPrepassMaterial =
          resolvedEntriesByIndex[group.materialIndex]?.stencilPrepassMaterial ?? null;
        if (stencilPrepassMaterial) {
          const materialIndex = stencilPrepassMaterials.length;
          stencilPrepassMaterials.push(stencilPrepassMaterial);
          stencilPrepassGroups.push({
            start: group.start,
            count: group.count,
            materialIndex,
          });
          const prepassUniforms = stencilPrepassMaterial instanceof THREE.ShaderMaterial
            ? stencilPrepassMaterial.uniforms
            : null;
          this.runtimeDebug.head.push({
            meshName: mesh.name,
            sourceMaterialName: originalMaterials[group.materialIndex]?.name ?? "",
            resolvedKey: null,
            resolvedKind: typeof stencilPrepassMaterial.userData.pjskMaterialKind === "string"
              ? stencilPrepassMaterial.userData.pjskMaterialKind
              : null,
            usedOriginalMap: false,
            boundMainTex: null,
            boundShadowTex: null,
            boundValueTex: null,
            boundFaceShadowTex: null,
            finalMaterialType: stencilPrepassMaterial.type,
            shaderHasMainTex: prepassUniforms?.uUseMainTex?.value ?? null,
            shaderUseAtlas: prepassUniforms?.uUseAtlas?.value ?? null,
            shaderAlphaScale: prepassUniforms?.uAlphaScale?.value ?? null,
            shaderAlphaCutoff: prepassUniforms?.uAlphaCutoff?.value ?? null,
            shaderStrictAlpha: prepassUniforms?.uStrictAlpha?.value ?? null,
            shaderStencilWrite: stencilPrepassMaterial.stencilWrite ?? null,
            shaderStencilRef: stencilPrepassMaterial.stencilRef ?? null,
            shaderStencilFunc: stencilPrepassMaterial.stencilFunc ?? null,
            shaderStencilFuncMask: stencilPrepassMaterial.stencilFuncMask ?? null,
            shaderStencilWriteMask: stencilPrepassMaterial.stencilWriteMask ?? null,
            shaderStencilZPass: stencilPrepassMaterial.stencilZPass ?? null,
            shaderDepthFunc: stencilPrepassMaterial.depthFunc ?? null,
            shaderDepthWrite: stencilPrepassMaterial.depthWrite ?? null,
            shaderTransparent: stencilPrepassMaterial.transparent ?? null,
            renderOrder: getHeadLayerRenderOrder(
              typeof stencilPrepassMaterial.userData.pjskMaterialKind === "string"
                ? stencilPrepassMaterial.userData.pjskMaterialKind
                : ""
            ),
          });
        }

        if (!overlayMaterial) {
          continue;
        }
        const overlayUniforms = overlayMaterial instanceof THREE.ShaderMaterial
          ? overlayMaterial.uniforms
          : null;
        this.runtimeDebug.head.push({
          meshName: mesh.name,
          sourceMaterialName: originalMaterials[group.materialIndex]?.name ?? "",
          resolvedKey: null,
          resolvedKind: typeof overlayMaterial.userData.pjskMaterialKind === "string"
            ? overlayMaterial.userData.pjskMaterialKind
            : null,
          usedOriginalMap: false,
          boundMainTex: null,
          boundShadowTex: null,
          boundValueTex: null,
          boundFaceShadowTex: null,
          finalMaterialType: overlayMaterial.type,
          shaderHasMainTex: overlayUniforms?.uUseMainTex?.value ?? null,
          shaderAtlasTileX: overlayUniforms?.uAtlasTile?.value?.x ?? null,
          shaderAtlasTileY: overlayUniforms?.uAtlasTile?.value?.y ?? null,
          shaderAtlasSample: overlayUniforms?.uAtlasSample?.value ?? null,
          shaderUseAtlas: overlayUniforms?.uUseAtlas?.value ?? null,
          shaderAlphaScale: overlayUniforms?.uAlphaScale?.value ?? null,
          shaderAlphaCutoff: overlayUniforms?.uAlphaCutoff?.value ?? null,
          shaderStrictAlpha: overlayUniforms?.uStrictAlpha?.value ?? null,
          shaderStencilWrite: overlayMaterial.stencilWrite ?? null,
          shaderStencilRef: overlayMaterial.stencilRef ?? null,
          shaderStencilFunc: overlayMaterial.stencilFunc ?? null,
          shaderStencilFuncMask: overlayMaterial.stencilFuncMask ?? null,
          shaderStencilWriteMask: overlayMaterial.stencilWriteMask ?? null,
          shaderStencilZPass: overlayMaterial.stencilZPass ?? null,
          shaderDepthFunc: overlayMaterial.depthFunc ?? null,
          shaderDepthWrite: overlayMaterial.depthWrite ?? null,
          shaderTransparent: overlayMaterial.transparent ?? null,
          renderOrder: getHeadLayerRenderOrder(
            typeof overlayMaterial.userData.pjskMaterialKind === "string"
              ? overlayMaterial.userData.pjskMaterialKind
              : ""
          ),
        });
      }
      const finalMaterials = rebound;
      disposeReplacedMaterials(originalMaterials, finalMaterials);
      sortHeadMeshGroupsByMaterialKind(mesh, finalMaterials);
      mesh.material = Array.isArray(mesh.material) || finalMaterials.length > 1 ? finalMaterials : finalMaterials[0];
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      for (const group of stencilPrepassGroups) {
        const stencilPrepassMaterial = stencilPrepassMaterials[group.materialIndex];
        if (!stencilPrepassMaterial) {
          continue;
        }
        const stencilPrepassMesh = createGroupedOverlayMesh(
          mesh,
          [{
            start: group.start,
            count: group.count,
            materialIndex: 0,
          }],
          [stencilPrepassMaterial]
        );
        if (stencilPrepassMesh && mesh.parent) {
          stencilPrepassMesh.name = `${mesh.name}_eye_stencil_prepass`;
          stencilPrepassMesh.userData.pjskEyeThroughHairPassKind = "stencil_prepass";
          stencilPrepassMesh.userData.pjskEyeThroughHairStencilPrepass = true;
          stencilPrepassMesh.userData.pjskEyeThroughHairOverlay = false;
          stencilPrepassMeshesToAttach.push({
            parent: mesh.parent,
            mesh: stencilPrepassMesh,
          });
        }

      }
      for (const group of overlayGroups) {
        const overlayMaterial = overlayMaterials[group.materialIndex];
        if (!overlayMaterial) {
          continue;
        }
        const overlayMesh = createGroupedOverlayMesh(
          mesh,
          [{
            start: group.start,
            count: group.count,
            materialIndex: 0,
          }],
          [overlayMaterial]
        );
        if (overlayMesh && mesh.parent) {
          overlayMeshesToAttach.push({
            parent: mesh.parent,
            mesh: overlayMesh,
          });
        }
      }
      for (const group of topLayerGroups) {
        const topLayerMaterial = topLayerMaterials[group.materialIndex];
        if (!topLayerMaterial) {
          continue;
        }
        const topLayerMesh = createGroupedLayerMesh(
          mesh,
          [{
            start: group.start,
            count: group.count,
            materialIndex: 0,
          }],
          [topLayerMaterial],
          "eyelight_top_layer"
        );
        if (topLayerMesh && mesh.parent) {
          topLayerMesh.userData.pjskTopLayerSource = mesh;
          topLayerMesh.userData.pjskMaterialKind =
            typeof topLayerMaterial.userData.pjskMaterialKind === "string"
              ? topLayerMaterial.userData.pjskMaterialKind
              : null;
          topLayerMeshesToAttach.push({
            parent: mesh.parent,
            mesh: topLayerMesh,
          });
        }
      }
    });
    for (const entry of stencilPrepassMeshesToAttach) {
      entry.parent.add(entry.mesh);
    }
    for (const entry of overlayMeshesToAttach) {
      entry.parent.add(entry.mesh);
    }
    for (const entry of topLayerMeshesToAttach) {
      entry.parent.add(entry.mesh);
    }
  }

  private applyBodyAsset(
    bodyAsset: BodyAssetManifest,
    loaded: LoadedPartResult
  ) {
    this.resetSlotParents();
    this.clearCharacterSlot(this.bodySlot);
    this.currentRuntimeExtension = null;
    this.currentVrmSpringBoneManager = loaded.springBoneManager ?? null;
    this.currentBodyAttachNode = null;
    updateSekaiBodyMaterial(this.bodyMaterial, {
      baseColor: bodyAsset.proxy.bodyColor,
      shadowColor: bodyAsset.proxy.shadowColor,
      skinColorDefault:
        this.currentHeadAsset?.proxy.skinColorDefault ??
        this.currentHeadAsset?.proxy.faceColor ??
        bodyAsset.proxy.bodyColor,
      skinColor1:
        this.currentHeadAsset?.proxy.skinColor1 ??
        this.currentHeadAsset?.proxy.faceShadeColor ??
        bodyAsset.proxy.shadowColor,
      skinColor2:
        this.currentHeadAsset?.proxy.skinColor2 ??
        this.currentHeadAsset?.proxy.faceShadeColor ??
        bodyAsset.proxy.shadowColor,
      lightDirection: this.directionalLight.position.clone(),
      lightIntensity: this.directionalLight.intensity,
      ambientIntensity: this.fillLight.intensity,
      shadowThreshold: this.bodyMaterial.uniforms.uShadowThreshold.value,
      shadowWeight: this.bodyMaterial.uniforms.uShadowWeight.value,
      characterAmbientIntensity:
        this.bodyMaterial.uniforms.uCharacterAmbientIntensity.value,
      rimIntensity: this.bodyMaterial.uniforms.uRimIntensity.value,
      controllerRimThreshold:
        this.bodyMaterial.uniforms.uControllerRimThreshold.value,
      rimDirectionality: this.bodyMaterial.uniforms.uRimDirectionality.value,
      rimDirection: this.bodyMaterial.uniforms.uRimDirection.value.clone(),
      specularPower: this.bodyMaterial.uniforms.uSpecularPower.value,
      rimThreshold: this.bodyMaterial.uniforms.uRimThreshold.value,
      shadowTexWeight: this.bodyMaterial.uniforms.uShadowTexWeight.value,
      shadowWidthOverride: this.toonShadowWidthOverride,
      valueShadowInfluence: this.toonValueShadowInfluence,
      saturation: this.bodyMaterial.uniforms.uSaturation.value,
      partsAmbientColor: `#${this.bodyMaterial.uniforms.uPartsAmbientColor.value.getHexString()}`,
      reflectionBlendColor: `#${this.bodyMaterial.uniforms.uReflectionBlendColor.value.getHexString()}`,
      bodyDebugMode: bodyDebugModeToUniform(this.bodyDebugMode),
      skinTintEnabled: true,
    });

    if (loaded.root) {
      this.bodySlot.add(loaded.root);
      this.currentBodyAnimationRoot = loaded.root;
      this.currentBodyAttachNode = this.findNodeByName(
        loaded.root,
        bodyAsset.skeleton.neckAttach.nodeName
      );
      return loaded.meshCount;
    }

    this.currentBodyAnimationRoot = null;

    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(
        bodyAsset.proxy.shoulderWidth * 0.34,
        bodyAsset.proxy.torsoLength,
        10,
        20
      ),
      this.bodyMaterial
    );
    body.position.y = 0.16;
    body.scale.setScalar(bodyAsset.proxy.bodyScale);
    this.bodySlot.add(body);

    const shoulderBand = new THREE.Mesh(
      new THREE.TorusGeometry(
        bodyAsset.proxy.shoulderWidth * 0.48,
        0.12,
        10,
        48
      ),
      this.bodyMaterial
    );
    shoulderBand.rotation.x = Math.PI / 2;
    shoulderBand.position.y = bodyAsset.neckAnchor.y - 0.16;
    this.bodySlot.add(shoulderBand);

    const neckMarker = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 0.1, 18),
      new THREE.MeshBasicMaterial({ color: "#5d4235" })
    );
    neckMarker.position.set(
      bodyAsset.neckAnchor.x,
      bodyAsset.neckAnchor.y,
      bodyAsset.neckAnchor.z
    );
    this.bodySlot.add(neckMarker);
    return 3;
  }

  private applyHeadAsset(
    headAsset: HeadAssetManifest,
    loaded: LoadedPartResult
  ) {
    this.resetSlotParents();
    this.clearCharacterSlot(this.headSlot);
    this.currentVrmSpringBoneManager =
      loaded.springBoneManager ?? this.currentVrmSpringBoneManager;
    this.currentHeadAttachOriginNode = null;
    this.runtimeDebug.headMorphs = [];
    updateSekaiFaceMaterial(this.faceMaterial, {
      baseColor: headAsset.proxy.faceColor,
      warmColor: headAsset.proxy.faceShadeColor,
      skinColorDefault: headAsset.proxy.skinColorDefault ?? headAsset.proxy.faceColor,
      skinColor1: headAsset.proxy.skinColor1 ?? headAsset.proxy.faceShadeColor,
      skinColor2: headAsset.proxy.skinColor2 ?? headAsset.proxy.faceShadeColor,
      lightDirection: COSTUME_SHOP_FACE_SHADOW_LIGHT_DIRECTION.clone(),
      lightIntensity: this.directionalLight.intensity,
      ambientIntensity: this.fillLight.intensity,
      faceSoftness: this.faceMaterial.uniforms.uFaceSoftness.value,
      faceSdfUseLightDirection:
        this.faceMaterial.uniforms.uFaceSdfUseLightDirection?.value ?? 0.5,
      headDotDirectionalLight: this.headDotDirectionalLight,
      useFaceShadowLimiter: COSTUME_SHOP_USE_FACE_SHADOW_LIMITER,
      faceShadowLimitRange: COSTUME_SHOP_FACE_SHADOW_LIMIT_RANGE,
    });
    updateSekaiBodyMaterial(this.hairMaterial, {
      baseColor: headAsset.proxy.hairColor,
      shadowColor: headAsset.proxy.hairShadowColor,
      lightDirection: this.directionalLight.position.clone(),
      lightIntensity: this.directionalLight.intensity,
      ambientIntensity: this.fillLight.intensity,
      shadowThreshold: this.hairMaterial.uniforms.uShadowThreshold.value,
      shadowWeight: this.hairMaterial.uniforms.uShadowWeight.value,
      characterAmbientIntensity:
        this.hairMaterial.uniforms.uCharacterAmbientIntensity.value,
      rimIntensity: this.hairMaterial.uniforms.uRimIntensity.value,
      controllerRimThreshold:
        this.hairMaterial.uniforms.uControllerRimThreshold.value,
      rimDirectionality: this.hairMaterial.uniforms.uRimDirectionality.value,
      rimDirection: this.hairMaterial.uniforms.uRimDirection.value.clone(),
      specularPower: this.hairMaterial.uniforms.uSpecularPower.value,
      rimThreshold: this.hairMaterial.uniforms.uRimThreshold.value,
      shadowTexWeight: this.hairMaterial.uniforms.uShadowTexWeight.value,
      saturation: this.hairMaterial.uniforms.uSaturation.value,
      partsAmbientColor: `#${this.hairMaterial.uniforms.uPartsAmbientColor.value.getHexString()}`,
      reflectionBlendColor: `#${this.hairMaterial.uniforms.uReflectionBlendColor.value.getHexString()}`,
      skinTintEnabled: false,
    });

    if (loaded.root) {
      this.headSlot.add(loaded.root);
      this.bindHeadMorphTargets(loaded.root, headAsset);
      this.currentHeadAttachOriginNode = this.findNodeByName(
        loaded.root,
        headAsset.assembly.attachOrigin.nodeName
      );
      return loaded.meshCount;
    }

    const face = new THREE.Mesh(
      new THREE.SphereGeometry(headAsset.proxy.headRadius, 32, 32),
      this.faceMaterial
    );
    face.position.set(
      0,
      headAsset.proxy.headRadius * 0.92,
      headAsset.proxy.faceDepth * 0.28
    );
    face.scale.set(1.0, 0.94, headAsset.proxy.faceDepth);
    this.headSlot.add(face);

    const hair = new THREE.Mesh(
      new THREE.TorusGeometry(headAsset.proxy.hairArc, 0.14, 14, 48, Math.PI),
      this.hairMaterial
    );
    hair.rotation.x = Math.PI / 2;
    hair.position.set(0, headAsset.proxy.headRadius + 0.42, -0.08);
    this.headSlot.add(hair);

    const seam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.22, 0.18, 18),
      this.faceMaterial
    );
    seam.position.set(0, 0.08, 0.02);
    seam.scale.z = 0.74;
    this.headSlot.add(seam);
    return 3;
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
    const width = Math.max(this.container.clientWidth, 320);
    const height = Math.max(this.container.clientHeight, 320);
    this.setViewportSize(width, height);
  }

  private updateCaptureBackgroundTexture(width?: number, height?: number) {
    const textureWidth = Math.max(
      Math.round(width ?? this.container.clientWidth),
      320
    );
    const textureHeight = Math.max(
      Math.round(height ?? this.container.clientHeight),
      320
    );
    this.captureBackgroundTexture?.dispose();
    this.captureBackgroundTexture = new THREE.CanvasTexture(
      drawCaptureTriangleBackground(textureWidth, textureHeight)
    );
    this.captureBackgroundTexture.colorSpace = THREE.SRGBColorSpace;
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

  private updateShaderFaceBasis() {
    const headNode =
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
    normalizeFaceShadowHorizontal(
      this.faceShadowHeadHorizontal,
      -this.faceUpWorld.x,
      -this.faceUpWorld.z
    );
    normalizeFaceShadowHorizontal(
      this.faceShadowLightHorizontal,
      COSTUME_SHOP_FACE_SHADOW_LIGHT_DIRECTION.x,
      COSTUME_SHOP_FACE_SHADOW_LIGHT_DIRECTION.z
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
    updateSekaiFaceBasis(
      this.faceMaterial,
      this.faceRightWorld,
      this.faceUpWorld,
      this.faceForwardWorld
    );
    updateSekaiFaceShadowParameters(
      this.faceMaterial,
      COSTUME_SHOP_FACE_SHADOW_LIGHT_DIRECTION,
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
          if (material.uniforms.uFaceRight) {
            updateSekaiFaceBasis(
              material,
              this.faceRightWorld,
              this.faceUpWorld,
              this.faceForwardWorld
            );
            updateSekaiFaceShadowParameters(
              material,
              COSTUME_SHOP_FACE_SHADOW_LIGHT_DIRECTION,
              this.headDotDirectionalLight,
              COSTUME_SHOP_USE_FACE_SHADOW_LIMITER,
              COSTUME_SHOP_FACE_SHADOW_LIMIT_RANGE
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
    this.controls.update();
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
    if (!shouldSmoothLoopClip(clip)) {
      return clip;
    }

    const cached = this.smoothedLoopClipCache.get(clip);
    if (cached) {
      return cached;
    }

    const smoothed = new THREE.AnimationClip(
      clip.name,
      clip.duration,
      clip.tracks.map((track) => smoothLoopTrack(track, clip.duration, 60))
    );
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
    utjControlledNodeNames: ReadonlySet<string>,
    updateRetargetDebug = true
  ): THREE.AnimationClip | null {
    const clip = prepareRuntimeAnimationClip(
      sourceClip,
      this.bodyHeadTracksEnabled,
      utjControlledNodeNames
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
      retargeted.debug.prefabHeadFollow = this.currentPrefabHeadFollowDebug;
      this.currentAnimationRetargetDebug = retargeted.debug;
    }
    if (retargeted.error) {
      this.currentAnimationError = retargeted.error;
      return null;
    }
    return retargeted.clip;
  }

  private async refreshAnimationPlayback() {
    const revision = ++this.animationRevision;
    this.stopAnimationPlayback();
    this.currentAnimationError = null;

    if (!this.currentAnimationUrl || !this.currentBodyAnimationRoot) {
      this.syncLinkedHeadBones();
      this.currentExtraBoneRuntime?.update();
      this.resetCurrentSpringRuntimeState();
      return;
    }

    const clipCacheKey = animationClipCacheKey(
      this.currentAnimationUrl,
      this.currentAnimationKind
    );
    let clips = this.animationClipCache.get(clipCacheKey);
    if (!clips) {
      if (this.currentAnimationKind !== "unity-json") {
        this.currentAnimationError = `Unity motion JSON is required; GLTF animation fallback is disabled for ${this.currentAnimationUrl}.`;
        return;
      }
      try {
        clips = await loadUnityMotionClips(this.currentAnimationUrl);
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

    const utjControlledNodeNames =
      this.currentSpringRuntime?.getControlledTrackNodeNames() ??
      new Set<string>();
    this.currentAnimationMixer = new THREE.AnimationMixer(
      this.currentBodyAnimationRoot
    );
    const sourceClip = clips.find((candidate) => !isLoopClipName(candidate.name, this.currentAnimationUrl))
      ?? clips[0];
    const clip = this.preparePlayableBodyAnimationClip(
      sourceClip,
      utjControlledNodeNames
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
          utjControlledNodeNames,
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
            loopClips = await loadUnityMotionClips(loopUrl);
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
          utjControlledNodeNames,
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
    this.syncLinkedHeadBones();
    this.currentExtraBoneRuntime?.update();
    this.resetCurrentSpringRuntimeState();
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
    const root = this.currentBodyAnimationRoot;
    const base: PrefabHeadFollowDebug = {
      ...this.currentPrefabHeadFollowDebug,
      setupVersion: readRuntimeUnitySetupVersion(this.currentRuntimeExtension),
    };
    if (!root) {
      return base;
    }

    root.updateMatrixWorld(true);
    const nodeByPath = buildPrefabNodePathLookup(root);
    const resolveKeyNode = (
      candidates: readonly string[]
    ): PrefabHeadFollowNodeDebug | null => {
      const resolved = resolvePrefabNodeCandidate(nodeByPath, candidates);
      return resolved ? makePrefabNodeDebug(resolved.node, root) : null;
    };
    const constraint = this.currentPrefabHeadFollowConstraint;
    const targetPaths = constraint?.targets.map((target) => target.path) ?? [];
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
      targetCount: targetPaths.length,
      targetPaths,
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

  private createPrefabHeadFollowConstraint(
    root: THREE.Object3D
  ): PrefabHeadFollowConstraint | null {
    if (readRuntimeUnitySetupVersion(this.currentRuntimeExtension) !== "0414") {
      this.currentPrefabHeadFollowDebug = {
        active: false,
        sourcePath: null,
        targetPath: null,
        reason: "runtimeUnitySetup version is not 0414",
      };
      return null;
    }

    const nodeByPath = buildPrefabNodePathLookup(root);
    const source = resolvePrefabNodeCandidate(nodeByPath, [
      "body/Position/PositionOffset/Hip/Waist/Spine/Chest/Neck",
      "body/Position/Hip/Waist/Spine/Chest/Neck",
    ]);
    if (!source) {
      this.currentPrefabHeadFollowDebug = {
        active: false,
        sourcePath: null,
        targetPath: null,
        reason: "body neck prefab node was not found",
      };
      return null;
    }

    const targetNodes = collectPrefabHeadFollowTargets(root);
    if (targetNodes.length === 0) {
      this.currentPrefabHeadFollowDebug = {
        active: false,
        sourcePath: source.path,
        targetPath: null,
        reason: "head prefab follow targets were not found",
      };
      return null;
    }

    root.updateMatrixWorld(true);
    source.node.updateMatrixWorld(true);
    const sourceRestInverse = new THREE.Matrix4()
      .copy(source.node.matrixWorld)
      .invert();
    const targets = targetNodes.map((target) => {
      target.node.updateMatrixWorld(true);
      return {
        node: target.node,
        path: target.path,
        restOffset: sourceRestInverse.clone().multiply(target.node.matrixWorld),
      };
    });
    this.currentPrefabHeadFollowDebug = {
      active: true,
      sourcePath: source.path,
      targetPath: targets.map((target) => target.path).join(", "),
      reason: null,
    };
    return {
      source: source.node,
      sourcePath: source.path,
      targets,
    };
  }

  private syncPrefabHeadFollow() {
    if (this.currentPrefabSourceGraph) {
      return;
    }
    const constraint = this.currentPrefabHeadFollowConstraint;
    if (!constraint) {
      return;
    }

    this.characterRoot.updateMatrixWorld(true);
    constraint.source.updateMatrixWorld(true);
    for (const target of constraint.targets) {
      this.tempMatrixB.multiplyMatrices(
        constraint.source.matrixWorld,
        target.restOffset
      );

      const parent = target.node.parent;
      if (parent) {
        parent.updateMatrixWorld(true);
        this.tempMatrixA.copy(parent.matrixWorld).invert();
        this.tempMatrixB.premultiply(this.tempMatrixA);
      }

      this.tempMatrixB.decompose(
        this.tempVector,
        this.tempQuaternion,
        this.tempScale
      );
      target.node.position.copy(this.tempVector);
      target.node.quaternion.copy(this.tempQuaternion);
      target.node.scale.copy(this.tempScale);
      target.node.updateMatrix();
      target.node.updateMatrixWorld(true);
    }
    this.characterRoot.updateMatrixWorld(true);
  }

  private syncUnityPrefabSourceGraph() {
    const graph = this.currentPrefabSourceGraph;
    if (!graph) {
      return;
    }

    graph.root.updateMatrixWorld(true);
    if (
      !graph.usesModelCombineSetup &&
      graph.bodyAttach &&
      graph.headRoot &&
      graph.headOrigin
    ) {
      graph.bodyAttach.updateMatrixWorld(true);
      if (graph.assemblyMount) {
        graph.assemblyMount.position.set(0, 0, 0);
        graph.assemblyMount.quaternion.identity();
        graph.assemblyMount.scale.set(1, 1, 1);
        graph.assemblyMount.updateMatrix();
        graph.assemblyMount.updateMatrixWorld(true);
      }
      const mounts = graph.headRootMounts.length
        ? graph.headRootMounts
        : [{
          root: graph.headRoot,
          rootPath: graph.headRootPath,
          origin: graph.headOrigin,
          originPath: graph.headOriginPath,
          originRestLocalToRoot: graph.headOriginRestLocalToHeadRoot,
        }];
      for (const mounted of mounts) {
        if (!mounted.originRestLocalToRoot) {
          continue;
        }
        this.tempMatrixB.copy(mounted.originRestLocalToRoot).invert();
        this.tempMatrixB.decompose(
          this.tempVector,
          this.tempQuaternion,
          this.tempScale
        );
        mounted.root.position.copy(this.tempVector);
        mounted.root.quaternion.copy(this.tempQuaternion);
        mounted.root.scale.copy(this.tempScale);
        mounted.root.updateMatrix();
      }
      const bodyHead = graph.nodeByPath.get(
        "body/Position/PositionOffset/Hip/Waist/Spine/Chest/Neck/Head"
      ) ?? graph.nodeByPath.get("body/Position/Hip/Waist/Spine/Chest/Neck/Head");
      const faceHead = graph.nodeByPath.get(
        "face/Position/Hip/Waist/Spine/Chest/Neck/Head"
      );
      if (bodyHead && faceHead) {
        faceHead.position.copy(bodyHead.position);
        faceHead.quaternion.copy(bodyHead.quaternion);
        faceHead.scale.copy(bodyHead.scale);
        faceHead.updateMatrix();
      }
      graph.root.updateMatrixWorld(true);
    }

    this.lastConstraintSetupDiagnostics = applyUnityRuntimeConstraints(
      graph,
      readRuntimeUnitySetup0414ForGraph(this.currentRuntimeExtension)?.constraintSetup,
      this.characterHeight
    );

    for (const binding of graph.meshCarrierBindings) {
      binding.target.position.copy(binding.source.position);
      binding.target.quaternion.copy(binding.source.quaternion);
      binding.target.scale.copy(binding.source.scale);
      binding.target.updateMatrix();
    }
    graph.root.updateMatrixWorld(true);
  }

  private syncLinkedHeadBones() {
    this.syncUnityPrefabSourceGraph();
    this.syncPrefabHeadFollow();

    if (
      (
        this.currentCompositionStatus.mode !== "bone_linked" &&
        this.currentCompositionStatus.mode !== "combined_glb"
      ) ||
      this.currentStitchMode !== "stitched" ||
      !this.activeBoneLinks.length
    ) {
      return;
    }

    this.characterRoot.updateMatrixWorld(true);
    for (const link of this.activeBoneLinks) {
      link.bodyBone.updateMatrixWorld(true);
      const parent = link.headBone.parent;
      if (parent) {
        parent.updateMatrixWorld(true);
        this.tempMatrixA.copy(parent.matrixWorld).invert();
        this.tempMatrixB.multiplyMatrices(
          this.tempMatrixA,
          link.bodyBone.matrixWorld
        );
      } else {
        this.tempMatrixB.copy(link.bodyBone.matrixWorld);
      }
      this.tempMatrixB.decompose(
        this.tempVector,
        this.tempQuaternion,
        this.tempScale
      );
      link.headBone.position.copy(this.tempVector);
      link.headBone.quaternion.copy(this.tempQuaternion);
      link.headBone.scale.copy(this.tempScale);
      link.headBone.updateMatrix();
    }
    this.characterRoot.updateMatrixWorld(true);
  }

  private resolvePjskRuntimeExtension(
    loaded: LoadedPartResult,
    runtimeExtension: unknown
  ) {
    if (runtimeExtension) {
      return runtimeExtension;
    }
    const extensions = (loaded.userData?.gltfExtensions ?? null) as
      | Record<string, unknown>
      | null;
    return extensions?.PJSK_sekai_runtime ?? null;
  }
}

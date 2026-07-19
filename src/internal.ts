export {
  type HarukiCameraControls,
  type HarukiCameraControlsFactory,
  type AnimationPlaybackSnapshot,
  type BodyAnimationKind,
  type BodyAnimationSelection,
  type BodyDebugMode,
  type CompositionMode,
  type CompositionStatus,
  type FaceMotionClip,
  type FaceMotionCurve,
  type FaceMotionKeyframe,
  type FaceMotionPlaybackSnapshot,
  type FaceMotionSet,
  type HairShadowMode,
  type Haruki3DEngineOptions,
  type HarukiEngineSnapshots,
  type HarukiRuntimePackageRequest,
  type HarukiRenderResult,
  type PartImportSnapshot,
  type PjskCameraProfile,
  type PjskCameraPreset,
  type PjskPresentationMode,
  type ProjectedShadowSettings,
  type ProjectedShadowSettingsInput,
  type PjskViewerEngineOptions,
  type PjskEngineOptions,
  type RenderIsolationMode,
  type RuntimeCameraDebug,
  type RuntimeDebugSnapshot,
  type SpringBoneRuntimeSnapshot,
  defaultProjectedShadowSettings,
} from "./engine/Haruki3DEngine";
export {
  Haruki3DEngine,
  Haruki3DEngineCore,
  type Haruki3DCaptureEngineOptions,
} from "./capture/Haruki3DCaptureEngine";
export type { RuntimeCombinedCharacterAsset } from "./runtime/runtimeTypes";
export {
  HarukiCaptureAdapter,
} from "./capture/captureAdapter";
export type {
  HarukiCaptureRolePartsRequest,
  HarukiCaptureRolePartsResult,
  HarukiPrepareCaptureFrameRequest,
} from "./capture/captureTypes";
export {
  loadRuntimePackageFromBaseUrl,
  resolveRuntimePackageUrl,
  type RuntimePackageLoadOptions,
  type RuntimePackageLoadResult,
} from "./runtime/runtimePackageLoader";
export {
  CustomWardrobeController,
  type CustomWardrobeControllerOptions,
} from "./parts/customWardrobeController";
export {
  type Character3dIndex,
  type Character3dIndexEntry,
  type CustomPartSelection,
  type HeadHairCompatibility,
  type PartPackageSet,
  type PartRegistryEntry,
  type PartRuntimePackage,
  type RoleRuntimePackage,
  type RuntimePartType,
} from "./parts/runtimePartComposer";
export {
  previewLightDefaults,
  type BodyAssetManifest,
  type HeadAssetManifest,
  type PreviewLightState,
  type Vec3,
} from "./data/sampleScene";
export {
  evaluateSekaiBaseShadow,
  evaluateSekaiFaceShadow,
  evaluateSekaiFaceSphereShadow,
  type SekaiBaseShadowInput,
  type SekaiFaceShadowInput,
  type SekaiFaceSphereShadowInput,
} from "./materials/sekaiCharacterLighting";
export {
  normalizeHarukiRenderRecipe,
  type HarukiRenderRecipe,
  type HarukiRuntimeRenderRecipe,
  type NormalizedHarukiRenderRecipe,
} from "./kernel/renderRecipe";
export {
  createHaruki3DKernel,
  type Haruki3DKernel,
  type Haruki3DKernelOptions,
} from "./kernel/Haruki3DKernel";
export {
  getCostumeShopCameraPose,
  getDefaultCameraPose,
  shiftCameraPoseRight,
} from "./engine/cameraRuntime";
export { createCaptureBackgroundTexture } from "./engine/captureBackground";
export { CharacterProjectedShadowController } from "./engine/projectedShadow";
export {
  createSmoothedLoopClip,
  decodeUnityMotionClips,
  inferBodyAnimationKind,
  makeAnimationTrackDebug,
  prepareRuntimeAnimationClip,
  retargetUnityPrefabAnimationClip,
} from "./engine/runtimeMotion";
export {
  buildUnityPrefabSourceGraph,
  installUnityRuntimeNativeMeshes,
  makeUnityPrefabHeadFollowDebugSnapshot,
  syncUnityPrefabSourceGraph,
} from "./engine/unityPrefabRuntime";
export {
  bindBodyRuntimeMaterials,
  configureSekaiEyelashPass,
  configureSekaiFaceLayerStencilPrepass,
  configureSekaiHairStencil,
  createSekaiThroughHairOverlayMesh,
  updateSekaiEyelashPassView,
  type RuntimeMaterialDebug,
} from "./engine/characterMaterialRuntime";
export {
  bindHeadRuntimeMaterials,
  type CharacterEyeMaterialController,
} from "./engine/headMaterialRuntime";
export { createSekaiBodyMaterial } from "./materials/sekaiBodyMaterial";
export { createSekaiLayerMaterial } from "./materials/sekaiCharacterShader";

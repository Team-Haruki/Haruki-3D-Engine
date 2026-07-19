import type { BodyAssetManifest, HeadAssetManifest } from "../data/sampleScene";

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

import * as THREE from "three";
import type {
  BodyAssetManifest,
  HeadAssetManifest,
  MaterialLightingSettings,
} from "../data/sampleScene";
import { updateSekaiBodyMaterial } from "../materials/sekaiBodyMaterial";

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
  shaderFaceDebugMode?: number | null;
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

type RuntimeTextureLoader = {
  loadAsync(url: string): Promise<THREE.Texture>;
};

type BodyRuntimeMaterialSlot = {
  key: string;
  meshKey: string;
  materialKey: string;
  materialKind: string;
  mainTex: string | null;
  shadowTex: string | null;
  valueTex: string | null;
  material: THREE.ShaderMaterial;
};

type CloneBodyMaterialParams = {
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
  useLambert?: boolean;
  headPosition?: THREE.Vector3;
  alphaCutoff?: number;
};

export function getSekaiPreviewRimDirection() {
  return new THREE.Vector3(0, 0, -1)
    .applyEuler(new THREE.Euler(THREE.MathUtils.degToRad(135), 0, THREE.MathUtils.degToRad(-90)))
    .normalize();
}

export function cloneBodyShaderMaterial(
  source: THREE.ShaderMaterial,
  params: CloneBodyMaterialParams
) {
  const material = source.clone();
  updateSekaiBodyMaterial(material, {
    baseColor: params.baseColor ?? `#${source.uniforms.uBaseColor.value.getHexString()}`,
    shadowColor: params.shadowColor ?? `#${source.uniforms.uShadowColor.value.getHexString()}`,
    skinColorDefault:
      params.skinColorDefault ?? `#${source.uniforms.uSkinColorDefault.value.getHexString()}`,
    skinColor1: params.skinColor1 ?? `#${source.uniforms.uSkinColor1.value.getHexString()}`,
    skinColor2: params.skinColor2 ?? `#${source.uniforms.uSkinColor2.value.getHexString()}`,
    mainTex: params.mainTex ?? null,
    shadowTex: params.shadowTex ?? null,
    valueTex: params.valueTex ?? null,
    useValueTex: params.lighting?.useValueTex ?? Boolean(params.valueTex),
    lightDirection: source.uniforms.uLightDirection.value.clone(),
    lightIntensity: source.uniforms.uLightIntensity.value,
    ambientIntensity: source.uniforms.uAmbientIntensity.value,
    shadowThreshold: params.lighting?.sekaiShadowThreshold ?? source.uniforms.uShadowThreshold.value,
    shadowWeight: source.uniforms.uShadowWeight.value,
    characterAmbientIntensity: source.uniforms.uCharacterAmbientIntensity?.value ?? 0.3,
    rimIntensity: source.uniforms.uRimIntensity?.value ?? 0.35,
    controllerRimThreshold: source.uniforms.uControllerRimThreshold?.value ?? 0.18,
    rimDirectionality: source.uniforms.uRimDirectionality?.value ?? 0.85,
    rimDirection: source.uniforms.uRimDirection?.value.clone() ?? getSekaiPreviewRimDirection(),
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
      params.valueShadowInfluence ?? source.uniforms.uValueShadowInfluence?.value ?? 0,
    hairShadowEnabled:
      params.hairShadowEnabled ?? ((source.uniforms.uHairShadowEnabled?.value ?? 0) > 0.5),
    useLambert:
      params.useLambert ??
      params.lighting?.useLambert ??
      ((source.uniforms.uUseLambert?.value ?? 1) > 0.5),
    headPosition: params.headPosition ?? source.uniforms.uHeadPosition?.value.clone(),
    faceSphereShadowEdge: params.lighting?.faceSphereShadowEdge ?? 0,
    faceSphereShadowSmoothness: params.lighting?.faceSphereShadowSmoothness ?? 0,
    faceSphereShadowWeight: params.lighting?.faceSphereShadowWeight ?? 0,
    saturation: params.lighting?.saturation ?? source.uniforms.uSaturation.value,
    value: params.lighting?.value ?? source.uniforms.uValue?.value ?? 0.5,
    contrast: params.lighting?.contrast ?? source.uniforms.uContrast?.value ?? 0.5,
    partsAmbientColor:
      params.lighting?.partsAmbientColor ?? `#${source.uniforms.uPartsAmbientColor.value.getHexString()}`,
    reflectionBlendColor:
      params.lighting?.reflectionBlendColor ??
      `#${source.uniforms.uReflectionBlendColor.value.getHexString()}`,
    globalShadowColor: source.uniforms.uGlobalShadowColor
      ? `#${source.uniforms.uGlobalShadowColor.value.getHexString()}`
      : "#ffffff",
    controllerAmbientColor: source.uniforms.uControllerAmbientColor
      ? `#${source.uniforms.uControllerAmbientColor.value.getHexString()}`
      : "#ffffff",
    controllerRimColor: source.uniforms.uControllerRimColor
      ? `#${source.uniforms.uControllerRimColor.value.getHexString()}`
      : "#e6edf9",
    controllerShadowRimColor: source.uniforms.uControllerShadowRimColor
      ? `#${source.uniforms.uControllerShadowRimColor.value.getHexString()}`
      : "#ffffff",
    controllerRimColorWeight: source.uniforms.uControllerRimColorWeight?.value ?? 0,
    controllerShadowRimColorWeight: source.uniforms.uControllerShadowRimColorWeight?.value ?? 0,
    controllerRimEdgeSmoothness: source.uniforms.uControllerRimEdgeSmoothness?.value ?? 0.38,
    controllerRimShadowSharpness: source.uniforms.uControllerRimShadowSharpness?.value ?? 0,
    bodyDebugMode: params.bodyDebugMode ?? source.uniforms.uBodyDebugMode?.value ?? 0,
    skinTintEnabled:
      params.skinTintEnabled ?? ((source.uniforms.uSkinTintEnabled?.value ?? 1) > 0.5),
    alphaCutoff: params.alphaCutoff ?? source.uniforms.uAlphaCutoff?.value ?? 0,
  });
  return material;
}

export async function loadRuntimeTexture(
  textureLoader: RuntimeTextureLoader,
  url: string | undefined,
  colorSpace: THREE.ColorSpace = THREE.SRGBColorSpace
) {
  if (!url) {
    return null;
  }
  try {
    const texture = await textureLoader.loadAsync(url);
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

export function extractMaterialColorMap(material: THREE.Material) {
  return (material as THREE.Material & { map?: THREE.Texture | null }).map ?? null;
}

export function syncReplacementTextureFromOriginal(
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
  } else if (material instanceof THREE.ShaderMaterial) {
    sync(material.uniforms.uMainTex?.value as THREE.Texture | null | undefined);
  }
}

export function normalizeMeshSlotName(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes("face")) return "face";
  if (lower.includes("hair")) return "hair";
  if (lower.includes("acc")) return "acc";
  if (lower.includes("body")) return "body";
  return lower;
}

export function tuneLightingForPreview(
  kind: string | undefined,
  lighting: MaterialLightingSettings | undefined
) {
  void kind;
  return lighting ? { ...lighting, shadowTexWeight: lighting.shadowTexWeight } : undefined;
}

export function usesSekaiSkinTint(kind: string | undefined) {
  const normalized = (kind ?? "body").toLowerCase();
  return normalized === "body" || normalized === "accessory" || normalized === "acc";
}

export async function bindBodyRuntimeMaterials({
  root,
  bodyAsset,
  headAsset,
  textureLoader,
  template,
  bodyDebugMode,
  debug = [],
}: {
  root: THREE.Object3D;
  bodyAsset: BodyAssetManifest;
  headAsset: HeadAssetManifest | null;
  textureLoader: RuntimeTextureLoader;
  template: THREE.ShaderMaterial;
  bodyDebugMode: number;
  debug?: RuntimeMaterialDebug[];
}) {
  const slots: BodyRuntimeMaterialSlot[] = [];
  for (const slot of bodyAsset.bodyMaterials) {
    if (!slot.materialKind) {
      throw new Error(`Body material ${slot.materialName ?? slot.materialKey} is missing materialKind.`);
    }
    const mainTex = await loadRuntimeTexture(textureLoader, slot.mainTex);
    const shadowTex = await loadRuntimeTexture(textureLoader, slot.shadowTex);
    const valueTex = await loadRuntimeTexture(textureLoader, slot.valueTex, THREE.NoColorSpace);
    const lighting = tuneLightingForPreview(slot.materialKind, slot.lighting);
    const material = cloneBodyShaderMaterial(template, {
      mainTex,
      shadowTex,
      valueTex,
      baseColor: bodyAsset.proxy.bodyColor,
      shadowColor: bodyAsset.proxy.shadowColor,
      skinColorDefault:
        headAsset?.proxy.skinColorDefault ?? headAsset?.proxy.faceColor ?? bodyAsset.proxy.bodyColor,
      skinColor1:
        headAsset?.proxy.skinColor1 ?? headAsset?.proxy.faceShadeColor ?? bodyAsset.proxy.shadowColor,
      skinColor2:
        headAsset?.proxy.skinColor2 ?? headAsset?.proxy.faceShadeColor ?? bodyAsset.proxy.shadowColor,
      lighting,
      skinTintEnabled: usesSekaiSkinTint(slot.materialKind),
      bodyDebugMode,
    });
    material.userData.pjskLighting = lighting;
    material.userData.pjskMaterialKind = slot.materialKind;
    material.userData.pjskMaterialKey = slot.materialKey;
    material.userData.pjskMaterialSlotIndex = slot.slotIndex;
    slots.push({
      key: slot.materialKey,
      meshKey: normalizeMeshSlotName(slot.meshName),
      materialKey: slot.materialKey,
      materialKind: slot.materialKind,
      mainTex: slot.mainTex ?? null,
      shadowTex: slot.shadowTex ?? null,
      valueTex: slot.valueTex ?? null,
      material,
    });
  }

  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    const originals = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const meshSlots = slots.filter((slot) => slot.meshKey === normalizeMeshSlotName(mesh.name));
    if (meshSlots.length === 0) return;
    const rebound = originals.map((original) => {
      const originalKey = typeof original.userData.pjskMaterialKey === "string"
        ? original.userData.pjskMaterialKey
        : "";
      if (!originalKey) {
        throw new Error(
          `Body mesh '${mesh.name}' material '${original.name}' is missing pjskMaterialKey; regenerate it with Haruki-3D-Exporter materialKey runtime support.`
        );
      }
      const resolved = meshSlots.find((slot) => slot.materialKey === originalKey);
      if (!resolved) {
        throw new Error(
          `Body mesh '${mesh.name}' material key '${originalKey}' was not found in body material slots.`
        );
      }
      const originalMap = extractMaterialColorMap(original);
      syncReplacementTextureFromOriginal(resolved.material, originalMap);
      mesh.userData.pjskMaterialKind = resolved.materialKind;
      let usedOriginalMap = false;
      if (!resolved.material.uniforms.uMainTex.value && originalMap) {
        resolved.material.uniforms.uMainTex.value = originalMap;
        resolved.material.uniforms.uUseMainTex.value = 1;
        resolved.material.uniforms.uBaseColor.value.set("#ffffff");
        usedOriginalMap = true;
      }
      const uniforms = resolved.material.uniforms;
      debug.push({
        meshName: mesh.name,
        sourceMaterialName: original.name,
        resolvedKey: resolved.key,
        resolvedKind: resolved.materialKind,
        usedOriginalMap,
        boundMainTex: resolved.mainTex,
        boundShadowTex: resolved.shadowTex,
        boundValueTex: resolved.valueTex,
        boundFaceShadowTex: null,
        finalMaterialType: resolved.material.type,
        shaderHasMainTex: uniforms.uUseMainTex?.value ?? null,
        shaderHasShadowTex: uniforms.uUseShadowTex?.value ?? null,
        shaderHasValueTex: uniforms.uUseValueTex?.value ?? null,
        shaderLightDirectionX: uniforms.uLightDirection?.value?.x ?? null,
        shaderLightDirectionY: uniforms.uLightDirection?.value?.y ?? null,
        shaderLightDirectionZ: uniforms.uLightDirection?.value?.z ?? null,
        shaderShadowThreshold: uniforms.uShadowThreshold?.value ?? null,
        shaderShadowWeight: uniforms.uShadowWeight?.value ?? null,
        shaderShadowWidthOverride: uniforms.uShadowWidthOverride?.value ?? null,
        shaderValueShadowInfluence: uniforms.uValueShadowInfluence?.value ?? null,
        shaderLambertEnabled: uniforms.uUseLambert?.value ?? null,
        shaderSpecularPower: uniforms.uSpecularPower?.value ?? null,
        shaderRimThreshold: uniforms.uRimThreshold?.value ?? null,
        shaderControllerRimThreshold: uniforms.uControllerRimThreshold?.value ?? null,
        shaderRimIntensity: uniforms.uRimIntensity?.value ?? null,
        shaderRimDirectionality: uniforms.uRimDirectionality?.value ?? null,
        shaderCharacterAmbient: uniforms.uCharacterAmbientIntensity?.value ?? null,
        shaderShadowTexWeight: uniforms.uShadowTexWeight?.value ?? null,
        shaderSaturation: uniforms.uSaturation?.value ?? null,
        shaderSkinTintEnabled: uniforms.uSkinTintEnabled?.value ?? null,
        shaderSkinColorDefault: uniforms.uSkinColorDefault?.value
          ? `#${uniforms.uSkinColorDefault.value.getHexString()}`
          : null,
        shaderSkinColor1: uniforms.uSkinColor1?.value
          ? `#${uniforms.uSkinColor1.value.getHexString()}`
          : null,
        shaderSkinColor2: uniforms.uSkinColor2?.value
          ? `#${uniforms.uSkinColor2.value.getHexString()}`
          : null,
        shaderBodyDebugMode: uniforms.uBodyDebugMode?.value ?? null,
      });
      return resolved.material;
    });
    const preserved = new Set<THREE.Material>(rebound);
    originals.forEach((material) => {
      if (!preserved.has(material)) material.dispose();
    });
    mesh.material = Array.isArray(mesh.material) ? rebound : rebound[0];
    mesh.castShadow = false;
    mesh.receiveShadow = false;
  });
  return debug;
}

import * as THREE from "three";
import type {
  HeadAssetManifest,
  MaterialLightingSettings,
} from "../data/sampleScene";
import { updateSekaiFaceMaterial } from "../materials/sekaiFaceMaterial";
import {
  createSekaiLayerMaterial,
  type SekaiLayerAtlas,
} from "../materials/sekaiLayerMaterial";
import {
  cloneBodyShaderMaterial,
  configureSekaiEyelashPass,
  configureSekaiFaceLayerStencilPrepass,
  configureSekaiHairStencil,
  createGroupedLayerMesh,
  createSekaiThroughHairOverlayMesh,
  extractMaterialColorMap,
  getHeadLayerRenderOrder,
  loadRuntimeTexture,
  normalizeMeshSlotName,
  sortHeadMeshGroupsByMaterialKind,
  syncReplacementTextureFromOriginal,
  tuneLightingForPreview,
  usesSekaiSkinTint,
  type RuntimeMaterialDebug,
} from "./characterMaterialRuntime";

const CHARACTER_STENCIL_BIT = 0x01;
const HAIR_ALPHA_CUTOFF = 0.02;
const ACCESSORY_ALPHA_CUTOFF = 0.02;

type RuntimeTextureLoader = {
  loadAsync(url: string): Promise<THREE.Texture>;
};

export type CharacterEyeMaterialController = {
  lightInfluence: number | null;
  lightInfluenceForEyeHighlight: number | null;
  tintColor: string | null;
  emissionColor: string | null;
  baseTiling: SekaiLayerAtlas | null;
  highlightTiling: SekaiLayerAtlas | null;
};

type HeadRuntimeMaterialSlot = {
  key: string;
  meshKey: string;
  materialKey: string;
  materialKind: string;
  mainTex: string | null;
  shadowTex: string | null;
  valueTex: string | null;
  faceShadowTex: string | null;
  material: THREE.Material;
  overlayMaterial: THREE.Material | null;
  stencilPrepassMaterial: THREE.Material | null;
  topLayerMaterial: THREE.Material | null;
};

function pushBoundMaterialDebug(
  debug: RuntimeMaterialDebug[],
  mesh: THREE.Mesh,
  original: THREE.Material,
  slot: HeadRuntimeMaterialSlot,
  usedOriginalMap: boolean,
  faceSdfCapable: boolean,
  faceSdfUv1Available: boolean
) {
  const uniforms = slot.material instanceof THREE.ShaderMaterial
    ? slot.material.uniforms
    : null;
  debug.push({
    meshName: mesh.name,
    sourceMaterialName: original.name,
    resolvedKey: slot.key,
    resolvedKind: slot.materialKind,
    usedOriginalMap,
    boundMainTex: slot.mainTex,
    boundShadowTex: slot.shadowTex,
    boundValueTex: slot.valueTex,
    boundFaceShadowTex: slot.faceShadowTex,
    finalMaterialType: slot.material.type,
    shaderHasMainTex: uniforms?.uUseMainTex?.value ?? null,
    shaderHasShadowTex: uniforms?.uUseShadowTex?.value ?? null,
    shaderHasFaceShadowTex: uniforms?.uUseFaceShadowTex?.value ?? null,
    shaderHasValueTex: uniforms?.uUseValueTex?.value ?? null,
    shaderLightDirectionX: uniforms?.uLightDirection?.value?.x ?? null,
    shaderLightDirectionY: uniforms?.uLightDirection?.value?.y ?? null,
    shaderLightDirectionZ: uniforms?.uLightDirection?.value?.z ?? null,
    shaderShadowThreshold: uniforms?.uShadowThreshold?.value ?? null,
    shaderShadowWeight: uniforms?.uShadowWeight?.value ?? null,
    shaderShadowWidthOverride: uniforms?.uShadowWidthOverride?.value ?? null,
    shaderValueShadowInfluence: uniforms?.uValueShadowInfluence?.value ?? null,
    shaderHairShadowEnabled:
      slot.materialKind === "hair" ? uniforms?.uHairShadowEnabled?.value ?? null : null,
    shaderLambertEnabled: uniforms?.uUseLambert?.value ?? null,
    shaderBodyDebugMode: uniforms?.uBodyDebugMode?.value ?? null,
    shaderSpecularPower: uniforms?.uSpecularPower?.value ?? null,
    shaderRimThreshold: uniforms?.uRimThreshold?.value ?? null,
    shaderControllerRimThreshold: uniforms?.uControllerRimThreshold?.value ?? null,
    shaderRimIntensity: uniforms?.uRimIntensity?.value ?? null,
    shaderRimDirectionality: uniforms?.uRimDirectionality?.value ?? null,
    shaderCharacterAmbient: uniforms?.uCharacterAmbientIntensity?.value ?? null,
    shaderShadowTexWeight: uniforms?.uShadowTexWeight?.value ?? null,
    shaderSaturation: uniforms?.uSaturation?.value ?? null,
    shaderSkinTintEnabled: uniforms?.uSkinTintEnabled?.value ?? null,
    shaderSkinColorDefault: uniforms?.uSkinColorDefault?.value
      ? `#${uniforms.uSkinColorDefault.value.getHexString()}`
      : null,
    shaderSkinColor1: uniforms?.uSkinColor1?.value
      ? `#${uniforms.uSkinColor1.value.getHexString()}`
      : null,
    shaderSkinColor2: uniforms?.uSkinColor2?.value
      ? `#${uniforms.uSkinColor2.value.getHexString()}`
      : null,
    shaderFaceDebugMode: uniforms?.uFaceDebugMode?.value ?? null,
    shaderFaceSdfEnabled: uniforms?.uFaceSdfEnabled?.value ?? null,
    faceSdfCapable,
    faceSdfUv1Available,
    shaderAtlasTileX: uniforms?.uAtlasTile?.value?.x ?? null,
    shaderAtlasTileY: uniforms?.uAtlasTile?.value?.y ?? null,
    shaderAtlasSample: uniforms?.uAtlasSample?.value ?? null,
    shaderUseAtlas: uniforms?.uUseAtlas?.value ?? null,
    shaderAlphaScale: uniforms?.uAlphaScale?.value ?? null,
    shaderAlphaCutoff: uniforms?.uAlphaCutoff?.value ?? null,
    shaderStrictAlpha: uniforms?.uStrictAlpha?.value ?? null,
    shaderStencilWrite: slot.material.stencilWrite ?? null,
    shaderStencilRef: slot.material.stencilRef ?? null,
    shaderStencilFunc: slot.material.stencilFunc ?? null,
    shaderStencilFuncMask: slot.material.stencilFuncMask ?? null,
    shaderStencilWriteMask: slot.material.stencilWriteMask ?? null,
    shaderStencilZPass: slot.material.stencilZPass ?? null,
    shaderDepthFunc: slot.material.depthFunc ?? null,
    shaderDepthWrite: slot.material.depthWrite ?? null,
    shaderTransparent: slot.material.transparent ?? null,
    renderOrder: mesh.renderOrder,
  });
}

function pushLayerMaterialDebug(
  debug: RuntimeMaterialDebug[],
  meshName: string,
  sourceMaterialName: string,
  material: THREE.Material,
  includeAtlasCoordinates = true
) {
  const uniforms = material instanceof THREE.ShaderMaterial ? material.uniforms : null;
  debug.push({
    meshName,
    sourceMaterialName,
    resolvedKey: null,
    resolvedKind:
      typeof material.userData.pjskMaterialKind === "string"
        ? material.userData.pjskMaterialKind
        : null,
    usedOriginalMap: false,
    boundMainTex: null,
    boundShadowTex: null,
    boundValueTex: null,
    boundFaceShadowTex: null,
    finalMaterialType: material.type,
    shaderHasMainTex: uniforms?.uUseMainTex?.value ?? null,
    ...(includeAtlasCoordinates ? {
      shaderAtlasTileX: uniforms?.uAtlasTile?.value?.x ?? null,
      shaderAtlasTileY: uniforms?.uAtlasTile?.value?.y ?? null,
      shaderAtlasSample: uniforms?.uAtlasSample?.value ?? null,
    } : {}),
    shaderUseAtlas: uniforms?.uUseAtlas?.value ?? null,
    shaderAlphaScale: uniforms?.uAlphaScale?.value ?? null,
    shaderAlphaCutoff: uniforms?.uAlphaCutoff?.value ?? null,
    shaderStrictAlpha: uniforms?.uStrictAlpha?.value ?? null,
    shaderStencilWrite: material.stencilWrite ?? null,
    shaderStencilRef: material.stencilRef ?? null,
    shaderStencilFunc: material.stencilFunc ?? null,
    shaderStencilFuncMask: material.stencilFuncMask ?? null,
    shaderStencilWriteMask: material.stencilWriteMask ?? null,
    shaderStencilZPass: material.stencilZPass ?? null,
    shaderDepthFunc: material.depthFunc ?? null,
    shaderDepthWrite: material.depthWrite ?? null,
    shaderTransparent: material.transparent ?? null,
    renderOrder: getHeadLayerRenderOrder(
      typeof material.userData.pjskMaterialKind === "string"
        ? material.userData.pjskMaterialKind
        : ""
    ),
  });
}

function cloneFaceShaderMaterial(
  source: THREE.ShaderMaterial,
  params: {
    mainTex?: THREE.Texture | null;
    shadowTex?: THREE.Texture | null;
    valueTex?: THREE.Texture | null;
    faceShadowTex?: THREE.Texture | null;
    baseColor?: THREE.ColorRepresentation;
    warmColor?: THREE.ColorRepresentation;
    skinColorDefault?: THREE.ColorRepresentation;
    skinColor1?: THREE.ColorRepresentation;
    skinColor2?: THREE.ColorRepresentation;
    lighting?: MaterialLightingSettings;
  }
) {
  const material = source.clone();
  updateSekaiFaceMaterial(material, {
    baseColor: params.baseColor ?? `#${source.uniforms.uBaseColor.value.getHexString()}`,
    warmColor: params.warmColor ?? `#${source.uniforms.uWarmColor.value.getHexString()}`,
    skinColorDefault:
      params.skinColorDefault ?? `#${source.uniforms.uSkinColorDefault.value.getHexString()}`,
    skinColor1: params.skinColor1 ?? `#${source.uniforms.uSkinColor1.value.getHexString()}`,
    skinColor2: params.skinColor2 ?? `#${source.uniforms.uSkinColor2.value.getHexString()}`,
    mainTex: params.mainTex ?? null,
    shadowTex: params.shadowTex ?? null,
    valueTex: params.valueTex ?? null,
    faceShadowTex: params.faceShadowTex ?? null,
    lightDirection: source.uniforms.uLightDirection.value.clone(),
    lightIntensity: source.uniforms.uLightIntensity.value,
    ambientIntensity: source.uniforms.uAmbientIntensity.value,
    headDotDirectionalLight: source.uniforms.uHeadDotDirectionalLight?.value,
    faceDebugMode: source.uniforms.uFaceDebugMode?.value ?? 0,
    faceSdfEnabled: false,
    useValueTex: params.lighting?.useValueTex ?? Boolean(params.valueTex),
    shadowThreshold:
      params.lighting?.sekaiShadowThreshold ?? source.uniforms.uShadowThreshold?.value ?? 0.5,
    shadowWeight: source.uniforms.uShadowWeight?.value ?? 1.0,
    shadowWidth: params.lighting?.shadowWidth ?? source.uniforms.uShadowWidth?.value ?? 0.0,
    fadeMode: params.lighting?.fadeMode ?? source.uniforms.uFadeMode?.value ?? 0.0,
    useLambert: params.lighting?.useLambert ?? true,
    shadowTexWeight:
      params.lighting?.shadowTexWeight ?? source.uniforms.uShadowTexWeight?.value ?? 1.0,
    faceSdfMirror: params.lighting?.faceSdfMirror ?? source.uniforms.uFaceSdfMirror?.value ?? 1.0,
    faceSdfBias: params.lighting?.faceSdfBias ?? source.uniforms.uFaceSdfBias?.value ?? 0.0,
    useFaceShadowLimiter:
      params.lighting?.useFaceShadowLimiter ??
      ((source.uniforms.uUseFaceShadowLimiter?.value ?? 1.0) > 0.5),
    faceShadowLimitRange:
      params.lighting?.rangeLimit ?? source.uniforms.uFaceShadowLimitRange?.value ?? 0,
  });
  return material;
}

function configureBaseStencilClear(material: THREE.Material) {
  material.stencilWrite = true;
  material.stencilRef = 0;
  material.stencilFunc = THREE.AlwaysStencilFunc;
  material.stencilFuncMask = 0xff;
  material.stencilWriteMask = 0xff;
  material.stencilFail = THREE.KeepStencilOp;
  material.stencilZFail = THREE.KeepStencilOp;
  material.stencilZPass = THREE.ReplaceStencilOp;
}

function disposeReplacedMaterials(
  originalMaterials: THREE.Material[],
  reboundMaterials: THREE.Material[]
) {
  const preserved = new Set(reboundMaterials);
  for (const material of originalMaterials) {
    if (!preserved.has(material)) {
      material.dispose();
    }
  }
}

function hasFaceSdfUv1Attribute(mesh: THREE.Mesh) {
  return Boolean(mesh.geometry?.getAttribute("uv1"));
}

function createEyeLayerOptions(
  eyeController: CharacterEyeMaterialController | null | undefined,
  lighting: MaterialLightingSettings | undefined
) {
  return {
    tintColor: eyeController?.tintColor,
    emissionColor: eyeController?.emissionColor,
    lightInfluence: eyeController?.lightInfluence ?? lighting?.lightInfluence,
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
  };
}

function createHighlightLayerOptions(
  eyeController: CharacterEyeMaterialController | null | undefined,
  lighting: MaterialLightingSettings | undefined
) {
  return {
    ...createEyeLayerOptions(eyeController, lighting),
    highlightInfluence:
      eyeController?.lightInfluenceForEyeHighlight ?? lighting?.lightInfluenceForEyeHighlight,
  };
}

export async function bindHeadRuntimeMaterials({
  root,
  headAsset,
  textureLoader,
  templates,
  view,
  hair,
  eyeController,
  debug = [],
}: {
  root: THREE.Object3D;
  headAsset: HeadAssetManifest;
  textureLoader: RuntimeTextureLoader;
  templates: {
    body: THREE.ShaderMaterial;
    hair: THREE.ShaderMaterial;
    face: THREE.ShaderMaterial;
  };
  view: {
    bodyDebugMode: number;
    faceDebugMode: number;
    faceSdfEnabled: boolean;
  };
  hair: {
    controllerPresent: boolean;
    proximityShadowEnabled: boolean;
    headPosition: THREE.Vector3;
  };
  eyeController?: CharacterEyeMaterialController | null;
  debug?: RuntimeMaterialDebug[];
}) {
  const overlayMeshesToAttach: Array<{ parent: THREE.Object3D; mesh: THREE.Mesh }> = [];
  const stencilPrepassMeshesToAttach: Array<{ parent: THREE.Object3D; mesh: THREE.Mesh }> = [];
  const topLayerMeshesToAttach: Array<{ parent: THREE.Object3D; mesh: THREE.Mesh }> = [];

  const slots = await Promise.all(headAsset.faceMaterials.map(async (slot): Promise<HeadRuntimeMaterialSlot> => {
    const [mainTex, shadowTex, valueTex, faceShadowTex] = await Promise.all([
      loadRuntimeTexture(textureLoader, slot.mainTex),
      loadRuntimeTexture(textureLoader, slot.shadowTex),
      loadRuntimeTexture(textureLoader, slot.valueTex, THREE.NoColorSpace),
      loadRuntimeTexture(textureLoader, slot.faceShadowTex, THREE.NoColorSpace),
    ]);
    if (!slot.materialKind) {
      throw new Error(
        `Head material ${slot.materialName ?? slot.materialKey} is missing materialKind.`
      );
    }
    const kind = slot.materialKind;
    const isAccessory = Boolean(slot.isAccessory) || kind === "accessory";
    const lighting = tuneLightingForPreview(kind, slot.lighting);
    let material: THREE.Material;
    let topLayerMaterial: THREE.Material | null = null;

    if (kind === "eye") {
      const layerOptions = createEyeLayerOptions(eyeController, lighting);
      material = createSekaiLayerMaterial(mainTex, "eye", eyeController?.baseTiling, {
        ...layerOptions,
        strictAlpha: true,
      });
      material.side = THREE.FrontSide;
      const stencilPrepassMaterial = createSekaiLayerMaterial(
        mainTex,
        "eye",
        eyeController?.baseTiling,
        layerOptions
      );
      stencilPrepassMaterial.side = THREE.FrontSide;
      configureSekaiFaceLayerStencilPrepass(stencilPrepassMaterial, CHARACTER_STENCIL_BIT);
      stencilPrepassMaterial.userData.pjskMaterialKind = "eye_stencil_prepass";
      const overlayMaterial = createSekaiLayerMaterial(
        mainTex,
        "eye",
        eyeController?.baseTiling,
        { ...layerOptions, strictAlpha: true }
      );
      overlayMaterial.side = THREE.FrontSide;
      configureSekaiEyelashPass(overlayMaterial, CHARACTER_STENCIL_BIT, "eye");
      overlayMaterial.userData.pjskMaterialKind = "eye_through_hair";
      material.userData.pjskOverlayMaterial = overlayMaterial;
      material.userData.pjskStencilPrepassMaterial = stencilPrepassMaterial;
    } else if (kind === "eyelight") {
      const layerOptions = createHighlightLayerOptions(eyeController, lighting);
      topLayerMaterial = createSekaiLayerMaterial(
        mainTex,
        "eyelight",
        eyeController?.highlightTiling,
        layerOptions
      );
      topLayerMaterial.side = THREE.FrontSide;
      material = topLayerMaterial.clone();
      material.visible = false;
      material.colorWrite = false;
      material.depthWrite = false;
      const overlayMaterial = createSekaiLayerMaterial(
        mainTex,
        "eyelight",
        eyeController?.highlightTiling,
        layerOptions
      );
      overlayMaterial.side = THREE.FrontSide;
      configureSekaiEyelashPass(overlayMaterial, CHARACTER_STENCIL_BIT, "eyelight");
      overlayMaterial.userData.pjskMaterialKind = "eyelight_through_hair";
      material.userData.pjskOverlayMaterial = overlayMaterial;
    } else if (kind === "eyelash" || kind === "eyebrow") {
      material = createSekaiLayerMaterial(mainTex, "alpha", null, {
        vertexBViewOffset: 0.015,
      });
      material.side = THREE.FrontSide;
      const stencilPrepassMaterial = createSekaiLayerMaterial(mainTex, "alpha", null, {
        strictAlpha: true,
      });
      stencilPrepassMaterial.side = THREE.FrontSide;
      configureSekaiFaceLayerStencilPrepass(stencilPrepassMaterial, CHARACTER_STENCIL_BIT);
      stencilPrepassMaterial.userData.pjskMaterialKind = kind === "eyelash"
        ? "eyelash_stencil_prepass"
        : "eyebrow_stencil_prepass";
      const overlayMaterial = createSekaiLayerMaterial(mainTex, "alpha", null, {
        strictAlpha: true,
      });
      overlayMaterial.side = THREE.FrontSide;
      configureSekaiEyelashPass(overlayMaterial, CHARACTER_STENCIL_BIT, kind);
      overlayMaterial.userData.pjskMaterialKind = kind === "eyelash"
        ? "eyelash_through_hair"
        : "eyebrow_through_hair";
      material.userData.pjskOverlayMaterial = overlayMaterial;
      material.userData.pjskStencilPrepassMaterial = stencilPrepassMaterial;
    } else if (kind === "hair") {
      material = cloneBodyShaderMaterial(templates.hair, {
        mainTex,
        shadowTex,
        valueTex,
        baseColor: headAsset.proxy.hairColor,
        shadowColor: headAsset.proxy.hairShadowColor,
        lighting,
        skinTintEnabled: false,
        hairShadowEnabled:
          hair.proximityShadowEnabled &&
          hair.controllerPresent &&
          lighting?.faceSphereShadowEdge != null &&
          lighting.faceSphereShadowSmoothness != null &&
          lighting.faceSphereShadowWeight != null,
        useLambert: hair.controllerPresent ? true : (lighting?.useLambert ?? true),
        headPosition: hair.headPosition,
        bodyDebugMode: view.bodyDebugMode,
        alphaCutoff: HAIR_ALPHA_CUTOFF,
      });
      configureSekaiHairStencil(material, CHARACTER_STENCIL_BIT);
    } else if (kind === "accessory" || kind === "body") {
      material = cloneBodyShaderMaterial(templates.body, {
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
        bodyDebugMode: view.bodyDebugMode,
        alphaCutoff: kind === "accessory" ? ACCESSORY_ALPHA_CUTOFF : 0,
      });
      configureBaseStencilClear(material);
    } else {
      const faceMaterial = cloneFaceShaderMaterial(templates.face, {
        mainTex,
        shadowTex,
        valueTex,
        faceShadowTex,
        baseColor: headAsset.proxy.faceColor,
        warmColor: headAsset.proxy.faceShadeColor,
        skinColorDefault: headAsset.proxy.skinColorDefault ?? headAsset.proxy.faceColor,
        skinColor1: headAsset.proxy.skinColor1 ?? headAsset.proxy.faceShadeColor,
        skinColor2: headAsset.proxy.skinColor2 ?? headAsset.proxy.faceShadeColor,
        lighting,
      });
      if (faceMaterial.uniforms.uFaceDebugMode) {
        faceMaterial.uniforms.uFaceDebugMode.value = view.faceDebugMode;
      }
      faceMaterial.side = THREE.FrontSide;
      configureBaseStencilClear(faceMaterial);
      material = faceMaterial;
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
    return {
      key: slot.materialKey,
      meshKey: normalizeMeshSlotName(slot.meshName),
      materialKey: slot.materialKey,
      materialKind: kind,
      mainTex: slot.mainTex ?? null,
      shadowTex: slot.shadowTex ?? null,
      valueTex: slot.valueTex ?? null,
      faceShadowTex: slot.faceShadowTex ?? null,
      material,
      overlayMaterial: material.userData.pjskOverlayMaterial instanceof THREE.Material
        ? material.userData.pjskOverlayMaterial
        : null,
      stencilPrepassMaterial:
        material.userData.pjskStencilPrepassMaterial instanceof THREE.Material
          ? material.userData.pjskStencilPrepassMaterial
          : null,
      topLayerMaterial,
    };
  }));

  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (
      !mesh.isMesh ||
      mesh.userData.pjskEyeThroughHairOverlay ||
      mesh.userData.pjskEyeThroughHairStencilPrepass
    ) {
      return;
    }
    const originalMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const meshKey = normalizeMeshSlotName(mesh.name);
    const meshSlots = slots.filter((slot) => slot.meshKey === meshKey);
    if (meshSlots.length === 0) {
      return;
    }

    const resolvedSlotsByIndex: Array<HeadRuntimeMaterialSlot | null> = [];
    const rebound = originalMaterials.map((original, index) => {
      const originalMaterialKey = typeof original.userData.pjskMaterialKey === "string"
        ? original.userData.pjskMaterialKey
        : "";
      if (!originalMaterialKey) {
        throw new Error(
          `Head mesh '${mesh.name}' material '${original.name}' is missing pjskMaterialKey; regenerate it with Haruki-3D-Exporter materialKey runtime support.`
        );
      }
      const resolvedSlot = meshSlots.find((slot) => slot.materialKey === originalMaterialKey);
      if (!resolvedSlot) {
        throw new Error(
          `Head mesh '${mesh.name}' material key '${originalMaterialKey}' was not found in head material slots.`
        );
      }

      const mainMap = extractMaterialColorMap(original);
      syncReplacementTextureFromOriginal(resolvedSlot.material, mainMap);
      if (resolvedSlot.overlayMaterial) {
        syncReplacementTextureFromOriginal(resolvedSlot.overlayMaterial, mainMap);
      }
      if (resolvedSlot.stencilPrepassMaterial) {
        syncReplacementTextureFromOriginal(resolvedSlot.stencilPrepassMaterial, mainMap);
      }
      if (resolvedSlot.topLayerMaterial) {
        syncReplacementTextureFromOriginal(resolvedSlot.topLayerMaterial, mainMap);
      }

      let usedOriginalMap = false;
      if (
        resolvedSlot.material instanceof THREE.ShaderMaterial &&
        !resolvedSlot.material.uniforms.uMainTex.value &&
        mainMap
      ) {
        resolvedSlot.material.uniforms.uMainTex.value = mainMap;
        resolvedSlot.material.uniforms.uUseMainTex.value = 1;
        for (const layerMaterial of [
          resolvedSlot.overlayMaterial,
          resolvedSlot.stencilPrepassMaterial,
          resolvedSlot.topLayerMaterial,
        ]) {
          if (layerMaterial instanceof THREE.ShaderMaterial) {
            layerMaterial.uniforms.uMainTex.value = mainMap;
            layerMaterial.uniforms.uUseMainTex.value = 1;
          }
        }
        if ("uBaseColor" in resolvedSlot.material.uniforms) {
          resolvedSlot.material.uniforms.uBaseColor.value.set("#ffffff");
        }
        usedOriginalMap = true;
      }
      if (
        resolvedSlot.material instanceof THREE.MeshBasicMaterial &&
        !resolvedSlot.material.map &&
        mainMap
      ) {
        resolvedSlot.material.map = mainMap;
        resolvedSlot.material.needsUpdate = true;
        usedOriginalMap = true;
      }

      mesh.renderOrder = getHeadLayerRenderOrder(resolvedSlot.materialKind);
      mesh.userData.pjskMaterialKind = resolvedSlot.materialKind;
      const uniforms = resolvedSlot.material instanceof THREE.ShaderMaterial
        ? resolvedSlot.material.uniforms
        : null;
      const faceSdfUv1Available = hasFaceSdfUv1Attribute(mesh);
      const faceLighting = resolvedSlot.material.userData.pjskLighting as
        | MaterialLightingSettings
        | undefined;
      const faceSdfCapable =
        resolvedSlot.materialKind === "face_sdf" &&
        Boolean(resolvedSlot.faceShadowTex) &&
        faceLighting?.useFaceSdf !== false;
      if (resolvedSlot.material instanceof THREE.ShaderMaterial && uniforms?.uFaceShadowTex) {
        resolvedSlot.material.userData.pjskFaceSdfCapable = faceSdfCapable;
        resolvedSlot.material.userData.pjskFaceSdfUv1Available = faceSdfUv1Available;
        uniforms.uFaceSdfEnabled.value = view.faceSdfEnabled && faceSdfCapable ? 1 : 0;
      }
      resolvedSlotsByIndex[index] = resolvedSlot;
      pushBoundMaterialDebug(
        debug,
        mesh,
        original,
        resolvedSlot,
        usedOriginalMap,
        faceSdfCapable,
        faceSdfUv1Available
      );
      return resolvedSlot.material;
    });

    const meshRenderOrder = resolvedSlotsByIndex.reduce((minimum, slot) => {
      return slot
        ? Math.min(minimum, getHeadLayerRenderOrder(slot.materialKind))
        : minimum;
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
      const resolvedSlot = resolvedSlotsByIndex[group.materialIndex];
      const topLayerMaterial = resolvedSlot?.topLayerMaterial ?? null;
      if (topLayerMaterial) {
        const materialIndex = topLayerMaterials.length;
        topLayerMaterials.push(topLayerMaterial);
        topLayerGroups.push({ start: group.start, count: group.count, materialIndex });
        pushLayerMaterialDebug(
          debug,
          mesh.name,
          originalMaterials[group.materialIndex]?.name ?? "",
          topLayerMaterial
        );
      }

      const overlayMaterial = resolvedSlot?.overlayMaterial ?? null;
      if (overlayMaterial) {
        const materialIndex = overlayMaterials.length;
        overlayMaterials.push(overlayMaterial);
        overlayGroups.push({ start: group.start, count: group.count, materialIndex });
      }

      const stencilPrepassMaterial = resolvedSlot?.stencilPrepassMaterial ?? null;
      if (stencilPrepassMaterial) {
        const materialIndex = stencilPrepassMaterials.length;
        stencilPrepassMaterials.push(stencilPrepassMaterial);
        stencilPrepassGroups.push({ start: group.start, count: group.count, materialIndex });
        pushLayerMaterialDebug(
          debug,
          mesh.name,
          originalMaterials[group.materialIndex]?.name ?? "",
          stencilPrepassMaterial,
          false
        );
      }

      if (overlayMaterial) {
        pushLayerMaterialDebug(
          debug,
          mesh.name,
          originalMaterials[group.materialIndex]?.name ?? "",
          overlayMaterial
        );
      }
    }

    disposeReplacedMaterials(originalMaterials, rebound);
    sortHeadMeshGroupsByMaterialKind(mesh, rebound);
    mesh.material = Array.isArray(mesh.material) || rebound.length > 1 ? rebound : rebound[0];
    mesh.castShadow = false;
    mesh.receiveShadow = false;

    for (const group of stencilPrepassGroups) {
      const material = stencilPrepassMaterials[group.materialIndex];
      if (!material) {
        continue;
      }
      const passMesh = createSekaiThroughHairOverlayMesh(
        mesh,
        [{ start: group.start, count: group.count, materialIndex: 0 }],
        [material]
      );
      if (passMesh && mesh.parent) {
        passMesh.name = `${mesh.name}_eye_stencil_prepass`;
        passMesh.userData.pjskEyeThroughHairPassKind = "stencil_prepass";
        passMesh.userData.pjskEyeThroughHairStencilPrepass = true;
        passMesh.userData.pjskEyeThroughHairOverlay = false;
        stencilPrepassMeshesToAttach.push({ parent: mesh.parent, mesh: passMesh });
      }
    }
    for (const group of overlayGroups) {
      const material = overlayMaterials[group.materialIndex];
      if (!material) {
        continue;
      }
      const passMesh = createSekaiThroughHairOverlayMesh(
        mesh,
        [{ start: group.start, count: group.count, materialIndex: 0 }],
        [material]
      );
      if (passMesh && mesh.parent) {
        overlayMeshesToAttach.push({ parent: mesh.parent, mesh: passMesh });
      }
    }
    for (const group of topLayerGroups) {
      const material = topLayerMaterials[group.materialIndex];
      if (!material) {
        continue;
      }
      const passMesh = createGroupedLayerMesh(
        mesh,
        [{ start: group.start, count: group.count, materialIndex: 0 }],
        [material],
        "eyelight_top_layer"
      );
      if (passMesh && mesh.parent) {
        passMesh.userData.pjskTopLayerSource = mesh;
        passMesh.userData.pjskMaterialKind =
          typeof material.userData.pjskMaterialKind === "string"
            ? material.userData.pjskMaterialKind
            : null;
        topLayerMeshesToAttach.push({ parent: mesh.parent, mesh: passMesh });
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
  return debug;
}

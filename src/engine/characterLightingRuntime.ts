import * as THREE from "three";
import type {
  BodyAssetManifest,
  HeadAssetManifest,
  MaterialLightingSettings,
  PreviewLightState,
} from "../data/sampleScene";
import {
  applySekaiOutlineController,
  sekaiCostumeShopOutlineControllerDefaults,
} from "./sekaiOutlineRuntime";
export {
  evaluateSekaiOutlineFovFactor,
  sekaiCostumeShopOutlineSettings,
} from "./sekaiOutlineRuntime";
import {
  updateSekaiBodyCamera,
  updateSekaiBodyMaterial,
} from "../materials/sekaiBodyMaterial";
import {
  updateSekaiFaceMaterial,
  updateSekaiFaceShadowParameters,
} from "../materials/sekaiFaceMaterial";
import {
  getSekaiPreviewRimDirection,
  updateSekaiEyelashPassView,
  type RuntimeMaterialDebug,
} from "./characterMaterialRuntime";

export type BodyDebugMode =
  | "off" | "skin" | "h_r" | "h_g" | "h_b" | "h_a" | "vertex_r" | "vertex_g"
  | "base_shadow" | "ndotl_raw" | "h_b_adjusted_shadow" | "ambient_target"
  | "ambient_weight" | "ambient_tint" | "specular" | "specular_mask"
  | "specular_add" | "rim_raw" | "rim_add" | "rim_gate" | "rim_color"
  | "rim_scalar" | "toon_luma" | "shadow_mask" | "shadow_target";
export type FaceSdfDebugMode = "off" | "sdf" | "mask" | "limit" | "basis" | "range";
export type FaceSdfDebugLightMode = "scene" | "front" | "left" | "right" | "back";
export type RenderIsolationMode =
  | "normal" | "face_sdf" | "no_face_sdf" | "no_face_layers" | "no_eye_through_hair"
  | "eye_through_hair_only" | "eye_through_hair_eye_only"
  | "eye_through_hair_eyebrow_only" | "eye_through_hair_eyelash_only"
  | "no_eye_through_hair_eye" | "no_eye_through_hair_eyebrow"
  | "no_eye_through_hair_eyelash" | "no_eye_through_hair_eyelash_overlay"
  | "no_eye_through_hair_eyelash_prepass" | "eyelight_only" | "no_eyelight"
  | "outline_only" | "no_outline" | "no_body_outline" | "no_hair_outline"
  | "no_face_outline";
export type HairShadowMode = "off" | "sekai_head_position" | "head_proximity";

type CharacterLightingDebug = {
  hairShadowMode: HairShadowMode;
  body: RuntimeMaterialDebug[];
  head: RuntimeMaterialDebug[];
};

type CharacterLightingRuntimeOptions = {
  bodyMaterial: THREE.ShaderMaterial;
  hairMaterial: THREE.ShaderMaterial;
  faceMaterial: THREE.ShaderMaterial;
  bodySlot: THREE.Group;
  headSlot: THREE.Group;
  directionalLight: THREE.DirectionalLight;
  fillLight: THREE.AmbientLight;
  debug: CharacterLightingDebug;
  valueShadowInfluence?: number;
};

function normalizeHairShadowMode(mode: HairShadowMode): HairShadowMode {
  return mode === "head_proximity" ? "sekai_head_position" : mode;
}

const bodyDebugUniformByMode: Readonly<Partial<Record<BodyDebugMode, number>>> = {
  skin: 1, h_r: 4, h_g: 5, h_b: 6, h_a: 7, vertex_r: 8, vertex_g: 9,
  base_shadow: 10, ndotl_raw: 11, h_b_adjusted_shadow: 12, ambient_target: 13,
  ambient_weight: 14, ambient_tint: 15, specular: 16, rim_raw: 17, rim_add: 18,
  rim_gate: 19, rim_color: 20, rim_scalar: 21, specular_mask: 22, specular_add: 23,
  toon_luma: 24, shadow_mask: 25, shadow_target: 26,
};

const faceDebugUniformByMode: Readonly<Partial<Record<FaceSdfDebugMode, number>>> = {
  sdf: 1,
  mask: 2,
  limit: 3,
  basis: 4,
  range: 5,
};

export function bodyDebugModeToUniform(mode: BodyDebugMode) {
  return bodyDebugUniformByMode[mode] ?? 0;
}

export function faceSdfDebugModeToUniform(mode: FaceSdfDebugMode) {
  return faceDebugUniformByMode[mode] ?? 0;
}

function isFaceLayerMaterialKind(kind: unknown) {
  return kind === "eyelash" || kind === "eyebrow" || kind === "eye" || kind === "eyelight";
}

function isFaceOrFaceLayerMaterialKind(kind: unknown) {
  return kind === "face" || kind === "face_sdf" || isFaceLayerMaterialKind(kind);
}

function isEyeThroughHairSourceAllowed(sourceKind: string, mode: RenderIsolationMode) {
  switch (mode) {
    case "eye_through_hair_eye_only": return sourceKind === "eye";
    case "eye_through_hair_eyebrow_only": return sourceKind === "eyebrow";
    case "eye_through_hair_eyelash_only": return sourceKind === "eyelash";
    case "no_eye_through_hair_eye": return sourceKind !== "eye";
    case "no_eye_through_hair_eyebrow": return sourceKind !== "eyebrow";
    case "no_eye_through_hair_eyelash": return sourceKind !== "eyelash";
    default: return true;
  }
}

function isEyeThroughHairPassAllowed(sourceKind: string, passKind: string, mode: RenderIsolationMode) {
  if (mode === "no_eye_through_hair_eyelash_overlay") {
    return sourceKind !== "eyelash" || passKind !== "overlay";
  }
  if (mode === "no_eye_through_hair_eyelash_prepass") {
    return sourceKind !== "eyelash" || passKind !== "stencil_prepass";
  }
  return true;
}

function isOutlineHiddenByIsolation(kind: string, mode: RenderIsolationMode) {
  switch (mode) {
    case "no_body_outline": return kind === "body";
    case "no_hair_outline": return kind === "hair";
    case "no_face_layers":
    case "no_face_outline": return isFaceOrFaceLayerMaterialKind(kind);
    default: return false;
  }
}

export class CharacterLightingRuntime {
  private readonly cameraDirection = new THREE.Vector3();
  private hairShadowMode: HairShadowMode = "sekai_head_position";
  private bodyDebugMode: BodyDebugMode = "off";
  private toonShadowWidthOverride: number | null = null;
  private toonValueShadowInfluence: number;
  private faceSdfEnabled = false;
  private faceSdfDebugMode: FaceSdfDebugMode = "off";
  private faceSdfDebugLightMode: FaceSdfDebugLightMode = "scene";
  private renderIsolationMode: RenderIsolationMode = "normal";
  private controllerOutlineColor = new THREE.Color().setRGB(
    sekaiCostumeShopOutlineControllerDefaults.color.r,
    sekaiCostumeShopOutlineControllerDefaults.color.g,
    sekaiCostumeShopOutlineControllerDefaults.color.b
  );
  private controllerOutlineBlending: number =
    sekaiCostumeShopOutlineControllerDefaults.blending;

  constructor(private readonly options: CharacterLightingRuntimeOptions) {
    this.toonValueShadowInfluence = options.valueShadowInfluence ?? 1;
    options.debug.hairShadowMode = this.hairShadowMode;
  }

  private get slots() {
    return [this.options.bodySlot, this.options.headSlot];
  }

  private get debugEntries() {
    return [this.options.debug.body, this.options.debug.head];
  }

  private forEachShaderMaterial(apply: (material: THREE.ShaderMaterial) => void) {
    for (const slot of this.slots) {
      slot.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh) return;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of materials) {
          if (material instanceof THREE.ShaderMaterial) apply(material);
        }
      });
    }
  }

  getBindingView() {
    return {
      bodyDebugMode: bodyDebugModeToUniform(this.bodyDebugMode),
      faceDebugMode: faceSdfDebugModeToUniform(this.faceSdfDebugMode),
      faceSdfEnabled: this.shouldEnableFaceSdf(),
      shadowWidthOverride: this.toonShadowWidthOverride,
      valueShadowInfluence: this.toonValueShadowInfluence,
      proximityHairShadowEnabled: this.isHairShadowEnabled(),
    };
  }

  getHairShadowMode() { return this.hairShadowMode; }
  isHairShadowEnabled() { return this.hairShadowMode === "sekai_head_position"; }

  setHairShadowMode(mode: HairShadowMode) {
    this.hairShadowMode = normalizeHairShadowMode(mode);
    this.options.debug.hairShadowMode = this.hairShadowMode;
    this.applyHairShadowMode();
  }

  setFaceSdfDebugMode(mode: FaceSdfDebugMode) {
    this.faceSdfDebugMode = mode;
    this.applyFaceSdfDebug();
  }

  setFaceSdfEnabled(enabled: boolean) {
    this.faceSdfEnabled = enabled;
    this.applyFaceSdfEnabled();
  }

  setBodyDebugMode(mode: BodyDebugMode) {
    this.bodyDebugMode = mode;
    this.applyBodyDebug();
  }

  setToonShadowPreview(shadowWidthOverride: number | null, valueShadowInfluence: number) {
    this.toonShadowWidthOverride = shadowWidthOverride === null ? null : Math.max(0, shadowWidthOverride);
    this.toonValueShadowInfluence = THREE.MathUtils.clamp(valueShadowInfluence, 0, 1);
    this.applyToonShadowPreview();
  }

  setFaceSdfDebugLightMode(mode: FaceSdfDebugLightMode) {
    this.faceSdfDebugLightMode = mode;
    this.applyFaceSdfDebug();
  }

  setRenderIsolationMode(mode: RenderIsolationMode) {
    this.renderIsolationMode = mode;
    this.applyRenderIsolationMode();
  }

  resolveFaceShadowLightDirection(
    sceneDirection: THREE.Vector3,
    faceRight: THREE.Vector3,
    faceForward: THREE.Vector3
  ) {
    switch (this.faceSdfDebugLightMode) {
      case "front": return faceForward.clone();
      case "left": return faceRight.clone().negate();
      case "right": return faceRight.clone();
      case "back": return faceForward.clone().negate();
      default: return sceneDirection.clone();
    }
  }

  applyCharacterView() {
    this.applyRenderIsolationMode();
    this.applyFaceSdfDebug();
    this.applyBodyDebug();
    this.applyToonShadowPreview();
    this.applyHairShadowMode();
  }

  private shouldEnableFaceSdf() {
    if (this.renderIsolationMode === "no_face_sdf") return false;
    return this.faceSdfEnabled || this.renderIsolationMode === "face_sdf";
  }

  private applyFaceSdfEnabled() {
    const enabled = this.shouldEnableFaceSdf();
    const apply = (material: THREE.ShaderMaterial) => {
      if (material.uniforms.uFaceSdfEnabled) {
        material.uniforms.uFaceSdfEnabled.value = enabled && material.userData.pjskFaceSdfCapable === true ? 1 : 0;
      }
    };
    apply(this.options.faceMaterial);
    this.forEachShaderMaterial(apply);
    for (const entries of this.debugEntries) {
      for (const entry of entries) {
        if (entry.shaderFaceSdfEnabled !== undefined || entry.resolvedKind === "face_sdf") {
          entry.shaderFaceSdfEnabled = enabled && entry.faceSdfCapable === true ? 1 : 0;
        }
      }
    }
  }

  private applyFaceSdfDebug() {
    const value = faceSdfDebugModeToUniform(this.faceSdfDebugMode);
    this.options.faceMaterial.uniforms.uFaceDebugMode.value = value;
    this.forEachShaderMaterial((material) => {
      if (material.uniforms.uFaceDebugMode) material.uniforms.uFaceDebugMode.value = value;
    });
    for (const entries of this.debugEntries) {
      for (const entry of entries) {
        if (entry.resolvedKind === "face_sdf" || entry.shaderFaceDebugMode !== undefined) {
          entry.shaderFaceDebugMode = value;
        }
      }
    }
  }

  private applyBodyDebug() {
    const value = bodyDebugModeToUniform(this.bodyDebugMode);
    const apply = (material: THREE.ShaderMaterial) => {
      if (material.uniforms.uBodyDebugMode) material.uniforms.uBodyDebugMode.value = value;
    };
    apply(this.options.bodyMaterial);
    apply(this.options.hairMaterial);
    this.forEachShaderMaterial(apply);
    for (const entries of this.debugEntries) {
      for (const entry of entries) {
        if (entry.shaderBodyDebugMode !== undefined || entry.resolvedKind === "body") {
          entry.shaderBodyDebugMode = value;
        }
      }
    }
  }

  private applyToonShadowPreview() {
    const width = this.toonShadowWidthOverride ?? -1;
    const apply = (material: THREE.Material) => {
      if (!(material instanceof THREE.ShaderMaterial)) return;
      if (material.uniforms.uShadowWidthOverride) material.uniforms.uShadowWidthOverride.value = width;
      if (material.uniforms.uValueShadowInfluence) material.uniforms.uValueShadowInfluence.value = this.toonValueShadowInfluence;
    };
    apply(this.options.bodyMaterial);
    apply(this.options.hairMaterial);
    this.forEachShaderMaterial(apply);
    for (const entries of this.debugEntries) {
      for (const entry of entries) {
        if (entry.shaderShadowWidthOverride !== undefined && entry.shaderShadowWidthOverride !== null &&
            entry.shaderValueShadowInfluence !== undefined && entry.shaderValueShadowInfluence !== null) {
          entry.shaderShadowWidthOverride = width;
          entry.shaderValueShadowInfluence = this.toonValueShadowInfluence;
        }
      }
    }
  }

  private applyHairShadowMode() {
    const enabled = this.isHairShadowEnabled() ? 1 : 0;
    if (this.options.hairMaterial.uniforms.uHairShadowEnabled) {
      this.options.hairMaterial.uniforms.uHairShadowEnabled.value = enabled;
    }
    this.forEachShaderMaterial((material) => {
      if (material.userData.pjskMaterialKind === "hair" && material.uniforms.uHairShadowEnabled) {
        material.uniforms.uHairShadowEnabled.value = enabled;
      }
    });
    for (const entry of this.options.debug.head) {
      if (entry.resolvedKind === "hair" && entry.shaderHairShadowEnabled !== undefined) {
        entry.shaderHairShadowEnabled = enabled;
      }
    }
  }

  applyRenderIsolationMode() {
    const faceSdfEnabled = this.shouldEnableFaceSdf();
    const mode = this.renderIsolationMode;
    const eyelightOnly = mode === "eyelight_only";
    const noEyelight = mode === "no_eyelight";
    const faceLayersVisible = mode !== "no_face_layers";
    const outlineOnly = mode === "outline_only";
    const outlineVisible = mode !== "no_outline";
    const noEyeThroughHair = mode === "no_eye_through_hair";
    const eyeThroughHairOnly = mode === "eye_through_hair_only" || mode === "eye_through_hair_eye_only" ||
      mode === "eye_through_hair_eyebrow_only" || mode === "eye_through_hair_eyelash_only";
    const apply = (node: THREE.Object3D) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (mesh.userData.pjskEyeThroughHairOverlay || mesh.userData.pjskEyeThroughHairStencilPrepass) {
        const source = mesh.userData.pjskEyeThroughHairSource;
        const sourceKind = typeof mesh.userData.pjskEyeThroughHairSourceKind === "string" ? mesh.userData.pjskEyeThroughHairSourceKind : "";
        const passKind = typeof mesh.userData.pjskEyeThroughHairPassKind === "string" ? mesh.userData.pjskEyeThroughHairPassKind : "";
        const sourceVisible = source instanceof THREE.Object3D ? source.visible : true;
        if (source instanceof THREE.Object3D) mesh.layers.mask = source.layers.mask;
        mesh.visible = sourceVisible && !outlineOnly && !eyelightOnly && !noEyeThroughHair &&
          isEyeThroughHairSourceAllowed(sourceKind, mode) && isEyeThroughHairPassAllowed(sourceKind, passKind, mode) &&
          faceLayersVisible && (!noEyelight || sourceKind !== "eyelight");
        mesh.userData.pjskEyeThroughHairBaseVisible = mesh.visible;
        return;
      }
      if (mesh.userData.pjskOutlineShell) {
        const sourceKind = typeof mesh.userData.pjskSourceMaterialKind === "string" ? mesh.userData.pjskSourceMaterialKind : "";
        const faceLayerOutline = isFaceOrFaceLayerMaterialKind(sourceKind);
        if (eyelightOnly) {
          mesh.visible = sourceKind === "eye" || sourceKind === "eyelight";
          return;
        }
        mesh.visible = !eyeThroughHairOnly && outlineVisible && !isOutlineHiddenByIsolation(sourceKind, mode) &&
          (!noEyelight || sourceKind !== "eyelight") && (!faceLayerOutline || faceLayersVisible);
        return;
      }
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      let faceLayer = false;
      let eyelightLayer = false;
      for (const material of materials) {
        if (!(material instanceof THREE.ShaderMaterial)) continue;
        const draws = material.visible !== false && material.colorWrite !== false;
        if (material.uniforms.uFaceSdfEnabled) {
          material.uniforms.uFaceSdfEnabled.value = faceSdfEnabled && material.userData.pjskFaceSdfCapable === true ? 1 : 0;
          faceLayer = true;
        }
        if (material.uniforms.uMode && !material.uniforms.uFaceSdfEnabled) {
          faceLayer = true;
          eyelightLayer ||= draws && material.uniforms.uMode.value > 1.5;
        }
      }
      if (outlineOnly || eyeThroughHairOnly) mesh.visible = false;
      else if (eyelightOnly) mesh.visible = faceLayer && materials.some((material) => material.userData.pjskMaterialKind === "eye" || material.userData.pjskMaterialKind === "eyelight");
      else if (faceLayer) mesh.visible = faceLayersVisible && (!noEyelight || !eyelightLayer);
      else mesh.visible = !eyelightOnly;
      const source = mesh.userData.pjskEyeThroughHairSource;
      if (source instanceof THREE.Object3D) {
        mesh.visible = mesh.visible && source.visible;
        mesh.layers.mask = source.layers.mask;
      }
    };
    for (const slot of this.slots) slot.traverse(apply);
    for (const entries of this.debugEntries) {
      for (const entry of entries) {
        if (entry.shaderFaceSdfEnabled !== undefined || entry.resolvedKind === "face_sdf") {
          entry.shaderFaceSdfEnabled = faceSdfEnabled && entry.faceSdfCapable === true ? 1 : 0;
        }
      }
    }
  }

  updateEyeThroughHairView(cameraPosition: THREE.Vector3, headPosition: THREE.Vector3, faceForward: THREE.Vector3) {
    const cameraDirection = this.cameraDirection.copy(cameraPosition).sub(headPosition);
    const valid = cameraDirection.lengthSq() > 0.000001;
    const faceCameraDot = valid ? cameraDirection.normalize().dot(faceForward) : 1;
    for (const slot of this.slots) {
      slot.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh || (!mesh.userData.pjskEyeThroughHairOverlay && !mesh.userData.pjskEyeThroughHairStencilPrepass)) return;
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

  updateCamera(cameraPosition: THREE.Vector3) {
    updateSekaiBodyCamera(this.options.bodyMaterial, cameraPosition);
    updateSekaiBodyCamera(this.options.hairMaterial, cameraPosition);
    this.forEachShaderMaterial((material) => {
      if (material.uniforms.uCameraPosition) updateSekaiBodyCamera(material, cameraPosition);
    });
  }

  updateFaceBasis(faceShadowLightDirection: THREE.Vector3, headDot: THREE.Vector2, hairHeadPosition: THREE.Vector3) {
    updateSekaiFaceShadowParameters(this.options.faceMaterial, faceShadowLightDirection, headDot, true, 0);
    this.forEachShaderMaterial((material) => {
      if (material.uniforms.uHeadDotDirectionalLight) {
        updateSekaiFaceShadowParameters(material, faceShadowLightDirection, headDot,
          (material.uniforms.uUseFaceShadowLimiter?.value ?? 1) > 0.5,
          material.uniforms.uFaceShadowLimitRange?.value ?? 0);
      }
      if (material.uniforms.uHeadPosition) material.uniforms.uHeadPosition.value.copy(hairHeadPosition);
    });
  }

  updatePreviewLight(
    next: PreviewLightState,
    bodyAsset: BodyAssetManifest | null,
    headAsset: HeadAssetManifest | null,
    headDotDirectionalLight: THREE.Vector2,
    faceShadowLightDirection: THREE.Vector3
  ) {
    const view = this.getBindingView();
    const { bodyMaterial, hairMaterial, faceMaterial, directionalLight, fillLight } = this.options;
    directionalLight.position.set(next.x, next.y, next.z);
    directionalLight.intensity = next.intensity;
    fillLight.intensity = next.ambient;
    updateSekaiBodyMaterial(bodyMaterial, {
      baseColor: bodyAsset?.proxy.bodyColor ?? "#f5d6d0",
      shadowColor: bodyAsset?.proxy.shadowColor ?? "#c79b95",
      skinColorDefault: headAsset?.proxy.skinColorDefault ?? headAsset?.proxy.faceColor ?? bodyAsset?.proxy.bodyColor ?? "#f5d6d0",
      skinColor1: headAsset?.proxy.skinColor1 ?? headAsset?.proxy.faceShadeColor ?? bodyAsset?.proxy.shadowColor ?? "#c79b95",
      skinColor2: headAsset?.proxy.skinColor2 ?? headAsset?.proxy.faceShadeColor ?? bodyAsset?.proxy.shadowColor ?? "#c79b95",
      lightDirection: directionalLight.position.clone(),
      lightIntensity: next.intensity,
      ambientIntensity: next.ambient,
      shadowThreshold: next.shadowThreshold,
      shadowWeight: next.shadowWeight,
      characterAmbientIntensity: next.characterAmbient,
      rimIntensity: next.rimIntensity,
      controllerRimThreshold: next.rimThreshold,
      rimDirectionality: next.rimDirectionality,
      rimDirection: getSekaiPreviewRimDirection(),
      specularPower: bodyMaterial.uniforms.uSpecularPower.value,
      rimThreshold: bodyMaterial.uniforms.uRimThreshold.value,
      shadowTexWeight: bodyMaterial.uniforms.uShadowTexWeight.value,
      shadowWidthOverride: view.shadowWidthOverride,
      valueShadowInfluence: view.valueShadowInfluence,
      saturation: bodyMaterial.uniforms.uSaturation.value,
      partsAmbientColor: `#${bodyMaterial.uniforms.uPartsAmbientColor.value.getHexString()}`,
      reflectionBlendColor: `#${bodyMaterial.uniforms.uReflectionBlendColor.value.getHexString()}`,
      globalShadowColor: `#${bodyMaterial.uniforms.uGlobalShadowColor.value.getHexString()}`,
      controllerAmbientColor: `#${bodyMaterial.uniforms.uControllerAmbientColor.value.getHexString()}`,
      controllerRimColor: `#${bodyMaterial.uniforms.uControllerRimColor.value.getHexString()}`,
      controllerShadowRimColor: `#${bodyMaterial.uniforms.uControllerShadowRimColor.value.getHexString()}`,
      controllerRimColorWeight: bodyMaterial.uniforms.uControllerRimColorWeight.value,
      controllerShadowRimColorWeight: bodyMaterial.uniforms.uControllerShadowRimColorWeight.value,
      controllerRimEdgeSmoothness: bodyMaterial.uniforms.uControllerRimEdgeSmoothness.value,
      controllerRimShadowSharpness: bodyMaterial.uniforms.uControllerRimShadowSharpness.value,
      bodyDebugMode: view.bodyDebugMode,
      skinTintEnabled: true,
    });
    updateSekaiBodyMaterial(hairMaterial, {
      baseColor: headAsset?.proxy.hairColor ?? "#7b5b4a",
      shadowColor: headAsset?.proxy.hairShadowColor ?? "#513d33",
      lightDirection: directionalLight.position.clone(),
      lightIntensity: next.intensity,
      ambientIntensity: next.ambient,
      shadowThreshold: next.shadowThreshold,
      shadowWeight: next.shadowWeight,
      characterAmbientIntensity: next.characterAmbient,
      rimIntensity: next.rimIntensity,
      controllerRimThreshold: next.rimThreshold,
      rimDirectionality: next.rimDirectionality,
      rimDirection: getSekaiPreviewRimDirection(),
      specularPower: hairMaterial.uniforms.uSpecularPower.value,
      rimThreshold: hairMaterial.uniforms.uRimThreshold.value,
      shadowTexWeight: hairMaterial.uniforms.uShadowTexWeight.value,
      shadowWidthOverride: view.shadowWidthOverride,
      valueShadowInfluence: view.valueShadowInfluence,
      saturation: hairMaterial.uniforms.uSaturation.value,
      partsAmbientColor: `#${hairMaterial.uniforms.uPartsAmbientColor.value.getHexString()}`,
      reflectionBlendColor: `#${hairMaterial.uniforms.uReflectionBlendColor.value.getHexString()}`,
      globalShadowColor: `#${hairMaterial.uniforms.uGlobalShadowColor.value.getHexString()}`,
      controllerAmbientColor: `#${hairMaterial.uniforms.uControllerAmbientColor.value.getHexString()}`,
      controllerRimColor: `#${hairMaterial.uniforms.uControllerRimColor.value.getHexString()}`,
      controllerShadowRimColor: `#${hairMaterial.uniforms.uControllerShadowRimColor.value.getHexString()}`,
      controllerRimColorWeight: hairMaterial.uniforms.uControllerRimColorWeight.value,
      controllerShadowRimColorWeight: hairMaterial.uniforms.uControllerShadowRimColorWeight.value,
      controllerRimEdgeSmoothness: hairMaterial.uniforms.uControllerRimEdgeSmoothness.value,
      controllerRimShadowSharpness: hairMaterial.uniforms.uControllerRimShadowSharpness.value,
      skinTintEnabled: false,
      hairShadowEnabled: false,
    });
    updateSekaiFaceMaterial(faceMaterial, {
      baseColor: headAsset?.proxy.faceColor ?? "#ffe4dc",
      warmColor: headAsset?.proxy.faceShadeColor ?? "#ffd4c8",
      skinColorDefault: headAsset?.proxy.skinColorDefault ?? headAsset?.proxy.faceColor ?? "#ffe4dc",
      skinColor1: headAsset?.proxy.skinColor1 ?? headAsset?.proxy.faceShadeColor ?? "#ffd4c8",
      skinColor2: headAsset?.proxy.skinColor2 ?? headAsset?.proxy.faceShadeColor ?? "#ffd4c8",
      lightDirection: faceShadowLightDirection.clone(),
      lightIntensity: next.intensity,
      ambientIntensity: next.ambient,
      headDotDirectionalLight,
      useFaceShadowLimiter: true,
      faceShadowLimitRange: 0,
    });
    this.updateLoadedMaterialLight(next, faceShadowLightDirection);
  }

  updateLoadedMaterialLight(next: PreviewLightState, faceShadowLightDirection: THREE.Vector3) {
    const lightDirection = this.options.directionalLight.position.clone().normalize();
    const rimDirection = getSekaiPreviewRimDirection();
    this.forEachShaderMaterial((material) => {
      const uniforms = material.uniforms;
      const lighting = material.userData.pjskLighting as MaterialLightingSettings | undefined;
      const faceShadow = Boolean(uniforms.uFaceShadowTex || uniforms.uHeadDotDirectionalLight);
      uniforms.uLightDirection?.value.copy(faceShadow ? faceShadowLightDirection : lightDirection);
      if (uniforms.uLightIntensity) uniforms.uLightIntensity.value = next.intensity;
      if (uniforms.uAmbientIntensity) uniforms.uAmbientIntensity.value = next.ambient;
      if (uniforms.uShadowThreshold) uniforms.uShadowThreshold.value = lighting?.sekaiShadowThreshold ?? next.shadowThreshold;
      if (uniforms.uShadowWeight) uniforms.uShadowWeight.value = next.shadowWeight;
      if (uniforms.uCharacterAmbientIntensity) uniforms.uCharacterAmbientIntensity.value = next.characterAmbient;
      if (uniforms.uRimIntensity) uniforms.uRimIntensity.value = next.rimIntensity;
      if (uniforms.uControllerRimThreshold) uniforms.uControllerRimThreshold.value = next.rimThreshold;
      if (uniforms.uRimDirectionality) uniforms.uRimDirectionality.value = next.rimDirectionality;
      uniforms.uRimDirection?.value.copy(rimDirection);
    });
  }

  updateGlobalShadowColor(color: THREE.ColorRepresentation) {
    const value = new THREE.Color(color);
    for (const material of [this.options.bodyMaterial, this.options.hairMaterial]) material.uniforms.uGlobalShadowColor?.value.copy(value);
    this.forEachShaderMaterial((material) => material.uniforms.uGlobalShadowColor?.value.copy(value));
  }

  updateControllerColors(colors: { ambientColor?: THREE.ColorRepresentation | null; rimColor?: THREE.ColorRepresentation | null; shadowRimColor?: THREE.ColorRepresentation | null }) {
    const ambient = new THREE.Color(colors.ambientColor ?? "#ffffff");
    const rim = new THREE.Color(colors.rimColor ?? "#e6edf9");
    const shadowRim = new THREE.Color(colors.shadowRimColor ?? "#ffffff");
    const apply = (material: THREE.ShaderMaterial) => {
      material.uniforms.uControllerAmbientColor?.value.copy(ambient);
      material.uniforms.uControllerRimColor?.value.copy(rim);
      material.uniforms.uControllerShadowRimColor?.value.copy(shadowRim);
      if (material.uniforms.uControllerRimColorWeight) material.uniforms.uControllerRimColorWeight.value = colors.rimColor ? 1 : 0;
      if (material.uniforms.uControllerShadowRimColorWeight) material.uniforms.uControllerShadowRimColorWeight.value = colors.shadowRimColor ? 1 : 0;
    };
    for (const material of [this.options.bodyMaterial, this.options.hairMaterial]) apply(material);
    this.forEachShaderMaterial(apply);
  }

  updateControllerRimShape(shape: { edgeSmoothness?: number | null; shadowSharpness?: number | null }) {
    const edge = THREE.MathUtils.clamp(shape.edgeSmoothness ?? 0.38, 0.02, 1);
    const sharpness = THREE.MathUtils.clamp(shape.shadowSharpness ?? 0, 0, 1);
    const apply = (material: THREE.ShaderMaterial) => {
      if (material.uniforms.uControllerRimEdgeSmoothness) material.uniforms.uControllerRimEdgeSmoothness.value = edge;
      if (material.uniforms.uControllerRimShadowSharpness) material.uniforms.uControllerRimShadowSharpness.value = sharpness;
    };
    for (const material of [this.options.bodyMaterial, this.options.hairMaterial]) apply(material);
    this.forEachShaderMaterial(apply);
  }

  updateControllerOutline(outline: { color?: THREE.ColorRepresentation | null; blending?: number | null }) {
    this.controllerOutlineColor = outline.color
      ? new THREE.Color(outline.color)
      : new THREE.Color().setRGB(
          sekaiCostumeShopOutlineControllerDefaults.color.r,
          sekaiCostumeShopOutlineControllerDefaults.color.g,
          sekaiCostumeShopOutlineControllerDefaults.color.b
        );
    this.controllerOutlineBlending = THREE.MathUtils.clamp(
      outline.blending ?? sekaiCostumeShopOutlineControllerDefaults.blending,
      0,
      1
    );
    for (const slot of this.slots) {
      slot.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh || !mesh.userData.pjskOutlineShell) return;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of materials) if (material instanceof THREE.MeshBasicMaterial) this.applyOutlineMaterial(material);
      });
    }
  }

  applyOutlineMaterial(material: THREE.MeshBasicMaterial) {
    applySekaiOutlineController(
      material,
      this.controllerOutlineColor,
      this.controllerOutlineBlending
    );
  }
}

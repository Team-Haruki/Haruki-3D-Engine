export type Vec3 = {
  x: number;
  y: number;
  z: number;
};

export type PreviewLightState = {
  x: number;
  y: number;
  z: number;
  intensity: number;
  ambient: number;
  shadowThreshold: number;
  shadowWeight: number;
  characterAmbient: number;
  rimColorAlpha: number;
  rimRange: number;
  rimEdgeSmoothness: number;
  rimEmission: number;
  rimLightInfluence: number;
  rimShadowSharpness: number;
  characterHeight: number;
};

export type SekaiRuntimeMaterialProfile = {
  version: number;
  bodyPipeline: "sekai_csh_toon";
  facePipeline: "sekai_csh_toon";
  layerPipeline: "sekai_eye_layers";
  vrmStrategy: "prefab_native_runtime_only";
  textureRoles: {
    main: "Sekai C";
    shadow: "Sekai S";
    value: "Sekai H";
    faceShadow: "Sekai SDF";
  };
  pluginPreview: {
    directionalLocation: Vec3;
    directionalEnergy: number;
    ambientIntensity: number;
    shadowThreshold: number;
    shadowWeight: number;
    characterAmbientIntensity: number;
    rimColorAlpha: number;
    rimRange: number;
    rimEdgeSmoothness: number;
    rimEmission: number;
    rimLightInfluence: number;
    rimShadowSharpness: number;
    rimRotationDegrees: Vec3;
  };
  viewerTunedPreview: PreviewLightState;
};

export type SekaiVrmMigrationProfile = {
  version: number;
  targetContainer: {
    preferred: "Unity prefab native runtime";
    fallback: "none";
    currentPhase: "prefab_native_runtime_with_pjsk_runtime_extension";
  };
  standardVrmFallback: {
    humanoidBoneMap: Record<string, string>;
    materialFallback: {
      shader: "MToon";
      mainTex: "baseColorTexture";
      shadowTex: "shadeMultiplyTexture";
      valueTex: "custom extras for rim/spec mask";
      faceShadowTex: "custom extras only";
    };
    expressionSource: "PJSK morphChannelBindings";
    springBoneSource: "raw PJSK spring metadata";
  };
  sekaiRuntimeExtras: {
    extensionName: "PJSK_sekai_runtime";
    requiredForExactViewerRender: true;
    payloadKeys: string[];
    materialKinds: string[];
  };
  preserveOutsideStandardVrm: string[];
  unresolvedBeforeTrueParity: string[];
};

export type FaceMode = "clean" | "sdf";
export type StitchMode = "stitched" | "manual" | "split";

export type AssetSource = {
  bundleRoot: string;
  manifestUrl: string;
  meshUrl: string;
  skeletonUrl?: string;
  animationUrls?: string[];
};

export type AssemblyAnchor = {
  nodeName?: string;
  fallbackPosition: Vec3;
};

export type MaterialLightingSettings = {
  specularPower: number;
  rimThreshold: number;
  shadowTexWeight: number;
  fadeMode: number;
  hueSinAngle: number;
  hueCosAngle: number;
  saturation: number;
  value: number;
  contrast: number;
  partsAmbientColor: string;
  reflectionBlendColor: string;
  outlineWidth: number;
  outlineOffset: number;
  outlineLightness: number;
  shadowWidth: number;
  useOutlineSecondNormal: number;
  distortionFps: number;
  distortionIntensity: number;
  distortionIntensityX: number;
  distortionIntensityY: number;
  distortionOffsetX: number;
  distortionOffsetY: number;
  distortionScrollSpeed: number;
  distortionScrollX: number;
  distortionScrollY: number;
  distortionTexTilingX: number;
  distortionTexTilingY: number;
  threshold: number;
  lightInfluence: number;
  lightInfluenceForEyeHighlight: number;
  sekaiShadowThreshold?: number | null;
  useLambert?: boolean | null;
  useValueTex?: boolean | null;
  useFaceSdf?: boolean | null;
  useSkinColor?: boolean | null;
  skinMaskMode?: number | null;
  faceSdfMirror?: number | null;
  faceSdfBias?: number | null;
  useFaceShadowLimiter?: boolean | null;
  rangeLimit?: number | null;
  faceSkinShadowStrength?: number | null;
  hairShadow?: boolean | null;
};

export type RawMaterialTextureProperty = {
  name: string;
  textureName?: string | null;
  textureFileId: number;
  texturePathId: number;
  textureKey?: string | null;
  scaleX: number;
  scaleY: number;
  offsetX: number;
  offsetY: number;
  colorSpace: number;
  uri?: string | null;
  sourceWidth: number;
  sourceHeight: number;
  sourceMipCount: number;
  sourceFormat: number;
  filterMode: number;
  anisoLevel: number;
  mipBias: number;
  wrapU: number;
  wrapV: number;
  wrapW: number;
};

export type RawMaterialColorProperty = {
  name: string;
  r: number;
  g: number;
  b: number;
  a: number;
};

export type RawMaterialScalarProperty = {
  name: string;
  value: number;
};

export type RawMaterialProperties = {
  shaderName?: string | null;
  shaderFileId: number;
  shaderPathId: number;
  shaderKey?: string | null;
  textureProperties: RawMaterialTextureProperty[];
  colorProperties: RawMaterialColorProperty[];
  floatProperties: RawMaterialScalarProperty[];
  intProperties: RawMaterialScalarProperty[];
  validKeywords: string[];
  invalidKeywords: string[];
  lightmapFlags: number;
  enableInstancingVariants: boolean;
  doubleSidedGi: boolean;
  customRenderQueue: number;
  stringTags: Record<string, string>;
  disabledShaderPasses: string[];
};

export type BodyMaterialSlot = {
  meshName: string;
  slotIndex: number;
  materialKey: string;
  materialFileId: number;
  materialPathId: number;
  materialName?: string;
  materialKind?: string;
  mainTex?: string;
  shadowTex?: string;
  valueTex?: string;
  lighting?: MaterialLightingSettings;
  rawMaterial?: RawMaterialProperties;
};

export type FaceMaterialSlot = {
  meshName: string;
  slotIndex: number;
  materialKey: string;
  materialFileId: number;
  materialPathId: number;
  materialName?: string;
  materialKind?: string;
  mainTex?: string;
  shadowTex?: string;
  valueTex?: string;
  faceShadowTex?: string;
  mode: FaceMode;
  isAccessory?: boolean;
  lighting?: MaterialLightingSettings;
  rawMaterial?: RawMaterialProperties;
};

export type BodyAssetManifest = {
  id: string;
  displayName: string;
  characterId?: string;
  characterHeightMeters?: number;
  materialPipeline?: "embedded" | "sekai_preview";
  source: AssetSource;
  neckAnchor: Vec3;
  skeleton: {
    skeletonId: string;
    rootNodeName?: string;
    neckAttach: AssemblyAnchor;
  };
  bodyMaterials: BodyMaterialSlot[];
  proxy: {
    bodyColor: string;
    shadowColor: string;
    bodyScale: number;
    torsoLength: number;
    shoulderWidth: number;
  };
};

export type HeadMorphChannel = {
  name: string;
  sourceName: string;
  nameHash: number;
  curveHash: number;
};

export type HeadAssetManifest = {
  id: string;
  displayName: string;
  characterId?: string;
  characterHeightMeters?: number;
  materialPipeline?: "embedded" | "sekai_preview";
  source: AssetSource;
  rawImportOffset: Vec3;
  assembly: {
    expectedSkeletonId: string;
    attachOrigin: AssemblyAnchor;
    rootNodeName?: string;
    boneRemap?: Record<string, string>;
  };
  defaultFaceMode: FaceMode;
  faceMaterials: FaceMaterialSlot[];
  morphChannels?: string[];
  morphChannelBindings?: HeadMorphChannel[];
  proxy: {
    faceColor: string;
    faceShadeColor: string;
    skinColorDefault?: string;
    skinColor1?: string;
    skinColor2?: string;
    hairColor: string;
    hairShadowColor: string;
    headRadius: number;
    faceDepth: number;
    hairArc: number;
  };
};

export type CharacterAssemblyState = {
  bodyAssetId: string;
  headAssetId: string;
  stitchMode: StitchMode;
  headScale: number;
  splitDistance: number;
  headOffset: Vec3;
};

export type CharacterImportCatalog = {
  version: 1;
  id: string;
  displayName: string;
  bodies: BodyAssetManifest[];
  heads: HeadAssetManifest[];
  defaultAssembly: CharacterAssemblyState;
};

export const sekaiReferenceDirectionalLocation: Vec3 = {
  x: -1.6,
  y: -0.75,
  z: 0.9,
};

export function sekaiPluginLightLocationToThreeDirection(location: Vec3): Vec3 {
  // Blender/plugin light location uses Y-forward/Z-up. The viewer uses Three's Y-up/Z-forward basis.
  return {
    x: location.x,
    y: location.z,
    z: -location.y,
  };
}

// CharacterLightConstants.DIRECTIONAL_LIGHT_ROTATION is (-15, 50, 0) in the
// costume shop. Unity applies Euler rotations in Z-X-Y order; converting its
// transform.forward into the viewer's mirrored-X basis gives this direction.
export const sekaiCostumeShopDirectionalLightRotationDegrees: Vec3 = {
  x: -15,
  y: 50,
  z: 0,
};

export const sekaiCostumeShopDirectionalLightDirection: Vec3 = {
  x: -0.7399421116938479,
  y: 0.2588190451025207,
  z: 0.6208851530148456,
};

export const sekaiCostumeShopRimLightDirection: Vec3 = {
  x: 0.8137976813493737,
  y: -0.3420201433256687,
  z: 0.4698463103929543,
};

export const sekaiCostumeShopControllerDefaults = {
  ambientColor: { r: 0.5, g: 0.5, b: 0.5 },
  ambientIntensity: 1,
  specularColor: { r: 1, g: 1, b: 1 },
  specularIntensity: 1,
  rimColor: { r: 0.5, g: 0.5, b: 0.5 },
  rimColorAlpha: 1,
  rimRange: 7,
  rimEdgeSmoothness: 0.0010000000474974513,
  rimEmission: 0,
  rimLightInfluence: 1,
  shadowRimColor: { r: 0.5, g: 0.5, b: 0.5 },
  rimShadowSharpness: 0.5,
} as const;

export const previewLightDirectionFit: Vec3 =
  sekaiCostumeShopDirectionalLightDirection;

export const previewShadowThresholdFit = 0.40625;

export const previewLightDefaults: PreviewLightState = {
  x: previewLightDirectionFit.x,
  y: previewLightDirectionFit.y,
  z: previewLightDirectionFit.z,
  intensity: 1,
  ambient: 0,
  shadowThreshold: previewShadowThresholdFit,
  shadowWeight: 1,
  characterAmbient: sekaiCostumeShopControllerDefaults.ambientIntensity,
  rimColorAlpha: sekaiCostumeShopControllerDefaults.rimColorAlpha,
  rimRange: sekaiCostumeShopControllerDefaults.rimRange,
  rimEdgeSmoothness: sekaiCostumeShopControllerDefaults.rimEdgeSmoothness,
  rimEmission: sekaiCostumeShopControllerDefaults.rimEmission,
  rimLightInfluence: sekaiCostumeShopControllerDefaults.rimLightInfluence,
  rimShadowSharpness: sekaiCostumeShopControllerDefaults.rimShadowSharpness,
  characterHeight: 1,
};

export const sekaiRuntimeMaterialProfile: SekaiRuntimeMaterialProfile = {
  version: 3,
  bodyPipeline: "sekai_csh_toon",
  facePipeline: "sekai_csh_toon",
  layerPipeline: "sekai_eye_layers",
  vrmStrategy: "prefab_native_runtime_only",
  textureRoles: {
    main: "Sekai C",
    shadow: "Sekai S",
    value: "Sekai H",
    faceShadow: "Sekai SDF",
  },
  pluginPreview: {
    directionalLocation: sekaiReferenceDirectionalLocation,
    directionalEnergy: 1,
    ambientIntensity: 0,
    shadowThreshold: previewShadowThresholdFit,
    shadowWeight: 1,
    characterAmbientIntensity: sekaiCostumeShopControllerDefaults.ambientIntensity,
    rimColorAlpha: sekaiCostumeShopControllerDefaults.rimColorAlpha,
    rimRange: sekaiCostumeShopControllerDefaults.rimRange,
    rimEdgeSmoothness: sekaiCostumeShopControllerDefaults.rimEdgeSmoothness,
    rimEmission: sekaiCostumeShopControllerDefaults.rimEmission,
    rimLightInfluence: sekaiCostumeShopControllerDefaults.rimLightInfluence,
    rimShadowSharpness: sekaiCostumeShopControllerDefaults.rimShadowSharpness,
    rimRotationDegrees: { x: 20, y: -60, z: 0 },
  },
  viewerTunedPreview: previewLightDefaults,
};

export const sekaiVrmMigrationProfile: SekaiVrmMigrationProfile = {
  version: 1,
  targetContainer: {
    preferred: "Unity prefab native runtime",
    fallback: "none",
    currentPhase: "prefab_native_runtime_with_pjsk_runtime_extension",
  },
  standardVrmFallback: {
    humanoidBoneMap: {
      hips: "Hip",
      spine: "Spine",
      chest: "Chest",
      neck: "Neck",
      head: "Head",
      leftShoulder: "Left_Shoulder",
      leftUpperArm: "Left_Arm",
      leftLowerArm: "Left_Elbow",
      leftHand: "Left_Wrist",
      rightShoulder: "Right_Shoulder",
      rightUpperArm: "Right_Arm",
      rightLowerArm: "Right_Elbow",
      rightHand: "Right_Wrist",
      leftUpperLeg: "Left_Thigh",
      leftLowerLeg: "Left_Knee",
      leftFoot: "Left_Ankle",
      leftToes: "Left_Toe",
      rightUpperLeg: "Right_Thigh",
      rightLowerLeg: "Right_Knee",
      rightFoot: "Right_Ankle",
      rightToes: "Right_Toe",
    },
    materialFallback: {
      shader: "MToon",
      mainTex: "baseColorTexture",
      shadowTex: "shadeMultiplyTexture",
      valueTex: "custom extras for rim/spec mask",
      faceShadowTex: "custom extras only",
    },
    expressionSource: "PJSK morphChannelBindings",
    springBoneSource: "raw PJSK spring metadata",
  },
  sekaiRuntimeExtras: {
    extensionName: "PJSK_sekai_runtime",
    requiredForExactViewerRender: true,
    payloadKeys: [
      "sekaiRuntimeMaterialProfile",
      "bodyManifest",
      "headManifest",
      "materialSlots",
      "textureRoles",
      "morphChannelBindings",
    "bodyHeadAssembly",
    "springBoneSourceMetadata",
    "characterControllers",
  ],
    materialKinds: [
      "body",
      "hair",
      "accessory",
      "face_sdf",
      "face",
      "eye",
      "eyelight",
      "eyelash",
      "eyebrow",
    ],
  },
  preserveOutsideStandardVrm: [
    "Sekai C/S/H texture role separation",
    "FaceShadowTex/SDF UV1 semantics",
    "PJSK body/head assembly metadata for exact runtime binding",
    "PJSK morph hash bindings for face motion JSON",
    "plugin/viewer tuned preview lighting",
  ],
  unresolvedBeforeTrueParity: [
    "browser equivalent of the runtime face SDF bone-basis driver",
    "portable runtime face motion outside the native prefab package",
    "exact Unity shader controller animation tracks",
  ],
};

export const characterHeightMetersById: Record<string, number> = {
  "01": 1.61,
  "02": 1.59,
  "03": 1.66,
  "04": 1.59,
  "05": 1.58,
  "06": 1.63,
  "07": 1.56,
  "08": 1.68,
  "09": 1.56,
  "10": 1.6,
  "11": 1.74,
  "12": 1.78,
  "13": 1.72,
  "14": 1.52,
  "15": 1.56,
  "16": 1.8,
  "17": 1.54,
  "18": 1.62,
  "19": 1.58,
  "20": 1.63,
  "21": 1.58,
  "22": 1.52,
  "23": 1.56,
  "24": 1.62,
  "25": 1.67,
  "26": 1.75,
};

export const sampleCatalog: CharacterImportCatalog = {
  version: 1,
  id: "char05-parts-catalog",
  displayName: "PJSK Character Parts Catalog",
  bodies: [
    {
      id: "body-char05-base",
      displayName: "Char05 Body Base",
      materialPipeline: "sekai_preview",
      source: {
        bundleRoot: "/converted/char05/body/base/",
        manifestUrl: "/converted/char05/body/base/body.manifest.json",
        meshUrl: "",
        skeletonUrl: "",
        animationUrls: ["/converted/char05/body/base/unity-motion.msgpack.br"],
      },
      neckAnchor: { x: 0, y: 1.78, z: 0.16 },
      skeleton: {
        skeletonId: "char05_humanoid",
        rootNodeName: "BodyRoot",
        neckAttach: {
          nodeName: "Head",
          fallbackPosition: { x: 0, y: 1.78, z: 0.16 },
        },
      },
      bodyMaterials: [
        {
          meshName: "Body",
          slotIndex: 0,
          materialKey: "0:1",
          materialFileId: 0,
          materialPathId: 1,
          mainTex: "/assets/char05/body_main.png",
          shadowTex: "/assets/char05/body_shadow.png",
          valueTex: "/assets/char05/body_value.png",
        },
      ],
      proxy: {
        bodyColor: "#f2d0c3",
        shadowColor: "#bf958a",
        bodyScale: 1,
        torsoLength: 2.18,
        shoulderWidth: 1.14,
      },
    },
    {
      id: "body-char05-stage",
      displayName: "Char05 Stage Outfit",
      materialPipeline: "sekai_preview",
      source: {
        bundleRoot: "/converted/char05/body/stage/",
        manifestUrl: "/converted/char05/body/stage/body.manifest.json",
        meshUrl: "",
        skeletonUrl: "",
        animationUrls: ["/converted/char05/body/stage/unity-motion.msgpack.br"],
      },
      neckAnchor: { x: 0, y: 1.82, z: 0.18 },
      skeleton: {
        skeletonId: "char05_humanoid",
        rootNodeName: "BodyRoot",
        neckAttach: {
          nodeName: "Head",
          fallbackPosition: { x: 0, y: 1.82, z: 0.18 },
        },
      },
      bodyMaterials: [
        {
          meshName: "Body",
          slotIndex: 0,
          materialKey: "0:1",
          materialFileId: 0,
          materialPathId: 1,
          mainTex: "/assets/char05/stage_main.png",
          shadowTex: "/assets/char05/stage_shadow.png",
          valueTex: "/assets/char05/stage_value.png",
        },
      ],
      proxy: {
        bodyColor: "#d7d7e8",
        shadowColor: "#9797b4",
        bodyScale: 1.04,
        torsoLength: 2.32,
        shoulderWidth: 1.2,
      },
    },
  ],
  heads: [
    {
      id: "head-0100-clean",
      displayName: "Head 0100 Clean",
      materialPipeline: "sekai_preview",
      source: {
        bundleRoot: "/converted/head/0100/clean/",
        manifestUrl: "/converted/head/0100/clean/head.manifest.json",
        meshUrl: "",
      },
      rawImportOffset: { x: 1.1, y: 0.96, z: 0.08 },
      assembly: {
        expectedSkeletonId: "char05_humanoid",
        rootNodeName: "HeadRoot",
        attachOrigin: {
          nodeName: "NeckSocket",
          fallbackPosition: { x: 0, y: 0.08, z: 0.02 },
        },
        boneRemap: {
          Head: "Head",
          Neck: "Neck",
        },
      },
      defaultFaceMode: "clean",
      faceMaterials: [
        {
          meshName: "Face",
          slotIndex: 0,
          materialKey: "0:1",
          materialFileId: 0,
          materialPathId: 1,
          mainTex: "/assets/head0100/face_main.png",
          shadowTex: "/assets/head0100/face_shadow.png",
          faceShadowTex: "/assets/head0100/face_sdf.png",
          mode: "clean",
        },
      ],
      proxy: {
        faceColor: "#fde2d9",
        faceShadeColor: "#f7cdbf",
        hairColor: "#7b5b4a",
        hairShadowColor: "#513d33",
        headRadius: 0.74,
        faceDepth: 0.82,
        hairArc: 0.98,
      },
    },
    {
      id: "head-0100-sdf",
      displayName: "Head 0100 Face SDF",
      materialPipeline: "sekai_preview",
      source: {
        bundleRoot: "/converted/head/0100/sdf/",
        manifestUrl: "/converted/head/0100/sdf/head.manifest.json",
        meshUrl: "",
      },
      rawImportOffset: { x: -1.05, y: 1.16, z: -0.05 },
      assembly: {
        expectedSkeletonId: "char05_humanoid",
        rootNodeName: "HeadRoot",
        attachOrigin: {
          nodeName: "NeckSocket",
          fallbackPosition: { x: 0, y: 0.08, z: 0.02 },
        },
        boneRemap: {
          Head: "Head",
          Neck: "Neck",
        },
      },
      defaultFaceMode: "sdf",
      faceMaterials: [
        {
          meshName: "Face",
          slotIndex: 0,
          materialKey: "0:1",
          materialFileId: 0,
          materialPathId: 1,
          mainTex: "/assets/head0100sdf/face_main.png",
          shadowTex: "/assets/head0100sdf/face_shadow.png",
          faceShadowTex: "/assets/head0100sdf/face_sdf.png",
          mode: "sdf",
        },
      ],
      proxy: {
        faceColor: "#ffe7dc",
        faceShadeColor: "#ffd3c6",
        hairColor: "#2f2f3e",
        hairShadowColor: "#1b1b28",
        headRadius: 0.7,
        faceDepth: 0.8,
        hairArc: 0.9,
      },
    },
  ],
  defaultAssembly: {
    bodyAssetId: "body-char05-base",
    headAssetId: "head-0100-clean",
    stitchMode: "stitched",
    headScale: 1,
    splitDistance: 2.8,
    headOffset: { x: 0, y: 0, z: 0 },
  },
};

export function cloneAssemblyState(
  assembly: CharacterAssemblyState
): CharacterAssemblyState {
  return {
    ...assembly,
    headOffset: { ...assembly.headOffset },
  };
}

export function getBodyAsset(
  catalog: CharacterImportCatalog,
  bodyAssetId: string
): BodyAssetManifest {
  const asset = catalog.bodies.find((entry) => entry.id === bodyAssetId);
  if (!asset) {
    throw new Error(`Unknown body asset: ${bodyAssetId}`);
  }
  return asset;
}

export function getHeadAsset(
  catalog: CharacterImportCatalog,
  headAssetId: string
): HeadAssetManifest {
  const asset = catalog.heads.find((entry) => entry.id === headAssetId);
  if (!asset) {
    throw new Error(`Unknown head asset: ${headAssetId}`);
  }
  return asset;
}

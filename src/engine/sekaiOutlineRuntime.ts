import * as THREE from "three";
import type {
  RawMaterialProperties,
} from "../data/sampleScene";

export const sekaiCostumeShopOutlineSettings = {
  widthMin: 0.0004,
  widthMax: 0.0095,
  distanceNear: 0.45,
  distanceFar: 20,
} as const;

const sekaiOutlineFovCurve = {
  startTime: -0.013763427734375,
  startValue: 27.81246566772461,
  startOutTangent: -0.13214513659477234,
  endTime: 100.92341613769531,
  endValue: -0.03620624542236328,
  endInTangent: -0.5713597536087036,
} as const;

/** Reconstructs the captured ClampForever, unweighted Unity FOV curve. */
export function evaluateSekaiOutlineFovFactor(fieldOfView: number) {
  const fov = Number.isFinite(fieldOfView) ? fieldOfView : 25;
  const curve = sekaiOutlineFovCurve;
  let curveValue: number;
  if (fov <= curve.startTime) {
    curveValue = curve.startValue;
  } else if (fov >= curve.endTime) {
    curveValue = curve.endValue;
  } else {
    const duration = curve.endTime - curve.startTime;
    const t = (fov - curve.startTime) / duration;
    const t2 = t * t;
    const t3 = t2 * t;
    curveValue =
      (2 * t3 - 3 * t2 + 1) * curve.startValue +
      (t3 - 2 * t2 + t) * duration * curve.startOutTangent +
      (-2 * t3 + 3 * t2) * curve.endValue +
      (t3 - t2) * duration * curve.endInTangent;
  }
  return Math.abs(curveValue) > Number.EPSILON ? fov / curveValue : 1;
}

export type SekaiRgb = {
  r: number;
  g: number;
  b: number;
};

export type SekaiRgba = SekaiRgb & {
  a: number;
};

export const sekaiCostumeShopOutlineControllerDefaults = {
  color: { r: 0, g: 0, b: 0 },
  blending: 0.5,
} as const;

const legacyMaterialOutlineColor = {
  r: 0.52,
  g: 0.47,
  b: 0.55,
  a: 1,
} as const;

type SekaiOutlineControllerState = {
  color: THREE.Color;
  blending: number;
};

export function readRawMaterialColor(
  rawMaterial: RawMaterialProperties | null | undefined,
  propertyName: string
): SekaiRgba | null {
  const property = rawMaterial?.colorProperties?.find(
    (entry) => entry.name.toLowerCase() === propertyName.toLowerCase()
  );
  if (
    !property ||
    !Number.isFinite(property.r) ||
    !Number.isFinite(property.g) ||
    !Number.isFinite(property.b) ||
    !Number.isFinite(property.a)
  ) {
    return null;
  }
  return {
    r: property.r,
    g: property.g,
    b: property.b,
    a: property.a,
  };
}

function readRawMaterialFloat(
  rawMaterial: RawMaterialProperties | null | undefined,
  propertyName: string
) {
  const normalizedName = propertyName.toLowerCase();
  const floatProperty = rawMaterial?.floatProperties?.find(
    (entry) => entry.name.toLowerCase() === normalizedName
  );
  if (Number.isFinite(floatProperty?.value)) {
    return floatProperty!.value;
  }
  const intProperty = rawMaterial?.intProperties?.find(
    (entry) => entry.name.toLowerCase() === normalizedName
  );
  return Number.isFinite(intProperty?.value) ? intProperty!.value : null;
}

function readRawMaterialTexture(
  rawMaterial: RawMaterialProperties | null | undefined,
  propertyName: string
) {
  return rawMaterial?.textureProperties?.find(
    (entry) => entry.name.toLowerCase() === propertyName.toLowerCase()
  ) ?? null;
}

export function evaluateSekaiOutlineColor(
  mainTexture: SekaiRgb,
  materialOutline: SekaiRgb,
  globalOutline: SekaiRgb,
  blending: number
): SekaiRgb {
  const weight = THREE.MathUtils.clamp(blending, 0, 1);
  const materialTerm = {
    r: mainTexture.r * materialOutline.r,
    g: mainTexture.g * materialOutline.g,
    b: mainTexture.b * materialOutline.b,
  };
  return {
    r: materialTerm.r + weight * (globalOutline.r - materialTerm.r),
    g: materialTerm.g + weight * (globalOutline.g - materialTerm.g),
    b: materialTerm.b + weight * (globalOutline.b - materialTerm.b),
  };
}

export function applySekaiOutlineController(
  material: THREE.MeshBasicMaterial,
  color: THREE.ColorRepresentation | SekaiRgb | null | undefined,
  blending: number | null | undefined
) {
  if (material.name !== "pjsk_shell_outline") {
    return;
  }
  const state = material.userData.pjskOutlineController as
    | SekaiOutlineControllerState
    | undefined;
  if (!state) {
    return;
  }
  if (
    color &&
    typeof color === "object" &&
    "r" in color &&
    "g" in color &&
    "b" in color
  ) {
    state.color.setRGB(color.r, color.g, color.b);
  } else {
    state.color.set(
      color ??
      new THREE.Color().setRGB(
        sekaiCostumeShopOutlineControllerDefaults.color.r,
        sekaiCostumeShopOutlineControllerDefaults.color.g,
        sekaiCostumeShopOutlineControllerDefaults.color.b
      )
    );
  }
  state.blending = THREE.MathUtils.clamp(
    blending ?? sekaiCostumeShopOutlineControllerDefaults.blending,
    0,
    1
  );
}

export function createSekaiOutlineMaterial(
  useVertexColor: boolean,
  rawMaterial?: RawMaterialProperties,
  useSecondNormal = false,
  sourceMainTex: THREE.Texture | null = null
) {
  const serializedOutlineColor =
    readRawMaterialColor(rawMaterial, "_OutlineColor") ??
    legacyMaterialOutlineColor;
  const mainTextureProperty = readRawMaterialTexture(rawMaterial, "_MainTex");
  const mainTextureTransform = new THREE.Vector4(
    mainTextureProperty?.scaleX ?? 1,
    mainTextureProperty?.scaleY ?? 1,
    mainTextureProperty?.offsetX ?? 0,
    mainTextureProperty?.offsetY ?? 0
  );
  const useAlphaClip =
    (readRawMaterialFloat(rawMaterial, "_UseAlphaClip") ?? 0) > 0.5;
  const alphaCutoff = THREE.MathUtils.clamp(
    readRawMaterialFloat(rawMaterial, "_Cutoff") ?? 0.5,
    0,
    1
  );
  const materialOutlineColor = new THREE.Color().setRGB(
    serializedOutlineColor.r,
    serializedOutlineColor.g,
    serializedOutlineColor.b
  );
  const controllerState: SekaiOutlineControllerState = {
    color: new THREE.Color().setRGB(
      sekaiCostumeShopOutlineControllerDefaults.color.r,
      sekaiCostumeShopOutlineControllerDefaults.color.g,
      sekaiCostumeShopOutlineControllerDefaults.color.b
    ),
    blending: sekaiCostumeShopOutlineControllerDefaults.blending,
  };
  const material = new THREE.MeshBasicMaterial({
    color: materialOutlineColor,
    map: sourceMainTex,
    side: THREE.BackSide,
    transparent: false,
    opacity: 1,
    depthWrite: true,
    depthTest: true,
    blending: THREE.NoBlending,
    vertexColors: false,
    alphaTest: useAlphaClip ? alphaCutoff : 0,
  });
  const outlineFactor = new THREE.Vector3(
    sekaiCostumeShopOutlineSettings.distanceNear,
    1 /
      (
        sekaiCostumeShopOutlineSettings.distanceFar -
        sekaiCostumeShopOutlineSettings.distanceNear
      ),
    evaluateSekaiOutlineFovFactor(25)
  );
  material.name = "pjsk_shell_outline";
  material.userData.pjskOutlineController = controllerState;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSekaiOutlineWidth = {
      value: new THREE.Vector2(
        sekaiCostumeShopOutlineSettings.widthMin,
        sekaiCostumeShopOutlineSettings.widthMax
      ),
    };
    shader.uniforms.uSekaiOutlineFactor = {
      value: outlineFactor,
    };
    shader.uniforms.uSekaiMainTexST = { value: mainTextureTransform };
    shader.uniforms.uSekaiCharacterOutlineColor = {
      value: controllerState.color,
    };
    shader.uniforms.uSekaiCharacterOutlineBlending = {
      get value() {
        return controllerState.blending;
      },
    };
    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      [
        "#include <common>",
        "uniform vec2 uSekaiOutlineWidth;",
        "uniform vec3 uSekaiOutlineFactor;",
        "uniform vec4 uSekaiMainTexST;",
        "#ifdef USE_MAP",
        "varying vec2 vSekaiMainTexUv;",
        "#endif",
        useVertexColor ? "attribute vec3 color;" : "",
        useSecondNormal ? "attribute vec4 tangent;" : "",
        useSecondNormal ? "attribute vec2 uv1;" : "",
        useSecondNormal ? "attribute vec2 uv2;" : "",
      ].join("\n")
    );
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      [
        "#include <begin_vertex>",
        "vec3 outlineWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;",
        "float outlineDistance = length(outlineWorldPosition - cameraPosition);",
        "float outlineDistanceFactor = clamp((outlineDistance - uSekaiOutlineFactor.x) * uSekaiOutlineFactor.y, 0.0, 1.0);",
        "outlineDistanceFactor = min(outlineDistanceFactor * uSekaiOutlineFactor.z, 1.0);",
        "float outlineWidth = mix(uSekaiOutlineWidth.x, uSekaiOutlineWidth.y, outlineDistanceFactor);",
        useSecondNormal
          ? [
              "vec3 secondNormalTS = normalize(vec3(uv1.xy, uv2.x));",
              "vec3 baseNormal = normalize(normal);",
              "vec3 baseTangent = normalize(tangent.xyz);",
              "vec3 baseBitangent = normalize(cross(baseNormal, baseTangent) * tangent.w);",
              "vec3 outlineDirection = normalize(baseTangent * secondNormalTS.x + baseBitangent * secondNormalTS.y + baseNormal * secondNormalTS.z);",
            ].join("\n")
          : "vec3 outlineDirection = normalize(normal);",
        useVertexColor
          ? "float outlineScale = clamp(color.r, 0.0, 1.0);"
          : "float outlineScale = 1.0;",
        "transformed += outlineDirection * outlineWidth * outlineScale;",
      ].join("\n")
    );
    shader.vertexShader = shader.vertexShader.replace(
      "#include <uv_vertex>",
      [
        "#include <uv_vertex>",
        "#ifdef USE_MAP",
        "vSekaiMainTexUv = uv * uSekaiMainTexST.xy + uSekaiMainTexST.zw;",
        "#endif",
      ].join("\n")
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <common>",
      [
        "#include <common>",
        "uniform vec3 uSekaiCharacterOutlineColor;",
        "uniform float uSekaiCharacterOutlineBlending;",
        "#ifdef USE_MAP",
        "varying vec2 vSekaiMainTexUv;",
        "#endif",
      ].join("\n")
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      [
        "#ifdef USE_MAP",
        "  vec4 sampledDiffuseColor = texture2D(map, vSekaiMainTexUv);",
        "  #ifdef DECODE_VIDEO_TEXTURE",
        "    sampledDiffuseColor = sRGBTransferEOTF(sampledDiffuseColor);",
        "  #endif",
        "  diffuseColor *= sampledDiffuseColor;",
        "#endif",
      ].join("\n")
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      [
        "#include <color_fragment>",
        "diffuseColor.rgb = mix(",
        "  diffuseColor.rgb,",
        "  uSekaiCharacterOutlineColor,",
        "  clamp(uSekaiCharacterOutlineBlending, 0.0, 1.0)",
        ");",
      ].join("\n")
    );
  };
  material.customProgramCacheKey = () =>
    `sekai-outline:${useVertexColor ? 1 : 0}:${useSecondNormal ? 1 : 0}`;
  material.onBeforeRender = (_renderer, _scene, camera) => {
    if (camera instanceof THREE.PerspectiveCamera) {
      outlineFactor.z = evaluateSekaiOutlineFovFactor(camera.fov);
    }
  };
  return material;
}

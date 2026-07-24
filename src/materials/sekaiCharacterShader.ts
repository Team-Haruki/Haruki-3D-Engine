import * as THREE from "three";
import {
  sekaiCharacterColorFunctionsGlsl,
  sekaiCharacterShadowFunctionsGlsl,
} from "./sekaiCharacterLighting";
import {
  sekaiCostumeShopControllerDefaults,
  sekaiCostumeShopRimLightDirection,
} from "../data/sampleScene";

export type BodyMaterialUniforms = {
  baseColor: THREE.ColorRepresentation;
  shadowColor: THREE.ColorRepresentation;
  skinColorDefault?: THREE.ColorRepresentation;
  skinColor1?: THREE.ColorRepresentation;
  skinColor2?: THREE.ColorRepresentation;
  mainTex?: THREE.Texture | null;
  shadowTex?: THREE.Texture | null;
  valueTex?: THREE.Texture | null;
  useValueTex?: boolean;
  lightDirection: THREE.Vector3;
  lightIntensity: number;
  ambientIntensity: number;
  shadowThreshold: number;
  shadowWeight: number;
  shadowWidth?: number;
  shadowFade?: number;
  shadowWidthOverride?: number | null;
  valueShadowInfluence?: number;
  characterAmbientIntensity?: number;
  rimColorAlpha?: number;
  controllerRimRange?: number;
  controllerRimEmission?: number;
  controllerRimLightInfluence?: number;
  rimDirection?: THREE.Vector3;
  specularPower?: number;
  rimThreshold?: number;
  shadowTexWeight?: number;
  fadeMode?: number;
  hueSinAngle?: number;
  hueCosAngle?: number;
  hairShadowEnabled?: boolean;
  useLambert?: boolean;
  headPosition?: THREE.Vector3;
  faceSphereShadowEdge?: number;
  faceSphereShadowSmoothness?: number;
  faceSphereShadowWeight?: number;
  saturation?: number;
  value?: number;
  contrast?: number;
  partsAmbientColor?: THREE.ColorRepresentation;
  partsAmbientAlpha?: number;
  reflectionBlendColor?: THREE.ColorRepresentation;
  globalShadowColor?: THREE.ColorRepresentation;
  globalShadowAlpha?: number;
  controllerAmbientColor?: THREE.ColorRepresentation;
  controllerAmbientIntensity?: number;
  controllerSpecularColor?: THREE.ColorRepresentation;
  controllerSpecularIntensity?: number;
  controllerRimColor?: THREE.ColorRepresentation;
  controllerShadowRimColor?: THREE.ColorRepresentation;
  controllerRimColorWeight?: number;
  controllerShadowRimColorWeight?: number;
  controllerRimShadowSharpness?: number;
  bodyDebugMode?: number;
  skinTintEnabled?: boolean;
  useSkinColor?: boolean;
  skinMaskMode?: number;
  skinAmbientColor?: THREE.ColorRepresentation;
  faceSkinShadowStrength?: number;
  finalSaturation?: number;
  brightness?: number;
  highlightRolloff?: number;
  alphaCutoff?: number;
};

export function setSekaiGammaColor(
  target: THREE.Color,
  value: THREE.ColorRepresentation
) {
  if (value instanceof THREE.Color) {
    return target.copy(value);
  }
  if (typeof value === "number") {
    return target.setHex(value, THREE.LinearSRGBColorSpace);
  }
  return target.setStyle(value, THREE.LinearSRGBColorSpace);
}

function sekaiGammaColor(value: THREE.ColorRepresentation) {
  return setSekaiGammaColor(new THREE.Color(), value);
}

function capturedColor(
  value: THREE.ColorRepresentation | undefined,
  fallback: { r: number; g: number; b: number }
) {
  return value === undefined
    ? new THREE.Color().setRGB(fallback.r, fallback.g, fallback.b)
    : sekaiGammaColor(value);
}

const sekaiGammaTextureFunctionsGlsl = `
  vec3 sekaiGammaTexture(vec3 linearColor) {
    vec3 safeColor = max(linearColor, vec3(0.0));
    vec3 low = safeColor * 12.92;
    vec3 high = pow(safeColor, vec3(1.0 / 2.4)) * 1.055 - vec3(0.055);
    return mix(low, high, step(vec3(0.0031308), safeColor));
  }

  vec4 sekaiGammaTexture(vec4 linearColor) {
    return vec4(sekaiGammaTexture(linearColor.rgb), linearColor.a);
  }
`;

export function createSekaiBodyMaterial(initial: BodyMaterialUniforms) {
  return new THREE.ShaderMaterial({
    transparent: false,
    depthWrite: true,
    side: THREE.DoubleSide,
    vertexColors: true,
    uniforms: {
      uBaseColor: { value: sekaiGammaColor(initial.baseColor) },
      uShadowColor: { value: sekaiGammaColor(initial.shadowColor) },
      uSkinColorDefault: { value: sekaiGammaColor(initial.skinColorDefault ?? initial.baseColor) },
      uSkinColor1: { value: sekaiGammaColor(initial.skinColor1 ?? initial.shadowColor) },
      uSkinColor2: { value: sekaiGammaColor(initial.skinColor2 ?? initial.skinColor1 ?? initial.shadowColor) },
      uPartsAmbientColor: { value: sekaiGammaColor(initial.partsAmbientColor ?? "#ffffff") },
      uPartsAmbientAlpha: { value: initial.partsAmbientAlpha ?? 0.0 },
      uReflectionBlendColor: { value: sekaiGammaColor(initial.reflectionBlendColor ?? "#ffffff") },
      uGlobalShadowColor: { value: sekaiGammaColor(initial.globalShadowColor ?? "#ffffff") },
      uGlobalShadowAlpha: { value: initial.globalShadowAlpha ?? 1.0 },
      uControllerAmbientColor: {
        value: capturedColor(
          initial.controllerAmbientColor,
          sekaiCostumeShopControllerDefaults.ambientColor
        ),
      },
      uControllerAmbientIntensity: { value: initial.controllerAmbientIntensity ?? 1.0 },
      uControllerSpecularColor: {
        value: sekaiGammaColor(initial.controllerSpecularColor ?? "#ffffff"),
      },
      uControllerSpecularIntensity: { value: initial.controllerSpecularIntensity ?? 1.0 },
      uControllerRimColor: {
        value: capturedColor(
          initial.controllerRimColor,
          sekaiCostumeShopControllerDefaults.rimColor
        ),
      },
      uControllerShadowRimColor: {
        value: capturedColor(
          initial.controllerShadowRimColor,
          sekaiCostumeShopControllerDefaults.shadowRimColor
        ),
      },
      uControllerRimColorWeight: {
        value: initial.controllerRimColorWeight ?? 1.0,
      },
      uControllerShadowRimColorWeight: {
        value: initial.controllerShadowRimColorWeight ?? 1.0,
      },
      uControllerRimRange: {
        value: initial.controllerRimRange ?? sekaiCostumeShopControllerDefaults.rimRange,
      },
      uControllerRimEmission: {
        value:
          initial.controllerRimEmission ??
          sekaiCostumeShopControllerDefaults.rimEmission,
      },
      uControllerRimLightInfluence: {
        value:
          initial.controllerRimLightInfluence ??
          sekaiCostumeShopControllerDefaults.rimLightInfluence,
      },
      uControllerRimShadowSharpness: {
        value:
          initial.controllerRimShadowSharpness ??
          sekaiCostumeShopControllerDefaults.rimShadowSharpness,
      },
      uBodyDebugMode: { value: initial.bodyDebugMode ?? 0 },
      uMainTex: { value: initial.mainTex ?? null },
      uShadowTex: { value: initial.shadowTex ?? null },
      uValueTex: { value: initial.valueTex ?? null },
      uUseMainTex: { value: initial.mainTex ? 1.0 : 0.0 },
      uUseShadowTex: { value: initial.shadowTex ? 1.0 : 0.0 },
      uHasValueTex: { value: initial.valueTex ? 1.0 : 0.0 },
      uUseValueTex: { value: (initial.useValueTex ?? Boolean(initial.valueTex)) ? 1.0 : 0.0 },
      uLightDirection: { value: initial.lightDirection.clone().normalize() },
      uCameraPosition: { value: new THREE.Vector3() },
      uLightIntensity: { value: initial.lightIntensity },
      uAmbientIntensity: { value: initial.ambientIntensity },
      uShadowThreshold: { value: initial.shadowThreshold },
      uShadowWeight: { value: initial.shadowWeight },
      uShadowWidth: { value: initial.shadowWidth ?? 0.0 },
      uShadowFade: { value: initial.shadowFade ?? 0.0 },
      uShadowWidthOverride: { value: initial.shadowWidthOverride ?? -1.0 },
      uValueShadowInfluence: { value: initial.valueShadowInfluence ?? 0.0 },
      uCharacterAmbientIntensity: { value: initial.characterAmbientIntensity ?? 0.3 },
      uRimColorAlpha: {
        value:
          initial.rimColorAlpha ??
          sekaiCostumeShopControllerDefaults.rimColorAlpha,
      },
      uRimDirection: {
        value: (
          initial.rimDirection ??
          new THREE.Vector3(
            sekaiCostumeShopRimLightDirection.x,
            sekaiCostumeShopRimLightDirection.y,
            sekaiCostumeShopRimLightDirection.z
          )
        ).clone().normalize(),
      },
      uSpecularPower: { value: initial.specularPower ?? 0 },
      uRimThreshold: { value: initial.rimThreshold ?? 0.2 },
      uShadowTexWeight: { value: initial.shadowTexWeight ?? 1 },
      uFadeMode: { value: initial.fadeMode ?? 0 },
      uHueSinAngle: { value: initial.hueSinAngle ?? 0 },
      uHueCosAngle: { value: initial.hueCosAngle ?? 1 },
      uHairShadowEnabled: { value: initial.hairShadowEnabled ? 1.0 : 0.0 },
      uUseLambert: { value: initial.useLambert === false ? 0.0 : 1.0 },
      uHeadPosition: {
        value: (initial.headPosition ?? new THREE.Vector3()).clone(),
      },
      uFaceSphereShadowEdge: { value: initial.faceSphereShadowEdge ?? 0.0 },
      uFaceSphereShadowSmoothness: { value: initial.faceSphereShadowSmoothness ?? 0.0 },
      uFaceSphereShadowWeight: { value: initial.faceSphereShadowWeight ?? 0.0 },
      uSaturation: { value: initial.saturation ?? 0.5 },
      uValue: { value: initial.value ?? 0.5 },
      uContrast: { value: initial.contrast ?? 0.5 },
      uSkinTintEnabled: { value: initial.skinTintEnabled === false ? 0.0 : 1.0 },
      uUseSkinColor: {
        value: (initial.useSkinColor ?? initial.skinTintEnabled ?? true) ? 1.0 : 0.0,
      },
      uSkinMaskMode: { value: initial.skinMaskMode ?? 0.0 },
      uSkinAmbientColor: { value: sekaiGammaColor(initial.skinAmbientColor ?? "#ffffff") },
      uFaceSkinShadowStrength: { value: initial.faceSkinShadowStrength ?? 0.1 },
      uFinalSaturation: { value: initial.finalSaturation ?? 1.0 },
      uBrightness: { value: initial.brightness ?? 1.0 },
      uHighlightRolloff: { value: initial.highlightRolloff ?? 0.5 },
      uAlphaCutoff: { value: initial.alphaCutoff ?? 0.0 },
    },
    vertexShader: `
      #include <common>
      #include <uv_pars_vertex>
      #include <color_pars_vertex>
      #include <skinning_pars_vertex>

      varying vec3 vWorldPosition;
      varying vec3 vWorldNormal;
      varying vec3 vViewPosition;
      varying vec3 vModelPosition;
      varying vec2 vUv;

      void main() {
        #include <uv_vertex>
        #include <color_vertex>
        #include <skinbase_vertex>
        #include <beginnormal_vertex>
        #include <skinnormal_vertex>
        #include <defaultnormal_vertex>
        #include <begin_vertex>
        #include <skinning_vertex>

        vec4 worldPosition = modelMatrix * vec4(transformed, 1.0);
        vec4 viewPosition = viewMatrix * worldPosition;
        vWorldPosition = worldPosition.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
        vViewPosition = viewPosition.xyz;
        vModelPosition = transformed;
        vUv = uv;
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: `
      #include <common>
      #include <color_pars_fragment>

      uniform vec3 uBaseColor;
      uniform vec3 uShadowColor;
      uniform vec3 uSkinColorDefault;
      uniform vec3 uSkinColor1;
      uniform vec3 uSkinColor2;
      uniform vec3 uPartsAmbientColor;
      uniform float uPartsAmbientAlpha;
      uniform vec3 uReflectionBlendColor;
      uniform vec3 uGlobalShadowColor;
      uniform float uGlobalShadowAlpha;
      uniform vec3 uControllerAmbientColor;
      uniform float uControllerAmbientIntensity;
      uniform vec3 uControllerSpecularColor;
      uniform float uControllerSpecularIntensity;
      uniform vec3 uControllerRimColor;
      uniform vec3 uControllerShadowRimColor;
      uniform float uControllerRimColorWeight;
      uniform float uControllerShadowRimColorWeight;
      uniform float uControllerRimRange;
      uniform float uControllerRimEmission;
      uniform float uControllerRimLightInfluence;
      uniform float uControllerRimShadowSharpness;
      uniform float uBodyDebugMode;
      uniform sampler2D uMainTex;
      uniform sampler2D uShadowTex;
      uniform sampler2D uValueTex;
      uniform float uUseMainTex;
      uniform float uUseShadowTex;
      uniform float uHasValueTex;
      uniform float uUseValueTex;
      uniform vec3 uLightDirection;
      uniform vec3 uCameraPosition;
      uniform float uLightIntensity;
      uniform float uAmbientIntensity;
      uniform float uShadowThreshold;
      uniform float uShadowWeight;
      uniform float uShadowWidth;
      uniform float uShadowFade;
      uniform float uShadowWidthOverride;
      uniform float uValueShadowInfluence;
      uniform float uCharacterAmbientIntensity;
      uniform float uRimColorAlpha;
      uniform vec3 uRimDirection;
      uniform float uSpecularPower;
      uniform float uRimThreshold;
      uniform float uShadowTexWeight;
      uniform float uFadeMode;
      uniform float uHueSinAngle;
      uniform float uHueCosAngle;
      uniform float uHairShadowEnabled;
      uniform float uUseLambert;
      uniform vec3 uHeadPosition;
      uniform float uFaceSphereShadowEdge;
      uniform float uFaceSphereShadowSmoothness;
      uniform float uFaceSphereShadowWeight;
      uniform float uSaturation;
      uniform float uValue;
      uniform float uContrast;
      uniform float uSkinTintEnabled;
      uniform float uUseSkinColor;
      uniform float uSkinMaskMode;
      uniform vec3 uSkinAmbientColor;
      uniform float uFaceSkinShadowStrength;
      uniform float uFinalSaturation;
      uniform float uBrightness;
      uniform float uHighlightRolloff;
      uniform float uAlphaCutoff;

      varying vec3 vWorldPosition;
      varying vec3 vWorldNormal;
      varying vec3 vViewPosition;
      varying vec3 vModelPosition;
      varying vec2 vUv;

      ${sekaiCharacterShadowFunctionsGlsl}
      ${sekaiCharacterColorFunctionsGlsl}
      ${sekaiGammaTextureFunctionsGlsl}

      vec3 outputColor(vec3 color) {
        return color;
      }

      vec3 applyMaterialHsvc(vec3 color) {
        return sekaiApplyHsvc(
          color,
          uHueSinAngle,
          uHueCosAngle,
          uSaturation,
          uValue,
          uContrast
        );
      }

      float toonBand(float value, float threshold, float width) {
        return width <= 0.0001
          ? step(threshold, value)
          : smoothstep(threshold - width, threshold + width, value);
      }

      void main() {
        vec3 normal = normalize(vWorldNormal);
        vec3 lightDir = normalize(uLightDirection);
        vec3 viewDir = normalize(uCameraPosition - vWorldPosition);
        float ndl = dot(normal, lightDir);
        vec4 mainSample = vec4(1.0);
        vec3 mainColor = uBaseColor;
        if (uUseMainTex > 0.5) {
          mainSample = sekaiGammaTexture(texture2D(uMainTex, vUv));
          if (uAlphaCutoff > 0.0 && mainSample.a < uAlphaCutoff) {
            discard;
          }
          mainColor = mainSample.rgb;
        }
        vec3 shadowValue = mainColor;
        if (uUseShadowTex > 0.5) {
          shadowValue = mix(
            shadowValue,
            sekaiGammaTexture(texture2D(uShadowTex, vUv).rgb),
            clamp(uShadowTexWeight, 0.0, 1.0)
          );
        }
        vec4 valueSample = vec4(0.0, 0.0, 0.5, 0.0);
        if (uHasValueTex > 0.5) {
          valueSample = texture2D(uValueTex, vUv);
        }
        float skinMask = sekaiSkinMask(
          mainColor,
          valueSample,
          min(uUseSkinColor, uSkinTintEnabled),
          uSkinMaskMode,
          uUseValueTex
        );
        float hMask = valueSample.b;
        float hAlpha = valueSample.a;
        float vertexOutlineIntensity = 1.0;
        float vertexRimMask = 1.0;
        #ifdef USE_COLOR
        vertexOutlineIntensity = clamp(vColor.r, 0.0, 1.0);
        vertexRimMask = clamp(vColor.g, 0.0, 1.0);
        #endif

        float halfNdl = clamp(ndl * 0.5 + 0.5, 0.0, 1.0);
        float materialShadowThreshold = clamp(uShadowThreshold, 0.0, 1.0);
        float shadowWidth = (uShadowWidthOverride >= 0.0)
          ? uShadowWidthOverride
          : uShadowWidth;
        float toonLuma = clamp((uUseLambert > 0.5 ? halfNdl : 1.0) + (uUseValueTex > 0.5 ? hMask * 2.0 - 1.0 : 0.0), 0.0, 1.0);
        float officialShadowBand = sekaiBaseShadow(
          ndl,
          hMask,
          uUseLambert,
          uUseValueTex,
          materialShadowThreshold,
          shadowWidth,
          uFadeMode
        );
        float valueShadowInfluence = clamp(uValueShadowInfluence, 0.0, 1.0);
        float geometricShadowBand = sekaiBaseShadow(
          ndl,
          0.5,
          uUseLambert,
          0.0,
          materialShadowThreshold,
          shadowWidth,
          uFadeMode
        );
        float shadowBand = mix(geometricShadowBand, officialShadowBand, valueShadowInfluence) * uShadowWeight;
        float litBand = clamp(1.0 - shadowBand, 0.0, 1.0);
        if (
          uHairShadowEnabled > 0.5 &&
          uFaceSphereShadowWeight > 0.001 &&
          dot(uHeadPosition, uHeadPosition) > 0.000001
        ) {
          vec3 fromHead = normalize(vWorldPosition - uHeadPosition);
          float sphereLight = smoothstep(
            uFaceSphereShadowEdge - uFaceSphereShadowSmoothness,
            uFaceSphereShadowEdge + uFaceSphereShadowSmoothness,
            dot(fromHead, lightDir)
          );
          shadowBand = clamp(
            shadowBand + (1.0 - sphereLight) * uFaceSphereShadowWeight,
            0.0,
            1.0
          );
        }
        litBand = clamp(1.0 - shadowBand, 0.0, 1.0);

        vec3 adjustedMainColor = applyMaterialHsvc(mainColor);
        vec3 fallbackShadowColor = mainColor * uShadowColor;
        vec3 weightedShadowColor = uUseShadowTex > 0.5
          ? shadowValue
          : mix(adjustedMainColor, fallbackShadowColor, clamp(uShadowTexWeight, 0.0, 1.0));
        vec3 shadowColor = weightedShadowColor;
        if (uBodyDebugMode > 0.5 && uBodyDebugMode < 12.5) {
          float debugValue = skinMask;
          if (uBodyDebugMode > 3.5 && uBodyDebugMode < 4.5) {
            debugValue = valueSample.r;
          } else if (uBodyDebugMode > 4.5 && uBodyDebugMode < 5.5) {
            debugValue = valueSample.g;
          } else if (uBodyDebugMode > 5.5 && uBodyDebugMode < 6.5) {
            debugValue = valueSample.b;
          } else if (uBodyDebugMode > 6.5 && uBodyDebugMode < 7.5) {
            debugValue = valueSample.a;
          } else if (uBodyDebugMode > 7.5 && uBodyDebugMode < 8.5) {
            debugValue = vertexOutlineIntensity;
          } else if (uBodyDebugMode > 8.5 && uBodyDebugMode < 9.5) {
            debugValue = vertexRimMask;
          } else if (uBodyDebugMode > 9.5 && uBodyDebugMode < 10.5) {
            debugValue = shadowBand;
          } else if (uBodyDebugMode > 10.5 && uBodyDebugMode < 11.5) {
            debugValue = halfNdl;
          } else if (uBodyDebugMode > 11.5 && uBodyDebugMode < 12.5) {
            debugValue = officialShadowBand;
          }
          gl_FragColor = vec4(outputColor(vec3(debugValue)), 1.0);
          return;
        }
        if (uBodyDebugMode > 23.5 && uBodyDebugMode < 24.5) {
          gl_FragColor = vec4(outputColor(vec3(clamp(toonLuma, 0.0, 1.0))), 1.0);
          return;
        } else if (uBodyDebugMode > 24.5 && uBodyDebugMode < 25.5) {
          gl_FragColor = vec4(outputColor(vec3(clamp(1.0 - litBand, 0.0, 1.0))), 1.0);
          return;
        } else if (uBodyDebugMode > 25.5 && uBodyDebugMode < 26.5) {
          gl_FragColor = vec4(outputColor(clamp(shadowColor, 0.0, 1.0)), 1.0);
          return;
        }
        vec3 baseShadedColor = mix(adjustedMainColor, weightedShadowColor, shadowBand);
        vec3 skinColor = applyMaterialHsvc(
          mainColor * sekaiSkinRamp(
            shadowBand,
            uSkinAmbientColor,
            uSkinColorDefault,
            uSkinColor1,
            uSkinColor2
          )
        );
        vec3 color = mix(baseShadedColor, skinColor, skinMask);
        float globalShadowWeight =
          clamp(uGlobalShadowAlpha, 0.0, 1.0) *
          clamp(shadowBand, 0.0, 1.0) *
          (1.0 - skinMask);
        color *= mix(vec3(1.0), uGlobalShadowColor, globalShadowWeight);

        float halfLambert = clamp(dot(normal, normalize(lightDir + viewDir)), 0.0, 1.0);
        float specEnabled = step(0.0001, uSpecularPower);
        float specPower = 10.0 / max(uSpecularPower, 0.0001);
        float specMask = hAlpha * specEnabled;
        float specular = pow(halfLambert, specPower) * specMask;
        vec3 specularAdd =
          uControllerSpecularColor *
          uControllerSpecularIntensity *
          specular;

        float nDotV = clamp(dot(normal, viewDir), 0.0, 1.0);
        vec3 rimDirection = normalize(uRimDirection);
        float nDotRim = dot(normal, rimDirection);
        float vDotRim = clamp(dot(viewDir, rimDirection), 0.0, 1.0);
        float rimFactorX = max(uControllerRimRange, 0.0);
        rimFactorX = rimFactorX > 10.0 ? rimFactorX * 0.01 : rimFactorX;
        rimFactorX = min(rimFactorX, 10.0);
        float rimFactorZ = max(uControllerRimEmission, 0.0001);
        float rimFactorW = clamp(uControllerRimLightInfluence, 0.0, 1.0);
        float viewFresnel = pow(
          1.0 - nDotV,
          max(10.0 - clamp(rimFactorX, 0.0, 10.0), 0.001)
        );
        float directedRim = viewFresnel * mix(1.0, vDotRim, rimFactorW);
        float sidedRim = nDotRim < 0.05
          ? directedRim
          : directedRim * (1.0 - 2.0 * rimFactorW);
        float rim = sekaiSmooth01(clamp(
          (sidedRim - uRimThreshold) / rimFactorZ,
          0.0,
          1.0
        ));
        float rimMask = vertexRimMask;
        vec3 controllerRimBase = mix(
          vec3(0.5),
          uControllerRimColor,
          clamp(uControllerRimColorWeight, 0.0, 1.0)
        );
        vec3 controllerShadowRimBase = mix(
          controllerRimBase,
          uControllerShadowRimColor,
          clamp(uControllerShadowRimColorWeight, 0.0, 1.0)
        );
        float rimShadowSharpness = clamp(
          uControllerRimShadowSharpness,
          0.0,
          1.0
        );
        float rimColorMix = sekaiSmooth01(clamp(
          (nDotRim - (rimShadowSharpness - 1.0)) /
            max(2.0 * (1.0 - rimShadowSharpness), 0.00001),
          0.0,
          1.0
        ));
        vec3 rimColor = mix(
          controllerRimBase,
          controllerShadowRimBase,
          rimColorMix
        );
        float rimGate = rimMask * max(uRimColorAlpha, 0.0);
        float rimScalar = rim * rimGate;
        vec3 rimAdd = rimColor * rimScalar;
        if (uBodyDebugMode > 15.5 && uBodyDebugMode < 16.5) {
          gl_FragColor = vec4(outputColor(vec3(clamp(specular, 0.0, 1.0))), 1.0);
          return;
        } else if (uBodyDebugMode > 21.5 && uBodyDebugMode < 22.5) {
          gl_FragColor = vec4(outputColor(vec3(clamp(specMask, 0.0, 1.0))), 1.0);
          return;
        } else if (uBodyDebugMode > 22.5 && uBodyDebugMode < 23.5) {
          gl_FragColor = vec4(outputColor(clamp(specularAdd * 8.0, 0.0, 1.0)), 1.0);
          return;
        } else if (uBodyDebugMode > 16.5 && uBodyDebugMode < 17.5) {
          gl_FragColor = vec4(outputColor(vec3(clamp(rim, 0.0, 1.0))), 1.0);
          return;
        } else if (uBodyDebugMode > 17.5 && uBodyDebugMode < 18.5) {
          gl_FragColor = vec4(outputColor(clamp(rimAdd * 4.0, 0.0, 1.0)), 1.0);
          return;
        } else if (uBodyDebugMode > 18.5 && uBodyDebugMode < 19.5) {
          gl_FragColor = vec4(outputColor(vec3(clamp(rimGate * 4.0, 0.0, 1.0))), 1.0);
          return;
        } else if (uBodyDebugMode > 19.5 && uBodyDebugMode < 20.5) {
          gl_FragColor = vec4(outputColor(clamp(rimColor, 0.0, 1.0)), 1.0);
          return;
        } else if (uBodyDebugMode > 20.5 && uBodyDebugMode < 21.5) {
          gl_FragColor = vec4(outputColor(vec3(clamp(rimScalar * 8.0, 0.0, 1.0))), 1.0);
          return;
        }
        color += rimAdd;
        color += specularAdd;

        vec3 ambientTarget = sekaiApplyCharacterAmbient(
          color,
          uControllerAmbientColor,
          uControllerAmbientIntensity,
          vec4(uPartsAmbientColor, uPartsAmbientAlpha)
        );
        if (uBodyDebugMode > 12.5 && uBodyDebugMode < 13.5) {
          gl_FragColor = vec4(outputColor(clamp(ambientTarget, 0.0, 1.0)), 1.0);
          return;
        } else if (uBodyDebugMode > 13.5 && uBodyDebugMode < 14.5) {
          gl_FragColor = vec4(outputColor(vec3(clamp(uControllerAmbientIntensity, 0.0, 1.0))), 1.0);
          return;
        } else if (uBodyDebugMode > 14.5 && uBodyDebugMode < 15.5) {
          gl_FragColor = vec4(outputColor(clamp(uControllerAmbientColor, 0.0, 1.0)), 1.0);
          return;
        }
        color = ambientTarget;
        float finalLuma = dot(color, vec3(0.299, 0.587, 0.114));
        color = mix(vec3(finalLuma), color, uFinalSaturation);
        color = sekaiApplyHighlightRolloff(
          color,
          uBrightness,
          uHighlightRolloff
        );
        gl_FragColor = vec4(outputColor(clamp(color, 0.0, 1.0)), 1.0);
      }
    `,
  });
}

export function updateSekaiBodyMaterial(
  material: THREE.ShaderMaterial,
  next: BodyMaterialUniforms
) {
  setSekaiGammaColor(material.uniforms.uBaseColor.value, next.baseColor);
  setSekaiGammaColor(material.uniforms.uShadowColor.value, next.shadowColor);
  setSekaiGammaColor(material.uniforms.uSkinColorDefault.value, next.skinColorDefault ?? next.baseColor);
  setSekaiGammaColor(material.uniforms.uSkinColor1.value, next.skinColor1 ?? next.shadowColor);
  setSekaiGammaColor(material.uniforms.uSkinColor2.value, next.skinColor2 ?? next.skinColor1 ?? next.shadowColor);
  setSekaiGammaColor(material.uniforms.uPartsAmbientColor.value, next.partsAmbientColor ?? "#ffffff");
  material.uniforms.uPartsAmbientAlpha.value =
    next.partsAmbientAlpha ?? material.uniforms.uPartsAmbientAlpha.value;
  setSekaiGammaColor(material.uniforms.uReflectionBlendColor.value, next.reflectionBlendColor ?? "#ffffff");
  setSekaiGammaColor(material.uniforms.uGlobalShadowColor.value, next.globalShadowColor ?? "#ffffff");
  material.uniforms.uGlobalShadowAlpha.value =
    next.globalShadowAlpha ?? material.uniforms.uGlobalShadowAlpha.value;
  if (next.controllerAmbientColor !== undefined) {
    setSekaiGammaColor(material.uniforms.uControllerAmbientColor.value, next.controllerAmbientColor);
  }
  material.uniforms.uControllerAmbientIntensity.value =
    next.controllerAmbientIntensity ?? material.uniforms.uControllerAmbientIntensity.value;
  setSekaiGammaColor(
    material.uniforms.uControllerSpecularColor.value,
    next.controllerSpecularColor ?? "#ffffff"
  );
  material.uniforms.uControllerSpecularIntensity.value =
    next.controllerSpecularIntensity ?? material.uniforms.uControllerSpecularIntensity.value;
  if (next.controllerRimColor !== undefined) {
    setSekaiGammaColor(material.uniforms.uControllerRimColor.value, next.controllerRimColor);
  }
  if (next.controllerShadowRimColor !== undefined) {
    setSekaiGammaColor(
      material.uniforms.uControllerShadowRimColor.value,
      next.controllerShadowRimColor
    );
  }
  material.uniforms.uControllerRimColorWeight.value =
    next.controllerRimColorWeight ?? material.uniforms.uControllerRimColorWeight.value;
  material.uniforms.uControllerShadowRimColorWeight.value =
    next.controllerShadowRimColorWeight ??
    material.uniforms.uControllerShadowRimColorWeight.value;
  material.uniforms.uControllerRimRange.value =
    next.controllerRimRange ?? material.uniforms.uControllerRimRange.value;
  material.uniforms.uControllerRimEmission.value =
    next.controllerRimEmission ?? material.uniforms.uControllerRimEmission.value;
  material.uniforms.uControllerRimLightInfluence.value =
    next.controllerRimLightInfluence ??
    material.uniforms.uControllerRimLightInfluence.value;
  material.uniforms.uControllerRimShadowSharpness.value =
    next.controllerRimShadowSharpness ??
    material.uniforms.uControllerRimShadowSharpness.value;
  if (next.bodyDebugMode !== undefined && material.uniforms.uBodyDebugMode) {
    material.uniforms.uBodyDebugMode.value = next.bodyDebugMode;
  }
  material.uniforms.uMainTex.value = next.mainTex ?? null;
  material.uniforms.uShadowTex.value = next.shadowTex ?? null;
  material.uniforms.uValueTex.value = next.valueTex ?? null;
  material.uniforms.uUseMainTex.value = next.mainTex ? 1.0 : 0.0;
  material.uniforms.uUseShadowTex.value = next.shadowTex ? 1.0 : 0.0;
  material.uniforms.uHasValueTex.value = next.valueTex ? 1.0 : 0.0;
  material.uniforms.uUseValueTex.value = (next.useValueTex ?? Boolean(next.valueTex)) ? 1.0 : 0.0;
  if (material.uniforms.uAlphaCutoff) {
    material.uniforms.uAlphaCutoff.value = next.alphaCutoff ?? 0.0;
  }
  material.uniforms.uLightDirection.value.copy(
    next.lightDirection.clone().normalize()
  );
  material.uniforms.uLightIntensity.value = next.lightIntensity;
  material.uniforms.uAmbientIntensity.value = next.ambientIntensity;
  material.uniforms.uShadowThreshold.value = next.shadowThreshold;
  material.uniforms.uShadowWeight.value = next.shadowWeight;
  material.uniforms.uShadowWidth.value = next.shadowWidth ?? material.uniforms.uShadowWidth.value;
  if (next.shadowFade !== undefined && material.uniforms.uShadowFade) {
    material.uniforms.uShadowFade.value = next.shadowFade;
  }
  if (next.shadowWidthOverride !== undefined && material.uniforms.uShadowWidthOverride) {
    material.uniforms.uShadowWidthOverride.value = next.shadowWidthOverride ?? -1.0;
  }
  if (next.valueShadowInfluence !== undefined && material.uniforms.uValueShadowInfluence) {
    material.uniforms.uValueShadowInfluence.value = next.valueShadowInfluence;
  }
  if (next.hairShadowEnabled !== undefined && material.uniforms.uHairShadowEnabled) {
    material.uniforms.uHairShadowEnabled.value = next.hairShadowEnabled ? 1.0 : 0.0;
  }
  if (next.useLambert !== undefined && material.uniforms.uUseLambert) {
    material.uniforms.uUseLambert.value = next.useLambert ? 1.0 : 0.0;
  }
  if (next.headPosition && material.uniforms.uHeadPosition) {
    material.uniforms.uHeadPosition.value.copy(next.headPosition);
  }
  material.uniforms.uFaceSphereShadowEdge.value = next.faceSphereShadowEdge ?? 0.0;
  material.uniforms.uFaceSphereShadowSmoothness.value = next.faceSphereShadowSmoothness ?? 0.0;
  material.uniforms.uFaceSphereShadowWeight.value = next.faceSphereShadowWeight ?? 0.0;
  material.uniforms.uCharacterAmbientIntensity.value = next.characterAmbientIntensity ?? 0.3;
  material.uniforms.uRimColorAlpha.value =
    next.rimColorAlpha ?? material.uniforms.uRimColorAlpha.value;
  material.uniforms.uRimDirection.value.copy(
    (
      next.rimDirection ??
      new THREE.Vector3(
        sekaiCostumeShopRimLightDirection.x,
        sekaiCostumeShopRimLightDirection.y,
        sekaiCostumeShopRimLightDirection.z
      )
    ).clone().normalize()
  );
  material.uniforms.uSpecularPower.value = next.specularPower ?? 0;
  material.uniforms.uRimThreshold.value = next.rimThreshold ?? 0.2;
  material.uniforms.uShadowTexWeight.value = next.shadowTexWeight ?? 1;
  if (material.uniforms.uFadeMode) {
    material.uniforms.uFadeMode.value = next.fadeMode ?? material.uniforms.uFadeMode.value;
  }
  if (material.uniforms.uHueSinAngle) {
    material.uniforms.uHueSinAngle.value = next.hueSinAngle ?? material.uniforms.uHueSinAngle.value;
  }
  if (material.uniforms.uHueCosAngle) {
    material.uniforms.uHueCosAngle.value = next.hueCosAngle ?? material.uniforms.uHueCosAngle.value;
  }
  material.uniforms.uSaturation.value = next.saturation ?? material.uniforms.uSaturation.value;
  if (material.uniforms.uValue) {
    material.uniforms.uValue.value = next.value ?? material.uniforms.uValue.value;
  }
  if (material.uniforms.uContrast) {
    material.uniforms.uContrast.value = next.contrast ?? material.uniforms.uContrast.value;
  }
  material.uniforms.uSkinTintEnabled.value = next.skinTintEnabled === false ? 0.0 : 1.0;
  material.uniforms.uUseSkinColor.value =
    (next.useSkinColor ?? next.skinTintEnabled ?? true) ? 1.0 : 0.0;
  material.uniforms.uSkinMaskMode.value =
    next.skinMaskMode ?? material.uniforms.uSkinMaskMode.value;
  setSekaiGammaColor(material.uniforms.uSkinAmbientColor.value, next.skinAmbientColor ?? "#ffffff");
  material.uniforms.uFaceSkinShadowStrength.value =
    next.faceSkinShadowStrength ?? material.uniforms.uFaceSkinShadowStrength.value;
  material.uniforms.uFinalSaturation.value =
    next.finalSaturation ?? material.uniforms.uFinalSaturation.value;
  material.uniforms.uBrightness.value =
    next.brightness ?? material.uniforms.uBrightness.value;
  material.uniforms.uHighlightRolloff.value =
    next.highlightRolloff ?? material.uniforms.uHighlightRolloff.value;
}

export function updateSekaiBodyCamera(
  material: THREE.ShaderMaterial,
  cameraPosition: THREE.Vector3
) {
  material.uniforms.uCameraPosition.value.copy(cameraPosition);
}
export type FaceMaterialUniforms = {
  baseColor: THREE.ColorRepresentation;
  warmColor: THREE.ColorRepresentation;
  skinColorDefault?: THREE.ColorRepresentation;
  skinColor1?: THREE.ColorRepresentation;
  skinColor2?: THREE.ColorRepresentation;
  mainTex?: THREE.Texture | null;
  shadowTex?: THREE.Texture | null;
  valueTex?: THREE.Texture | null;
  faceShadowTex?: THREE.Texture | null;
  lightDirection: THREE.Vector3;
  lightIntensity: number;
  ambientIntensity: number;
  headDotDirectionalLight?: THREE.Vector2;
  useFaceShadowLimiter?: boolean;
  faceShadowLimitRange?: number;
  faceDebugMode?: number;
  faceSdfEnabled?: boolean;
  useValueTex?: boolean;
  shadowThreshold?: number;
  shadowWeight?: number;
  shadowWidth?: number;
  fadeMode?: number;
  useLambert?: boolean;
  shadowTexWeight?: number;
  faceSdfMirror?: number;
  faceSdfBias?: number;
  useSkinColor?: boolean;
  skinMaskMode?: number;
  faceSkinShadowStrength?: number;
  skinAmbientColor?: THREE.ColorRepresentation;
  hueSinAngle?: number;
  hueCosAngle?: number;
  saturation?: number;
  value?: number;
  contrast?: number;
  partsAmbientColor?: THREE.ColorRepresentation;
  partsAmbientAlpha?: number;
  controllerAmbientColor?: THREE.ColorRepresentation;
  controllerAmbientIntensity?: number;
  globalShadowColor?: THREE.ColorRepresentation;
  globalShadowAlpha?: number;
  finalSaturation?: number;
  brightness?: number;
  highlightRolloff?: number;
  alphaCutoff?: number;
};

export function createSekaiFaceMaterial(initial: FaceMaterialUniforms) {
  return new THREE.ShaderMaterial({
    defines: {
      USE_UV1: "",
    },
    transparent: false,
    depthWrite: true,
    side: THREE.DoubleSide,
    uniforms: {
      uBaseColor: { value: sekaiGammaColor(initial.baseColor) },
      uWarmColor: { value: sekaiGammaColor(initial.warmColor) },
      uSkinColorDefault: { value: sekaiGammaColor(initial.skinColorDefault ?? initial.baseColor) },
      uSkinColor1: { value: sekaiGammaColor(initial.skinColor1 ?? initial.warmColor) },
      uSkinColor2: { value: sekaiGammaColor(initial.skinColor2 ?? initial.warmColor) },
      uMainTex: { value: initial.mainTex ?? null },
      uShadowTex: { value: initial.shadowTex ?? null },
      uValueTex: { value: initial.valueTex ?? null },
      uFaceShadowTex: { value: initial.faceShadowTex ?? null },
      uUseMainTex: { value: initial.mainTex ? 1.0 : 0.0 },
      uUseShadowTex: { value: initial.shadowTex ? 1.0 : 0.0 },
      uHasValueTex: { value: initial.valueTex ? 1.0 : 0.0 },
      uUseValueTex: { value: (initial.useValueTex ?? Boolean(initial.valueTex)) ? 1.0 : 0.0 },
      uUseFaceShadowTex: { value: initial.faceShadowTex ? 1.0 : 0.0 },
      uLightDirection: { value: initial.lightDirection.clone().normalize() },
      uHeadDotDirectionalLight: {
        value: (initial.headDotDirectionalLight ?? new THREE.Vector2(0, 0)).clone(),
      },
      uUseFaceShadowLimiter: { value: initial.useFaceShadowLimiter === false ? 0.0 : 1.0 },
      uFaceShadowLimitRange: { value: initial.faceShadowLimitRange ?? 0.0 },
      uLightIntensity: { value: initial.lightIntensity },
      uAmbientIntensity: { value: initial.ambientIntensity },
      uFaceDebugMode: { value: initial.faceDebugMode ?? 0 },
      uFaceSdfEnabled: { value: initial.faceSdfEnabled && initial.faceShadowTex ? 1.0 : 0.0 },
      uShadowThreshold: { value: initial.shadowThreshold ?? 0.5 },
      uShadowWeight: { value: initial.shadowWeight ?? 1.0 },
      uShadowWidth: { value: initial.shadowWidth ?? 0.0 },
      uFadeMode: { value: initial.fadeMode ?? 0.0 },
      uUseLambert: { value: initial.useLambert === false ? 0.0 : 1.0 },
      uShadowTexWeight: { value: initial.shadowTexWeight ?? 1.0 },
      uFaceSdfMirror: { value: initial.faceSdfMirror ?? 1.0 },
      uFaceSdfBias: { value: initial.faceSdfBias ?? 0.0 },
      uUseSkinColor: { value: initial.useSkinColor === false ? 0.0 : 1.0 },
      uSkinMaskMode: { value: initial.skinMaskMode ?? 0.0 },
      uFaceSkinShadowStrength: { value: initial.faceSkinShadowStrength ?? 0.1 },
      uSkinAmbientColor: { value: sekaiGammaColor(initial.skinAmbientColor ?? "#ffffff") },
      uHueSinAngle: { value: initial.hueSinAngle ?? 0.0 },
      uHueCosAngle: { value: initial.hueCosAngle ?? 1.0 },
      uSaturation: { value: initial.saturation ?? 0.5 },
      uValue: { value: initial.value ?? 0.5 },
      uContrast: { value: initial.contrast ?? 0.5 },
      uPartsAmbientColor: { value: sekaiGammaColor(initial.partsAmbientColor ?? "#ffffff") },
      uPartsAmbientAlpha: { value: initial.partsAmbientAlpha ?? 0.0 },
      uControllerAmbientColor: {
        value: capturedColor(
          initial.controllerAmbientColor,
          sekaiCostumeShopControllerDefaults.ambientColor
        ),
      },
      uControllerAmbientIntensity: { value: initial.controllerAmbientIntensity ?? 1.0 },
      uGlobalShadowColor: { value: sekaiGammaColor(initial.globalShadowColor ?? "#ffffff") },
      uGlobalShadowAlpha: { value: initial.globalShadowAlpha ?? 1.0 },
      uFinalSaturation: { value: initial.finalSaturation ?? 1.0 },
      uBrightness: { value: initial.brightness ?? 1.0 },
      uHighlightRolloff: { value: initial.highlightRolloff ?? 0.5 },
      uAlphaCutoff: { value: initial.alphaCutoff ?? 0.0 },
    },
    vertexShader: `
      #include <common>
      #include <uv_pars_vertex>
      #include <skinning_pars_vertex>
      #include <morphtarget_pars_vertex>

      varying vec3 vWorldNormal;
      varying vec2 vUv;
      varying vec2 vFaceShadowUv;

      void main() {
        #include <uv_vertex>
        #include <beginnormal_vertex>
        #include <morphnormal_vertex>
        #include <skinbase_vertex>
        #include <skinnormal_vertex>
        #include <defaultnormal_vertex>
        #include <begin_vertex>
        #include <morphtarget_vertex>
        #include <skinning_vertex>

        vec4 worldPosition = modelMatrix * vec4(transformed, 1.0);
        vWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
        vUv = uv;
        #ifdef USE_UV1
          vFaceShadowUv = abs(uv1.x) + abs(uv1.y) > 0.000001 ? uv1 : uv;
        #else
          vFaceShadowUv = uv;
        #endif
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      #include <common>

      uniform vec3 uBaseColor;
      uniform vec3 uWarmColor;
      uniform vec3 uSkinColorDefault;
      uniform vec3 uSkinColor1;
      uniform vec3 uSkinColor2;
      uniform sampler2D uMainTex;
      uniform sampler2D uShadowTex;
      uniform sampler2D uValueTex;
      uniform sampler2D uFaceShadowTex;
      uniform float uUseMainTex;
      uniform float uUseShadowTex;
      uniform float uHasValueTex;
      uniform float uUseValueTex;
      uniform float uUseFaceShadowTex;
      uniform vec3 uLightDirection;
      uniform vec2 uHeadDotDirectionalLight;
      uniform float uUseFaceShadowLimiter;
      uniform float uFaceShadowLimitRange;
      uniform float uLightIntensity;
      uniform float uAmbientIntensity;
      uniform float uFaceDebugMode;
      uniform float uFaceSdfEnabled;
      uniform float uShadowThreshold;
      uniform float uShadowWeight;
      uniform float uShadowWidth;
      uniform float uFadeMode;
      uniform float uUseLambert;
      uniform float uShadowTexWeight;
      uniform float uFaceSdfMirror;
      uniform float uFaceSdfBias;
      uniform float uUseSkinColor;
      uniform float uSkinMaskMode;
      uniform float uFaceSkinShadowStrength;
      uniform vec3 uSkinAmbientColor;
      uniform float uHueSinAngle;
      uniform float uHueCosAngle;
      uniform float uSaturation;
      uniform float uValue;
      uniform float uContrast;
      uniform vec3 uPartsAmbientColor;
      uniform float uPartsAmbientAlpha;
      uniform vec3 uControllerAmbientColor;
      uniform float uControllerAmbientIntensity;
      uniform vec3 uGlobalShadowColor;
      uniform float uGlobalShadowAlpha;
      uniform float uFinalSaturation;
      uniform float uBrightness;
      uniform float uHighlightRolloff;
      uniform float uAlphaCutoff;

      varying vec3 vWorldNormal;
      varying vec2 vUv;
      varying vec2 vFaceShadowUv;

      ${sekaiCharacterShadowFunctionsGlsl}
      ${sekaiCharacterColorFunctionsGlsl}
      ${sekaiGammaTextureFunctionsGlsl}

      vec3 outputColor(vec3 color) {
        return color;
      }

      void main() {
        vec4 mainSample = vec4(1.0);
        vec3 mainColor = uBaseColor;
        if (uUseMainTex > 0.5) {
          mainSample = sekaiGammaTexture(texture2D(uMainTex, vUv));
          if (uAlphaCutoff > 0.0 && mainSample.a < uAlphaCutoff) {
            discard;
          }
          mainColor = mainSample.rgb;
        }

        vec3 sampledShadow = uUseShadowTex > 0.5
          ? sekaiGammaTexture(texture2D(uShadowTex, vUv).rgb)
          : uWarmColor;
        vec3 shadowColor = mix(mainColor, sampledShadow, clamp(uShadowTexWeight, 0.0, 1.0));
        vec4 valueSample = vec4(0.0, 0.0, 0.5, 0.0);
        if (uHasValueTex > 0.5) {
          valueSample = texture2D(uValueTex, vUv);
        }
        float skinMask = sekaiSkinMask(
          mainColor,
          valueSample,
          uUseSkinColor,
          uSkinMaskMode,
          uUseValueTex
        );
        float shadowBand = sekaiBaseShadow(
          dot(normalize(vWorldNormal), normalize(uLightDirection)),
          valueSample.b,
          uUseLambert,
          uUseValueTex,
          uShadowThreshold,
          uShadowWidth,
          uFadeMode
        ) * uShadowWeight;
        float sdfValue = 0.0;
        float faceThreshold = 0.0;
        float faceShadow = 0.0;
        if ((uFaceSdfEnabled > 0.5 || uFaceDebugMode > 0.5) && uUseFaceShadowTex > 0.5) {
          float sdf0 = texture2D(uFaceShadowTex, vFaceShadowUv).r;
          float sdf1 = texture2D(uFaceShadowTex, vec2(-vFaceShadowUv.x, vFaceShadowUv.y)).r;
          sdfValue = uFaceSdfMirror * uHeadDotDirectionalLight.x <= 0.0 ? sdf1 : sdf0;
          faceThreshold = uHeadDotDirectionalLight.y;
          if (uUseFaceShadowLimiter > 0.5) {
            faceThreshold = min(
              max((1.0 - abs(2.0 * uHeadDotDirectionalLight.y - 1.0)) * 0.5, 0.0),
              uFaceShadowLimitRange
            );
          }
          faceThreshold = clamp(faceThreshold + uFaceSdfBias, 0.0, 1.0);
          faceShadow = sekaiFaceShadow(sdfValue, faceThreshold, uShadowWidth, uFadeMode);
          if (uFaceDebugMode > 0.5) {
            if (uFaceDebugMode < 1.5) {
              gl_FragColor = vec4(outputColor(vec3(sdfValue)), 1.0);
              return;
            }
            if (uFaceDebugMode < 2.5) {
              gl_FragColor = vec4(outputColor(vec3(faceShadow)), 1.0);
              return;
            }
            if (uFaceDebugMode < 3.5) {
              gl_FragColor = vec4(outputColor(vec3(faceThreshold)), 1.0);
              return;
            }
            if (uFaceDebugMode < 4.5) {
              gl_FragColor = vec4(outputColor(vec3(
                max(uHeadDotDirectionalLight.x, 0.0),
                max(-uHeadDotDirectionalLight.x, 0.0),
                uHeadDotDirectionalLight.y
              )), 1.0);
              return;
            }
            gl_FragColor = vec4(outputColor(vec3(uHeadDotDirectionalLight.y)), 1.0);
            return;
          }
          if (uFaceSdfEnabled > 0.5) {
            shadowBand = max(shadowBand, faceShadow);
          }
        }
        vec3 adjustedMainColor = sekaiApplyHsvc(
          mainColor,
          uHueSinAngle,
          uHueCosAngle,
          uSaturation,
          uValue,
          uContrast
        );
        vec3 baseShadedColor = mix(
          adjustedMainColor,
          shadowColor,
          clamp(shadowBand, 0.0, 1.0)
        );
        float skinShadow =
          uFaceSdfEnabled > 0.5
            ? clamp(shadowBand, 0.0, 1.0) *
              clamp(uFaceSkinShadowStrength, 0.0, 0.1)
            : clamp(shadowBand, 0.0, 1.0);
        vec3 skinColor = sekaiApplyHsvc(
          mainColor * sekaiSkinRamp(
            skinShadow,
            uSkinAmbientColor,
            uSkinColorDefault,
            uSkinColor1,
            uSkinColor2
          ),
          uHueSinAngle,
          uHueCosAngle,
          uSaturation,
          uValue,
          uContrast
        );
        vec3 color = mix(baseShadedColor, skinColor, skinMask);
        float globalShadowWeight =
          clamp(uGlobalShadowAlpha, 0.0, 1.0) *
          clamp(shadowBand, 0.0, 1.0) *
          (1.0 - skinMask);
        color *= mix(vec3(1.0), uGlobalShadowColor, globalShadowWeight);
        color = sekaiApplyCharacterAmbient(
          color,
          uControllerAmbientColor,
          uControllerAmbientIntensity,
          vec4(uPartsAmbientColor, uPartsAmbientAlpha)
        );
        float finalLuma = dot(color, vec3(0.299, 0.587, 0.114));
        color = mix(vec3(finalLuma), color, uFinalSaturation);
        color = sekaiApplyHighlightRolloff(
          color,
          uBrightness,
          uHighlightRolloff
        );
        gl_FragColor = vec4(outputColor(clamp(color, 0.0, 1.0)), 1.0);
      }
    `,
  });
}

export function updateSekaiFaceMaterial(
  material: THREE.ShaderMaterial,
  next: FaceMaterialUniforms
) {
  setSekaiGammaColor(material.uniforms.uBaseColor.value, next.baseColor);
  setSekaiGammaColor(material.uniforms.uWarmColor.value, next.warmColor);
  setSekaiGammaColor(material.uniforms.uSkinColorDefault.value, next.skinColorDefault ?? next.baseColor);
  setSekaiGammaColor(material.uniforms.uSkinColor1.value, next.skinColor1 ?? next.warmColor);
  setSekaiGammaColor(material.uniforms.uSkinColor2.value, next.skinColor2 ?? next.warmColor);
  material.uniforms.uMainTex.value = next.mainTex ?? null;
  material.uniforms.uShadowTex.value = next.shadowTex ?? null;
  material.uniforms.uValueTex.value = next.valueTex ?? null;
  material.uniforms.uFaceShadowTex.value = next.faceShadowTex ?? null;
  material.uniforms.uUseMainTex.value = next.mainTex ? 1.0 : 0.0;
  material.uniforms.uUseShadowTex.value = next.shadowTex ? 1.0 : 0.0;
  material.uniforms.uHasValueTex.value = next.valueTex ? 1.0 : 0.0;
  material.uniforms.uUseValueTex.value = (next.useValueTex ?? Boolean(next.valueTex)) ? 1.0 : 0.0;
  material.uniforms.uUseFaceShadowTex.value = next.faceShadowTex ? 1.0 : 0.0;
  material.uniforms.uLightDirection.value.copy(
    next.lightDirection.clone().normalize()
  );
  updateSekaiFaceShadowParameters(
    material,
    next.lightDirection,
    next.headDotDirectionalLight ?? material.uniforms.uHeadDotDirectionalLight?.value,
    next.useFaceShadowLimiter,
    next.faceShadowLimitRange
  );
  material.uniforms.uLightIntensity.value = next.lightIntensity;
  material.uniforms.uAmbientIntensity.value = next.ambientIntensity;
  material.uniforms.uShadowThreshold.value = next.shadowThreshold ?? material.uniforms.uShadowThreshold.value;
  material.uniforms.uShadowWeight.value = next.shadowWeight ?? material.uniforms.uShadowWeight.value;
  material.uniforms.uShadowWidth.value = next.shadowWidth ?? material.uniforms.uShadowWidth.value;
  material.uniforms.uFadeMode.value = next.fadeMode ?? material.uniforms.uFadeMode.value;
  material.uniforms.uUseLambert.value = next.useLambert === false ? 0.0 : 1.0;
  material.uniforms.uShadowTexWeight.value = next.shadowTexWeight ?? material.uniforms.uShadowTexWeight.value;
  material.uniforms.uFaceSdfMirror.value = next.faceSdfMirror ?? material.uniforms.uFaceSdfMirror.value;
  material.uniforms.uFaceSdfBias.value = next.faceSdfBias ?? material.uniforms.uFaceSdfBias.value;
  material.uniforms.uUseSkinColor.value = next.useSkinColor === false ? 0.0 : 1.0;
  material.uniforms.uSkinMaskMode.value =
    next.skinMaskMode ?? material.uniforms.uSkinMaskMode.value;
  material.uniforms.uFaceSkinShadowStrength.value =
    next.faceSkinShadowStrength ?? material.uniforms.uFaceSkinShadowStrength.value;
  setSekaiGammaColor(material.uniforms.uSkinAmbientColor.value, next.skinAmbientColor ?? "#ffffff");
  material.uniforms.uHueSinAngle.value =
    next.hueSinAngle ?? material.uniforms.uHueSinAngle.value;
  material.uniforms.uHueCosAngle.value =
    next.hueCosAngle ?? material.uniforms.uHueCosAngle.value;
  material.uniforms.uSaturation.value =
    next.saturation ?? material.uniforms.uSaturation.value;
  material.uniforms.uValue.value =
    next.value ?? material.uniforms.uValue.value;
  material.uniforms.uContrast.value =
    next.contrast ?? material.uniforms.uContrast.value;
  setSekaiGammaColor(material.uniforms.uPartsAmbientColor.value, next.partsAmbientColor ?? "#ffffff");
  material.uniforms.uPartsAmbientAlpha.value =
    next.partsAmbientAlpha ?? material.uniforms.uPartsAmbientAlpha.value;
  if (next.controllerAmbientColor !== undefined) {
    setSekaiGammaColor(material.uniforms.uControllerAmbientColor.value, next.controllerAmbientColor);
  }
  material.uniforms.uControllerAmbientIntensity.value =
    next.controllerAmbientIntensity ??
    material.uniforms.uControllerAmbientIntensity.value;
  setSekaiGammaColor(material.uniforms.uGlobalShadowColor.value, next.globalShadowColor ?? "#ffffff");
  material.uniforms.uGlobalShadowAlpha.value =
    next.globalShadowAlpha ?? material.uniforms.uGlobalShadowAlpha.value;
  material.uniforms.uFinalSaturation.value =
    next.finalSaturation ?? material.uniforms.uFinalSaturation.value;
  material.uniforms.uBrightness.value =
    next.brightness ?? material.uniforms.uBrightness.value;
  material.uniforms.uHighlightRolloff.value =
    next.highlightRolloff ?? material.uniforms.uHighlightRolloff.value;
  material.uniforms.uAlphaCutoff.value =
    next.alphaCutoff ?? material.uniforms.uAlphaCutoff.value;
  if (next.faceDebugMode !== undefined) {
    material.uniforms.uFaceDebugMode.value = next.faceDebugMode;
  }
  if (material.uniforms.uFaceSdfEnabled) {
    material.uniforms.uFaceSdfEnabled.value = next.faceSdfEnabled && next.faceShadowTex ? 1.0 : 0.0;
  }
}

export function updateSekaiFaceShadowParameters(
  material: THREE.ShaderMaterial,
  lightDirection: THREE.Vector3,
  headDotDirectionalLight?: THREE.Vector2 | null,
  useFaceShadowLimiter = true,
  faceShadowLimitRange = 0
) {
  material.uniforms.uLightDirection?.value.copy(lightDirection).normalize();
  if (headDotDirectionalLight && material.uniforms.uHeadDotDirectionalLight) {
    material.uniforms.uHeadDotDirectionalLight.value.copy(headDotDirectionalLight);
  }
  if (material.uniforms.uUseFaceShadowLimiter) {
    material.uniforms.uUseFaceShadowLimiter.value = useFaceShadowLimiter ? 1.0 : 0.0;
  }
  if (material.uniforms.uFaceShadowLimitRange) {
    material.uniforms.uFaceShadowLimitRange.value = faceShadowLimitRange;
  }
}
export type SekaiLayerMode = "alpha" | "add" | "eye" | "eyelight";

export type SekaiLayerAtlas = {
  tileX: number;
  tileY: number;
  sample: number;
  enabled?: boolean;
};

export type SekaiLayerOptions = {
  tintColor?: THREE.ColorRepresentation | null;
  emissionColor?: THREE.ColorRepresentation | null;
  lightInfluence?: number | null;
  highlightInfluence?: number | null;
  vertexBViewOffset?: number | null;
  distortionFps?: number | null;
  distortionIntensity?: number | null;
  distortionIntensityX?: number | null;
  distortionIntensityY?: number | null;
  distortionOffsetX?: number | null;
  distortionOffsetY?: number | null;
  distortionScrollSpeed?: number | null;
  distortionScrollX?: number | null;
  distortionScrollY?: number | null;
  distortionTexTilingX?: number | null;
  distortionTexTilingY?: number | null;
  threshold?: number | null;
  alphaScale?: number | null;
  alphaCutoff?: number | null;
  strictAlpha?: boolean | null;
};

export function createSekaiLayerMaterial(
  texture: THREE.Texture | null,
  mode: SekaiLayerMode = "alpha",
  atlas?: SekaiLayerAtlas | null,
  options?: SekaiLayerOptions
) {
  const isAdditive = mode === "add" || mode === "eyelight";
  const isEyelight = mode === "eyelight";
  const atlasTileX = atlas && atlas.tileX > 0 ? atlas.tileX : 1;
  const atlasTileY = atlas && atlas.tileY > 0 ? atlas.tileY : 1;
  const atlasSample = Math.max(0, atlas?.sample ?? 0);
  const useVertexBViewOffset = (options?.vertexBViewOffset ?? 0.0) > 0.0;
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    depthFunc: THREE.LessEqualDepth,
    side: THREE.DoubleSide,
    vertexColors: useVertexBViewOffset,
    blending: isAdditive ? THREE.CustomBlending : THREE.NormalBlending,
    ...(isAdditive ? {
      blendSrc: THREE.SrcAlphaFactor,
      blendDst: THREE.OneFactor,
      blendEquation: THREE.AddEquation,
    } : {}),
    polygonOffset: true,
    polygonOffsetFactor: isEyelight ? -0.5 : -1,
    polygonOffsetUnits: isEyelight ? -0.5 : -1,
    uniforms: {
      uMainTex: { value: texture },
      uUseMainTex: { value: texture ? 1.0 : 0.0 },
      uMode: { value: mode === "eye" ? 1.0 : isEyelight ? 2.0 : 0.0 },
      uTintColor: { value: sekaiGammaColor(options?.tintColor ?? "#ffffff") },
      uEmissionColor: { value: sekaiGammaColor(options?.emissionColor ?? "#000000") },
      uAtlasTile: { value: new THREE.Vector2(atlasTileX, atlasTileY) },
      uAtlasSample: { value: atlasSample },
      uUseAtlas: { value: 0.0 },
      uTime: { value: 0.0 },
      uLightInfluence: { value: THREE.MathUtils.clamp(options?.lightInfluence ?? 1.0, 0.0, 1.0) },
      uHighlightInfluence: { value: THREE.MathUtils.clamp(options?.highlightInfluence ?? 1.0, 0.0, 1.0) },
      uVertexBViewOffset: { value: Math.max(0.0, options?.vertexBViewOffset ?? 0.0) },
      uDistortionFps: { value: Math.max(1.0, options?.distortionFps ?? 12.0) },
      uDistortionIntensity: { value: Math.max(0.0, options?.distortionIntensity ?? (isEyelight ? 1.0 : 0.0)) },
      uDistortionIntensityXY: {
        value: new THREE.Vector2(
          Math.max(0.0, options?.distortionIntensityX ?? (isEyelight ? 1.0 : 0.0)),
          Math.max(0.0, options?.distortionIntensityY ?? (isEyelight ? 1.0 : 0.0))
        ),
      },
      uDistortionOffset: {
        value: new THREE.Vector2(options?.distortionOffsetX ?? 0.0, options?.distortionOffsetY ?? 0.0),
      },
      uDistortionScroll: {
        value: new THREE.Vector2(options?.distortionScrollX ?? 0.5, options?.distortionScrollY ?? 0.5),
      },
      uDistortionScrollSpeed: { value: options?.distortionScrollSpeed ?? 1.0 },
      uDistortionTexTiling: {
        value: new THREE.Vector2(
          Math.max(0.001, options?.distortionTexTilingX ?? 1.0),
          Math.max(0.001, options?.distortionTexTilingY ?? 1.0)
        ),
      },
      uThreshold: { value: THREE.MathUtils.clamp(options?.threshold ?? 0.5, 0.0, 1.0) },
      uAlphaScale: { value: THREE.MathUtils.clamp(options?.alphaScale ?? 1.0, 0.0, 1.0) },
      uAlphaCutoff: { value: THREE.MathUtils.clamp(options?.alphaCutoff ?? 0.001, 0.0, 1.0) },
      uStrictAlpha: { value: options?.strictAlpha ? 1.0 : 0.0 },
      // 0: texture alpha, 1: SekaiEyelash opaque source, 2: SekaiEyelash highlight red.
      uAlphaSource: { value: 0.0 },
    },
    vertexShader: `
      #include <common>
      #include <uv_pars_vertex>
      #include <color_pars_vertex>
      #include <skinning_pars_vertex>
      #include <morphtarget_pars_vertex>

      uniform float uVertexBViewOffset;

      varying vec2 vUv;
      varying vec3 vViewNormal;

      void main() {
        #include <uv_vertex>
        #include <color_vertex>
        #include <beginnormal_vertex>
        #include <morphnormal_vertex>
        #include <skinbase_vertex>
        #include <skinnormal_vertex>
        #include <defaultnormal_vertex>
        #include <begin_vertex>
        #include <morphtarget_vertex>
        #include <skinning_vertex>

        vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
        #ifdef USE_COLOR
        mvPosition.z += clamp(vColor.b, 0.0, 1.0) * uVertexBViewOffset;
        #endif
        vUv = uv;
        vViewNormal = normalize(normalMatrix * objectNormal);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      #include <common>

      uniform sampler2D uMainTex;
      uniform float uUseMainTex;
      uniform float uMode;
      uniform vec3 uTintColor;
      uniform vec3 uEmissionColor;
      uniform vec2 uAtlasTile;
      uniform float uAtlasSample;
      uniform float uUseAtlas;
      uniform float uTime;
      uniform float uLightInfluence;
      uniform float uHighlightInfluence;
      uniform float uDistortionFps;
      uniform float uDistortionIntensity;
      uniform vec2 uDistortionIntensityXY;
      uniform vec2 uDistortionOffset;
      uniform vec2 uDistortionScroll;
      uniform float uDistortionScrollSpeed;
      uniform vec2 uDistortionTexTiling;
      uniform float uThreshold;
      uniform float uAlphaScale;
      uniform float uAlphaCutoff;
      uniform float uStrictAlpha;
      uniform float uAlphaSource;

      varying vec2 vUv;
      varying vec3 vViewNormal;

      ${sekaiGammaTextureFunctionsGlsl}

      vec3 outputColor(vec3 color) {
        return color;
      }

      void main() {
        vec2 uv = vUv;
        if (uUseAtlas > 0.5) {
          vec2 tile = max(uAtlasTile, vec2(1.0));
          float sampleIndex = floor(max(uAtlasSample, 0.0));
          float tileX = mod(sampleIndex, tile.x);
          float tileY = floor(sampleIndex / tile.x);
          uv = (uv + vec2(tileX, tileY)) / tile;
        }
        if (uMode > 1.5) {
          float steppedTime = floor(uTime * uDistortionFps) / uDistortionFps;
          vec2 distortionUv = uv * uDistortionTexTiling
            + uDistortionOffset
            + uDistortionScroll * steppedTime * uDistortionScrollSpeed;
          vec2 proceduralDistortion = vec2(
            sin((distortionUv.x + distortionUv.y) * 6.2831853),
            cos((distortionUv.x - distortionUv.y) * 6.2831853)
          ) * 0.5 + vec2(
            sin(distortionUv.y * 12.5663706 + steppedTime),
            cos(distortionUv.x * 12.5663706 - steppedTime)
          ) * 0.25;
          float edge = 1.0 - clamp(abs(vViewNormal.z), 0.0, 1.0);
          vec2 normalDrift = normalize(vViewNormal.xy + vec2(0.0001)) * edge * 0.0045;
          vec2 distortion = proceduralDistortion * uDistortionIntensityXY * 0.0032 * uDistortionIntensity;
          uv += (normalDrift + distortion) * mix(0.25, 1.0, uHighlightInfluence);
        }
        vec4 sampleColor = uUseMainTex > 0.5
          ? sekaiGammaTexture(texture2D(uMainTex, uv))
          : vec4(1.0);
        float textureAlpha = sampleColor.a;
        float alpha = uAlphaSource > 1.5
          ? sampleColor.r
          : (uAlphaSource > 0.5 ? 1.0 : textureAlpha);
        if (uAlphaSource > 1.5 && sampleColor.r < uThreshold) {
          discard;
        }
        if (uAlphaSource < 0.5 && uMode > 1.5 && uStrictAlpha < 0.5) {
          float brightness = max(max(sampleColor.r, sampleColor.g), sampleColor.b);
          float alphaLow = mix(0.06, 0.16, uThreshold);
          float alphaHigh = mix(0.32, 0.55, uThreshold);
          float brightnessMask = smoothstep(alphaLow, alphaHigh, brightness);
          alpha = textureAlpha * brightnessMask;
        }
        if (alpha < max(uAlphaCutoff, 0.001)) {
          discard;
        }
        alpha *= uAlphaScale;
        if (alpha < 0.001) {
          discard;
        }
        vec3 color = sampleColor.rgb * uTintColor + uEmissionColor;
        if (uMode > 0.5 && uMode < 1.5) {
          color *= mix(1.0, 1.04, uLightInfluence);
        }
        if (uMode > 1.5) {
          float brightness = max(max(sampleColor.r, sampleColor.g), sampleColor.b);
          color = max(color, vec3(brightness) * uTintColor);
          color *= 1.05 + alpha * mix(0.65, 1.05, uHighlightInfluence);
          if (uAlphaSource < 0.5) {
            alpha = clamp(alpha * mix(1.1, 1.55, uHighlightInfluence), 0.0, 1.0);
          }
        }
        gl_FragColor = vec4(outputColor(clamp(color, 0.0, 1.0)), alpha);
      }
    `,
  });
  material.forceSinglePass = true;
  return material;
}

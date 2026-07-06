import * as THREE from "three";

export type BodyMaterialUniforms = {
  baseColor: THREE.ColorRepresentation;
  shadowColor: THREE.ColorRepresentation;
  skinColorDefault?: THREE.ColorRepresentation;
  skinColor1?: THREE.ColorRepresentation;
  skinColor2?: THREE.ColorRepresentation;
  mainTex?: THREE.Texture | null;
  shadowTex?: THREE.Texture | null;
  valueTex?: THREE.Texture | null;
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
  rimIntensity?: number;
  controllerRimThreshold?: number;
  rimDirectionality?: number;
  rimDirection?: THREE.Vector3;
  specularPower?: number;
  rimThreshold?: number;
  shadowTexWeight?: number;
  hairShadowEnabled?: boolean;
  lambertEnabled?: boolean;
  headPosition?: THREE.Vector3;
  saturation?: number;
  partsAmbientColor?: THREE.ColorRepresentation;
  reflectionBlendColor?: THREE.ColorRepresentation;
  globalShadowColor?: THREE.ColorRepresentation;
  controllerAmbientColor?: THREE.ColorRepresentation;
  controllerRimColor?: THREE.ColorRepresentation;
  controllerShadowRimColor?: THREE.ColorRepresentation;
  controllerRimColorWeight?: number;
  controllerShadowRimColorWeight?: number;
  controllerRimEdgeSmoothness?: number;
  controllerRimShadowSharpness?: number;
  bodyDebugMode?: number;
  skinTintEnabled?: boolean;
  alphaCutoff?: number;
};

export function createSekaiBodyMaterial(initial: BodyMaterialUniforms) {
  return new THREE.ShaderMaterial({
    transparent: false,
    depthWrite: true,
    side: THREE.DoubleSide,
    vertexColors: true,
    uniforms: {
      uBaseColor: { value: new THREE.Color(initial.baseColor) },
      uShadowColor: { value: new THREE.Color(initial.shadowColor) },
      uSkinColorDefault: { value: new THREE.Color(initial.skinColorDefault ?? initial.baseColor) },
      uSkinColor1: { value: new THREE.Color(initial.skinColor1 ?? initial.shadowColor) },
      uSkinColor2: { value: new THREE.Color(initial.skinColor2 ?? initial.skinColor1 ?? initial.shadowColor) },
      uPartsAmbientColor: { value: new THREE.Color(initial.partsAmbientColor ?? "#ffffff") },
      uReflectionBlendColor: { value: new THREE.Color(initial.reflectionBlendColor ?? "#ffffff") },
      uGlobalShadowColor: { value: new THREE.Color(initial.globalShadowColor ?? "#ffffff") },
      uControllerAmbientColor: { value: new THREE.Color(initial.controllerAmbientColor ?? "#ffffff") },
      uControllerRimColor: { value: new THREE.Color(initial.controllerRimColor ?? "#e6edf9") },
      uControllerShadowRimColor: { value: new THREE.Color(initial.controllerShadowRimColor ?? "#ffffff") },
      uControllerRimColorWeight: {
        value: initial.controllerRimColorWeight ?? (initial.controllerRimColor ? 1.0 : 0.0),
      },
      uControllerShadowRimColorWeight: {
        value: initial.controllerShadowRimColorWeight ?? (initial.controllerShadowRimColor ? 1.0 : 0.0),
      },
      uControllerRimEdgeSmoothness: { value: initial.controllerRimEdgeSmoothness ?? 0.38 },
      uControllerRimShadowSharpness: { value: initial.controllerRimShadowSharpness ?? 0.0 },
      uBodyDebugMode: { value: initial.bodyDebugMode ?? 0 },
      uMainTex: { value: initial.mainTex ?? null },
      uShadowTex: { value: initial.shadowTex ?? null },
      uValueTex: { value: initial.valueTex ?? null },
      uUseMainTex: { value: initial.mainTex ? 1.0 : 0.0 },
      uUseShadowTex: { value: initial.shadowTex ? 1.0 : 0.0 },
      uUseValueTex: { value: initial.valueTex ? 1.0 : 0.0 },
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
      uRimIntensity: { value: initial.rimIntensity ?? 0.35 },
      uControllerRimThreshold: { value: initial.controllerRimThreshold ?? 0.18 },
      uRimDirectionality: { value: initial.rimDirectionality ?? 0.85 },
      uRimDirection: {
        value: (initial.rimDirection ?? new THREE.Vector3(0, 0.70710678, -0.70710678)).clone().normalize(),
      },
      uSpecularPower: { value: initial.specularPower ?? 0 },
      uRimThreshold: { value: initial.rimThreshold ?? 0.2 },
      uShadowTexWeight: { value: initial.shadowTexWeight ?? 1 },
      uHairShadowEnabled: { value: initial.hairShadowEnabled ? 1.0 : 0.0 },
      uLambertEnabled: { value: initial.lambertEnabled ? 1.0 : 0.0 },
      uHeadPosition: {
        value: (initial.headPosition ?? new THREE.Vector3()).clone(),
      },
      uSaturation: { value: initial.saturation ?? 0.5 },
      uSkinTintEnabled: { value: initial.skinTintEnabled === false ? 0.0 : 1.0 },
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
      uniform vec3 uReflectionBlendColor;
      uniform vec3 uGlobalShadowColor;
      uniform vec3 uControllerAmbientColor;
      uniform vec3 uControllerRimColor;
      uniform vec3 uControllerShadowRimColor;
      uniform float uControllerRimColorWeight;
      uniform float uControllerShadowRimColorWeight;
      uniform float uControllerRimEdgeSmoothness;
      uniform float uControllerRimShadowSharpness;
      uniform float uBodyDebugMode;
      uniform sampler2D uMainTex;
      uniform sampler2D uShadowTex;
      uniform sampler2D uValueTex;
      uniform float uUseMainTex;
      uniform float uUseShadowTex;
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
      uniform float uRimIntensity;
      uniform float uControllerRimThreshold;
      uniform float uRimDirectionality;
      uniform vec3 uRimDirection;
      uniform float uSpecularPower;
      uniform float uRimThreshold;
      uniform float uShadowTexWeight;
      uniform float uHairShadowEnabled;
      uniform float uLambertEnabled;
      uniform vec3 uHeadPosition;
      uniform float uSaturation;
      uniform float uSkinTintEnabled;
      uniform float uAlphaCutoff;

      varying vec3 vWorldPosition;
      varying vec3 vWorldNormal;
      varying vec3 vViewPosition;
      varying vec3 vModelPosition;
      varying vec2 vUv;

      vec3 outputColor(vec3 color) {
        bvec3 cutoff = lessThanEqual(color, vec3(0.0031308));
        vec3 lower = color * 12.92;
        vec3 higher = pow(max(color, vec3(0.0)), vec3(1.0 / 2.4)) * 1.055 - vec3(0.055);
        return mix(higher, lower, vec3(cutoff));
      }

      vec3 applyMaterialSaturation(vec3 color, float saturation) {
        float gray = dot(color, vec3(0.299, 0.587, 0.114));
        float amount = clamp(1.055 + (saturation - 0.5) * 0.35, 0.65, 1.35);
        return mix(vec3(gray), color, amount);
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
          mainSample = texture2D(uMainTex, vUv);
          if (uAlphaCutoff > 0.0 && mainSample.a < uAlphaCutoff) {
            discard;
          }
          mainColor = mainSample.rgb;
        }
        vec3 rawMainColor = mainColor;
        vec3 shadowValue = mainColor;
        if (uUseShadowTex > 0.5) {
          shadowValue = mix(shadowValue, texture2D(uShadowTex, vUv).rgb, clamp(uShadowTexWeight, 0.0, 1.0));
        }
        vec3 rawShadowValue = shadowValue;
        vec4 valueSample = vec4(0.0, 0.0, 0.5, 0.0);
        if (uUseValueTex > 0.5) {
          valueSample = texture2D(uValueTex, vUv);
        }
        float skinMask = (uSkinTintEnabled > 0.5 && uUseValueTex > 0.5) ? step(0.5, valueSample.r) : 0.0;
        float skinTextureLuma = dot(mainColor, vec3(0.299, 0.587, 0.114));
        float skinLinePreserve = smoothstep(0.36, 0.72, skinTextureLuma);
        float skinTintMask = skinMask * skinLinePreserve;
        float skinRamp = smoothstep(0.36, 0.92, mainSample.r);
        vec3 skinWarmBias = vec3(1.040, 0.970, 0.945);
        vec3 skinShadowWarmBias = vec3(1.095, 0.925, 1.020);
        vec3 skinLitColor = mix(uSkinColor1, uSkinColorDefault, skinRamp) * skinWarmBias;
        vec3 skinShadowRampColor = mix(uSkinColor2, uSkinColor1, skinRamp) * skinShadowWarmBias;
        vec3 skinShadowColor = mix(skinShadowRampColor, skinLitColor, 0.08);
        mainColor = mix(mainColor, skinLitColor, skinTintMask);
        shadowValue = mix(shadowValue, skinShadowColor, skinTintMask);
        float hMask = valueSample.b;
        float hAlpha = valueSample.a;
        float vertexOutlineIntensity = 1.0;
        float vertexRimMask = 1.0;
        #ifdef USE_COLOR
        vertexOutlineIntensity = clamp(vColor.r, 0.0, 1.0);
        vertexRimMask = clamp(vColor.g, 0.0, 1.0);
        #endif

        float halfNdl = clamp(ndl * 0.5 + 0.5, 0.0, 1.0);
        float lambertNdl = clamp(ndl, 0.0, 1.0);
        float toonLightInput = mix(halfNdl, lambertNdl, step(0.5, uLambertEnabled));
        float materialShadowThreshold = clamp(uShadowThreshold, 0.0, 1.0);
        float shadowWidth = (uShadowWidthOverride >= 0.0)
          ? uShadowWidthOverride
          : uShadowWidth;
        float geometricLitBand = toonBand(toonLightInput, materialShadowThreshold, shadowWidth);
        float hShadowOffset = (uUseValueTex > 0.5) ? (hMask * 2.0 - 1.0) : 0.0;
        float toonLuma = clamp(toonLightInput + hShadowOffset, 0.0, 1.0);
        float hAdjustedLitBand = toonBand(toonLuma, materialShadowThreshold, shadowWidth);
        float geometricShadowBand = clamp((1.0 - geometricLitBand) * uShadowWeight, 0.0, 1.0);
        float hAdjustedShadowBand = clamp((1.0 - hAdjustedLitBand) * uShadowWeight, 0.0, 1.0);
        float valueShadowInfluence = clamp(uValueShadowInfluence, 0.0, 1.0);
        float litBand = mix(geometricLitBand, hAdjustedLitBand, valueShadowInfluence);
        float shadowBand = mix(geometricShadowBand, hAdjustedShadowBand, valueShadowInfluence);
        if (uHairShadowEnabled > 0.5) {
          vec3 fromHead = vWorldPosition - uHeadPosition;
          float headDistance = length(fromHead);
          vec3 headDirection = headDistance > 0.0001 ? fromHead / headDistance : vec3(0.0, 1.0, 0.0);
          float behindHead = smoothstep(0.1, 0.92, dot(headDirection, -lightDir));
          float headProximity = 1.0 - smoothstep(0.18, 0.78, headDistance);
          shadowBand = max(shadowBand, behindHead * headProximity * 0.42 * uShadowWeight);
        }
        litBand = clamp(1.0 - shadowBand, 0.0, 1.0);

        // PJSK character shader semantics: C is the lit color; S already owns the toon-shadow target color.
        vec3 fallbackShadowColor = mainColor * uShadowColor * uGlobalShadowColor;
        vec3 shadowColor = (uUseShadowTex > 0.5) ? shadowValue * uGlobalShadowColor : fallbackShadowColor;
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
            debugValue = hAdjustedShadowBand;
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
        vec3 color = mix(mainColor, shadowColor, shadowBand);

        vec3 partsAmbient = mix(vec3(1.0), uPartsAmbientColor, 0.62);
        vec3 ambientTint = partsAmbient * uControllerAmbientColor;
        float sceneAmbient = clamp(uAmbientIntensity, 0.0, 1.0);
        float characterAmbient = clamp(uCharacterAmbientIntensity, 0.0, 1.0);
        float ambientShadowFocus = smoothstep(0.08, 0.72, shadowBand);
        float ambientLitSupport = sceneAmbient * 0.07 * (1.0 - shadowBand);
        float ambientShadowSupport = characterAmbient * mix(0.055, 0.21, ambientShadowFocus);
        float ambientWeight = clamp(ambientLitSupport + ambientShadowSupport, 0.0, 0.24);
        vec3 ambientTarget = max(color, mainColor * ambientTint);
        if (uBodyDebugMode > 12.5 && uBodyDebugMode < 13.5) {
          gl_FragColor = vec4(outputColor(clamp(ambientTarget, 0.0, 1.0)), 1.0);
          return;
        } else if (uBodyDebugMode > 13.5 && uBodyDebugMode < 14.5) {
          gl_FragColor = vec4(outputColor(vec3(clamp(ambientWeight / 0.24, 0.0, 1.0))), 1.0);
          return;
        } else if (uBodyDebugMode > 14.5 && uBodyDebugMode < 15.5) {
          gl_FragColor = vec4(outputColor(clamp(ambientTint, 0.0, 1.0)), 1.0);
          return;
        }
        color = mix(color, ambientTarget, ambientWeight);

        float halfLambert = clamp(dot(normal, normalize(lightDir + viewDir)), 0.0, 1.0);
        float specEnabled = step(0.01, uSpecularPower);
        float specPower = mix(18.0, 42.0, clamp(uSpecularPower / 8.0, 0.0, 1.0));
        float specMask = hAlpha * specEnabled;
        float litGate = toonBand(ndl, -0.02, 0.12);
        float specular = pow(halfLambert, specPower) * specMask * litGate;
        vec3 specularAdd = uReflectionBlendColor * specular * uLightIntensity * 0.22;

        float nDotV = clamp(dot(normal, viewDir), 0.0, 1.0);
        vec3 rimDirection = normalize(uRimDirection);
        float nDotRim = dot(normal, rimDirection);
        float vDotRim = max(dot(viewDir, rimDirection), 0.0);
        float rimFactorX = 7.2;
        float rimFactorZ = clamp(uControllerRimEdgeSmoothness, 0.02, 1.0);
        float rimFactorW = clamp(uRimDirectionality, 0.0, 1.0);
        float viewFresnel = pow(1.0 - nDotV, 10.0 - rimFactorX);
        float rimSideGate = smoothstep(-0.28, 0.48, nDotRim);
        float rimDirectionGate = mix(1.0, mix(0.32, 1.0, rimSideGate), rimFactorW);
        float rimViewGate = mix(1.0, mix(0.62, 1.0, vDotRim), rimFactorW * 0.45);
        float rimBase = viewFresnel * rimDirectionGate * rimViewGate;
        float rimThreshold = clamp(max(uRimThreshold, uControllerRimThreshold), 0.0, 0.95);
        float rim = smoothstep(0.0, rimFactorZ, rimBase - rimThreshold);
        float rimMask = vertexRimMask;
        vec3 controllerRimBase = mix(
          vec3(0.9, 0.93, 0.98),
          uControllerRimColor,
          clamp(uControllerRimColorWeight, 0.0, 1.0)
        );
        vec3 rimLitColor = mix(controllerRimBase, uReflectionBlendColor, 0.2);
        vec3 controllerShadowRimBase = mix(
          shadowColor,
          uControllerShadowRimColor,
          clamp(uControllerShadowRimColorWeight, 0.0, 1.0)
        );
        vec3 rimShadowColor = mix(controllerShadowRimBase, rimLitColor, 0.42);
        float rimShadowTransitionWidth = mix(1.0, 0.08, clamp(uControllerRimShadowSharpness, 0.0, 1.0));
        float rimColorMix = smoothstep(
          -rimShadowTransitionWidth * 0.5,
          rimShadowTransitionWidth * 0.5,
          nDotRim
        );
        vec3 rimColor = mix(rimLitColor, rimShadowColor, rimColorMix);
        float rimEnergy = 0.42 * uRimIntensity * clamp(0.72 + uLightIntensity, 0.0, 1.25);
        float rimGate = rimMask * rimEnergy * mix(0.42, 1.0, litBand);
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

        color *= mix(vec3(1.0), uPartsAmbientColor, 0.06);
        color *= vec3(1.024, 0.998, 0.986);
        color = applyMaterialSaturation(color, uSaturation);
        gl_FragColor = vec4(outputColor(clamp(color, 0.0, 1.0)), 1.0);
      }
    `,
  });
}

export function updateSekaiBodyMaterial(
  material: THREE.ShaderMaterial,
  next: BodyMaterialUniforms
) {
  material.uniforms.uBaseColor.value.set(next.baseColor);
  material.uniforms.uShadowColor.value.set(next.shadowColor);
  material.uniforms.uSkinColorDefault.value.set(next.skinColorDefault ?? next.baseColor);
  material.uniforms.uSkinColor1.value.set(next.skinColor1 ?? next.shadowColor);
  material.uniforms.uSkinColor2.value.set(next.skinColor2 ?? next.skinColor1 ?? next.shadowColor);
  material.uniforms.uPartsAmbientColor.value.set(next.partsAmbientColor ?? "#ffffff");
  material.uniforms.uReflectionBlendColor.value.set(next.reflectionBlendColor ?? "#ffffff");
  material.uniforms.uGlobalShadowColor.value.set(next.globalShadowColor ?? "#ffffff");
  material.uniforms.uControllerAmbientColor.value.set(next.controllerAmbientColor ?? "#ffffff");
  material.uniforms.uControllerRimColor.value.set(next.controllerRimColor ?? "#e6edf9");
  material.uniforms.uControllerShadowRimColor.value.set(next.controllerShadowRimColor ?? "#ffffff");
  material.uniforms.uControllerRimColorWeight.value =
    next.controllerRimColorWeight ?? (next.controllerRimColor ? 1.0 : 0.0);
  material.uniforms.uControllerShadowRimColorWeight.value =
    next.controllerShadowRimColorWeight ?? (next.controllerShadowRimColor ? 1.0 : 0.0);
  material.uniforms.uControllerRimEdgeSmoothness.value = next.controllerRimEdgeSmoothness ?? 0.38;
  material.uniforms.uControllerRimShadowSharpness.value = next.controllerRimShadowSharpness ?? 0.0;
  if (next.bodyDebugMode !== undefined && material.uniforms.uBodyDebugMode) {
    material.uniforms.uBodyDebugMode.value = next.bodyDebugMode;
  }
  material.uniforms.uMainTex.value = next.mainTex ?? null;
  material.uniforms.uShadowTex.value = next.shadowTex ?? null;
  material.uniforms.uValueTex.value = next.valueTex ?? null;
  material.uniforms.uUseMainTex.value = next.mainTex ? 1.0 : 0.0;
  material.uniforms.uUseShadowTex.value = next.shadowTex ? 1.0 : 0.0;
  material.uniforms.uUseValueTex.value = next.valueTex ? 1.0 : 0.0;
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
  if (next.lambertEnabled !== undefined && material.uniforms.uLambertEnabled) {
    material.uniforms.uLambertEnabled.value = next.lambertEnabled ? 1.0 : 0.0;
  }
  if (next.headPosition && material.uniforms.uHeadPosition) {
    material.uniforms.uHeadPosition.value.copy(next.headPosition);
  }
  material.uniforms.uCharacterAmbientIntensity.value = next.characterAmbientIntensity ?? 0.3;
  material.uniforms.uRimIntensity.value = next.rimIntensity ?? 0.35;
  material.uniforms.uControllerRimThreshold.value = next.controllerRimThreshold ?? 0.18;
  material.uniforms.uRimDirectionality.value = next.rimDirectionality ?? 0.85;
  material.uniforms.uRimDirection.value.copy(
    (next.rimDirection ?? new THREE.Vector3(0, 0.70710678, -0.70710678)).clone().normalize()
  );
  material.uniforms.uSpecularPower.value = next.specularPower ?? 0;
  material.uniforms.uRimThreshold.value = next.rimThreshold ?? 0.2;
  material.uniforms.uShadowTexWeight.value = next.shadowTexWeight ?? 1;
  material.uniforms.uSaturation.value = next.saturation ?? 0.5;
  material.uniforms.uSkinTintEnabled.value = next.skinTintEnabled === false ? 0.0 : 1.0;
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
  faceShadowTex?: THREE.Texture | null;
  lightDirection: THREE.Vector3;
  lightIntensity: number;
  ambientIntensity: number;
  faceSoftness: number;
  faceSdfUseLightDirection?: number;
  headDotDirectionalLight?: THREE.Vector2;
  useFaceShadowLimiter?: boolean;
  faceShadowLimitRange?: number;
  faceDebugMode?: number;
  faceDebugLightMode?: number;
  faceSdfEnabled?: boolean;
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
      uBaseColor: { value: new THREE.Color(initial.baseColor) },
      uWarmColor: { value: new THREE.Color(initial.warmColor) },
      uSkinColorDefault: { value: new THREE.Color(initial.skinColorDefault ?? initial.baseColor) },
      uSkinColor1: { value: new THREE.Color(initial.skinColor1 ?? initial.warmColor) },
      uSkinColor2: { value: new THREE.Color(initial.skinColor2 ?? initial.warmColor) },
      uMainTex: { value: initial.mainTex ?? null },
      uShadowTex: { value: initial.shadowTex ?? null },
      uFaceShadowTex: { value: initial.faceShadowTex ?? null },
      uUseMainTex: { value: initial.mainTex ? 1.0 : 0.0 },
      uUseShadowTex: { value: initial.shadowTex ? 1.0 : 0.0 },
      uUseFaceShadowTex: { value: initial.faceShadowTex ? 1.0 : 0.0 },
      uLightDirection: { value: initial.lightDirection.clone().normalize() },
      uFaceRight: { value: new THREE.Vector3(1, 0, 0) },
      uFaceUp: { value: new THREE.Vector3(0, 1, 0) },
      uFaceForward: { value: new THREE.Vector3(0, 0, 1) },
      uHeadDotDirectionalLight: {
        value: (initial.headDotDirectionalLight ?? new THREE.Vector2(0, 0)).clone(),
      },
      uUseFaceShadowLimiter: { value: initial.useFaceShadowLimiter === false ? 0.0 : 1.0 },
      uFaceShadowLimitRange: { value: initial.faceShadowLimitRange ?? 0.0 },
      uLightIntensity: { value: initial.lightIntensity },
      uAmbientIntensity: { value: initial.ambientIntensity },
      uFaceSoftness: { value: initial.faceSoftness },
      uFaceSdfUseLightDirection: { value: initial.faceSdfUseLightDirection ?? 0.5 },
      uFaceDebugMode: { value: initial.faceDebugMode ?? 0 },
      uFaceDebugLightMode: { value: initial.faceDebugLightMode ?? 0 },
      uFaceSdfEnabled: { value: initial.faceSdfEnabled && initial.faceShadowTex ? 1.0 : 0.0 },
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
          vFaceShadowUv = uv1;
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
      uniform sampler2D uFaceShadowTex;
      uniform float uUseMainTex;
      uniform float uUseShadowTex;
      uniform float uUseFaceShadowTex;
      uniform vec3 uLightDirection;
      uniform vec3 uFaceRight;
      uniform vec3 uFaceUp;
      uniform vec3 uFaceForward;
      uniform vec2 uHeadDotDirectionalLight;
      uniform float uUseFaceShadowLimiter;
      uniform float uFaceShadowLimitRange;
      uniform float uLightIntensity;
      uniform float uAmbientIntensity;
      uniform float uFaceSoftness;
      uniform float uFaceSdfUseLightDirection;
      uniform float uFaceDebugMode;
      uniform float uFaceDebugLightMode;
      uniform float uFaceSdfEnabled;

      varying vec3 vWorldNormal;
      varying vec2 vUv;
      varying vec2 vFaceShadowUv;

      vec3 outputColor(vec3 color) {
        bvec3 cutoff = lessThanEqual(color, vec3(0.0031308));
        vec3 lower = color * 12.92;
        vec3 higher = pow(max(color, vec3(0.0)), vec3(1.0 / 2.4)) * 1.055 - vec3(0.055);
        return mix(higher, lower, vec3(cutoff));
      }

      void main() {
        vec4 mainSample = vec4(1.0);
        vec3 mainColor = uBaseColor;
        if (uUseMainTex > 0.5) {
          mainSample = texture2D(uMainTex, vUv);
          mainColor = mainSample.rgb;
        }

        vec3 color = mainColor;
        float faceSkinLuma = dot(mainColor, vec3(0.299, 0.587, 0.114));
        float faceSkinMask = smoothstep(0.46, 0.82, faceSkinLuma) * (1.0 - smoothstep(0.92, 0.99, faceSkinLuma));
        float faceSkinRamp = smoothstep(0.36, 0.92, mainSample.r);
        vec3 faceSkinLit = mix(uSkinColor1, uSkinColorDefault, faceSkinRamp);
        vec3 faceSkinShadow = mix(uSkinColor2, uSkinColor1, faceSkinRamp);
        color = mix(color, faceSkinLit, faceSkinMask * 0.58);
        if ((uFaceSdfEnabled > 0.5 || uFaceDebugMode > 0.5) && uUseShadowTex > 0.5 && uUseFaceShadowTex > 0.5) {
          vec3 shadowColor = texture2D(uShadowTex, vUv).rgb;
          shadowColor = mix(shadowColor, faceSkinShadow, faceSkinMask * 0.75);
          vec3 faceForward = normalize(uFaceForward);
          vec3 faceRight = normalize(uFaceRight - faceForward * dot(uFaceRight, faceForward));
          vec3 faceUp = normalize(uFaceUp - faceForward * dot(uFaceUp, faceForward) - faceRight * dot(uFaceUp, faceRight));
          vec3 lightDir = normalize(uLightDirection);
          if (uFaceDebugLightMode > 0.5) {
            if (uFaceDebugLightMode < 1.5) {
              lightDir = faceForward;
            } else if (uFaceDebugLightMode < 2.5) {
              lightDir = -faceRight;
            } else if (uFaceDebugLightMode < 3.5) {
              lightDir = faceRight;
            } else {
              lightDir = -faceForward;
            }
          }
          vec3 tbnLight = vec3(dot(lightDir, faceRight), dot(lightDir, faceUp), dot(lightDir, faceForward));
          vec2 faceLight = tbnLight.xz / max(length(tbnLight.xz), 0.001);
          float officialSide = clamp(uHeadDotDirectionalLight.x, -1.0, 1.0);
          float officialRange = clamp(uHeadDotDirectionalLight.y, 0.0, 1.0);
          float faceSide = mix(faceLight.x, officialSide, clamp(uFaceSdfUseLightDirection, 0.0, 1.0));
          float faceFront = faceLight.y;
          vec2 sdfUv = vFaceShadowUv;
          // SekaiShaderTextureHelper does abs(uv * -1 + FlipX):
          // a positive helper sign flips X, while zero/negative keeps the
          // repeated texture on the original side. Keep a neutral zone so
          // back/near-back light does not jitter between both SDF halves.
          if (faceSide > 0.05) {
            sdfUv.x = 1.0 - sdfUv.x;
          }
          float sdfValue = texture2D(uFaceShadowTex, sdfUv).r;
          // Runtime face SDF semantics: compare SDF against horizontal angle.
          // acos(max(dot(front, light), 0)) / (pi / 2). Flip only mirrors UV.
          float sdfLimit = acos(max(faceFront, 0.0)) / 1.5707963;
          sdfLimit *= clamp(uFaceSdfUseLightDirection, 0.0, 1.0);
          sdfLimit = clamp(sdfLimit, 0.015, 0.985);
          float sdfWidth = mix(0.018, 0.11, clamp(uFaceSoftness, 0.0, 1.0));
          float sideGate = smoothstep(0.035, 0.18, abs(faceSide));
          float rangeLimit = clamp(uFaceShadowLimitRange, 0.0, 1.0);
          float rangeGate = uUseFaceShadowLimiter > 0.5
            ? smoothstep(rangeLimit, min(rangeLimit + 0.18, 1.0), officialRange)
            : 1.0;
          float sdfMask = 1.0 - smoothstep(sdfLimit - sdfWidth, sdfLimit + sdfWidth, sdfValue);
          sdfMask *= sideGate * rangeGate;
          if (uFaceDebugMode > 0.5) {
            if (uFaceDebugMode < 1.5) {
              gl_FragColor = vec4(outputColor(vec3(sdfValue)), 1.0);
              return;
            }
            if (uFaceDebugMode < 2.5) {
              gl_FragColor = vec4(outputColor(vec3(sdfMask)), 1.0);
              return;
            }
            if (uFaceDebugMode < 3.5) {
              gl_FragColor = vec4(outputColor(vec3(sdfLimit)), 1.0);
              return;
            }
            if (uFaceDebugMode < 4.5) {
              gl_FragColor = vec4(outputColor(max(vec3(faceSide, -faceSide, faceFront), vec3(0.0))), 1.0);
              return;
            }
            gl_FragColor = vec4(outputColor(vec3(officialRange)), 1.0);
            return;
          }
          if (uFaceSdfEnabled > 0.5) {
            color = mix(mainColor, shadowColor, sdfMask);
          }
        }
        float sceneExposure = clamp(0.86 + uLightIntensity * 0.24 + uAmbientIntensity * 0.16, 0.80, 1.16);
        color *= sceneExposure * vec3(1.018, 0.992, 0.980);
        gl_FragColor = vec4(outputColor(clamp(color, 0.0, 1.0)), 1.0);
      }
    `,
  });
}

export function updateSekaiFaceMaterial(
  material: THREE.ShaderMaterial,
  next: FaceMaterialUniforms
) {
  material.uniforms.uBaseColor.value.set(next.baseColor);
  material.uniforms.uWarmColor.value.set(next.warmColor);
  material.uniforms.uSkinColorDefault.value.set(next.skinColorDefault ?? next.baseColor);
  material.uniforms.uSkinColor1.value.set(next.skinColor1 ?? next.warmColor);
  material.uniforms.uSkinColor2.value.set(next.skinColor2 ?? next.warmColor);
  material.uniforms.uMainTex.value = next.mainTex ?? null;
  material.uniforms.uShadowTex.value = next.shadowTex ?? null;
  material.uniforms.uFaceShadowTex.value = next.faceShadowTex ?? null;
  material.uniforms.uUseMainTex.value = next.mainTex ? 1.0 : 0.0;
  material.uniforms.uUseShadowTex.value = next.shadowTex ? 1.0 : 0.0;
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
  material.uniforms.uFaceSoftness.value = next.faceSoftness;
  if (next.faceSdfUseLightDirection !== undefined && material.uniforms.uFaceSdfUseLightDirection) {
    material.uniforms.uFaceSdfUseLightDirection.value = next.faceSdfUseLightDirection;
  }
  if (next.faceDebugMode !== undefined) {
    material.uniforms.uFaceDebugMode.value = next.faceDebugMode;
  }
  if (next.faceDebugLightMode !== undefined) {
    material.uniforms.uFaceDebugLightMode.value = next.faceDebugLightMode;
  }
  if (material.uniforms.uFaceSdfEnabled) {
    material.uniforms.uFaceSdfEnabled.value = next.faceSdfEnabled && next.faceShadowTex ? 1.0 : 0.0;
  }
}

export function updateSekaiFaceBasis(
  material: THREE.ShaderMaterial,
  faceRight: THREE.Vector3,
  faceUp: THREE.Vector3,
  faceForward: THREE.Vector3
) {
  material.uniforms.uFaceRight?.value.copy(faceRight).normalize();
  material.uniforms.uFaceUp?.value.copy(faceUp).normalize();
  material.uniforms.uFaceForward?.value.copy(faceForward).normalize();
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
    blendSrc: isAdditive ? THREE.SrcAlphaFactor : undefined,
    blendDst: isAdditive ? THREE.OneFactor : undefined,
    blendEquation: isAdditive ? THREE.AddEquation : undefined,
    polygonOffset: true,
    polygonOffsetFactor: isEyelight ? -0.5 : -1,
    polygonOffsetUnits: isEyelight ? -0.5 : -1,
    uniforms: {
      uMainTex: { value: texture },
      uUseMainTex: { value: texture ? 1.0 : 0.0 },
      uMode: { value: mode === "eye" ? 1.0 : isEyelight ? 2.0 : 0.0 },
      uTintColor: { value: new THREE.Color(options?.tintColor ?? "#ffffff") },
      uEmissionColor: { value: new THREE.Color(options?.emissionColor ?? "#000000") },
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

      varying vec2 vUv;
      varying vec3 vViewNormal;

      vec3 outputColor(vec3 color) {
        bvec3 cutoff = lessThanEqual(color, vec3(0.0031308));
        vec3 lower = color * 12.92;
        vec3 higher = pow(max(color, vec3(0.0)), vec3(1.0 / 2.4)) * 1.055 - vec3(0.055);
        return mix(higher, lower, vec3(cutoff));
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
        vec4 sampleColor = uUseMainTex > 0.5 ? texture2D(uMainTex, uv) : vec4(1.0);
        float textureAlpha = sampleColor.a;
        float alpha = textureAlpha;
        if (uMode > 1.5 && uStrictAlpha < 0.5) {
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
          alpha = clamp(alpha * mix(1.1, 1.55, uHighlightInfluence), 0.0, 1.0);
        }
        gl_FragColor = vec4(outputColor(clamp(color, 0.0, 1.0)), alpha);
      }
    `,
  });
  material.forceSinglePass = true;
  return material;
}

export type SekaiBaseShadowInput = {
  normalDotLight: number;
  valueB: number;
  useLambert: boolean;
  useValueTex: boolean;
  threshold: number;
  width: number;
  fadeMode: number;
};

export type SekaiFaceShadowInput = {
  sdf: number;
  mirroredSdf: number;
  headDotX: number;
  headDotY: number;
  mirror: number;
  bias: number;
  useLimiter: boolean;
  rangeLimit: number;
  width: number;
  fadeMode: number;
};

export type SekaiFaceSphereShadowInput = {
  shadow: number;
  worldPosition: readonly [number, number, number];
  headPosition: readonly [number, number, number];
  lightDirection: readonly [number, number, number];
  edge: number;
  smoothness: number;
  weight: number;
};

function saturate(value: number) {
  return Math.min(Math.max(value, 0), 1);
}

function smooth01(value: number) {
  const x = saturate(value);
  return x * x * (3 - 2 * x);
}

export function evaluateSekaiBaseShadow(input: SekaiBaseShadowInput) {
  const halfLambert = input.normalDotLight * 0.5 + 0.5;
  const baseLight = input.useLambert ? halfLambert : 1;
  const valueB = input.useValueTex ? input.valueB : 0.5;
  const rawLight = saturate(baseLight + 2 * valueB - 1);
  const threshold = saturate(input.threshold);
  const width = saturate(input.width);
  const denominator = input.fadeMode < 0.5
    ? Math.max(threshold * width, 1e-5)
    : Math.max((1 - threshold) * width, 1e-5);
  const q = input.fadeMode < 0.5
    ? saturate((rawLight - threshold * (1 - width)) / denominator)
    : saturate((rawLight - threshold) / denominator);
  return { rawLight, shadow: 1 - smooth01(q) };
}

export function evaluateSekaiFaceShadow(input: SekaiFaceShadowInput) {
  const sdf = input.mirror * input.headDotX <= 0 ? input.mirroredSdf : input.sdf;
  const threshold = saturate((input.useLimiter
    ? Math.min(
        Math.max((1 - Math.abs(2 * input.headDotY - 1)) * 0.5, 0),
        input.rangeLimit
      )
    : input.headDotY) + input.bias);
  const width = saturate(input.width);
  const q = input.fadeMode < 0.5
    ? saturate((threshold - sdf) / Math.max((1 - sdf) * width, 1e-5))
    : saturate((sdf - threshold) / Math.max((1 - threshold) * width, 1e-5));
  const shadow = input.fadeMode < 0.5 ? smooth01(q) : 1 - smooth01(q);
  return { sdf, threshold, shadow };
}

export function evaluateSekaiFaceSphereShadow(input: SekaiFaceSphereShadowInput) {
  const headLengthSquared = input.headPosition.reduce((sum, value) => sum + value * value, 0);
  if (input.weight <= 0.001 || headLengthSquared <= 1e-6) {
    return saturate(input.shadow);
  }
  const fromHead = input.worldPosition.map(
    (value, index) => value - input.headPosition[index]
  );
  const fromHeadLength = Math.hypot(...fromHead);
  const lightLength = Math.hypot(...input.lightDirection);
  if (fromHeadLength <= 1e-6 || lightLength <= 1e-6) {
    return saturate(input.shadow);
  }
  const dot = fromHead.reduce(
    (sum, value, index) =>
      sum + value / fromHeadLength * input.lightDirection[index] / lightLength,
    0
  );
  const width = Math.max(input.smoothness, 0);
  const q = saturate((dot - (input.edge - width)) / Math.max(width * 2, 1e-5));
  return saturate(input.shadow + (1 - smooth01(q)) * input.weight);
}

export function evaluateSekaiHighlightRolloff(
  color: readonly [number, number, number],
  brightness: number,
  highlightRolloff: number
) {
  const threshold = Math.min(Math.max(highlightRolloff, 0.5), 0.98);
  return color.map((channel) => {
    const bright = channel * brightness;
    if (bright < threshold) {
      return bright;
    }
    const normalized = Math.max(bright - threshold, 0) / (1 - threshold);
    return threshold + (1 - threshold) * normalized / (normalized + 1);
  }) as [number, number, number];
}

export const sekaiCharacterShadowFunctionsGlsl = `
float sekaiSmooth01(float value) {
  float x = clamp(value, 0.0, 1.0);
  return x * x * (3.0 - 2.0 * x);
}

float sekaiBaseShadow(
  float normalDotLight,
  float valueB,
  float useLambert,
  float useValueTex,
  float threshold,
  float width,
  float fadeMode
) {
  float halfLambert = normalDotLight * 0.5 + 0.5;
  float baseLight = useLambert > 0.5 ? halfLambert : 1.0;
  float selectedValueB = useValueTex > 0.5 ? valueB : 0.5;
  float rawLight = clamp(baseLight + 2.0 * selectedValueB - 1.0, 0.0, 1.0);
  float t = clamp(threshold, 0.0, 1.0);
  float w = clamp(width, 0.0, 1.0);
  float q = fadeMode < 0.5
    ? clamp((rawLight - t * (1.0 - w)) / max(t * w, 0.00001), 0.0, 1.0)
    : clamp((rawLight - t) / max((1.0 - t) * w, 0.00001), 0.0, 1.0);
  return 1.0 - sekaiSmooth01(q);
}

float sekaiFaceShadow(
  float sdf,
  float threshold,
  float width,
  float fadeMode
) {
  float w = clamp(width, 0.0, 1.0);
  float q = fadeMode < 0.5
    ? clamp((threshold - sdf) / max((1.0 - sdf) * w, 0.00001), 0.0, 1.0)
    : clamp((sdf - threshold) / max((1.0 - threshold) * w, 0.00001), 0.0, 1.0);
  return fadeMode < 0.5 ? sekaiSmooth01(q) : 1.0 - sekaiSmooth01(q);
}
`;

export const sekaiCharacterColorFunctionsGlsl = `
vec3 sekaiApplyHsvc(
  vec3 color,
  float hueSin,
  float hueCos,
  float saturation,
  float value,
  float contrast
) {
  vec3 axis = vec3(0.577350259);
  vec3 rotated =
    color * hueCos +
    cross(axis, color) * hueSin +
    axis * dot(axis, color) * (1.0 - hueCos);
  rotated =
    (rotated - vec3(0.5)) * (contrast * 2.0) +
    vec3(value * 2.0 - 0.5);
  float luma = dot(rotated, vec3(0.22, 0.707, 0.071));
  return (rotated - vec3(luma)) * (saturation * 2.0) + vec3(luma);
}

float sekaiSkinMask(
  vec3 mainColor,
  vec4 valueSample,
  float useSkinColor,
  float skinMaskMode,
  float useValueTex
) {
  if (useSkinColor < 0.5) {
    return 0.0;
  }
  if (skinMaskMode < 0.5) {
    return 1.0;
  }

  float maxChannel = max(mainColor.r, max(mainColor.g, mainColor.b));
  float minChannel = min(mainColor.r, min(mainColor.g, mainColor.b));
  float chroma = maxChannel - minChannel;
  float redBlueA = smoothstep(0.035, 0.12, mainColor.r - mainColor.b);
  float redGreenA = smoothstep(-0.02, 0.04, mainColor.r - mainColor.g);
  float redBlueB = smoothstep(0.012, 0.08, mainColor.r - mainColor.b);
  float chromaLow = smoothstep(0.035, 0.09, chroma);
  float chromaHigh = 1.0 - smoothstep(0.4, 0.62, chroma);
  float brightness = smoothstep(0.52, 0.72, maxChannel);
  float redGreenB = 1.0 - smoothstep(0.22, 0.36, mainColor.r - mainColor.g);
  float alphaMask = 1.0 - smoothstep(0.02, 0.2, valueSample.a);
  float inferred =
    redBlueA * redGreenA * redBlueB *
    chromaLow * chromaHigh * brightness * redGreenB * alphaMask;

  float valueMask = clamp(valueSample.r, 0.0, 1.0);
  float useExportedMask = useValueTex >= 0.5 && valueMask >= 0.02 ? 1.0 : 0.0;
  return mix(inferred, valueMask, useExportedMask);
}

vec3 sekaiSkinRamp(
  float shadow,
  vec3 skinAmbient,
  vec3 defaultSkin,
  vec3 shadow1Skin,
  vec3 shadow2Skin
) {
  vec3 ambient = clamp(skinAmbient, 0.0, 1.0);
  vec3 lit = dot(defaultSkin, vec3(1.0)) >= 0.0001
    ? ambient * defaultSkin
    : ambient;
  vec3 mid = dot(shadow1Skin, vec3(1.0)) >= 0.0001
    ? ambient * shadow1Skin
    : lit;
  vec3 dark = dot(shadow2Skin, vec3(1.0)) >= 0.0001
    ? ambient * shadow2Skin
    : mid;
  vec3 firstBand = mix(lit, mid, clamp(shadow * 2.0, 0.0, 1.0));
  return mix(firstBand, dark, clamp(shadow * 2.0 - 1.0, 0.0, 1.0));
}

vec3 sekaiOverlay(vec3 base, vec3 blend) {
  vec3 multiplyBranch = 2.0 * base * blend;
  vec3 screenBranch = 1.0 - 2.0 * (1.0 - base) * (1.0 - blend);
  return mix(multiplyBranch, screenBranch, step(vec3(0.5), base));
}

vec3 sekaiApplyCharacterAmbient(
  vec3 color,
  vec3 ambientColor,
  float ambientIntensity,
  vec4 partsAmbientColor
) {
  vec3 overlaid = sekaiOverlay(color, ambientColor);
  float intensity = ambientIntensity;
  vec3 multiplied = overlaid * intensity * partsAmbientColor.rgb;
  vec3 screened =
    1.0 -
    2.0 * (1.0 - overlaid * intensity) * (1.0 - partsAmbientColor.rgb);
  return mix(screened, multiplied, clamp(partsAmbientColor.a, 0.0, 1.0));
}

vec3 sekaiApplyHighlightRolloff(
  vec3 color,
  float brightness,
  float highlightRolloff
) {
  vec3 bright = color * brightness;
  float threshold = min(max(highlightRolloff, 0.5), 0.98);
  vec3 normalized = max(bright - vec3(threshold), vec3(0.0)) /
    max(1.0 - threshold, 0.00001);
  vec3 compressed =
    vec3(threshold) +
    (1.0 - threshold) * normalized / (normalized + vec3(1.0));
  return mix(bright, compressed, step(vec3(threshold), bright));
}
`;

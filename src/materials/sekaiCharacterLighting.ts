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

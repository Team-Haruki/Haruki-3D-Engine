import * as THREE from "three";
import { FullScreenQuad } from "three/examples/jsm/postprocessing/Pass.js";
import {
  PRESETS as SMAA_PRESETS,
  SMAA_BLEND_FRAG,
  SMAA_BLEND_VERT,
  SMAA_EDGES_FRAG,
  SMAA_EDGES_VERT,
  SMAA_WEIGHTS_FRAG,
  SMAA_WEIGHTS_VERT,
  SMAATextures,
} from "glsl-smaa";

export const sekaiPreviewPostProcessDefaults = {
  referenceSize: 1024,
  maxOutputSize: 2048,
  maxLinearUpscale: 2,
  smaaSearchSteps: 16,
  smaaDiagonalSearchSteps: 8,
  smaaCornerRounding: 25,
  rcasSharpnessStops: 0.2,
} as const;

export function rcasSharpnessStopsToLinear(stops: number) {
  return Math.pow(2, -Math.max(0, Number.isFinite(stops) ? stops : 0));
}

export function resolveSekaiPreviewPostProcessSize(outputWidth: number, outputHeight: number) {
  const safeOutputWidth = Math.max(1, Math.round(outputWidth));
  const safeOutputHeight = Math.max(1, Math.round(outputHeight));
  if (safeOutputWidth !== safeOutputHeight) {
    throw new Error(
      `Sekai costume preview requires a square output surface, got ${safeOutputWidth}x${safeOutputHeight}.`
    );
  }
  if (safeOutputWidth > sekaiPreviewPostProcessDefaults.maxOutputSize) {
    throw new Error(
      `Sekai costume preview output must not exceed ${sekaiPreviewPostProcessDefaults.maxOutputSize}x${sekaiPreviewPostProcessDefaults.maxOutputSize}.`
    );
  }
  const inputSize = Math.min(
    safeOutputWidth,
    Math.max(
      sekaiPreviewPostProcessDefaults.referenceSize,
      Math.ceil(safeOutputWidth / sekaiPreviewPostProcessDefaults.maxLinearUpscale)
    )
  );
  return {
    inputWidth: inputSize,
    inputHeight: inputSize,
    outputWidth: safeOutputWidth,
    outputHeight: safeOutputHeight,
  };
}

export function resolveSekaiPreviewPixelRatio(
  width: number,
  height: number,
  requestedPixelRatio: number
) {
  const safeWidth = Math.max(1, Number.isFinite(width) ? width : 1);
  const safeHeight = Math.max(1, Number.isFinite(height) ? height : 1);
  const safeRequestedRatio = Math.max(
    0.1,
    Number.isFinite(requestedPixelRatio) ? requestedPixelRatio : 1
  );
  return Math.min(
    safeRequestedRatio,
    2,
    sekaiPreviewPostProcessDefaults.maxOutputSize / Math.max(safeWidth, safeHeight)
  );
}

const fullScreenVertexShader = /* glsl */`
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const easuFragmentShader = /* glsl */`
  precision highp float;
  precision highp int;

  uniform sampler2D tInput;
  uniform vec2 uInputSize;
  uniform vec2 uOutputSize;

  vec4 loadInput(ivec2 pixel) {
    ivec2 limit = ivec2(uInputSize) - ivec2(1);
    vec2 samplePixel = vec2(clamp(pixel, ivec2(0), limit)) + 0.5;
    return texture2D(tInput, samplePixel / uInputSize);
  }

  float luma2(vec3 color) {
    return color.g + 0.5 * (color.r + color.b);
  }

  void easuSet(
    inout vec2 direction,
    inout float edgeLength,
    vec2 subPixel,
    float weight,
    float lumaA,
    float lumaB,
    float lumaC,
    float lumaD,
    float lumaE
  ) {
    float dc = lumaD - lumaC;
    float cb = lumaC - lumaB;
    float lengthX = max(abs(dc), abs(cb));
    float directionX = lumaD - lumaB;
    direction.x += directionX * weight;
    lengthX = clamp(abs(directionX) / max(lengthX, 1e-6), 0.0, 1.0);
    edgeLength += lengthX * lengthX * weight;

    float ec = lumaE - lumaC;
    float ca = lumaC - lumaA;
    float lengthY = max(abs(ec), abs(ca));
    float directionY = lumaE - lumaA;
    direction.y += directionY * weight;
    lengthY = clamp(abs(directionY) / max(lengthY, 1e-6), 0.0, 1.0);
    edgeLength += lengthY * lengthY * weight;
  }

  void easuTap(
    inout vec3 accumulatedColor,
    inout float accumulatedWeight,
    vec2 offset,
    vec2 direction,
    vec2 anisotropicLength,
    float negativeLobe,
    float clippingPoint,
    vec3 color
  ) {
    vec2 rotatedOffset = vec2(
      offset.x * direction.x + offset.y * direction.y,
      offset.x * -direction.y + offset.y * direction.x
    ) * anisotropicLength;
    float distanceSquared = min(dot(rotatedOffset, rotatedOffset), clippingPoint);
    float windowB = 0.4 * distanceSquared - 1.0;
    float windowA = negativeLobe * distanceSquared - 1.0;
    windowB *= windowB;
    windowA *= windowA;
    windowB = (25.0 / 16.0) * windowB - (25.0 / 16.0 - 1.0);
    float weight = windowB * windowA;
    accumulatedColor += color * weight;
    accumulatedWeight += weight;
  }

  void main() {
    vec2 outputPixel = floor(gl_FragCoord.xy);
    vec2 sourcePosition = outputPixel * (uInputSize / uOutputSize)
      + 0.5 * (uInputSize / uOutputSize) - 0.5;
    ivec2 sourceBase = ivec2(floor(sourcePosition));
    vec2 subPixel = fract(sourcePosition);

    vec4 b4 = loadInput(sourceBase + ivec2( 0, -1));
    vec4 c4 = loadInput(sourceBase + ivec2( 1, -1));
    vec4 e4 = loadInput(sourceBase + ivec2(-1,  0));
    vec4 f4 = loadInput(sourceBase + ivec2( 0,  0));
    vec4 g4 = loadInput(sourceBase + ivec2( 1,  0));
    vec4 h4 = loadInput(sourceBase + ivec2( 2,  0));
    vec4 i4 = loadInput(sourceBase + ivec2(-1,  1));
    vec4 j4 = loadInput(sourceBase + ivec2( 0,  1));
    vec4 k4 = loadInput(sourceBase + ivec2( 1,  1));
    vec4 l4 = loadInput(sourceBase + ivec2( 2,  1));
    vec4 n4 = loadInput(sourceBase + ivec2( 0,  2));
    vec4 o4 = loadInput(sourceBase + ivec2( 1,  2));

    float bL = luma2(b4.rgb);
    float cL = luma2(c4.rgb);
    float eL = luma2(e4.rgb);
    float fL = luma2(f4.rgb);
    float gL = luma2(g4.rgb);
    float hL = luma2(h4.rgb);
    float iL = luma2(i4.rgb);
    float jL = luma2(j4.rgb);
    float kL = luma2(k4.rgb);
    float lL = luma2(l4.rgb);
    float nL = luma2(n4.rgb);
    float oL = luma2(o4.rgb);

    vec2 direction = vec2(0.0);
    float edgeLength = 0.0;
    easuSet(direction, edgeLength, subPixel,
      (1.0 - subPixel.x) * (1.0 - subPixel.y), bL, eL, fL, gL, jL);
    easuSet(direction, edgeLength, subPixel,
      subPixel.x * (1.0 - subPixel.y), cL, fL, gL, hL, kL);
    easuSet(direction, edgeLength, subPixel,
      (1.0 - subPixel.x) * subPixel.y, fL, iL, jL, kL, nL);
    easuSet(direction, edgeLength, subPixel,
      subPixel.x * subPixel.y, gL, jL, kL, lL, oL);

    float directionSquared = dot(direction, direction);
    direction = directionSquared < (1.0 / 32768.0)
      ? vec2(1.0, 0.0)
      : direction * inversesqrt(directionSquared);
    edgeLength = edgeLength * 0.5;
    edgeLength *= edgeLength;
    float stretch = 1.0 / max(abs(direction.x), abs(direction.y));
    vec2 anisotropicLength = vec2(
      mix(1.0, stretch, edgeLength),
      1.0 - 0.5 * edgeLength
    );
    float negativeLobe = mix(0.5, 0.21, edgeLength);
    float clippingPoint = 1.0 / negativeLobe;

    vec3 minimum = min(min(f4.rgb, g4.rgb), min(j4.rgb, k4.rgb));
    vec3 maximum = max(max(f4.rgb, g4.rgb), max(j4.rgb, k4.rgb));
    vec3 accumulatedColor = vec3(0.0);
    float accumulatedWeight = 0.0;
    easuTap(accumulatedColor, accumulatedWeight, vec2( 0.0, -1.0) - subPixel, direction, anisotropicLength, negativeLobe, clippingPoint, b4.rgb);
    easuTap(accumulatedColor, accumulatedWeight, vec2( 1.0, -1.0) - subPixel, direction, anisotropicLength, negativeLobe, clippingPoint, c4.rgb);
    easuTap(accumulatedColor, accumulatedWeight, vec2(-1.0,  1.0) - subPixel, direction, anisotropicLength, negativeLobe, clippingPoint, i4.rgb);
    easuTap(accumulatedColor, accumulatedWeight, vec2( 0.0,  1.0) - subPixel, direction, anisotropicLength, negativeLobe, clippingPoint, j4.rgb);
    easuTap(accumulatedColor, accumulatedWeight, vec2( 0.0,  0.0) - subPixel, direction, anisotropicLength, negativeLobe, clippingPoint, f4.rgb);
    easuTap(accumulatedColor, accumulatedWeight, vec2(-1.0,  0.0) - subPixel, direction, anisotropicLength, negativeLobe, clippingPoint, e4.rgb);
    easuTap(accumulatedColor, accumulatedWeight, vec2( 1.0,  1.0) - subPixel, direction, anisotropicLength, negativeLobe, clippingPoint, k4.rgb);
    easuTap(accumulatedColor, accumulatedWeight, vec2( 2.0,  1.0) - subPixel, direction, anisotropicLength, negativeLobe, clippingPoint, l4.rgb);
    easuTap(accumulatedColor, accumulatedWeight, vec2( 2.0,  0.0) - subPixel, direction, anisotropicLength, negativeLobe, clippingPoint, h4.rgb);
    easuTap(accumulatedColor, accumulatedWeight, vec2( 1.0,  0.0) - subPixel, direction, anisotropicLength, negativeLobe, clippingPoint, g4.rgb);
    easuTap(accumulatedColor, accumulatedWeight, vec2( 1.0,  2.0) - subPixel, direction, anisotropicLength, negativeLobe, clippingPoint, o4.rgb);
    easuTap(accumulatedColor, accumulatedWeight, vec2( 0.0,  2.0) - subPixel, direction, anisotropicLength, negativeLobe, clippingPoint, n4.rgb);

    vec3 color = clamp(accumulatedColor / max(accumulatedWeight, 1e-6), minimum, maximum);
    gl_FragColor = vec4(color, f4.a);
  }
`;

const rcasFragmentShader = /* glsl */`
  precision highp float;
  precision highp int;

  uniform sampler2D tInput;
  uniform vec2 uInputSize;
  uniform float uSharpness;

  vec4 loadInput(ivec2 pixel) {
    ivec2 limit = ivec2(uInputSize) - ivec2(1);
    vec2 samplePixel = vec2(clamp(pixel, ivec2(0), limit)) + 0.5;
    return texture2D(tInput, samplePixel / uInputSize);
  }

  vec3 safeRatio(vec3 numerator, vec3 denominator) {
    return vec3(
      abs(denominator.r) > 1e-6 ? numerator.r / denominator.r : 0.0,
      abs(denominator.g) > 1e-6 ? numerator.g / denominator.g : 0.0,
      abs(denominator.b) > 1e-6 ? numerator.b / denominator.b : 0.0
    );
  }

  void main() {
    ivec2 pixel = ivec2(floor(gl_FragCoord.xy));
    vec3 b = loadInput(pixel + ivec2( 0, -1)).rgb;
    vec3 d = loadInput(pixel + ivec2(-1,  0)).rgb;
    vec4 center = loadInput(pixel);
    vec3 e = center.rgb;
    vec3 f = loadInput(pixel + ivec2( 1,  0)).rgb;
    vec3 h = loadInput(pixel + ivec2( 0,  1)).rgb;

    vec3 minimum = min(min(b, d), min(f, h));
    vec3 maximum = max(max(b, d), max(f, h));
    vec3 hitMinimum = safeRatio(min(minimum, e), 4.0 * maximum);
    vec3 hitMaximum = safeRatio(1.0 - max(maximum, e), 4.0 * minimum - 4.0);
    vec3 lobeByChannel = max(-hitMinimum, hitMaximum);
    float lobe = max(
      -(0.25 - 1.0 / 16.0),
      min(max(lobeByChannel.r, max(lobeByChannel.g, lobeByChannel.b)), 0.0)
    ) * uSharpness;
    float reciprocalWeight = 1.0 / (4.0 * lobe + 1.0);
    vec3 color = (lobe * (b + d + f + h) + e) * reciprocalWeight;
    gl_FragColor = vec4(clamp(color, 0.0, 1.0), center.a);
    #include <colorspace_fragment>
  }
`;

function adaptSmaaVertexShader(shader: string) {
  return shader
    .replace("attribute vec2 aPosition;", "")
    .split("aPosition")
    .join("position.xy");
}

function createSmaaLookupTexture(name: string, source: string, filter: THREE.MagnificationTextureFilter) {
  const image = new Image();
  const texture = new THREE.Texture(image);
  texture.name = name;
  texture.minFilter = filter;
  texture.magFilter = filter;
  texture.generateMipmaps = false;
  texture.flipY = false;
  const ready = new Promise<void>((resolve, reject) => {
    image.onload = () => {
      texture.needsUpdate = true;
      resolve();
    };
    image.onerror = () => reject(new Error(`Failed to load ${name} lookup texture.`));
  });
  image.src = source;
  return { texture, ready };
}

class SmaaHighPass {
  private readonly edgesTarget = new THREE.WebGLRenderTarget(1, 1, {
    depthBuffer: false,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    type: THREE.UnsignedByteType,
  });
  private readonly weightsTarget = new THREE.WebGLRenderTarget(1, 1, {
    depthBuffer: false,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    type: THREE.UnsignedByteType,
  });
  private readonly areaLookup = createSmaaLookupTexture(
    "SMAA.area",
    SMAATextures.area,
    THREE.LinearFilter
  );
  private readonly searchLookup = createSmaaLookupTexture(
    "SMAA.search",
    SMAATextures.search,
    THREE.NearestFilter
  );
  readonly ready = Promise.all([
    this.areaLookup.ready,
    this.searchLookup.ready,
  ]).then(() => undefined);
  private readonly texelSize = new THREE.Vector2(1, 1);
  private readonly viewportSize = new THREE.Vector2(1, 1);
  private readonly edgesMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uColorTexture: { value: null },
      uTexelSize: { value: this.texelSize },
    },
    vertexShader: adaptSmaaVertexShader(SMAA_EDGES_VERT),
    fragmentShader: `#define SMAA_PRESET_HIGH\n#define SMAA_EDGES_COLOR\n${SMAA_PRESETS}\n${SMAA_EDGES_FRAG}`,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  private readonly weightsMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uEdgesTexture: { value: this.edgesTarget.texture },
      uAreaTexture: { value: this.areaLookup.texture },
      uSearchTexture: { value: this.searchLookup.texture },
      uTexelSize: { value: this.texelSize },
      uViewportSize: { value: this.viewportSize },
    },
    vertexShader: `#define SMAA_PRESET_HIGH\n${SMAA_PRESETS}\n${adaptSmaaVertexShader(SMAA_WEIGHTS_VERT)}`,
    fragmentShader: `#define SMAA_PRESET_HIGH\n${SMAA_PRESETS}\n${SMAA_WEIGHTS_FRAG}`,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  private readonly blendMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uColorTexture: { value: null },
      uBlendTexture: { value: this.weightsTarget.texture },
      uTexelSize: { value: this.texelSize },
    },
    vertexShader: adaptSmaaVertexShader(SMAA_BLEND_VERT),
    fragmentShader: SMAA_BLEND_FRAG,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  private readonly fullScreenQuad = new FullScreenQuad();

  setSize(width: number, height: number) {
    this.edgesTarget.setSize(width, height);
    this.weightsTarget.setSize(width, height);
    this.texelSize.set(1 / width, 1 / height);
    this.viewportSize.set(width, height);
  }

  render(
    renderer: THREE.WebGLRenderer,
    input: THREE.WebGLRenderTarget,
    output: THREE.WebGLRenderTarget
  ) {
    this.edgesMaterial.uniforms.uColorTexture.value = input.texture;
    this.fullScreenQuad.material = this.edgesMaterial;
    renderer.setRenderTarget(this.edgesTarget);
    this.fullScreenQuad.render(renderer);

    this.fullScreenQuad.material = this.weightsMaterial;
    renderer.setRenderTarget(this.weightsTarget);
    this.fullScreenQuad.render(renderer);

    this.blendMaterial.uniforms.uColorTexture.value = input.texture;
    this.fullScreenQuad.material = this.blendMaterial;
    renderer.setRenderTarget(output);
    this.fullScreenQuad.render(renderer);
  }

  dispose() {
    this.edgesTarget.dispose();
    this.weightsTarget.dispose();
    this.areaLookup.texture.dispose();
    this.searchLookup.texture.dispose();
    this.edgesMaterial.dispose();
    this.weightsMaterial.dispose();
    this.blendMaterial.dispose();
    this.fullScreenQuad.dispose();
  }
}

export class SekaiPreviewPostProcessor {
  private readonly sceneTarget = new THREE.WebGLRenderTarget(1, 1, {
    depthBuffer: true,
    stencilBuffer: true,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    type: THREE.UnsignedByteType,
  });
  private readonly smaaTarget = new THREE.WebGLRenderTarget(1, 1, {
    depthBuffer: false,
    stencilBuffer: false,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    type: THREE.UnsignedByteType,
  });
  private readonly easuTarget = new THREE.WebGLRenderTarget(1, 1, {
    depthBuffer: false,
    stencilBuffer: false,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    type: THREE.UnsignedByteType,
  });
  private readonly smaaPass = new SmaaHighPass();
  private readonly easuMaterial = new THREE.ShaderMaterial({
    uniforms: {
      tInput: { value: null },
      uInputSize: { value: new THREE.Vector2(1, 1) },
      uOutputSize: { value: new THREE.Vector2(1, 1) },
    },
    vertexShader: fullScreenVertexShader,
    fragmentShader: easuFragmentShader,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  private readonly rcasMaterial = new THREE.ShaderMaterial({
    uniforms: {
      tInput: { value: null },
      uInputSize: { value: new THREE.Vector2(1, 1) },
      uSharpness: {
        value: rcasSharpnessStopsToLinear(
          sekaiPreviewPostProcessDefaults.rcasSharpnessStops
        ),
      },
    },
    vertexShader: fullScreenVertexShader,
    fragmentShader: rcasFragmentShader,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  private readonly fullScreenQuad = new FullScreenQuad();
  private size = resolveSekaiPreviewPostProcessSize(1, 1);

  constructor(private readonly renderer: THREE.WebGLRenderer) {}

  waitUntilReady() {
    return this.smaaPass.ready;
  }

  setSize(outputWidth: number, outputHeight: number) {
    this.size = resolveSekaiPreviewPostProcessSize(outputWidth, outputHeight);
    const { inputWidth, inputHeight } = this.size;
    this.sceneTarget.setSize(inputWidth, inputHeight);
    this.smaaTarget.setSize(inputWidth, inputHeight);
    this.easuTarget.setSize(this.size.outputWidth, this.size.outputHeight);
    this.smaaPass.setSize(inputWidth, inputHeight);
    this.easuMaterial.uniforms.uInputSize.value.set(inputWidth, inputHeight);
    this.easuMaterial.uniforms.uOutputSize.value.set(
      this.size.outputWidth,
      this.size.outputHeight
    );
    this.rcasMaterial.uniforms.uInputSize.value.set(
      this.size.outputWidth,
      this.size.outputHeight
    );
  }

  render(scene: THREE.Scene, camera: THREE.Camera) {
    const previousTarget = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.sceneTarget);
    this.renderer.render(scene, camera);

    this.smaaPass.render(this.renderer, this.sceneTarget, this.smaaTarget);

    this.easuMaterial.uniforms.tInput.value = this.smaaTarget.texture;
    this.fullScreenQuad.material = this.easuMaterial;
    this.renderer.setRenderTarget(this.easuTarget);
    this.fullScreenQuad.render(this.renderer);

    this.rcasMaterial.uniforms.tInput.value = this.easuTarget.texture;
    this.fullScreenQuad.material = this.rcasMaterial;
    this.renderer.setRenderTarget(null);
    this.fullScreenQuad.render(this.renderer);
    if (previousTarget !== null) {
      this.renderer.setRenderTarget(previousTarget);
    }
  }

  dispose() {
    this.sceneTarget.dispose();
    this.smaaTarget.dispose();
    this.easuTarget.dispose();
    this.smaaPass.dispose();
    this.easuMaterial.dispose();
    this.rcasMaterial.dispose();
    this.fullScreenQuad.dispose();
  }
}

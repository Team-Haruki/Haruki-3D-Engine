import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

import {
  createSekaiOutlineMaterial,
  evaluateSekaiOutlineColor,
  evaluateSekaiOutlineFovFactor,
  readRawMaterialColor,
  sekaiCostumeShopOutlineControllerDefaults,
  sekaiCostumeShopOutlineSettings,
} from "../dist/haruki-3d-engine-internal.js";

function rawMaterial(overrides = {}) {
  return {
    shaderName: "Sekai/Character",
    shaderFileId: 0,
    shaderPathId: 1,
    shaderKey: "ref:0:1",
    textureProperties: [],
    colorProperties: [],
    floatProperties: [],
    intProperties: [],
    validKeywords: [],
    invalidKeywords: [],
    lightmapFlags: 0,
    enableInstancingVariants: false,
    doubleSidedGi: false,
    customRenderQueue: -1,
    stringTags: {},
    disabledShaderPasses: [],
    ...overrides,
  };
}

test("costume shop outline globals match the captured 6.6.2 runtime", () => {
  assert.deepEqual(sekaiCostumeShopOutlineSettings, {
    widthMin: 0.0004,
    widthMax: 0.0095,
    distanceNear: 0.45,
    distanceFar: 20,
  });
  assert.ok(
    Math.abs(evaluateSekaiOutlineFovFactor(25) - 1.027823567390442) < 1e-7
  );
});

test("raw material lookup preserves unknown exported color properties", () => {
  assert.deepEqual(
    readRawMaterialColor(rawMaterial({
      colorProperties: [
        { name: "_FutureColor", r: 0.1, g: 0.2, b: 0.3, a: 0.4 },
        { name: "_OutlineColor", r: 0.52, g: 0.47, b: 0.55, a: 1 },
      ],
    }), "_OutlineColor"),
    { r: 0.52, g: 0.47, b: 0.55, a: 1 }
  );
});

test("outline material consumes raw color, alpha clip, and texture transform", () => {
  const texture = new THREE.Texture();
  const material = createSekaiOutlineMaterial(
    true,
    rawMaterial({
      textureProperties: [{
        name: "_MainTex",
        textureName: "main",
        textureFileId: 0,
        texturePathId: 1,
        textureKey: "ref:0:1",
        scaleX: 2,
        scaleY: 3,
        offsetX: 0.25,
        offsetY: 0.5,
        colorSpace: 0,
        uri: "/main.ktx2",
      }],
      colorProperties: [
        { name: "_OutlineColor", r: 0.2, g: 0.3, b: 0.4, a: 1 },
      ],
      floatProperties: [
        { name: "_UseAlphaClip", value: 1 },
        { name: "_Cutoff", value: 0.375 },
      ],
    }),
    true,
    texture
  );
  assert.ok(Math.abs(material.color.r - 0.2) < 1e-7);
  assert.ok(Math.abs(material.color.g - 0.3) < 1e-7);
  assert.ok(Math.abs(material.color.b - 0.4) < 1e-7);
  assert.equal(material.alphaTest, 0.375);
  assert.equal(material.side, THREE.BackSide);
  assert.equal(material.depthWrite, true);
  assert.equal(material.blending, THREE.NoBlending);

  const shader = {
    uniforms: THREE.UniformsUtils.clone(THREE.ShaderLib.basic.uniforms),
    vertexShader: THREE.ShaderLib.basic.vertexShader,
    fragmentShader: THREE.ShaderLib.basic.fragmentShader,
  };
  material.onBeforeCompile(shader, {});
  assert.deepEqual(shader.uniforms.uSekaiMainTexST.value.toArray(), [2, 3, 0.25, 0.5]);
  assert.match(shader.vertexShader, /vSekaiMainTexUv = uv \* uSekaiMainTexST\.xy \+ uSekaiMainTexST\.zw;/);
  assert.match(shader.fragmentShader, /texture2D\(map, vSekaiMainTexUv\)/);
  assert.match(shader.fragmentShader, /diffuseColor\.rgb = mix\(/);

  material.dispose();
  texture.dispose();
});

test("outline color matches the captured 6.6.2 material/global blend formula", () => {
  assert.deepEqual(sekaiCostumeShopOutlineControllerDefaults, {
    color: { r: 0, g: 0, b: 0 },
    blending: 0.5,
  });
  assert.deepEqual(
    evaluateSekaiOutlineColor(
      { r: 0.8, g: 0.6, b: 0.4 },
      { r: 0.5, g: 0.25, b: 1 },
      { r: 0.1, g: 0.2, b: 0.3 },
      0.5
    ),
    { r: 0.25, g: 0.175, b: 0.35 }
  );
});

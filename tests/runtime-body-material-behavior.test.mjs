import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import {
  applyRawMaterialShaderUniforms,
  bindBodyRuntimeMaterials,
  createSekaiBodyMaterial,
} from "../dist/haruki-3d-engine-internal.js";

test("raw Unity material colors and alpha feature state override proxy defaults", () => {
  const material = createSekaiBodyMaterial({
    baseColor: "#ffffff",
    shadowColor: "#808080",
    lightDirection: new THREE.Vector3(0, 1, 0),
    lightIntensity: 1,
    ambientIntensity: 1,
    shadowThreshold: 0.5,
    shadowWeight: 1,
    alphaCutoff: 0.02,
  });
  applyRawMaterialShaderUniforms(material, {
    shaderFileId: 0,
    shaderPathId: 1,
    textureProperties: [],
    colorProperties: [
      { name: "_DefaultSkinColor", r: 0.9, g: 0.8, b: 0.7, a: 1 },
      { name: "_Shadow1SkinColor", r: 0.6, g: 0.5, b: 0.4, a: 1 },
      { name: "_Shadow2SkinColor", r: 0.3, g: 0.2, b: 0.1, a: 1 },
      { name: "_PartsAmbientColor", r: 0.4, g: 0.5, b: 0.6, a: 0.75 },
    ],
    floatProperties: [
      { name: "_UseAlphaClip", value: 1 },
      { name: "_Cutoff", value: 0.375 },
    ],
    intProperties: [],
    validKeywords: [],
    invalidKeywords: [],
    lightmapFlags: 0,
    enableInstancingVariants: false,
    doubleSidedGi: false,
    customRenderQueue: -1,
    stringTags: {},
    disabledShaderPasses: [],
  });

  assert.deepEqual(material.uniforms.uSkinColorDefault.value.toArray(), [0.9, 0.8, 0.7]);
  assert.deepEqual(material.uniforms.uSkinColor1.value.toArray(), [0.6, 0.5, 0.4]);
  assert.deepEqual(material.uniforms.uSkinColor2.value.toArray(), [0.3, 0.2, 0.1]);
  assert.equal(material.uniforms.uPartsAmbientAlpha.value, 0.75);
  assert.equal(material.uniforms.uAlphaCutoff.value, 0.375);
});

test("body material binding preserves exact Unity slots and texture sampling state", async () => {
  const loaded = [];
  const textureLoader = {
    async loadAsync(url) {
      const texture = new THREE.Texture();
      texture.name = url;
      loaded.push(texture);
      return texture;
    },
  };
  const originalMap = new THREE.Texture();
  originalMap.wrapS = THREE.MirroredRepeatWrapping;
  originalMap.wrapT = THREE.ClampToEdgeWrapping;
  originalMap.offset.set(0.25, 0.5);
  originalMap.repeat.set(2, 3);
  originalMap.center.set(0.1, 0.2);
  originalMap.rotation = 0.75;
  originalMap.magFilter = THREE.NearestFilter;
  originalMap.minFilter = THREE.LinearMipmapNearestFilter;
  originalMap.anisotropy = 4;
  originalMap.flipY = true;
  originalMap.colorSpace = THREE.LinearSRGBColorSpace;

  const originalMaterial = new THREE.MeshBasicMaterial({ map: originalMap });
  originalMaterial.name = "BodySource";
  originalMaterial.userData.pjskMaterialKey = "body:0";
  let originalDisposed = false;
  originalMaterial.dispose = () => {
    originalDisposed = true;
  };
  const fallbackMap = new THREE.Texture();
  const fallbackMaterial = new THREE.MeshBasicMaterial({ map: fallbackMap });
  fallbackMaterial.name = "BodyFallbackSource";
  fallbackMaterial.userData.pjskMaterialKey = "body:1";
  let fallbackDisposed = false;
  fallbackMaterial.dispose = () => {
    fallbackDisposed = true;
  };
  const mesh = new THREE.Mesh(
    new THREE.BufferGeometry(),
    [originalMaterial, fallbackMaterial]
  );
  mesh.name = "Body";
  const root = new THREE.Group();
  root.add(mesh);

  const template = createSekaiBodyMaterial({
    baseColor: "#ffffff",
    shadowColor: "#808080",
    lightDirection: new THREE.Vector3(0, 1, 0),
    lightIntensity: 1,
    ambientIntensity: 1,
    shadowThreshold: 0.5,
    shadowWeight: 1,
  });
  const targetDebug = [];
  const debug = await bindBodyRuntimeMaterials({
    root,
    bodyAsset: {
      id: "body",
      displayName: "Body",
      source: { bundleRoot: "", manifestUrl: "", meshUrl: "" },
      neckAnchor: { x: 0, y: 0, z: 0 },
      skeleton: {
        skeletonId: "body",
        neckAttach: { fallbackPosition: { x: 0, y: 0, z: 0 } },
      },
      bodyMaterials: [{
        meshName: "Body",
        slotIndex: 0,
        materialKey: "body:0",
        materialFileId: 1,
        materialPathId: 2,
        materialName: "BodyRuntime",
        materialKind: "body",
        mainTex: "/body-c.png",
        shadowTex: "/body-s.png",
        valueTex: "/body-h.png",
      }, {
        meshName: "Body",
        slotIndex: 1,
        materialKey: "body:1",
        materialFileId: 1,
        materialPathId: 3,
        materialName: "BodyFallback",
        materialKind: "body",
      }],
      proxy: {
        bodyColor: "#f0d0c0",
        shadowColor: "#c09080",
        bodyScale: 1,
        torsoLength: 1,
        shoulderWidth: 1,
      },
    },
    headAsset: null,
    textureLoader,
    template,
    bodyDebugMode: 7,
    debug: targetDebug,
  });

  assert.deepEqual(loaded.map((texture) => texture.name), [
    "/body-c.png",
    "/body-s.png",
    "/body-h.png",
  ]);
  assert.ok(Array.isArray(mesh.material));
  const [replacementMaterial, fallbackReplacementMaterial] = mesh.material;
  assert.ok(replacementMaterial instanceof THREE.ShaderMaterial);
  assert.ok(fallbackReplacementMaterial instanceof THREE.ShaderMaterial);
  assert.equal(replacementMaterial.userData.pjskMaterialKey, "body:0");
  assert.equal(replacementMaterial.userData.pjskMaterialKind, "body");
  assert.equal(mesh.userData.pjskMaterialKind, "body");
  assert.equal(replacementMaterial.uniforms.uShadowTex.value.colorSpace, THREE.SRGBColorSpace);
  assert.equal(replacementMaterial.uniforms.uValueTex.value.colorSpace, THREE.NoColorSpace);
  assert.equal(replacementMaterial.uniforms.uBodyDebugMode.value, 7);

  const replacementMap = replacementMaterial.uniforms.uMainTex.value;
  assert.equal(replacementMap.wrapS, originalMap.wrapS);
  assert.equal(replacementMap.wrapT, originalMap.wrapT);
  assert.deepEqual(replacementMap.offset.toArray(), originalMap.offset.toArray());
  assert.deepEqual(replacementMap.repeat.toArray(), originalMap.repeat.toArray());
  assert.deepEqual(replacementMap.center.toArray(), originalMap.center.toArray());
  assert.equal(replacementMap.rotation, originalMap.rotation);
  assert.equal(replacementMap.magFilter, originalMap.magFilter);
  assert.equal(replacementMap.minFilter, originalMap.minFilter);
  assert.equal(replacementMap.anisotropy, originalMap.anisotropy);
  assert.equal(replacementMap.flipY, originalMap.flipY);
  assert.equal(replacementMap.colorSpace, THREE.SRGBColorSpace);
  assert.equal(fallbackReplacementMaterial.uniforms.uMainTex.value, fallbackMap);
  assert.equal(fallbackReplacementMaterial.uniforms.uUseMainTex.value, 1);
  assert.equal(fallbackReplacementMaterial.uniforms.uBaseColor.value.getHex(), 0xffffff);
  assert.equal(originalDisposed, true);
  assert.equal(fallbackDisposed, true);
  assert.equal(debug, targetDebug);
  assert.equal(mesh.castShadow, false);
  assert.equal(mesh.receiveShadow, false);
  assert.deepEqual(debug.map(({ meshName, sourceMaterialName, resolvedKey, resolvedKind, usedOriginalMap }) => ({
    meshName,
    sourceMaterialName,
    resolvedKey,
    resolvedKind,
    usedOriginalMap,
  })), [{
    meshName: "Body",
    sourceMaterialName: "BodySource",
    resolvedKey: "body:0",
    resolvedKind: "body",
    usedOriginalMap: false,
  }, {
    meshName: "Body",
    sourceMaterialName: "BodyFallbackSource",
    resolvedKey: "body:1",
    resolvedKind: "body",
    usedOriginalMap: true,
  }]);
});

test("body texture binding starts independent texture loads concurrently and deduplicates matching URLs", async () => {
  const pending = new Map();
  const calls = [];
  const textureLoader = {
    loadAsync(url) {
      calls.push(url);
      return new Promise((resolve) => pending.set(url, resolve));
    },
  };
  const root = new THREE.Group();
  const template = createSekaiBodyMaterial({
    baseColor: "#ffffff",
    shadowColor: "#808080",
    lightDirection: new THREE.Vector3(0, 1, 0),
    lightIntensity: 1,
    ambientIntensity: 1,
    shadowThreshold: 0.5,
    shadowWeight: 1,
  });

  const binding = bindBodyRuntimeMaterials({
    root,
    bodyAsset: {
      id: "body",
      displayName: "Body",
      source: { bundleRoot: "", manifestUrl: "", meshUrl: "" },
      neckAnchor: { x: 0, y: 0, z: 0 },
      skeleton: {
        skeletonId: "body",
        neckAttach: { fallbackPosition: { x: 0, y: 0, z: 0 } },
      },
      bodyMaterials: [{
        meshName: "BodyA",
        slotIndex: 0,
        materialKey: "body:0",
        materialKind: "body",
        mainTex: "/shared.png",
        shadowTex: "/shadow.png",
      }, {
        meshName: "BodyB",
        slotIndex: 0,
        materialKey: "body:1",
        materialKind: "body",
        mainTex: "/shared.png",
        valueTex: "/value.png",
      }],
      proxy: {
        bodyColor: "#ffffff",
        shadowColor: "#808080",
        bodyScale: 1,
        torsoLength: 1,
        shoulderWidth: 1,
      },
    },
    headAsset: null,
    textureLoader,
    template,
    bodyDebugMode: 0,
  });

  await Promise.resolve();
  assert.deepEqual(calls, ["/shared.png", "/shadow.png", "/value.png"]);
  for (const [url, resolve] of pending) {
    const texture = new THREE.Texture();
    texture.name = url;
    resolve(texture);
  }
  await binding;
});

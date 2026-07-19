import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

import {
  CharacterLightingRuntime,
  createSekaiBodyMaterial,
  createSekaiFaceMaterial,
  previewLightDefaults,
} from "../dist/haruki-3d-engine-internal.js";

function shaderMaterial(kind, uniforms) {
  const material = new THREE.ShaderMaterial({ uniforms });
  material.userData.pjskMaterialKind = kind;
  return material;
}

test("character lighting owns material view state across templates and loaded slots", () => {
  const body = shaderMaterial("body", {
    uBodyDebugMode: { value: 0 },
    uShadowWidthOverride: { value: -1 },
    uValueShadowInfluence: { value: 0 },
  });
  const hair = shaderMaterial("hair", {
    uHairShadowEnabled: { value: 1 },
    uShadowWidthOverride: { value: -1 },
    uValueShadowInfluence: { value: 0 },
  });
  const face = shaderMaterial("face_sdf", {
    uFaceSdfEnabled: { value: 0 },
    uFaceDebugMode: { value: 0 },
  });
  face.userData.pjskFaceSdfCapable = true;
  const bodySlot = new THREE.Group();
  const headSlot = new THREE.Group();
  headSlot.add(new THREE.Mesh(new THREE.BufferGeometry(), [hair, face]));
  const debug = {
    hairShadowMode: "sekai_head_position",
    body: [{ resolvedKind: "body", shaderBodyDebugMode: 0 }],
    head: [
      { resolvedKind: "hair", shaderHairShadowEnabled: 1 },
      { resolvedKind: "face_sdf", faceSdfCapable: true, shaderFaceSdfEnabled: 0 },
    ],
  };
  const runtime = new CharacterLightingRuntime({
    bodyMaterial: body,
    hairMaterial: hair,
    faceMaterial: face,
    bodySlot,
    headSlot,
    directionalLight: new THREE.DirectionalLight(),
    fillLight: new THREE.AmbientLight(),
    debug,
  });

  runtime.setBodyDebugMode("toon_luma");
  runtime.setFaceSdfEnabled(true);
  runtime.setHairShadowMode("off");
  runtime.setToonShadowPreview(0.25, 0.75);

  assert.equal(body.uniforms.uBodyDebugMode.value, 24);
  assert.equal(face.uniforms.uFaceSdfEnabled.value, 1);
  assert.equal(hair.uniforms.uHairShadowEnabled.value, 0);
  assert.equal(body.uniforms.uShadowWidthOverride.value, 0.25);
  assert.equal(hair.uniforms.uValueShadowInfluence.value, 0.75);
  assert.equal(debug.hairShadowMode, "off");
  assert.deepEqual(runtime.getBindingView(), {
    bodyDebugMode: 24,
    faceDebugMode: 0,
    faceSdfEnabled: true,
    shadowWidthOverride: 0.25,
    valueShadowInfluence: 0.75,
    proximityHairShadowEnabled: false,
  });
});

function bodyTemplate(baseColor) {
  return createSekaiBodyMaterial({
    baseColor,
    shadowColor: "#222222",
    lightDirection: new THREE.Vector3(0, 1, 0),
    lightIntensity: 1,
    ambientIntensity: 1,
    shadowThreshold: 0.5,
    shadowWeight: 1,
  });
}

test("preview light updates lights, proxy colors, and material controller state together", () => {
  const body = bodyTemplate("#111111");
  const hair = bodyTemplate("#222222");
  const face = createSekaiFaceMaterial({
    baseColor: "#333333",
    warmColor: "#444444",
    lightDirection: new THREE.Vector3(0, 0, 1),
    lightIntensity: 1,
    ambientIntensity: 1,
  });
  const directionalLight = new THREE.DirectionalLight();
  const fillLight = new THREE.AmbientLight();
  const runtime = new CharacterLightingRuntime({
    bodyMaterial: body,
    hairMaterial: hair,
    faceMaterial: face,
    bodySlot: new THREE.Group(),
    headSlot: new THREE.Group(),
    directionalLight,
    fillLight,
    debug: { hairShadowMode: "off", body: [], head: [] },
  });
  runtime.updateControllerColors({ ambientColor: "#123456" });

  const next = {
    ...previewLightDefaults,
    x: 2,
    y: 3,
    z: 4,
    intensity: 1.25,
    ambient: 0.4,
  };
  runtime.updatePreviewLight(
    next,
    { proxy: { bodyColor: "#abcdef", shadowColor: "#102030" } },
    {
      proxy: {
        hairColor: "#fedcba",
        hairShadowColor: "#302010",
        faceColor: "#ffeedd",
        faceShadeColor: "#ddccbb",
      },
    },
    new THREE.Vector2(0.25, 0.75),
    new THREE.Vector3(1, 0, 0)
  );

  assert.deepEqual(directionalLight.position.toArray(), [2, 3, 4]);
  assert.equal(directionalLight.intensity, 1.25);
  assert.equal(fillLight.intensity, 0.4);
  assert.equal(body.uniforms.uBaseColor.value.getHexString(), "abcdef");
  assert.equal(hair.uniforms.uBaseColor.value.getHexString(), "fedcba");
  assert.equal(face.uniforms.uBaseColor.value.getHexString(), "ffeedd");
  assert.equal(body.uniforms.uControllerAmbientColor.value.getHexString(), "123456");
  assert.deepEqual(face.uniforms.uHeadDotDirectionalLight.value.toArray(), [0.25, 0.75]);
  assert.deepEqual(face.uniforms.uLightDirection.value.toArray(), [1, 0, 0]);
});

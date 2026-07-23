import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

import {
  createSekaiBodyMaterial,
  createSekaiFaceMaterial,
  createSekaiLayerMaterial,
  resolveSekaiPreviewPixelRatio,
  sekaiPreviewPostProcessDefaults,
} from "../dist/haruki-3d-engine-internal.js";

test("Sekai preview renders natively at up to 2K with post-processing disabled", () => {
  assert.deepEqual(sekaiPreviewPostProcessDefaults, {
    maxOutputSize: 2048,
    enabled: false,
  });
  assert.equal(resolveSekaiPreviewPixelRatio(1024, 1024, 2), 2);
  assert.equal(resolveSekaiPreviewPixelRatio(1280, 1280, 2), 1.6);
});

test("character shaders defer output encoding to the active render target", () => {
  const common = {
    baseColor: "#808080",
    lightDirection: new THREE.Vector3(0, 1, 0),
    lightIntensity: 1,
    ambientIntensity: 1,
  };
  const materials = [
    createSekaiBodyMaterial({
      ...common,
      shadowColor: "#404040",
      shadowThreshold: 0.5,
      shadowWeight: 1,
    }),
    createSekaiFaceMaterial({
      ...common,
      warmColor: "#604040",
    }),
    createSekaiLayerMaterial(null),
  ];

  for (const material of materials) {
    assert.match(
      material.fragmentShader,
      /return linearToOutputTexel\(vec4\(color, 1\.0\)\)\.rgb;/
    );
    assert.doesNotMatch(material.fragmentShader, /1\.0 \/ 2\.4/);
    material.dispose();
  }
});

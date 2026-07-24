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

test("Sekai preview preserves the established 1400x1000 scale-2 capture without post-processing", () => {
  assert.deepEqual(sekaiPreviewPostProcessDefaults, {
    maxOutputSize: 2800,
    enabled: false,
  });
  assert.equal(resolveSekaiPreviewPixelRatio(1024, 1024, 2), 2);
  assert.equal(resolveSekaiPreviewPixelRatio(1400, 1000, 2), 2);
  assert.equal(resolveSekaiPreviewPixelRatio(1600, 1600, 2), 1.75);
});

test("character shaders preserve the captured CostumeShop Gamma workflow", () => {
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

  assert.ok(
    Math.abs(materials[0].uniforms.uBaseColor.value.r - (128 / 255)) < 1e-6,
    "Unity Gamma material colors must not be converted to linear RGB"
  );

  for (const material of materials) {
    assert.match(
      material.fragmentShader,
      /vec3 outputColor\(vec3 color\) \{\s*return color;\s*\}/
    );
    assert.doesNotMatch(material.fragmentShader, /linearToOutputTexel/);
    assert.match(material.fragmentShader, /sekaiGammaTexture/);
    assert.match(material.fragmentShader, /1\.0 \/ 2\.4/);
    material.dispose();
  }
});

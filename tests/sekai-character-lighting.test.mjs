import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateSekaiBaseShadow,
  evaluateSekaiFaceShadow,
  evaluateSekaiFaceSphereShadow,
  previewLightDefaults,
  resolvePreviewLambertEnabled,
  sekaiCostumeShopDirectionalLightDirection,
  sekaiCostumeShopDirectionalLightRotationDegrees,
} from "../dist/haruki-3d-engine-internal.js";

test("costume preview keeps directional Lambert on for body and accessories", () => {
  assert.equal(resolvePreviewLambertEnabled("body", false), true);
  assert.equal(resolvePreviewLambertEnabled("accessory", false), true);
  assert.equal(resolvePreviewLambertEnabled("acc", false), true);
  assert.equal(resolvePreviewLambertEnabled("hair", false), false);
});

test("costume preview uses the official costume-shop directional transform", () => {
  assert.deepEqual(sekaiCostumeShopDirectionalLightRotationDegrees, {
    x: -15,
    y: 50,
    z: 0,
  });
  assert.deepEqual(
    {
      x: previewLightDefaults.x,
      y: previewLightDefaults.y,
      z: previewLightDefaults.z,
    },
    sekaiCostumeShopDirectionalLightDirection
  );
  assert.ok(Math.abs(Math.hypot(
    previewLightDefaults.x,
    previewLightDefaults.y,
    previewLightDefaults.z
  ) - 1) < 1e-12);
  assert.equal(previewLightDefaults.shadowThreshold, 0.40625);
});

test("official base toon uses half Lambert only when enabled", () => {
  assert.equal(evaluateSekaiBaseShadow({
    normalDotLight: -1,
    valueB: 0.5,
    useLambert: false,
    useValueTex: true,
    threshold: 0.4,
    width: 0,
    fadeMode: 0,
  }).shadow, 0);
  assert.equal(evaluateSekaiBaseShadow({
    normalDotLight: -1,
    valueB: 0.5,
    useLambert: true,
    useValueTex: true,
    threshold: 0.4,
    width: 0,
    fadeMode: 0,
  }).shadow, 1);
});

test("official toon width uses asymmetric FadeOut and Spread intervals", () => {
  const fadeOut = evaluateSekaiBaseShadow({
    normalDotLight: -0.4,
    valueB: 0.5,
    useLambert: true,
    useValueTex: true,
    threshold: 0.4,
    width: 0.5,
    fadeMode: 0,
  });
  const spread = evaluateSekaiBaseShadow({
    normalDotLight: 0.1,
    valueB: 0.5,
    useLambert: true,
    useValueTex: true,
    threshold: 0.4,
    width: 0.5,
    fadeMode: 1,
  });

  assert.ok(Math.abs(fadeOut.shadow - 0.5) < 1e-6);
  assert.ok(Math.abs(spread.shadow - 0.5) < 1e-6);
});

test("official FaceSDF mirrors UV choice and reuses the toon band", () => {
  const result = evaluateSekaiFaceShadow({
    sdf: 0.9,
    mirroredSdf: 0.1,
    headDotX: -0.5,
    headDotY: 0.75,
    mirror: 1,
    bias: 0,
    useLimiter: true,
    rangeLimit: 0.25,
    width: 0.2,
    fadeMode: 0,
  });

  assert.equal(result.sdf, 0.1);
  assert.equal(result.threshold, 0.25);
  assert.ok(Math.abs(result.shadow - 0.9259259259259258) < 1e-6);
});

test("official head sphere shadow is additive and independent of distance", () => {
  const near = evaluateSekaiFaceSphereShadow({
    shadow: 0.2,
    worldPosition: [1, 0, -1],
    headPosition: [1, 0, 0],
    lightDirection: [0, 0, 1],
    edge: 0,
    smoothness: 0.5,
    weight: 0.4,
  });
  const far = evaluateSekaiFaceSphereShadow({
    shadow: 0.2,
    worldPosition: [1, 0, -100],
    headPosition: [1, 0, 0],
    lightDirection: [0, 0, 1],
    edge: 0,
    smoothness: 0.5,
    weight: 0.4,
  });

  assert.ok(Math.abs(near - 0.6) < 1e-6);
  assert.ok(Math.abs(far - 0.6) < 1e-6);
});

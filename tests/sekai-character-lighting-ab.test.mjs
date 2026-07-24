import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateSekaiBaseShadow,
  evaluateSekaiFaceShadow,
} from "../dist/haruki-3d-engine-internal.js";

function saturate(value) {
  return Math.min(Math.max(value, 0), 1);
}

function smooth01(value) {
  const x = saturate(value);
  return x * x * (3 - 2 * x);
}

function legacyBaseShadow({ normalDotLight, valueB, threshold, width }) {
  const halfLambert = saturate(normalDotLight * 0.5 + 0.5);
  const rawLight = saturate(halfLambert + valueB * 2 - 1);
  const lit = width <= 0.0001
    ? Number(rawLight >= threshold)
    : smooth01((rawLight - (threshold - width)) / (width * 2));
  return 1 - lit;
}

function legacyFaceShadow({ sdf, faceFront, faceSoftness }) {
  const limit = Math.min(
    Math.max(Math.acos(Math.max(faceFront, 0)) / Math.PI * 2 * 0.5, 0.015),
    0.985
  );
  const width = 0.018 + (0.11 - 0.018) * saturate(faceSoftness);
  return 1 - smooth01((sdf - (limit - width)) / (width * 2));
}

test("fixed shoulder input proves the zero-width default was already algebraically equal", () => {
  const input = {
    normalDotLight: -0.4,
    valueB: 0.35,
    useLambert: true,
    useValueTex: true,
    threshold: 0.40625,
    width: 0,
    fadeMode: 0,
  };

  assert.equal(evaluateSekaiBaseShadow(input).shadow, legacyBaseShadow(input));
});

test("fixed nonzero-width input separates official FadeOut from the legacy symmetric band", () => {
  const input = {
    normalDotLight: -0.4,
    valueB: 0.5,
    useLambert: true,
    useValueTex: true,
    threshold: 0.4,
    width: 0.5,
    fadeMode: 0,
  };

  const official = evaluateSekaiBaseShadow(input).shadow;
  const legacy = legacyBaseShadow(input);
  assert.ok(Math.abs(official - 0.5) < 1e-6);
  assert.ok(Math.abs(legacy - official) > 0.1);
});

test("fixed face input removes the legacy reconstructed-angle gate", () => {
  const official = evaluateSekaiFaceShadow({
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
  }).shadow;
  const legacy = legacyFaceShadow({ sdf: 0.9, faceFront: 1, faceSoftness: 0.5 });

  assert.ok(official > 0.9);
  assert.equal(legacy, 0);
});

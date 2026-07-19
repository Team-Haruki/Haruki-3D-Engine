import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import {
  configureSekaiEyelashPass,
  configureSekaiFaceLayerStencilPrepass,
  configureSekaiHairStencil,
  createSekaiLayerMaterial,
  createSekaiThroughHairOverlayMesh,
  updateSekaiEyelashPassView,
} from "../dist/haruki-3d-engine-internal.js";

test("SekaiEyelash uses the official always-depth stencil pass", () => {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    uniforms: { uAlphaScale: { value: 1 } },
  });

  configureSekaiEyelashPass(material, 0x01);

  assert.equal(material.side, THREE.FrontSide);
  assert.equal(material.depthTest, true);
  assert.equal(material.depthWrite, false);
  assert.equal(material.depthFunc, THREE.AlwaysDepth);
  assert.equal(material.stencilWrite, true);
  assert.equal(material.stencilRef, 0x01);
  assert.equal(material.stencilFunc, THREE.EqualStencilFunc);
  assert.equal(material.stencilFuncMask, 0x01);
  assert.equal(material.stencilWriteMask, 0x01);
  assert.equal(material.stencilZPass, THREE.KeepStencilOp);
  assert.equal(material.blending, THREE.CustomBlending);
  assert.equal(material.blendSrc, THREE.SrcAlphaFactor);
  assert.equal(material.blendDst, THREE.OneMinusSrcAlphaFactor);
  assert.equal(material.blendSrcAlpha, THREE.ZeroFactor);
  assert.equal(material.blendDstAlpha, THREE.OneFactor);

});

test("through-hair overlay copies only the selected source submesh group", () => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([
    0, 0, 0,
    1, 0, 0,
    0, 1, 0,
    1, 1, 0,
  ], 3));
  geometry.setIndex([0, 1, 2, 1, 3, 2]);
  const source = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  source.name = "Face";
  source.position.set(1, 2, 3);
  source.layers.set(4);
  const material = new THREE.ShaderMaterial();
  material.userData.pjskMaterialKind = "eyelash_through_hair";

  const overlay = createSekaiThroughHairOverlayMesh(
    source,
    [{ start: 3, count: 3, materialIndex: 0 }],
    [material]
  );

  assert.ok(overlay);
  assert.notEqual(overlay.geometry, source.geometry);
  assert.deepEqual(overlay.geometry.groups, [{ start: 3, count: 3, materialIndex: 0 }]);
  assert.equal(overlay.position.equals(source.position), true);
  assert.equal(overlay.layers.mask, source.layers.mask);
  assert.equal(overlay.renderOrder, 2453);
  assert.equal(overlay.userData.pjskEyeThroughHairSource, source);
  assert.equal(overlay.userData.pjskEyeThroughHairSourceKind, "eyelash");
  assert.equal(overlay.userData.pjskEyeThroughHairPassKind, "overlay");
});

test("SekaiEyelash view alpha follows the captured FaceFront smoothstep", () => {
  const eye = createSekaiLayerMaterial(null, "eye");
  const eyebrow = createSekaiLayerMaterial(null, "alpha");
  const eyelight = createSekaiLayerMaterial(null, "eyelight");
  configureSekaiEyelashPass(eye, 0x01, "eye");
  configureSekaiEyelashPass(eyebrow, 0x01, "eyebrow");
  configureSekaiEyelashPass(eyelight, 0x01, "eyelight");

  assert.equal(eye.uniforms.uAlphaSource.value, 1);
  assert.equal(eyebrow.uniforms.uAlphaSource.value, 1);
  assert.equal(eyelight.uniforms.uAlphaSource.value, 2);
  assert.match(eye.fragmentShader, /uAlphaSource > 1\.5\s*\? sampleColor\.r/);
  assert.match(eye.fragmentShader, /uAlphaSource > 0\.5 \? 1\.0 : textureAlpha/);
  assert.match(eye.fragmentShader, /uAlphaSource > 1\.5 && sampleColor\.r < uThreshold/);
  assert.match(
    eye.fragmentShader,
    /if \(uAlphaSource < 0\.5\) \{\s*alpha = clamp\(alpha \* mix\(1\.1, 1\.55, uHighlightInfluence\)/s
  );
  assert.equal(updateSekaiEyelashPassView(eye, 1), 0.2);
  assert.equal(updateSekaiEyelashPassView(eye, 0.2), 0);
  assert.ok(Math.abs(updateSekaiEyelashPassView(eye, 0.55) - 0.1) < 1e-9);
  assert.equal(updateSekaiEyelashPassView(eye, -1), 0);
  assert.equal(updateSekaiEyelashPassView(eyebrow, 1), 0.5);
  assert.equal(eyebrow.uniforms.uAlphaScale.value, 0.5);
});

test("face layers and hair share one character formation stencil bit", () => {
  const prepass = new THREE.ShaderMaterial();
  const hair = new THREE.ShaderMaterial();

  configureSekaiFaceLayerStencilPrepass(prepass, 0x01);
  configureSekaiHairStencil(hair, 0x01);

  assert.equal(prepass.colorWrite, false);
  assert.equal(prepass.stencilRef, 0x01);
  assert.equal(prepass.stencilWriteMask, 0x01);
  assert.equal(prepass.depthFunc, THREE.LessEqualDepth);
  assert.equal(hair.stencilRef, 0);
  assert.equal(hair.stencilWriteMask, 0xfe);
});

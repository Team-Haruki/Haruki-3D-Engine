import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import {
  bindHeadRuntimeMaterials,
  createSekaiBodyMaterial,
} from "../dist/haruki-3d-engine-internal.js";

test("head material binding installs the official through-hair layers for the exact Unity slot", async () => {
  const textureLoader = {
    async loadAsync(url) {
      const texture = new THREE.Texture();
      texture.name = url;
      return texture;
    },
  };
  const originalMaterial = new THREE.MeshBasicMaterial();
  originalMaterial.name = "EyelashSource";
  originalMaterial.userData.pjskMaterialKey = "face:0";
  let originalDisposed = false;
  originalMaterial.dispose = () => {
    originalDisposed = true;
  };
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([
    0, 0, 0,
    1, 0, 0,
    0, 1, 0,
  ], 3));
  geometry.setIndex([0, 1, 2]);
  geometry.addGroup(0, 3, 0);
  const mesh = new THREE.Mesh(geometry, originalMaterial);
  mesh.name = "Face";
  const root = new THREE.Group();
  root.add(mesh);

  const bodyTemplate = createSekaiBodyMaterial({
    baseColor: "#ffffff",
    shadowColor: "#808080",
    lightDirection: new THREE.Vector3(0, 1, 0),
    lightIntensity: 1,
    ambientIntensity: 1,
    shadowThreshold: 0.5,
    shadowWeight: 1,
  });
  const debug = [];
  const result = await bindHeadRuntimeMaterials({
    root,
    headAsset: {
      id: "head",
      displayName: "Head",
      source: { bundleRoot: "", manifestUrl: "", meshUrl: "" },
      rawImportOffset: { x: 0, y: 0, z: 0 },
      assembly: {
        expectedSkeletonId: "head",
        attachOrigin: { fallbackPosition: { x: 0, y: 0, z: 0 } },
      },
      defaultFaceMode: "clean",
      faceMaterials: [{
        meshName: "Face",
        slotIndex: 0,
        materialKey: "face:0",
        materialFileId: 1,
        materialPathId: 2,
        materialName: "mtl_chr_Eyelash_00",
        materialKind: "eyelash",
        mainTex: "/eyelash.png",
        mode: "clean",
      }],
      proxy: {
        faceColor: "#ffffff",
        faceShadeColor: "#808080",
        hairColor: "#ffffff",
        hairShadowColor: "#808080",
        headRadius: 1,
        faceDepth: 1,
        hairArc: 1,
      },
    },
    textureLoader,
    templates: {
      body: bodyTemplate,
      hair: bodyTemplate,
      face: new THREE.ShaderMaterial(),
    },
    view: {
      bodyDebugMode: 0,
      faceDebugMode: 0,
      faceSdfEnabled: false,
    },
    hair: {
      controllerPresent: false,
      proximityShadowEnabled: false,
      headPosition: new THREE.Vector3(),
    },
    debug,
  });

  assert.equal(result, debug);
  assert.equal(originalDisposed, true);
  assert.ok(mesh.material instanceof THREE.ShaderMaterial);
  assert.equal(mesh.material.userData.pjskMaterialKey, "face:0");
  assert.equal(mesh.material.userData.pjskMaterialKind, "eyelash");
  assert.equal(mesh.castShadow, false);
  assert.equal(mesh.receiveShadow, false);

  const passMeshes = root.children.filter((child) => child !== mesh);
  assert.equal(passMeshes.length, 2);
  const prepass = passMeshes.find((child) => child.userData.pjskEyeThroughHairStencilPrepass);
  const overlay = passMeshes.find((child) => child.userData.pjskEyeThroughHairOverlay);
  assert.ok(prepass);
  assert.ok(overlay);
  assert.deepEqual(prepass.geometry.groups, [{ start: 0, count: 3, materialIndex: 0 }]);
  assert.deepEqual(overlay.geometry.groups, [{ start: 0, count: 3, materialIndex: 0 }]);
  const overlayMaterial = Array.isArray(overlay.material) ? overlay.material[0] : overlay.material;
  assert.equal(overlayMaterial.depthFunc, THREE.AlwaysDepth);
  assert.equal(overlayMaterial.stencilRef, 0x01);
  assert.deepEqual(debug.map((entry) => entry.resolvedKind), [
    "eyelash",
    "eyelash_stencil_prepass",
    "eyelash_through_hair",
  ]);
});

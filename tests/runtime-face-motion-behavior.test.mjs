import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

import {
  FaceMotionRuntime,
  readEmbeddedRuntimeFaceMotion,
} from "../dist/haruki-3d-engine-internal.js";

function createMorphRoot() {
  const root = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.BufferGeometry(),
    new THREE.MeshBasicMaterial()
  );
  mesh.name = "Face";
  mesh.morphTargetDictionary = { smile: 0 };
  mesh.morphTargetInfluences = [0];
  root.add(mesh);
  return { root, mesh };
}

test("face motion binds manifest hashes and advances into the queued loop", () => {
  const { root, mesh } = createMorphRoot();
  const runtime = new FaceMotionRuntime();
  const debug = runtime.bind(root, {
    morphChannels: ["smile"],
    morphChannelBindings: [{ name: "smile", curveHash: 42 }],
  });
  runtime.setMotion({
    clips: [
      {
        name: "face",
        sampleRate: 30,
        duration: 1,
        curves: [{
          curveHash: 42,
          keyframes: [{ time: 0, value: 0 }, { time: 1, value: 100 }],
        }],
      },
      {
        name: "face_loop",
        sampleRate: 30,
        duration: 1,
        curves: [{
          curveHash: 42,
          keyframes: [{ time: 0, value: 20 }, { time: 1, value: 60 }],
        }],
      },
    ],
  }, "face", "face_loop");

  runtime.step(0.5, 1);
  assert.equal(mesh.morphTargetInfluences[0], 0.5);
  runtime.step(0.75, 1);
  assert.equal(runtime.getSnapshot().activeClipName, "face_loop");
  assert.equal(runtime.getSnapshot().currentTime, 0.25);
  assert.equal(mesh.morphTargetInfluences[0], 0.3);
  assert.deepEqual(debug, [{
    meshName: "Face",
    morphTargetCount: 1,
    mappedChannelCount: 1,
    sampleChannels: ["smile"],
  }]);
});

test("face motion survives a same-role mesh rebind and clears when disabled", () => {
  const first = createMorphRoot();
  const runtime = new FaceMotionRuntime();
  const headAsset = {
    morphChannels: ["smile"],
    morphChannelBindings: [{ name: "smile", curveHash: 42 }],
  };
  runtime.bind(first.root, headAsset);
  runtime.setMotion({
    clips: [{
      name: "face",
      sampleRate: 30,
      duration: 1,
      curves: [{
        curveHash: 42,
        keyframes: [{ time: 0, value: 0 }, { time: 1, value: 100 }],
      }],
    }],
  }, "face", null);
  runtime.seek(0.4);
  runtime.release({ preserveMotion: true });

  const second = createMorphRoot();
  runtime.bind(second.root, headAsset);
  runtime.applyCurrent();
  assert.equal(second.mesh.morphTargetInfluences[0], 0.4);
  runtime.setEnabled(false);
  assert.equal(second.mesh.morphTargetInfluences[0], 0);
});

test("embedded face motion is read from the exported motion package", () => {
  const faceMotion = { clips: [] };
  assert.equal(readEmbeddedRuntimeFaceMotion({
    motionPackage: { faceMotion },
  }), faceMotion);
  assert.equal(readEmbeddedRuntimeFaceMotion({}), null);
});

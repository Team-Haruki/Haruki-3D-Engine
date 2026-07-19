import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { UnityPrefabSpringRuntime } from "../dist/haruki-3d-engine-internal.js";

test("shared wind provider advances inside each official GetForceOnBone call", () => {
  const root = new THREE.Group();
  const wind = addNode(root, "wind");
  const boneA = addNode(root, "boneA");
  const boneB = addNode(root, "boneB");
  wind.rotation.y = 0.2;

  const runtime = UnityPrefabSpringRuntime.fromPjskRuntimeExtension(
    makeWindRuntimeExtension(),
    root
  );

  assert.ok(runtime);
  runtime.update(0.125);

  assert.ok(boneA.quaternion.angleTo(new THREE.Quaternion()) > 1e-6);
  assert.ok(boneB.quaternion.angleTo(new THREE.Quaternion()) > 1e-6);
  assert.ok(boneA.quaternion.angleTo(boneB.quaternion) > 1e-6);
});

test("active late-update wind also advances per manager bone", () => {
  const root = new THREE.Group();
  addNode(root, "wind");
  const boneA = addNode(root, "boneA");
  const boneB = addNode(root, "boneB");
  const extension = makeWindRuntimeExtension();
  extension.pjskSpringBone.runtimeUnitySetup.managers[0].forceProviders[0].raw.isActive = true;

  const runtime = UnityPrefabSpringRuntime.fromPjskRuntimeExtension(extension, root);

  assert.ok(runtime);
  runtime.update(0.125);
  assert.ok(boneA.quaternion.angleTo(new THREE.Quaternion()) > 1e-6);
  assert.ok(boneA.quaternion.angleTo(boneB.quaternion) > 1e-6);
});

test("clearing timeline controls restores official per-bone values and manager defaults", () => {
  const root = new THREE.Group();
  addNode(root, "wind");
  addNode(root, "boneA");
  addNode(root, "boneB");
  const extension = makeWindRuntimeExtension();
  const manager = extension.pjskSpringBone.runtimeUnitySetup.managers[0];
  manager.slowMotionScale = 0.75;
  manager.isPaused = true;

  const runtime = UnityPrefabSpringRuntime.fromPjskRuntimeExtension(extension, root);

  assert.ok(runtime);
  runtime.setTimelineControl({
    stiffnessForce: 50,
    dragForce: 0.8,
    windInfluence: 0.25,
    slowMotionScale: 0.4,
    paused: false,
  });
  let snapshot = runtime.getSnapshot();
  assert.equal(snapshot.topOffsets[0].stiffnessForce, 50);
  assert.equal(snapshot.topOffsets[0].slowMotionScale, 0.4);
  assert.equal(snapshot.topOffsets[0].bonePaused, false);

  runtime.clearTimelineControl();
  snapshot = runtime.getSnapshot();
  assert.equal(snapshot.topOffsets[0].stiffnessForce, 0);
  assert.equal(snapshot.topOffsets[0].slowMotionScale, 1);
  assert.equal(snapshot.topOffsets[0].bonePaused, false);
});

function makeWindRuntimeExtension() {
  return {
    pjskSpringBone: {
      runtimeUnitySetup: {
        version: "0414",
        prefabGraphs: [{
          transforms: [
            transform(1, "boneA"),
            transform(2, "boneB"),
            transform(3, "wind"),
          ],
        }],
        managers: [{
          pathId: 100,
          nodeName: "shared-wind-manager",
          automaticUpdates: true,
          isSumOfForcesOnBone: true,
          simulationFrameRate: 60,
          rawGravity: { x: 0, y: 0, z: 0 },
          bonePathIds: [10, 20],
          forceProviders: [{
            sourcePathId: 500,
            scriptName: "WindVolumeOneSelf",
            nodePath: "wind",
            springManagerPathId: 100,
            raw: {
              m_Enabled: true,
              isActive: false,
              weight: 1,
              strength: 1,
              period: 1,
              currentTime: 0,
              spinPeriod: 0,
              amplitude: 0.5,
              peakDistance: 1,
            },
          }],
        }],
        bones: [
          springBone(10, "boneA"),
          springBone(20, "boneB"),
        ],
      },
    },
  };
}

function transform(pathId, transformPath) {
  return {
    pathId,
    name: transformPath,
    transformPath,
    childPathIds: [],
    localPosition: { x: 0, y: 0, z: 0 },
  };
}

function springBone(pathId, nodePath) {
  return {
    pathId,
    nodeName: nodePath,
    nodePath,
    rawStiffnessForce: 0,
    rawDragForce: 0,
    rawWindInfluence: 1,
    rawSpringForce: { x: 0, y: 0, z: 0 },
  };
}

function addNode(root, name) {
  const node = new THREE.Group();
  node.name = name;
  root.add(node);
  return node;
}

import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import {
  buildUnityPrefabSourceGraph,
  createUnityPrefabConstraintRuntime,
  installUnityRuntimeNativeMeshes,
  makeUnityPrefabHeadFollowDebugSnapshot,
  syncUnityPrefabSourceGraph,
} from "../dist/haruki-3d-engine-internal.js";

test("0414 prefab runtime applies official model combine and installs native meshes", () => {
  const extension = makeRuntimeExtension();
  const graph = buildUnityPrefabSourceGraph(extension);

  assert.ok(graph);
  const nativeMeshes = installUnityRuntimeNativeMeshes(graph, extension);
  assert.equal(graph.root.name, "UnityPrefabSourceRoot");
  assert.equal(nativeMeshes.error, null);
  assert.equal(nativeMeshes.meshCount, 1);
  assert.equal(nativeMeshes.skinnedMeshCount, 0);

  const bodyRoot = graph.nodeByPath.get("body");
  const faceNeck = graph.nodeByPath.get("face/Neck");
  const faceHead = graph.nodeByPath.get("face/Neck/Head");
  const renderer = graph.nodeByPath.get("face/Face");
  const movedTarget = graph.nodeByPath.get("face/Neck/hat_target");
  const drainedBodyChild = graph.nodeByPath.get(
    "body/Neck/Head/BodyChild"
  );

  assert.equal(graph.nodeByPath.get("body/Neck"), faceNeck);
  assert.equal(graph.nodeByPath.get("body/Neck/Head"), faceHead);
  assert.equal(faceNeck.parent, bodyRoot);
  assert.deepEqual(faceNeck.position.toArray(), [-1, 2, 3]);
  assert.deepEqual(faceHead.position.toArray(), [-4, 5, 6]);
  assert.equal(renderer.parent, bodyRoot);
  assert.equal(movedTarget.parent, bodyRoot);
  assert.equal(drainedBodyChild.parent, faceHead);

  const mesh = renderer.children.find((node) => node instanceof THREE.Mesh);
  assert.ok(mesh);
  assert.equal(mesh.name, "FaceMesh");
  assert.equal(mesh.geometry.getAttribute("position").count, 3);
  const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  assert.equal(material.userData.pjskMaterialKey, "face:0");
  assert.equal(graph.debug.active, true);
  assert.equal(graph.debug.sourcePath, "body/Neck");
  assert.equal(graph.debug.targetPath, "face/Neck");
});

test("prefab runtime binds skinned morph meshes and applies exported constraints", () => {
  const extension = makeRuntimeExtension();
  extension.runtimeUnitySetup.constraintSetup = {
    version: "0414",
    sourceKind: "unity-prefab",
    constraints: [{
      type: "parent",
      ownerPath: "face/Face",
      sources: [{
        sourcePath: "body",
        weight: 1,
        translationOffset: { x: 1, y: 0, z: 0 },
      }],
    }],
  };
  const sourceMesh = extension.nativeMeshes.meshes[0];
  sourceMesh.bonePaths = ["face/Neck/Head"];
  sourceMesh.boneInverseBindMatrices = identityMatrix();
  sourceMesh.skinIndices = [
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
  ];
  sourceMesh.skinWeights = [
    1, 0, 0, 0,
    1, 0, 0, 0,
    1, 0, 0, 0,
  ];
  sourceMesh.morphTargets = [{
    name: "smile",
    indices: [0],
    positionDeltas: [0.25, 0, 0],
    normalDeltas: [0, 0.1, 0],
  }];

  const graph = buildUnityPrefabSourceGraph(extension);
  const nativeMeshes = installUnityRuntimeNativeMeshes(graph, extension);
  const constraints = syncUnityPrefabSourceGraph(graph, extension, 2);
  const renderer = graph.nodeByPath.get("face/Face");
  const mesh = renderer.children.find((node) => node instanceof THREE.SkinnedMesh);

  assert.equal(nativeMeshes.error, null);
  assert.equal(nativeMeshes.skinnedMeshCount, 1);
  assert.ok(mesh);
  assert.equal(mesh.skeleton.bones[0], graph.nodeByPath.get("face/Neck/Head"));
  assert.deepEqual(mesh.skeleton.boneInverses[0].toArray(), identityMatrix());
  assert.equal(mesh.geometry.morphAttributes.position[0].name, "smile");
  assert.ok(
    Math.abs(mesh.geometry.morphAttributes.position[0].array[0] - 0.25) < 1e-6
  );
  assert.equal(constraints.appliedCount, 1);
  assert.deepEqual(renderer.position.toArray(), [-2, 0, 0]);
});

test("prefab debug snapshot preserves fallback state until a graph is loaded", () => {
  const fallback = {
    active: false,
    sourcePath: null,
    targetPath: null,
    reason: "not initialized",
  };
  const extension = { runtimeUnitySetup: { version: "0414" } };

  assert.deepEqual(
    makeUnityPrefabHeadFollowDebugSnapshot(null, extension, fallback),
    { ...fallback, setupVersion: "0414" }
  );

  const graph = buildUnityPrefabSourceGraph(makeRuntimeExtension());
  const snapshot = makeUnityPrefabHeadFollowDebugSnapshot(
    graph,
    extension,
    fallback
  );
  assert.equal(snapshot.active, true);
  assert.equal(snapshot.sourcePath, "body/Neck");
  assert.equal(snapshot.setupVersion, "0414");
});

test("persistent constraints retain resolved transform bindings between frames", () => {
  const extension = makeRuntimeExtension();
  extension.runtimeUnitySetup.constraintSetup = {
    version: "0414",
    sourceKind: "unity-prefab",
    constraints: [{
      type: "parent",
      ownerPath: "face/Face",
      sources: [{
        sourcePath: "body",
        weight: 1,
        translationOffset: { x: 1, y: 0, z: 0 },
      }],
    }],
  };
  const graph = buildUnityPrefabSourceGraph(extension);
  const body = graph.nodeByPath.get("body");
  const renderer = graph.nodeByPath.get("face/Face");
  const runtime = createUnityPrefabConstraintRuntime(graph, extension, 2);

  assert.ok(runtime);
  runtime.update();
  const before = renderer.getWorldPosition(new THREE.Vector3());
  graph.nodeByPath.clear();
  body.position.x = 3;
  body.updateMatrixWorld(true);

  const diagnostics = runtime.update();
  const after = renderer.getWorldPosition(new THREE.Vector3());

  assert.equal(diagnostics.appliedCount, 1);
  assert.ok(Math.abs(after.x - before.x - 3) < 1e-6);
});

function makeRuntimeExtension() {
  return {
    runtimeUnitySetup: {
      version: "0414",
      prefabGraphs: [{
        partKind: "combined",
        transforms: [
          transform(1, "body", null),
          transform(2, "body/Neck", 1, [1, 2, 3]),
          transform(3, "body/Neck/Head", 2, [4, 5, 6]),
          transform(4, "body/Neck/Head/BodyChild", 3),
          transform(10, "face", null),
          transform(11, "face/Neck", 10, [7, 8, 9]),
          transform(12, "face/Neck/Head", 11),
          transform(13, "face/Neck/hat_target", 11),
          transform(14, "face/Face", 10),
        ],
      }],
      bodyHeadAssembly: {
        version: "0414",
        parentingMode: "model_combine_setup",
        parentRootPath: "body",
        parentAttachPath: "body/Neck",
        childRootPath: "face",
        childOriginPath: "face/Neck",
        parentCombineNodeAPath: "body/Neck",
        parentCombineNodeBPath: "body/Neck/Head",
        childCombineNodeAPath: "face/Neck",
        childCombineNodeBPath: "face/Neck/Head",
        faceRendererName: "Face",
        childMoveSuffix: "_target",
      },
    },
    nativeMeshes: {
      version: "0414",
      meshes: [{
        partKind: "face",
        meshPath: "face/Face/FaceMesh",
        meshName: "FaceMesh",
        rendererTransformPath: "face/Face",
        positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
        normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
        uv0: [0, 0, 1, 0, 0, 1],
        submeshes: [{
          slotIndex: 0,
          materialKey: "face:0",
          materialName: "FaceMaterial",
          indices: [0, 1, 2],
        }],
      }],
    },
  };
}

function transform(pathId, transformPath, parentPathId, position = [0, 0, 0]) {
  return {
    pathId,
    name: transformPath.split("/").at(-1),
    transformPath,
    parentPathId,
    localPosition: { x: position[0], y: position[1], z: position[2] },
    localRotation: { x: 0, y: 0, z: 0, w: 1 },
    localScale: { x: 1, y: 1, z: 1 },
  };
}

function identityMatrix() {
  return [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ];
}

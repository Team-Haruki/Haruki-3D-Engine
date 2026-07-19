import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import {
  createSmoothedLoopClip,
  decodeUnityMotionClips,
  inferBodyAnimationKind,
  makeAnimationTrackDebug,
  prepareRuntimeAnimationClip,
  retargetUnityPrefabAnimationClip,
} from "../dist/haruki-3d-engine-internal.js";

test("0414 motion decoding preserves track kinds and duration", () => {
  const [clip] = decodeUnityMotionClips({
    version: "0414",
    clips: [{
      name: "motion_loop",
      tracks: [
        {
          nodeKey: "Hip",
          property: "translation",
          componentCount: 3,
          times: new Float32Array([0, 0.5]),
          values: new Float32Array([0, 0, 0, 1, 2, 3]),
        },
        {
          nodeKey: "Head",
          property: "rotation",
          componentCount: 4,
          times: [0, 0.5],
          values: [0, 0, 0, 1, 0, 0.2, 0, 0.98],
        },
      ],
    }],
  });

  assert.equal(clip.name, "motion_loop");
  assert.equal(clip.duration, 0.5);
  assert.equal(clip.tracks[0].name, "Hip.position");
  assert.ok(clip.tracks[0] instanceof THREE.VectorKeyframeTrack);
  assert.equal(clip.tracks[1].name, "Head.quaternion");
  assert.ok(clip.tracks[1] instanceof THREE.QuaternionKeyframeTrack);
  assert.equal(inferBodyAnimationKind("/role/unity-motion.msgpack.br"), "unity-json");
  assert.throws(
    () => decodeUnityMotionClips({ version: "future", clips: [] }),
    /version 0414/
  );
});

test("runtime clip preparation and diagnostics preserve the body-head policy", () => {
  const clip = new THREE.AnimationClip("motion", 1, [
    vectorTrack("Hip.position", [0, 0, 0], [1, 0, 0]),
    vectorTrack("Head.position", [0, 1, 0], [0, 1.1, 0]),
    quaternionTrack("Neck.quaternion"),
    vectorTrack("Hair_A.position", [0, 0, 0], [0, 0.1, 0]),
  ]);

  const prepared = prepareRuntimeAnimationClip(clip, false);
  assert.deepEqual(
    prepared.tracks.map((track) => track.name),
    ["Hip.position", "Hair_A.position"]
  );
  assert.deepEqual(makeAnimationTrackDebug(clip, new Set(["Hair_A"])), {
    trackCount: 4,
    transformTrackCount: 4,
    hairTrackCount: 1,
    headTrackCount: 1,
    neckTrackCount: 1,
    upperBodyTrackCount: 3,
    utjControlledTrackCount: 1,
    sampleHairTracks: ["Hair_A.position"],
    sampleHeadTracks: ["Head.position", "Neck.quaternion"],
    sampleUtjControlledTracks: ["Hair_A.position"],
  });
});

test("loop smoothing closes sparse position and quaternion tracks", () => {
  const clip = new THREE.AnimationClip("motion_loop", 1, [
    new THREE.VectorKeyframeTrack(
      "Hip.position",
      [0, 0.5, 0.9],
      [0, 0, 0, 1, 0, 0, 0.2, 0, 0]
    ),
    new THREE.QuaternionKeyframeTrack(
      "Hip.quaternion",
      [0, 0.5, 0.9],
      [0, 0, 0, 1, 0, 0.4, 0, 0.9165, 0, 0.1, 0, 0.995]
    ),
  ]);

  const smoothed = createSmoothedLoopClip(clip, 60);
  assert.notEqual(smoothed, clip);
  for (const track of smoothed.tracks) {
    const stride = track.getValueSize();
    assert.equal(track.times.length, 61);
    assert.deepEqual(
      Array.from(track.values.slice(0, stride)),
      Array.from(track.values.slice(-stride))
    );
  }
});

test("prefab retargeting binds decoded node keys to loaded objects", () => {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.name = "body";
  const hip = new THREE.Group();
  hip.name = "Hip";
  body.add(hip);
  root.add(body);

  const clip = new THREE.AnimationClip("motion", 1, [
    vectorTrack("hip_key.position", [0, 0, 0], [1, 2, 3]),
  ]);
  const result = retargetUnityPrefabAnimationClip(clip, root, {
    motionPackage: {
      bodyMotionBindings: {
        version: "0414",
        bindingMode: "prefab_path",
        bindings: [{
          pathCrc: 1,
          nodeKey: "hip_key",
          leafName: "Hip",
          targets: [{
            poseRoot: "body",
            transformPath: "body/Hip",
            pathId: 2,
          }],
        }],
      },
    },
  });

  assert.equal(result.error, null);
  assert.equal(result.clip.tracks[0].name, `${hip.uuid}.position`);
  assert.equal(result.debug.resolvedBodyTargetCount, 1);
  assert.equal(result.debug.unresolvedTrackCount, 0);
  assert.match(
    retargetUnityPrefabAnimationClip(clip, root, {}).error,
    /bodyMotionBindings version 0414/
  );
});

test("official body-head assembly suppresses only face bridge targets", () => {
  const root = new THREE.Group();
  const bodyHip = addNamedPath(root, "body/Hip");
  addNamedPath(root, "face/Position");
  const faceDetail = addNamedPath(root, "face/Position/Hip/FaceNode");
  const clip = new THREE.AnimationClip("motion", 1, [
    vectorTrack("hip_key.position", [0, 0, 0], [1, 2, 3]),
  ]);
  const result = retargetUnityPrefabAnimationClip(clip, root, {
    runtimeUnitySetup: {
      version: "0414",
      bodyHeadAssembly: {
        parentingMode: "model_combine_setup",
        parentAttachPath: "body/Hip",
        childRootPath: "face/Position",
        childOriginPath: "face/Position/Hip",
      },
    },
    motionPackage: {
      bodyMotionBindings: {
        version: "0414",
        bindingMode: "prefab_path",
        bindings: [{
          pathCrc: 1,
          nodeKey: "hip_key",
          leafName: "Hip",
          sourceRest: identityRest(),
          targets: [
            { poseRoot: "body", transformPath: "body/Hip", pathId: 2 },
            { poseRoot: "face", transformPath: "face/Position", pathId: 3 },
            {
              poseRoot: "face",
              transformPath: "face/Position/Hip/FaceNode",
              pathId: 4,
              rest: identityRest(),
            },
          ],
        }],
      },
    },
  });

  assert.equal(result.error, null);
  assert.deepEqual(
    result.clip.tracks.map((track) => track.name).sort(),
    [`${bodyHip.uuid}.position`, `${faceDetail.uuid}.position`].sort()
  );
  assert.equal(result.debug.resolvedBodyTargetCount, 1);
  assert.equal(result.debug.resolvedFaceTargetCount, 1);
});

function vectorTrack(name, start, end) {
  return new THREE.VectorKeyframeTrack(name, [0, 1], [...start, ...end]);
}

function quaternionTrack(name) {
  return new THREE.QuaternionKeyframeTrack(
    name,
    [0, 1],
    [0, 0, 0, 1, 0, 0, 0, 1]
  );
}

function addNamedPath(root, path) {
  let parent = root;
  for (const name of path.split("/")) {
    let child = parent.children.find((candidate) => candidate.name === name);
    if (!child) {
      child = new THREE.Group();
      child.name = name;
      parent.add(child);
    }
    parent = child;
  }
  return parent;
}

function identityRest() {
  return {
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    scale: { x: 1, y: 1, z: 1 },
  };
}

import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

import { AnimationPlaybackRuntime } from "../dist/haruki-3d-engine-internal.js";

const prefabHeadFollow = {
  active: false,
  sourcePath: null,
  targetPath: null,
  reason: "test",
};

test("animation playback promotes the queued loop and reports it through its interface", async () => {
  let loopPromotions = 0;
  const clipsByUrl = new Map([
    ["motion", [new THREE.AnimationClip("motion", 1, [])]],
    ["loop", [new THREE.AnimationClip("motion_loop", 2, [])]],
  ]);
  const runtime = new AnimationPlaybackRuntime({
    loadClips: async (url) => clipsByUrl.get(url) ?? [],
    onLoopPromoted: () => {
      loopPromotions += 1;
    },
  });

  runtime.setSelection({
    motionUrl: "motion",
    motionKind: "unity-json",
    loopUrl: "loop",
    loopKind: "unity-json",
  });
  await runtime.refresh({
    root: new THREE.Group(),
    retargetWithUnityPrefab: false,
    runtimeExtension: null,
    prefabHeadFollow,
  });

  assert.equal(runtime.getSnapshot().activeClipName, "motion");
  assert.equal(runtime.getSnapshot().queuedLoopClipName, "motion_loop");
  runtime.step(1.1);
  assert.equal(runtime.getSnapshot().activeClipName, "motion_loop");
  assert.equal(runtime.getSnapshot().queuedLoopClipName, null);
  assert.equal(loopPromotions, 1);
});

test("animation playback keeps speed, pause, and seek behavior behind its interface", async () => {
  const runtime = new AnimationPlaybackRuntime({
    loadClips: async () => [new THREE.AnimationClip("motion", 1, [])],
  });
  runtime.setSelection({
    motionUrl: "motion",
    motionKind: "unity-json",
    loopUrl: null,
  });
  await runtime.refresh({
    root: new THREE.Group(),
    retargetWithUnityPrefab: false,
    runtimeExtension: null,
    prefabHeadFollow,
  });

  runtime.setSpeed(2);
  runtime.step(0.25);
  assert.equal(runtime.getSnapshot().currentTime, 0.5);
  runtime.setPaused(true);
  runtime.step(0.25);
  assert.equal(runtime.getSnapshot().currentTime, 0.5);
  runtime.seekPhase(0.75);
  assert.equal(runtime.getSnapshot().currentTime, 0.75);
  assert.equal(runtime.getSnapshot().paused, true);
});

test("a stale animation load cannot overwrite the latest playback state", async () => {
  let rejectSlowLoad;
  const runtime = new AnimationPlaybackRuntime({
    loadClips: async (url) => {
      if (url === "slow") {
        return new Promise((_, reject) => {
          rejectSlowLoad = reject;
        });
      }
      return [new THREE.AnimationClip("latest", 1, [])];
    },
  });
  const context = {
    root: new THREE.Group(),
    retargetWithUnityPrefab: false,
    runtimeExtension: null,
    prefabHeadFollow,
  };

  runtime.setSelection({
    motionUrl: "slow",
    motionKind: "unity-json",
    loopUrl: null,
  });
  const staleRefresh = runtime.refresh(context);
  runtime.setSelection({
    motionUrl: "latest",
    motionKind: "unity-json",
    loopUrl: null,
  });
  await runtime.refresh(context);
  rejectSlowLoad(new Error("stale load failed"));
  await staleRefresh;

  assert.equal(runtime.getSnapshot().selectedUrl, "latest");
  assert.equal(runtime.getSnapshot().activeClipName, "latest");
  assert.equal(runtime.getSnapshot().error, null);
});

test("same-role reload restores loop position and reuses decoded clips", async () => {
  let loadCount = 0;
  const runtime = new AnimationPlaybackRuntime({
    loadClips: async (url) => {
      loadCount += 1;
      return [new THREE.AnimationClip(url === "loop" ? "motion_loop" : "motion", 2, [])];
    },
  });
  const context = {
    root: new THREE.Group(),
    retargetWithUnityPrefab: false,
    runtimeExtension: null,
    prefabHeadFollow,
  };
  runtime.setSelection({
    motionUrl: "motion",
    motionKind: "unity-json",
    loopUrl: "loop",
    loopKind: "unity-json",
  });
  await runtime.refresh(context);
  runtime.seekLoopPhase(0.6);
  const position = runtime.capturePosition();

  runtime.release({ preserveSelection: true });
  await runtime.refresh({ ...context, root: new THREE.Group() });
  runtime.restorePosition(position);

  assert.equal(runtime.getSnapshot().activeClipName, "motion_loop");
  assert.ok(Math.abs(runtime.getSnapshot().currentTime - 1.2) < 1e-6);
  assert.equal(loadCount, 2);

  runtime.release({ preserveSelection: true, clearCache: true });
  await runtime.refresh({ ...context, root: new THREE.Group() });
  assert.equal(loadCount, 4);
});

import assert from "node:assert/strict";
import test from "node:test";
import { createHaruki3DKernelRuntime } from "../dist/haruki-3d-engine-internal.js";

test("destroy waits for an in-flight load and never renders its late result", async () => {
  let finishLoad;
  const loadGate = new Promise((resolve) => {
    finishLoad = resolve;
  });
  const calls = [];
  const engine = fakeEngine(calls, () => loadGate);
  installAnimationFrameStubs();
  const kernel = createHaruki3DKernelRuntime(engine, "/runtime/jp/");

  const loading = kernel.load(recipe());
  kernel.destroy();

  assert.deepEqual(calls, [["load", "/runtime/jp/"]]);
  finishLoad();
  await loading;
  await Promise.resolve();

  assert.deepEqual(calls, [
    ["load", "/runtime/jp/"],
    ["destroy"],
  ]);
});

test("a completed load prepares and renders exactly one initial frame", async () => {
  const calls = [];
  const engine = fakeEngine(calls, async () => {});
  installAnimationFrameStubs();
  const kernel = createHaruki3DKernelRuntime(engine, "/runtime/jp/");

  await kernel.load(recipe());

  assert.deepEqual(calls, [
    ["load", "/runtime/jp/"],
    ["step", 0, false, 0],
    ["render"],
  ]);
  kernel.destroy();
  await Promise.resolve();
});

test("prepare loads a recipe without rendering and the matching load reuses it", async () => {
  const calls = [];
  const engine = fakeEngine(calls, async () => {});
  installAnimationFrameStubs();
  const kernel = createHaruki3DKernelRuntime(engine, "/runtime/jp/");

  await kernel.prepare(recipe());
  assert.deepEqual(calls, [["load", "/runtime/jp/"]]);

  await kernel.load(recipe());
  assert.deepEqual(calls, [
    ["load", "/runtime/jp/"],
    ["step", 0, false, 0],
    ["render"],
  ]);
  kernel.destroy();
  await Promise.resolve();
});

test("concurrent prepares for the same recipe share one engine load", async () => {
  let finishLoad;
  const loadGate = new Promise(resolve => {
    finishLoad = resolve;
  });
  const calls = [];
  const engine = fakeEngine(calls, () => loadGate);
  installAnimationFrameStubs();
  const kernel = createHaruki3DKernelRuntime(engine, "/runtime/jp/");

  const first = kernel.prepare(recipe());
  const second = kernel.prepare(recipe());
  assert.equal(first, second);
  assert.deepEqual(calls, [["load", "/runtime/jp/"]]);

  finishLoad();
  await first;
  kernel.destroy();
  await Promise.resolve();
});

test("a failed prepare can be retried", async () => {
  let attempts = 0;
  const calls = [];
  const engine = fakeEngine(calls, async () => {
    attempts += 1;
    if (attempts === 1) throw new Error("network failed");
  });
  installAnimationFrameStubs();
  const kernel = createHaruki3DKernelRuntime(engine, "/runtime/jp/");

  await assert.rejects(kernel.prepare(recipe()), /network failed/);
  await kernel.prepare(recipe());
  assert.equal(attempts, 2);
  kernel.destroy();
  await Promise.resolve();
});

test("destroy exposes one promise that settles after engine resources are released", async () => {
  let finishLoad;
  const loadGate = new Promise(resolve => {
    finishLoad = resolve;
  });
  const calls = [];
  const engine = fakeEngine(calls, () => loadGate);
  installAnimationFrameStubs();
  const kernel = createHaruki3DKernelRuntime(engine, "/runtime/jp/");

  void kernel.prepare(recipe());
  const first = kernel.destroy();
  const second = kernel.destroy();
  assert.equal(first, second);
  assert.equal(typeof first?.then, "function");
  assert.deepEqual(calls, [["load", "/runtime/jp/"]]);

  finishLoad();
  await first;
  assert.deepEqual(calls, [["load", "/runtime/jp/"], ["destroy"]]);
});

function fakeEngine(calls, load) {
  return {
    loadRenderRecipe(request) {
      calls.push(["load", request.baseUrl]);
      return load();
    },
    stepRuntimeFrame(delta, options) {
      calls.push(["step", delta, options.advanceAnimation, options.elapsedTime]);
    },
    renderFrame() {
      calls.push(["render"]);
    },
    setViewportSize(width, height) {
      calls.push(["resize", width, height]);
    },
    destroy() {
      calls.push(["destroy"]);
    },
  };
}

function installAnimationFrameStubs() {
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
}

function recipe() {
  return {
    roleId: "5:light_sound",
    bodyCostume3dId: 1,
    headCostume3dId: 2,
    hairCostume3dId: 3,
    headOptionalCostume3dId: null,
  };
}

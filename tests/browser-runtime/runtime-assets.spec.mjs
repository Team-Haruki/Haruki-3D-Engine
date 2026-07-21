import crypto from "node:crypto";
import { expect, test } from "@playwright/test";

const initial = {
  roleId: "11:street",
  bodyCostume3dId: 2015008,
  headCostume3dId: 21,
  hairCostume3dId: 211,
  headOptionalCostume3dId: 2015007,
};
const sameRoleSwitch = {
  roleId: "11:street",
  bodyCostume3dId: 321,
  headCostume3dId: 320,
  hairCostume3dId: 211,
  headOptionalCostume3dId: null,
};
const crossRoleSwitch = {
  roleId: "14:theme_park",
  bodyCostume3dId: 28,
  headCostume3dId: 114,
  hairCostume3dId: 214,
  headOptionalCostume3dId: null,
};

const maxColdMs = Number(process.env.HARUKI_BROWSER_MAX_COLD_MS ?? 45_000);
const maxSwitchMs = Number(process.env.HARUKI_BROWSER_MAX_SWITCH_MS ?? 30_000);

test("loads the bundled public package consumer", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/consumer/index.html?assets=/runtime/jp/&basis=/basis/");
  await expect.poll(async () => ({
    ready: await page.locator("body").getAttribute("data-haruki-ready"),
    errors,
  }), {
    timeout: maxColdMs,
  }).toEqual({ ready: "true", errors: [] });

  const png = await page.locator("canvas").screenshot();
  const resources = await page.evaluate(() => performance.getEntriesByType("resource")
    .map(entry => entry.name));
  expect(png.length).toBeGreaterThan(10_000);
  expect(resources.some(name => name.includes(".ktx2"))).toBe(true);
  expect(resources.some(name => name.includes("brotli_wasm_bg") && name.endsWith(".wasm"))).toBe(true);
  expect(errors).toEqual([]);
});

async function openHarness(page) {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/capture.html?captureBase=/runtime/jp/&captureWarmupFrames=3");
  await expect.poll(() => page.locator("body").getAttribute("data-capture-ready"))
    .toBe("true");
  return errors;
}

async function render(page, recipe) {
  const elapsedMs = await page.evaluate(async request => {
    const start = performance.now();
    await window.__HARUKI_CAPTURE_REQUEST__({
      ...request,
      phase: 0.5,
      warmupFrames: 3,
      warmupMode: "animation",
    });
    return performance.now() - start;
  }, recipe);
  const png = await page.locator("canvas").screenshot();
  return {
    elapsedMs,
    hash: crypto.createHash("sha256").update(png).digest("hex"),
    bytes: png.length,
  };
}

test("loads KTX2 assets, switches parts and roles, and keeps rendering", async ({ page }, testInfo) => {
  const errors = await openHarness(page);
  const cold = await render(page, initial);
  const sameRole = await render(page, sameRoleSwitch);
  const crossRole = await render(page, crossRoleSwitch);
  const hot = await render(page, crossRoleSwitch);

  const resources = await page.evaluate(() => performance.getEntriesByType("resource")
    .map(entry => ({ name: entry.name, transferSize: entry.transferSize })));
  const ktx2 = resources.filter(entry => entry.name.includes(".ktx2"));
  const metadata = resources.filter(entry => entry.name.includes(".msgpack.br"));
  const brotliWasm = new Set(resources
    .map(entry => new URL(entry.name).pathname)
    .filter(name => name.includes("brotli_wasm_bg") && name.endsWith(".wasm")));

  expect(cold.elapsedMs).toBeLessThan(maxColdMs);
  for (const result of [sameRole, crossRole, hot]) {
    expect(result.elapsedMs).toBeLessThan(maxSwitchMs);
    expect(result.bytes).toBeGreaterThan(10_000);
  }
  expect(new Set([cold.hash, sameRole.hash, crossRole.hash]).size).toBe(3);
  expect(ktx2.length).toBeGreaterThan(0);
  expect(metadata.length).toBeGreaterThan(0);
  expect(brotliWasm.size).toBe(1);
  expect(errors.filter(error => /shader error|program not valid|webgl/i.test(error))).toEqual([]);

  console.log(`[runtime-e2e:${testInfo.project.name}] ${JSON.stringify({
    coldMs: Math.round(cold.elapsedMs),
    sameRoleMs: Math.round(sameRole.elapsedMs),
    crossRoleMs: Math.round(crossRole.elapsedMs),
    hotMs: Math.round(hot.elapsedMs),
    ktx2Requests: ktx2.length,
    metadataRequests: metadata.length,
    transferBytes: resources.reduce((sum, entry) => sum + entry.transferSize, 0),
  })}`);
});

test("loads the shared default role from every exported region", async ({ page }, testInfo) => {
  const errors = await openHarness(page);
  const blank = await page.locator("canvas").screenshot();
  const blankHash = crypto.createHash("sha256").update(blank).digest("hex");
  const timings = {};
  for (const region of ["jp", "en", "tw", "kr", "cn"]) {
    const result = await render(page, {
      ...crossRoleSwitch,
      runtimeBaseUrl: `/runtime/${region}/`,
    });
    expect(result.elapsedMs).toBeLessThan(maxColdMs);
    expect(result.bytes).toBeGreaterThan(1_000);
    expect(result.hash).not.toBe(blankHash);
    timings[region] = Math.round(result.elapsedMs);
  }
  expect(errors.filter(error => /shader error|program not valid|webgl/i.test(error))).toEqual([]);
  console.log(`[runtime-regions:${testInfo.project.name}] ${JSON.stringify(timings)}`);
});

test("recovers after a failed registry request", async ({ page }) => {
  const errors = await openHarness(page);
  const blank = await page.locator("canvas").screenshot();
  const blankHash = crypto.createHash("sha256").update(blank).digest("hex");
  let blocked = true;
  await page.route("**/part-registry.msgpack.br", async route => {
    if (blocked) {
      blocked = false;
      await route.abort("failed");
      return;
    }
    await route.continue();
  });

  const failed = await page.evaluate(async request => {
    try {
      await window.__HARUKI_CAPTURE_REQUEST__(request);
      return "";
    } catch (error) {
      return String(error);
    }
  }, initial);
  expect(failed).not.toBe("");

  const recovered = await render(page, initial);
  expect(recovered.bytes).toBeGreaterThan(1_000);
  expect(recovered.hash).not.toBe(blankHash);
  expect(errors.filter(error => /shader error|program not valid/i.test(error))).toEqual([]);
});

test("restores WebGL context and renders again", async ({ page }) => {
  const errors = await openHarness(page);
  await render(page, initial);
  const supported = await page.evaluate(async () => {
    const canvas = document.querySelector("canvas");
    const gl = canvas?.getContext("webgl2") ?? canvas?.getContext("webgl");
    const extension = gl?.getExtension("WEBGL_lose_context");
    if (!extension) return { supported: false, lost: false, restored: false };
    const waitFor = event => Promise.race([
      new Promise(resolve => canvas.addEventListener(event, () => resolve(true), { once: true })),
      new Promise(resolve => setTimeout(() => resolve(false), 5_000)),
    ]);
    const lost = waitFor("webglcontextlost");
    extension.loseContext();
    const didLose = await lost;
    if (!didLose) return { supported: true, lost: false, restored: false };
    const restored = waitFor("webglcontextrestored");
    extension.restoreContext();
    return { supported: true, lost: true, restored: await restored };
  });
  test.skip(!supported.supported, "WEBGL_lose_context is unavailable in this browser");
  test.skip(!supported.restored, "the browser's software WebGL backend cannot restore a forced context loss");
  expect(supported).toEqual({ supported: true, lost: true, restored: true });

  const recovered = await render(page, initial);
  expect(recovered.bytes).toBeGreaterThan(10_000);
  expect(errors.filter(error => /shader error|program not valid/i.test(error))).toEqual([]);
});

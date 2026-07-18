import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

const repoRoot = path.resolve(import.meta.dirname, "..");

function readSource(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("runtime files expose a stable version for parsed metadata invalidation", () => {
  const source = readSource("capture-server.mjs");
  assert.match(source, /"x-haruki-file-version": `\$\{stat\.size\}-\$\{Math\.trunc\(stat\.mtimeMs\)\}`/);
  assert.match(source, /"access-control-expose-headers": "x-haruki-file-version"/);
});

test("engine serves and loads only final MessagePack Brotli runtime files", () => {
  const serverSource = readSource("capture-server.mjs");
  const loaderSource = readSource("src/runtime/runtimePackageLoader.ts");
  assert.doesNotMatch(serverSource, /content-encoding|decodeMsgpackBrotliAsJSON|compactRuntimeFiles/);
  assert.match(loaderSource, /Runtime metadata must use \.msgpack\.br/);
  assert.match(loaderSource, /parts\/by-role\/\$\{role\.characterId\}/);
  assert.doesNotMatch(loaderSource, /full-runtime|\.json\.gz|DecompressionStream|parts\/part-registry\.json/);
  assert.match(loaderSource, /runtime\.corePath\?\.endsWith\("\.msgpack\.br"\)/);
});

function sourceSlice(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

function loadCaptureRequestValidator() {
  const source = readSource("capture-server.mjs");
  const snippet = sourceSlice(
    source,
    "function validateCaptureRequest",
    "function makeTempDir"
  );
  const context = vm.createContext({
    defaultPhase: 0.5,
    defaultWarmupMs: 250,
    defaultWarmupFrames: 60,
    defaultWarmupMode: "animation",
    defaultCameraPreset: "capture",
    defaultCameraProfile: "full-body",
    defaultFaceSdfEnabled: false,
    defaultProjectedShadow: {
      width: 0.72,
      height: 1.06,
      opacity: 0.28,
      crossSize: 0.46,
      crossOpacity: 0.22,
      floorY: 0,
      adjustShadow: false,
      adjustAlpha: true,
      invisibleHeight: 0.2,
      directionalShadow: false,
    },
    defaultWidth: 1400,
    defaultHeight: 1000,
    defaultScale: 2,
    defaultTimeoutMs: 45000,
    MAX_CAPTURE_DIMENSION: 2048,
    MAX_CAPTURE_TIMEOUT_MS: 300000,
    MAX_CAPTURE_WARMUP_FRAMES: 600,
    MAX_CAPTURE_WARMUP_MS: 300000,
    MAX_TRACE_EVENTS: 10000,
    tempCaptureTtlMs: 6 * 60 * 60 * 1000,
  });
  vm.runInContext(snippet, context);
  return vm.runInContext("validateCaptureRequest", context);
}

function validCaptureRequest(overrides = {}) {
  return {
    imageId: "pjsk3d_jp_test",
    region: "jp",
    roleId: "5:light_sound",
    bodyCostume3dId: 1,
    headCostume3dId: 2,
    hairCostume3dId: 3,
    ...overrides,
  };
}

test("capture request preserves explicit zero values", () => {
  const validateCaptureRequest = loadCaptureRequestValidator();
  const request = validateCaptureRequest(validCaptureRequest({
    phase: 0,
    warmupMs: 0,
    warmupFrames: 0,
  }));

  assert.equal(request.phase, 0);
  assert.equal(request.warmupMs, 0);
  assert.equal(request.warmupFrames, 0);
});

test("capture request preserves an exact independent head source", () => {
  const validateCaptureRequest = loadCaptureRequestValidator();
  const request = validateCaptureRequest(validCaptureRequest({
    headPackagePath: "  parts/_sources/head_optional/shared  ",
  }));

  assert.equal(request.headPackagePath, "parts/_sources/head_optional/shared");
  assert.throws(
    () => validateCaptureRequest(validCaptureRequest({ headPackagePath: 123 })),
    /headPackagePath must be a string or null/
  );
  assert.throws(
    () => validateCaptureRequest(validCaptureRequest({ headPackagePath: " " })),
    /headPackagePath must be a non-empty string/
  );
  assert.throws(
    () => validateCaptureRequest(validCaptureRequest({ headPackagePath: "bad\0path" })),
    /without NUL bytes/
  );
});

test("capture runtime forwards the exact head source into the browser", async () => {
  const source = readSource("capture-server.mjs");
  const snippet = sourceSlice(
    source,
    "class CaptureRuntimeSession",
    "const captureSession"
  );
  const context = vm.createContext({ Buffer, clearTimeout, setTimeout });
  vm.runInContext(snippet, context);
  const CaptureRuntimeSession = vm.runInContext("CaptureRuntimeSession", context);
  const session = new CaptureRuntimeSession();
  let browserRequest = null;
  session.ensureStarted = async () => {};
  session.client = {
    send: async (method, params) => {
      if (method === "Runtime.evaluate" && params.expression.startsWith("window.__HARUKI_CAPTURE_REQUEST__(")) {
        const serialized = params.expression.slice(
          "window.__HARUKI_CAPTURE_REQUEST__(".length,
          -1
        );
        browserRequest = JSON.parse(serialized);
        return {
          result: {
            value: {
              snapshots: null,
              pngDataUrl: `data:image/png;base64,${Buffer.from("png").toString("base64")}`,
            },
          },
        };
      }
      return {};
    },
  };

  await session.capture({
    ...validCaptureRequest(),
    headPackagePath: "parts/_sources/head/exclusive",
    width: 700,
    height: 500,
    scale: 2,
    timeoutMs: 45000,
  });

  assert.equal(browserRequest.headPackagePath, "parts/_sources/head/exclusive");
});

test("capture request bounds renderer work supplied by callers", () => {
  const validateCaptureRequest = loadCaptureRequestValidator();
  const request = validateCaptureRequest(validCaptureRequest({
    width: 999999,
    height: 999999,
    warmupMs: 999999999,
    warmupFrames: 999999999,
    timeoutMs: 999999999,
    traceUtjMaxEvents: 999999999,
  }));

  assert.ok(request.width <= 2048);
  assert.ok(request.height <= 2048);
  assert.ok(request.warmupMs <= 300000);
  assert.ok(request.warmupFrames <= 600);
  assert.ok(request.timeoutMs <= 300000);
  assert.ok(request.traceUtjMaxEvents <= 10000);
});

test("DevTools commands reject when Chromium does not answer", async () => {
  const source = readSource("capture-server.mjs");
  const snippet = sourceSlice(
    source,
    "class DevToolsSocket",
    "async function waitForRuntimeReady"
  );
  const context = vm.createContext({
    Buffer,
    URL,
    clearTimeout,
    crypto,
    defaultTimeoutMs: 45000,
    net,
    setTimeout,
  });
  vm.runInContext(snippet, context);
  const DevToolsSocket = vm.runInContext("DevToolsSocket", context);
  const client = new DevToolsSocket("ws://127.0.0.1:9222/devtools/page/test");
  client.socket = { write() {}, end() {} };

  const outcome = await Promise.race([
    client.send("Runtime.evaluate", {}, 10).then(
      () => "resolved",
      () => "rejected"
    ),
    new Promise((resolve) => setTimeout(() => resolve("pending"), 50)),
  ]);

  assert.equal(outcome, "rejected");
});

test("runtime package URLs cannot escape their region root", () => {
  const source = readSource("src/runtime/runtimePackageLoader.ts");
  const snippet = sourceSlice(
    source,
    "export function resolveRuntimePackageUrl",
    "async function loadPartPackageSetFromBaseUrl"
  )
    .replace("export function", "function")
    .replace("baseUrl: string, relativePath: string", "baseUrl, relativePath");
  const context = vm.createContext({
    URL,
    encodeURIComponent,
    window: { location: { href: "http://engine.local/capture.html" } },
  });
  vm.runInContext(snippet, context);
  const resolveRuntimePackageUrl = vm.runInContext("resolveRuntimePackageUrl", context);

  assert.equal(
    resolveRuntimePackageUrl("/runtime/jp/", "parts/body/part-runtime.msgpack.br"),
    "http://engine.local/runtime/jp/parts/body/part-runtime.msgpack.br"
  );
  assert.equal(
    resolveRuntimePackageUrl("/runtime/jp/", "parts/body//part-runtime.msgpack.br"),
    "http://engine.local/runtime/jp/parts/body/part-runtime.msgpack.br"
  );
  assert.throws(
    () => resolveRuntimePackageUrl("/runtime/jp/", "../en/parts/body/part-runtime.msgpack.br"),
    /relative path/i
  );
  assert.throws(
    () => resolveRuntimePackageUrl("/runtime/jp/", "///"),
    /relative path/i
  );
  assert.throws(
    () => resolveRuntimePackageUrl("/runtime/jp/", "parts/./body/part-runtime.msgpack.br"),
    /relative path/i
  );
});

test("multi-region capture and runtime candidate keys stay consistent", () => {
  const harnessSource = readSource("src/captureHarness.ts");
  const loaderSource = readSource("src/runtime/runtimePackageLoader.ts");
  const engineSource = readSource("src/engine/Haruki3DEngine.ts");

  assert.match(harnessSource, /let settledCapturePackageKey: string \| null = null;/);
  assert.match(harnessSource, /settledCapturePackageKey === packageKey/);
  assert.match(harnessSource, /settledCapturePackageKey = packageKey;/);
  assert.match(loaderSource, /return !seen\.has\(entry\.packagePath\);/);
  assert.match(engineSource, /warmupMs\?: number;/);
  assert.match(engineSource, /warmupMs: request\.warmupMs,/);
});

test("exact repeated selections preserve spring state", () => {
  const engineSource = readSource("src/engine/Haruki3DEngine.ts");
  const branch = sourceSlice(
    engineSource,
    "const sameResolvedSelection",
    "await this.applyCustomRoleDefaultMotion(combined, !preserveAnimation)"
  );

  assert.doesNotMatch(branch, /resetCurrentSpringRuntimeState/);
});

test("only head_and_hair replaces the face while split head types stay accessories", () => {
  const composerSource = readSource("src/parts/runtimePartComposer.ts");
  const classifier = sourceSlice(
    composerSource,
    "function isCompleteHeadCostumeType",
    "function isAccessoryHeadCostumeType"
  );
  const assembly = sourceSlice(
    composerSource,
    "const selectedHead = resolveHeadRuntime",
    "assertPartRuntimeProxyMetadata(body"
  );

  assert.match(classifier, /return type === "head_and_hair";/);
  assert.doesNotMatch(classifier, /head_all|head_front|head_back/);
  assert.match(assembly, /runtimePartSlot\(selectedHead\.part\) === "head" \? selectedHead : hair/);
  assert.match(assembly, /runtimePartSlot\(selectedHead\.part\) === "head_optional" \? selectedHead : null/);
});

test("same raw head id requires an exact package instead of slot priority", () => {
  const composerSource = readSource("src/parts/runtimePartComposer.ts");
  const resolver = sourceSlice(
    composerSource,
    "export function resolveHeadRegistryEntry",
    "function resolveHeadRuntime"
  );
  const resolveRuntime = sourceSlice(
    composerSource,
    "function resolveHeadRuntime",
    "function resolveOptionalHeadRuntime"
  );
  const wardrobeSource = readSource("src/parts/customWardrobeController.ts");
  const engineSource = readSource("src/engine/Haruki3DEngine.ts");

  assert.match(resolver, /candidate\.packagePath === requestedPackagePath/);
  assert.match(resolver, /identities\.size > 1/);
  assert.match(resolver, /specify headPackagePath/);
  assert.match(resolveRuntime, /resolveHeadRegistryEntry\(partSet, selection\)/);
  assert.doesNotMatch(resolveRuntime, /findRegistryPart/);
  assert.match(wardrobeSource, /resolveHeadRegistryEntry\(this\.partSet, selection\)/);
  assert.doesNotMatch(wardrobeSource, /findHeadRegistryEntry/);
  assert.match(composerSource, /headPackagePath: selectedHeadEntry\.packagePath/);
  assert.match(composerSource, /encodeURIComponent\(resolvedSelection\.headPackagePath\)/);
  assert.match(engineSource, /headPackagePath: request\.headPackagePath \?\? null/);
});

test("capture output and idle cleanup use request-owned paths", () => {
  const serverSource = readSource("capture-server.mjs");

  assert.match(serverSource, /crypto\.randomUUID\(\)/);
  assert.match(serverSource, /const oldTempRoot = this\.tempRoot;/);
  assert.match(serverSource, /this\.tempRoot = "";/);
  assert.match(serverSource, /removePathWithRetry\(oldTempRoot\)/);
});

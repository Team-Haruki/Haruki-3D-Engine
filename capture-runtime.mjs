#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  loadEngineConfig,
  resolveCaptureRuntimeOptions,
} from "./config/haruki-3d-engine-config.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, "dist");

const mimeByExtension = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".glb", "model/gltf-binary"],
  [".vrm", "model/gltf-binary"],
  [".wasm", "application/wasm"],
]);

export function parseArgs(argv) {
  const options = {
    input: "",
    out: "",
    outDir: "",
    imageId: "",
    phase: undefined,
    clip: "",
    width: undefined,
    height: undefined,
    scale: undefined,
    timeoutMs: undefined,
    warmupMs: undefined,
    warmupFrames: undefined,
    warmupMode: "",
    yaw: "",
    bodyDebugMode: "",
    renderIsolation: "",
    springRuntimeMode: "",
    cameraPreset: "",
    traceUtjBones: [],
    traceUtjMaxEvents: 240,
    traceOut: "",
    chromium: "",
    configPath: "",
    roleId: "",
    bodyCostume3dId: undefined,
    headCostume3dId: undefined,
    hairCostume3dId: undefined,
    headOptionalCostume3dId: undefined,
    build: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const readValue = () => {
      index += 1;
      if (index >= argv.length) {
        throw new Error(`Missing value for ${arg}`);
      }
      return argv[index];
    };

    if (arg === "--input" || arg === "-i") {
      options.input = readValue();
    } else if (arg === "--out" || arg === "-o") {
      options.out = readValue();
    } else if (arg === "--out-dir") {
      options.outDir = readValue();
    } else if (arg === "--image-id") {
      options.imageId = readValue();
    } else if (arg === "--phase") {
      options.phase = Number(readValue());
    } else if (arg === "--clip") {
      options.clip = readValue();
    } else if (arg === "--width") {
      options.width = Number(readValue());
    } else if (arg === "--height") {
      options.height = Number(readValue());
    } else if (arg === "--scale" || arg === "--device-scale-factor") {
      options.scale = Number(readValue());
    } else if (arg === "--timeout-ms") {
      options.timeoutMs = Number(readValue());
    } else if (arg === "--warmup-ms") {
      options.warmupMs = Number(readValue());
    } else if (arg === "--warmup-frames") {
      options.warmupFrames = Number(readValue());
    } else if (arg === "--warmup-mode") {
      options.warmupMode = readValue();
    } else if (arg === "--yaw") {
      options.yaw = readValue();
    } else if (arg === "--body-debug-mode") {
      options.bodyDebugMode = readValue();
    } else if (arg === "--render-isolation") {
      options.renderIsolation = readValue();
    } else if (arg === "--spring-runtime-mode") {
      const mode = readValue();
      if (!["off", "unity-prefab", "webgl-utj"].includes(mode)) {
        throw new Error(`Invalid --spring-runtime-mode ${mode}`);
      }
      options.springRuntimeMode = mode === "webgl-utj" ? "unity-prefab" : mode;
    } else if (arg === "--camera-preset") {
      const preset = readValue();
      if (!["default", "capture", "id5-debug"].includes(preset)) {
        throw new Error(`Invalid --camera-preset ${preset}`);
      }
      options.cameraPreset = normalizeCameraPreset(preset);
    } else if (arg === "--utj-springbone") {
      options.springRuntimeMode = "unity-prefab";
    } else if (arg === "--no-utj-springbone") {
      options.springRuntimeMode = "off";
    } else if (arg === "--trace-utj-bone") {
      options.traceUtjBones.push(readValue());
    } else if (arg === "--trace-utj-max-events") {
      options.traceUtjMaxEvents = Number(readValue());
    } else if (arg === "--trace-out") {
      options.traceOut = readValue();
    } else if (arg === "--chromium") {
      options.chromium = readValue();
    } else if (arg === "--config") {
      options.configPath = readValue();
    } else if (arg === "--role-id") {
      options.roleId = readValue();
    } else if (arg === "--body-costume3d-id") {
      options.bodyCostume3dId = Number(readValue());
    } else if (arg === "--head-costume3d-id") {
      options.headCostume3dId = Number(readValue());
    } else if (arg === "--hair-costume3d-id") {
      options.hairCostume3dId = Number(readValue());
    } else if (arg === "--head-optional-costume3d-id") {
      options.headOptionalCostume3dId = Number(readValue());
    } else if (arg === "--build") {
      options.build = true;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else if (!options.input) {
      options.input = arg;
    } else if (!options.out) {
      options.out = arg;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  const config = loadEngineConfig(options.configPath || undefined);
  Object.assign(options, resolveCaptureRuntimeOptions(config, options));

  if (!options.input) {
    throw new Error("Missing --input converter output directory.");
  }
  if (options.imageId || options.outDir) {
    if (!options.imageId || !options.outDir) {
      throw new Error("--image-id and --out-dir must be used together.");
    }
    if (options.out) {
      throw new Error("--out cannot be combined with --image-id/--out-dir.");
    }
    if (!/^[A-Za-z0-9._-]+$/.test(options.imageId) || options.imageId === "." || options.imageId === "..") {
      throw new Error(`Invalid --image-id ${options.imageId}`);
    }
  }
  if (!Number.isFinite(options.phase)) {
    options.phase = 0.5;
  }
  options.phase = Math.min(Math.max(options.phase, 0), 1);
  if (options.clip !== "motion" && options.clip !== "motion_loop") {
    throw new Error("--clip must be motion or motion_loop.");
  }
  options.width = Math.max(Math.trunc(options.width) || 1400, 320);
  options.height = Math.max(Math.trunc(options.height) || 1000, 320);
  options.scale = Math.min(Math.max(Number(options.scale) || 1, 1), 2);
  options.timeoutMs = Math.max(Math.trunc(options.timeoutMs) || 45000, 5000);
  options.warmupMs = Math.max(Math.trunc(options.warmupMs) || 0, 0);
  options.warmupFrames = Math.max(Math.trunc(options.warmupFrames) || 0, 0);
  options.traceUtjMaxEvents = Math.max(Math.trunc(options.traceUtjMaxEvents) || 240, 1);
  if (options.warmupMode !== "animation" && options.warmupMode !== "runtime") {
    throw new Error("--warmup-mode must be animation or runtime.");
  }
  const renderIsolationModes = new Set([
    "normal",
    "face_sdf",
    "no_face_sdf",
    "no_face_layers",
    "no_eye_through_hair",
    "eye_through_hair_only",
    "eye_through_hair_eye_only",
    "eye_through_hair_eyebrow_only",
    "eye_through_hair_eyelash_only",
    "no_eye_through_hair_eye",
    "no_eye_through_hair_eyebrow",
    "no_eye_through_hair_eyelash",
    "no_eye_through_hair_eyelash_overlay",
    "no_eye_through_hair_eyelash_prepass",
    "eyelight_only",
    "no_eyelight",
    "outline_only",
    "no_outline",
    "no_body_outline",
    "no_hair_outline",
    "no_face_outline",
  ]);
  if (!renderIsolationModes.has(options.renderIsolation)) {
    throw new Error(`Invalid --render-isolation ${options.renderIsolation}`);
  }
  const partCaptureFields = [
    options.roleId,
    options.bodyCostume3dId,
    options.headCostume3dId,
    options.hairCostume3dId,
    options.headOptionalCostume3dId,
  ];
  options.partCapture = partCaptureFields.some((value) => value !== "" && value !== undefined);
  if (options.partCapture) {
    if (!options.roleId) {
      throw new Error("Missing --role-id for part-registry capture.");
    }
    for (const [name, value] of [
      ["--body-costume3d-id", options.bodyCostume3dId],
      ["--head-costume3d-id", options.headCostume3dId],
      ["--hair-costume3d-id", options.hairCostume3dId],
    ]) {
      if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`Missing or invalid ${name} for part-registry capture.`);
      }
    }
    if (
      options.headOptionalCostume3dId !== undefined &&
      (!Number.isInteger(options.headOptionalCostume3dId) || options.headOptionalCostume3dId <= 0)
    ) {
      throw new Error("Invalid --head-optional-costume3d-id for part-registry capture.");
    }
  }
  options.input = path.resolve(options.input);
  options.out = path.resolve(options.out || path.join(process.cwd(), "capture.png"));
  options.outDir = options.outDir ? path.resolve(options.outDir) : "";
  options.traceOut = options.traceOut ? path.resolve(options.traceOut) : "";
  return options;
}

function normalizeCameraPreset(value) {
  return value === "default" ? "default" : "capture";
}

function printHelp() {
  console.log(`Usage:
  npm run capture:runtime -- --input <converter-output> --out <capture.png>

Options:
  --image-id <id>     Stable PNG id when used with --out-dir; writes <out-dir>/<id>.png
  --out-dir <dir>     Stable PNG output directory for --image-id
  --phase <0..1>       Loop phase to capture. Default: 0.5
  --clip <name>        Clip to capture: motion or motion_loop. Default: motion_loop
  --width <px>         Browser viewport width. Default: 1400
  --height <px>        Browser viewport height. Default: 1000
  --scale <n>          Output pixel scale / DPR, 1..2. Default: 1
  --timeout-ms <ms>    Capture-ready timeout. Default: 45000
  --warmup-ms <ms>     Let animation/runtime play before capture. Default: 0
  --warmup-frames <n>  Deterministically step n frames at 60fps instead of real-time warmup
  --warmup-mode <mode> animation advances the loop; runtime freezes animation and settles spring. Default: animation
  --yaw <mode>         Character yaw mode: 0, 45, -45, 90, -90, 180
  --body-debug-mode <mode>
                       Body/hair shader debug: off, toon_luma, shadow_mask, shadow_target, etc.
  --render-isolation <mode>
                       Render isolation/debug mode. Default: normal
  --spring-runtime-mode <mode>
                       Spring runtime: off, unity-prefab. Default: unity-prefab
  --camera-preset <id> Camera preset: default, capture. Default: capture
  --utj-springbone     Compatibility alias for --spring-runtime-mode unity-prefab
  --no-utj-springbone  Compatibility alias for --spring-runtime-mode off
  --trace-utj-bone <s> Trace spring stages for bones whose name/path contains this text
  --trace-utj-max-events <n>
                       Maximum retained spring trace events. Default: 240
  --trace-out <json>   Write only snapshot.utjSpringBoneTrace to a JSON file
  --chromium <path>    Chromium executable. Default: chromium
  --config <json>      Config file. Default: haruki-3d-engine.config.json
  --role-id <id>       Part-registry capture role, formatted as <characterId>:<unit>
  --body-costume3d-id <id>
                       Part-registry body costume3d id
  --head-costume3d-id <id>
                       Part-registry head costume3d id
  --hair-costume3d-id <id>
                       Part-registry hair costume3d id
  --head-optional-costume3d-id <id>
                       Optional part-registry accessory/head_optional costume3d id
  --build              Run npm run build before capture
`);
}

function assertConverterPackage(inputDir) {
  const runtimePath = path.join(inputDir, "pjsk-sekai-runtime.extension.json");
  if (!fs.existsSync(runtimePath)) {
    throw new Error(
      `Capture requires a full runtime package: missing ${runtimePath}`
    );
  }
}

function assertPartRegistryPackage(inputDir) {
  const registryPath = path.join(inputDir, "parts", "part-registry.json");
  const characterIndexPath = path.join(inputDir, "character3d-index.json");
  for (const filePath of [registryPath, characterIndexPath]) {
    if (!fs.existsSync(filePath) && !fs.existsSync(`${filePath}.gz`)) {
      throw new Error(
        `Part-registry capture requires ${filePath} or ${filePath}.gz`
      );
    }
  }
}

function maybeBuildDist(shouldBuild) {
  if (!shouldBuild && fs.existsSync(path.join(distDir, "capture.html"))) {
    return;
  }
  const result = spawnSync("npm", ["run", "build"], {
    cwd: __dirname,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    throw new Error("npm run build failed.");
  }
}

function safeJoin(root, requestPath) {
  const decoded = decodeURIComponent(requestPath);
  const resolved = path.resolve(root, decoded.replace(/^\/+/, ""));
  const rootWithSep = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (resolved !== root && !resolved.startsWith(rootWithSep)) {
    return null;
  }
  return resolved;
}

function serveFile(filePath, req, res) {
  fs.stat(filePath, (statError, stat) => {
    if (statError || !stat.isFile()) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("not found");
      return;
    }
    const headers = {
      "content-type": mimeByExtension.get(path.extname(filePath).toLowerCase()) ??
        "application/octet-stream",
      "content-length": String(stat.size),
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
    };
    if (req.method === "HEAD") {
      res.writeHead(200, headers);
      res.end();
      return;
    }
    res.writeHead(200, headers);
    fs.createReadStream(filePath).pipe(res);
  });
}

function startStaticServer(inputDir) {
  const server = http.createServer((req, res) => {
    try {
      const requestUrl = new URL(req.url ?? "/", "http://127.0.0.1");
      if (requestUrl.pathname.startsWith("/capture-input/")) {
        const relativePath = requestUrl.pathname.slice("/capture-input/".length);
        const filePath = safeJoin(inputDir, relativePath);
        if (!filePath) {
          res.writeHead(403);
          res.end("forbidden");
          return;
        }
        serveFile(filePath, req, res);
        return;
      }

      const relativePath =
        requestUrl.pathname === "/" ? "capture.html" : requestUrl.pathname;
      const filePath = safeJoin(distDir, relativePath) ??
        path.join(distDir, "capture.html");
      serveFile(fs.existsSync(filePath) ? filePath : path.join(distDir, "capture.html"), req, res);
    } catch (error) {
      res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      res.end(error instanceof Error ? error.message : String(error));
    }
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to bind static server."));
        return;
      }
      resolve({ server, port: address.port });
    });
  });
}

function createCaptureTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "haruki-3d-capture-"));
}

function removeCapturePath(targetPath) {
  try {
    fs.rmSync(targetPath, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup.
  }
}

async function removeCapturePathWithRetry(targetPath) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      fs.rmSync(targetPath, { recursive: true, force: true });
      if (!fs.existsSync(targetPath)) {
        return;
      }
    } catch {
      // Retry below.
    }
    await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
  }
  try {
    fs.rmSync(targetPath, { recursive: true, force: true });
  } catch {
    // Final best-effort cleanup.
  }
}

function buildOutputPath(options) {
  if (options.outDir && options.imageId) {
    return path.join(options.outDir, `${options.imageId}.png`);
  }
  return options.out;
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to allocate port."));
        return;
      }
      const port = address.port;
      server.close(() => resolve(port));
    });
  });
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${url}`);
  }
  return response.json();
}

async function waitForPageTarget(debugPort, pageUrl, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const targets = await fetchJson(`http://127.0.0.1:${debugPort}/json/list`);
      const target = targets.find((entry) =>
        entry.type === "page" &&
        entry.url?.startsWith(pageUrl) &&
        entry.webSocketDebuggerUrl
      ) ?? targets.find((entry) => entry.type === "page" && entry.webSocketDebuggerUrl);
      if (target) {
        return target;
      }
    } catch {
      // Chromium may not have opened the debugging endpoint yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Timed out waiting for Chromium page target.");
}

class DevToolsSocket {
  constructor(wsUrl) {
    this.wsUrl = new URL(wsUrl);
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    this.nextId = 1;
    this.pending = new Map();
  }

  connect() {
    return new Promise((resolve, reject) => {
      const key = crypto.randomBytes(16).toString("base64");
      const socket = net.createConnection(
        Number(this.wsUrl.port),
        this.wsUrl.hostname,
        () => {
          socket.write([
            `GET ${this.wsUrl.pathname}${this.wsUrl.search} HTTP/1.1`,
            `Host: ${this.wsUrl.host}`,
            "Upgrade: websocket",
            "Connection: Upgrade",
            `Sec-WebSocket-Key: ${key}`,
            "Sec-WebSocket-Version: 13",
            "",
            "",
          ].join("\r\n"));
        }
      );
      this.socket = socket;
      let handshake = Buffer.alloc(0);
      const onHandshakeData = (chunk) => {
        handshake = Buffer.concat([handshake, chunk]);
        const headerEnd = handshake.indexOf("\r\n\r\n");
        if (headerEnd === -1) {
          return;
        }
        const header = handshake.slice(0, headerEnd).toString("utf8");
        if (!/^HTTP\/1\.1 101/i.test(header)) {
          reject(new Error(`WebSocket handshake failed: ${header.split("\r\n")[0]}`));
          socket.destroy();
          return;
        }
        socket.off("data", onHandshakeData);
        socket.on("data", (data) => this.handleData(data));
        const rest = handshake.slice(headerEnd + 4);
        if (rest.length) {
          this.handleData(rest);
        }
        resolve();
      };
      socket.on("data", onHandshakeData);
      socket.once("error", reject);
      socket.once("close", () => {
        for (const { reject: rejectPending } of this.pending.values()) {
          rejectPending(new Error("DevTools socket closed."));
        }
        this.pending.clear();
      });
    });
  }

  send(method, params = {}) {
    const id = this.nextId;
    this.nextId += 1;
    const payload = JSON.stringify({ id, method, params });
    this.socket.write(this.encodeFrame(Buffer.from(payload, "utf8")));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  close() {
    this.socket?.end();
  }

  encodeFrame(payload) {
    const mask = crypto.randomBytes(4);
    const length = payload.length;
    let header;
    if (length < 126) {
      header = Buffer.alloc(2);
      header[1] = 0x80 | length;
    } else if (length <= 0xffff) {
      header = Buffer.alloc(4);
      header[1] = 0x80 | 126;
      header.writeUInt16BE(length, 2);
    } else {
      header = Buffer.alloc(10);
      header[1] = 0x80 | 127;
      header.writeBigUInt64BE(BigInt(length), 2);
    }
    header[0] = 0x81;
    const masked = Buffer.alloc(payload.length);
    for (let index = 0; index < payload.length; index += 1) {
      masked[index] = payload[index] ^ mask[index % 4];
    }
    return Buffer.concat([header, mask, masked]);
  }

  handleData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 2) {
      const first = this.buffer[0];
      const second = this.buffer[1];
      const opcode = first & 0x0f;
      const masked = Boolean(second & 0x80);
      let offset = 2;
      let length = second & 0x7f;
      if (length === 126) {
        if (this.buffer.length < offset + 2) {
          return;
        }
        length = this.buffer.readUInt16BE(offset);
        offset += 2;
      } else if (length === 127) {
        if (this.buffer.length < offset + 8) {
          return;
        }
        length = Number(this.buffer.readBigUInt64BE(offset));
        offset += 8;
      }
      const maskOffset = offset;
      if (masked) {
        offset += 4;
      }
      if (this.buffer.length < offset + length) {
        return;
      }
      let payload = this.buffer.slice(offset, offset + length);
      if (masked) {
        const mask = this.buffer.slice(maskOffset, maskOffset + 4);
        payload = Buffer.from(payload.map((byte, index) => byte ^ mask[index % 4]));
      }
      this.buffer = this.buffer.slice(offset + length);
      if (opcode === 0x8) {
        this.close();
        return;
      }
      if (opcode !== 0x1) {
        continue;
      }
      this.handleMessage(payload.toString("utf8"));
    }
  }

  handleMessage(message) {
    const parsed = JSON.parse(message);
    if (!parsed.id) {
      return;
    }
    const pending = this.pending.get(parsed.id);
    if (!pending) {
      return;
    }
    this.pending.delete(parsed.id);
    if (parsed.error) {
      pending.reject(new Error(parsed.error.message ?? JSON.stringify(parsed.error)));
    } else {
      pending.resolve(parsed.result);
    }
  }
}

async function waitForCaptureReady(client, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await client.send("Runtime.evaluate", {
      expression: `(() => ({
        ready: window.__PJSK_CAPTURE_READY__ === true,
        error: window.__PJSK_CAPTURE_ERROR__ || document.body?.dataset?.captureError || "",
        snapshot: window.__PJSK_CAPTURE_SNAPSHOT__ || null
      }))()`,
      returnByValue: true,
    });
    const value = result.result?.value;
    if (value?.error) {
      throw new Error(value.error);
    }
    if (value?.ready) {
      return value.snapshot ?? null;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Timed out waiting for capture harness readiness.");
}

async function evaluateCaptureRequest(client, options) {
  const request = {
    roleId: options.roleId,
    bodyCostume3dId: options.bodyCostume3dId,
    headCostume3dId: options.headCostume3dId,
    hairCostume3dId: options.hairCostume3dId,
    headOptionalCostume3dId: options.headOptionalCostume3dId ?? null,
    imageId: options.imageId || undefined,
    phase: options.phase,
    warmupFrames: options.warmupFrames,
    warmupMode: options.warmupMode,
    cameraPreset: options.cameraPreset,
    traceUtjBones: options.traceUtjBones,
    traceUtjMaxEvents: options.traceUtjMaxEvents,
  };
  const result = await client.send("Runtime.evaluate", {
    expression: `window.__HARUKI_CAPTURE_REQUEST__(${JSON.stringify(request)}).then((result) => result.snapshots)`,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    const text = result.exceptionDetails.exception?.description ??
      result.exceptionDetails.text ??
      "Part-registry capture request failed.";
    throw new Error(text);
  }
  return result.result?.value ?? null;
}

async function capture(options) {
  if (options.partCapture) {
    assertPartRegistryPackage(options.input);
  } else {
    assertConverterPackage(options.input);
  }
  maybeBuildDist(options.build);
  const outputPath = buildOutputPath(options);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const tempRoot = createCaptureTempDir();
  const chromiumProfileDir = path.join(tempRoot, "profile");
  const chromiumCacheDir = path.join(tempRoot, "cache");
  const chromiumMediaCacheDir = path.join(tempRoot, "media-cache");
  const tempOutputPath = path.join(
    path.dirname(outputPath),
    `.${path.basename(outputPath)}.${process.pid}.tmp`
  );

  const { server, port } = await startStaticServer(options.input);
  const debugPort = await getFreePort();
  const pageUrl =
    `http://127.0.0.1:${port}/capture.html?captureBase=/capture-input/&capturePhase=${options.phase}` +
    `&captureClip=${encodeURIComponent(options.clip)}` +
    `&captureWarmupMs=${options.warmupMs}` +
    `&captureWarmupFrames=${options.warmupFrames}` +
    `&captureWarmupMode=${encodeURIComponent(options.warmupMode)}` +
    `&bodyDebugMode=${encodeURIComponent(options.bodyDebugMode)}` +
    `&renderIsolation=${encodeURIComponent(options.renderIsolation)}` +
    `&springRuntimeMode=${encodeURIComponent(options.springRuntimeMode)}` +
    `&cameraPreset=${encodeURIComponent(options.cameraPreset)}` +
    `&captureFullRuntimeOnly=${options.partCapture ? "false" : "true"}` +
    `&utjTraceMaxEvents=${options.traceUtjMaxEvents}` +
    options.traceUtjBones.map((filter) => `&utjTraceBone=${encodeURIComponent(filter)}`).join("") +
    (options.yaw ? `&characterYawMode=${encodeURIComponent(options.yaw)}` : "");
  const chromium = spawn(options.chromium, [
    "--headless=new",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-dev-shm-usage",
    "--no-sandbox",
    "--enable-unsafe-swiftshader",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    `--user-data-dir=${chromiumProfileDir}`,
    `--disk-cache-dir=${chromiumCacheDir}`,
    `--media-cache-dir=${chromiumMediaCacheDir}`,
    "--disable-application-cache",
    "--aggressive-cache-discard",
    `--remote-debugging-port=${debugPort}`,
    `--window-size=${options.width},${options.height}`,
    "about:blank",
  ], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  const chromiumStarted = new Promise((resolve, reject) => {
    chromium.once("spawn", resolve);
    chromium.once("error", reject);
  });
  let chromiumLog = "";
  chromium.stderr.on("data", (chunk) => {
    chromiumLog += chunk.toString("utf8");
  });

  let client;
  try {
    await chromiumStarted;
    const target = await waitForPageTarget(debugPort, pageUrl, options.timeoutMs);
    client = new DevToolsSocket(target.webSocketDebuggerUrl);
    await client.connect();
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: options.width,
      height: options.height,
      deviceScaleFactor: options.scale,
      mobile: false,
    });
    await client.send("Page.navigate", { url: pageUrl });
    let snapshot = await waitForCaptureReady(client, options.timeoutMs);
    if (options.partCapture) {
      snapshot = await evaluateCaptureRequest(client, options);
    }
    await client.send("Runtime.evaluate", {
      expression: "new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
      awaitPromise: true,
    });
    const image = await client.send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
    });
    fs.writeFileSync(tempOutputPath, Buffer.from(image.data, "base64"));
    fs.renameSync(tempOutputPath, outputPath);
    if (options.traceOut) {
      fs.mkdirSync(path.dirname(options.traceOut), { recursive: true });
      fs.writeFileSync(
        options.traceOut,
        JSON.stringify(snapshot?.utjSpringBoneTrace ?? null, null, 2)
      );
    }
    console.log(JSON.stringify({
      output: outputPath,
      traceOutput: options.traceOut || null,
      input: options.input,
      phase: options.phase,
      renderIsolation: options.renderIsolation,
      width: options.width,
      height: options.height,
      scale: options.scale,
      partCapture: options.partCapture,
      roleId: options.partCapture ? options.roleId : null,
      snapshot,
    }, null, 2));
  } catch (error) {
    if (chromiumLog.trim()) {
      console.error(chromiumLog.trim());
    }
    throw error;
  } finally {
    client?.close();
    if (fs.existsSync(tempOutputPath)) {
      removeCapturePath(tempOutputPath);
    }
    chromium.kill("SIGTERM");
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        chromium.kill("SIGKILL");
        resolve(null);
      }, 5000);
      chromium.once("close", () => {
        clearTimeout(timer);
        resolve(null);
      });
    });
    await new Promise((resolve) => server.close(() => resolve(null)));
    await removeCapturePathWithRetry(tempRoot);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  capture(parseArgs(process.argv.slice(2))).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  loadEngineConfig,
  resolveCaptureServerOptions,
} from "./config/haruki-3d-engine-config.mjs";
import { ensurePngRgba } from "./png-rgba.mjs";
import { applyRouteRegion, resolveRegionRoute } from "./region-routing.mjs";
import { decodeMsgpackBrotliAsJSON } from "./runtime-codec.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, "dist");
const engineConfig = loadEngineConfig(process.env.HARUKI_ENGINE_CONFIG || undefined);
const {
  runtimeRoot,
  captureOutputDir,
  chromiumPath,
  port,
  defaultWidth,
  defaultHeight,
  defaultScale,
  defaultTimeoutMs,
  defaultPhase,
  defaultClip,
  defaultWarmupMs,
  defaultWarmupFrames,
  defaultWarmupMode,
  defaultSpringRuntimeMode,
  defaultCameraPreset,
  defaultCameraProfile,
  defaultFaceSdfEnabled,
  defaultProjectedShadow,
  tempCaptureTtlMs,
  tempCaptureMaxBytes,
  captureGCIntervalMs,
  idleShutdownMs,
} = resolveCaptureServerOptions(engineConfig);

const mimeByExtension = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".msgpack", "application/msgpack"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".glb", "model/gltf-binary"],
  [".vrm", "model/gltf-binary"],
  [".wasm", "application/wasm"],
]);

function contentTypeForPath(filePath) {
  if (filePath.endsWith(".msgpack.br")) {
    return "application/msgpack";
  }
  return mimeByExtension.get(path.extname(filePath).toLowerCase()) ??
    "application/octet-stream";
}

let queue = Promise.resolve();
const MAX_PENDING_CAPTURES = 16;
const MAX_CAPTURE_DIMENSION = 2048;
const MAX_CAPTURE_WARMUP_MS = 300000;
const MAX_CAPTURE_WARMUP_FRAMES = 600;
const MAX_CAPTURE_TIMEOUT_MS = 300000;
const MAX_TRACE_EVENTS = 10000;
let pendingCaptureCount = 0;

function enqueue(task) {
  if (pendingCaptureCount >= MAX_PENDING_CAPTURES) {
    throw new Error("Capture queue is full.");
  }
  pendingCaptureCount += 1;
  const run = queue.then(task, task);
  queue = run.catch(() => {});
  return run.finally(() => {
    pendingCaptureCount -= 1;
  });
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store",
  });
  res.end(payload);
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

function serveResolvedFile(filePath, req, res, extraHeaders = {}) {
  fs.stat(filePath, (error, stat) => {
    if (error || !stat.isFile()) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("not found");
      return;
    }
    const headers = {
      "content-type": contentTypeForPath(filePath),
      "content-length": String(stat.size),
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      ...extraHeaders,
    };
    if (req.method === "HEAD") {
      res.writeHead(200, headers);
      res.end();
      return;
    }
    res.writeHead(200, headers);
    const stream = fs.createReadStream(filePath);
    stream.on("error", (error) => {
      if (res.headersSent) {
        res.destroy(error);
        return;
      }
      res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      res.end("failed to read file");
    });
    stream.pipe(res);
  });
}

function serveFile(root, relativePath, req, res) {
  const filePath = safeJoin(root, relativePath);
  if (!filePath) {
    res.writeHead(403);
    res.end("forbidden");
    return;
  }
  serveResolvedFile(filePath, req, res);
}

function serveRuntimeFile(root, relativePath, req, res) {
  const filePath = safeJoin(root, relativePath);
  if (!filePath) {
    res.writeHead(403);
    res.end("forbidden");
    return;
  }

  if (path.extname(filePath).toLowerCase() === ".json" && !fs.existsSync(filePath)) {
    const gzipPath = `${filePath}.gz`;
    if (fs.existsSync(gzipPath)) {
      serveResolvedFile(gzipPath, req, res, {
        "content-type": "application/json; charset=utf-8",
        "content-encoding": "gzip",
      });
      return;
    }
    const msgpackBrotliPath = filePath.replace(/\.json$/i, ".msgpack.br");
    if (fs.existsSync(msgpackBrotliPath)) {
      try {
        const payload = decodeMsgpackBrotliAsJSON(fs.readFileSync(msgpackBrotliPath));
        const headers = {
          "content-type": "application/json; charset=utf-8",
          "content-length": String(Buffer.byteLength(payload)),
          "cache-control": "no-store",
          "access-control-allow-origin": "*",
        };
        res.writeHead(200, headers);
        res.end(req.method === "HEAD" ? undefined : payload);
      } catch {
        res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
        res.end("failed to decode runtime registry");
      }
      return;
    }
  }

  serveResolvedFile(filePath, req, res);
}

function readRequestJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 64 * 1024) {
        reject(new Error("Request body is too large."));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function validateCaptureRequest(input) {
  const readNumber = (value, fallback) => {
    if (value === undefined || value === null || value === "") {
      return fallback;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const readIntInRange = (value, fallback, min, max) =>
    Math.min(Math.max(Math.trunc(readNumber(value, fallback)), min), max);
  const cacheMode = input.cacheMode === "temporary" ? "temporary" : "persistent";
  let imageId = String(input.imageId ?? "");
  if (imageId === "") {
    throw new Error("imageId must match /^[A-Za-z0-9._-]+$/.");
  }
  if (cacheMode === "temporary" && !imageId.startsWith("tmp_")) {
    imageId = `tmp_${imageId}`;
  }
  if (!/^[A-Za-z0-9._-]+$/.test(imageId) || imageId === "." || imageId === "..") {
    throw new Error("imageId must match /^[A-Za-z0-9._-]+$/.");
  }
  const roleId = String(input.roleId ?? "");
  if (!/^\d+(?::[A-Za-z0-9_/-]+)?$/.test(roleId)) {
    throw new Error("roleId must be '<characterId>:<unit>' or '<characterId>'.");
  }
  const region = String(input.region ?? "").trim();
  if (region !== "" && !/^[A-Za-z0-9_-]+$/.test(region)) {
    throw new Error("region must match /^[A-Za-z0-9_-]+$/.");
  }
  const readId = (name) => {
    const value = Number(input[name]);
    if (!Number.isInteger(value) || value <= 0) {
      throw new Error(`${name} must be a positive integer.`);
    }
    return value;
  };
  const readStringList = (...values) => values
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .flatMap((value) => typeof value === "string" ? value.split(",") : [])
    .map((value) => value.trim())
    .filter(Boolean);
  const readBoolean = (value) => value === true || value === "true" || value === 1 || value === "1";
  const readProjectedShadow = (value) => {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const readNumber = (name, fallback, min, max = Infinity) => {
      const parsed = Number(source[name]);
      const value = Number.isFinite(parsed) ? parsed : fallback;
      return Math.min(Math.max(value, min), max);
    };
    const readBool = (name, fallback) =>
      source[name] === undefined ? fallback : readBoolean(source[name]);
    return {
      width: readNumber("width", defaultProjectedShadow.width, 0.001),
      height: readNumber("height", defaultProjectedShadow.height, 0.001),
      opacity: readNumber("opacity", defaultProjectedShadow.opacity, 0, 1),
      crossSize: readNumber("crossSize", defaultProjectedShadow.crossSize, 0.001),
      crossOpacity: readNumber("crossOpacity", defaultProjectedShadow.crossOpacity, 0, 1),
      floorY: readNumber("floorY", defaultProjectedShadow.floorY, -Infinity),
      adjustShadow: readBool("adjustShadow", defaultProjectedShadow.adjustShadow),
      adjustAlpha: readBool("adjustAlpha", defaultProjectedShadow.adjustAlpha),
      invisibleHeight: readNumber("invisibleHeight", defaultProjectedShadow.invisibleHeight, 0.001),
      directionalShadow: readBool("directionalShadow", defaultProjectedShadow.directionalShadow),
    };
  };
  const readTtlMs = (value) => {
    const seconds = Number(value);
    if (!Number.isFinite(seconds) || seconds <= 0) {
      return tempCaptureTtlMs;
    }
    return Math.trunc(seconds * 1000);
  };
  const traceMaxEvents = Number(input.traceUtjMaxEvents);
  const optionalHeadOptional = input.headOptionalCostume3dId;
  return {
    imageId,
    cacheMode,
    ttlMs: cacheMode === "temporary" ? readTtlMs(input.ttlSeconds) : 0,
    runtimeBaseUrl: region === "" ? "/runtime/" : `/runtime/${region}/`,
    region: region || null,
    roleId,
    bodyCostume3dId: readId("bodyCostume3dId"),
    headCostume3dId: readId("headCostume3dId"),
    hairCostume3dId: readId("hairCostume3dId"),
    headOptionalCostume3dId:
      optionalHeadOptional === undefined || optionalHeadOptional === null
        ? null
        : readId("headOptionalCostume3dId"),
    phase: Math.min(Math.max(readNumber(input.phase, defaultPhase), 0), 1),
    cameraPreset: normalizeCameraPreset(input.cameraPreset, defaultCameraPreset),
    cameraProfile: normalizeCameraProfile(input.cameraProfile, defaultCameraProfile),
    characterYawMode: normalizeCharacterYawMode(input.characterYawMode, null),
    warmupMs: readIntInRange(input.warmupMs, defaultWarmupMs, 0, MAX_CAPTURE_WARMUP_MS),
    warmupFrames: readIntInRange(
      input.warmupFrames,
      defaultWarmupFrames,
      0,
      MAX_CAPTURE_WARMUP_FRAMES
    ),
    warmupMode: input.warmupMode === "runtime" ? "runtime" : defaultWarmupMode === "runtime" ? "runtime" : "animation",
    bodyDebugMode: normalizeBodyDebugMode(input.bodyDebugMode),
    faceSdfEnabled: input.faceSdfEnabled === undefined
      ? defaultFaceSdfEnabled
      : readBoolean(input.faceSdfEnabled),
    faceSdfDebugMode: normalizeFaceSdfDebugMode(input.faceSdfDebugMode),
    faceSdfDebugLightMode: normalizeFaceSdfDebugLightMode(input.faceSdfDebugLightMode),
    projectedShadow: readProjectedShadow(input.projectedShadow),
    width: readIntInRange(input.width, defaultWidth, 320, MAX_CAPTURE_DIMENSION),
    height: readIntInRange(input.height, defaultHeight, 320, MAX_CAPTURE_DIMENSION),
    scale: Math.min(Math.max(readNumber(input.scale, defaultScale), 1), 2),
    timeoutMs: readIntInRange(input.timeoutMs, defaultTimeoutMs, 5000, MAX_CAPTURE_TIMEOUT_MS),
    traceUtjBones: readStringList(input.traceUtjBones, input.traceUtjBone),
    traceUtjMaxEvents: Math.min(
      Math.max(
        Math.trunc(Number.isFinite(traceMaxEvents) ? traceMaxEvents : 240),
        1
      ),
      MAX_TRACE_EVENTS
    ),
    springDebugBones: readStringList(input.springDebugBones, input.springDebugBone),
    springDebugAllOffsets: readBoolean(input.springDebugAllOffsets),
  };
}

function normalizeBodyDebugMode(value) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const normalized = String(value);
  return [
    "skin",
    "h_r",
    "h_g",
    "h_b",
    "h_a",
    "vertex_r",
    "vertex_g",
    "base_shadow",
    "ndotl_raw",
    "h_b_adjusted_shadow",
    "ambient_target",
    "ambient_weight",
    "ambient_tint",
    "specular",
    "specular_mask",
    "specular_add",
    "rim_raw",
    "rim_add",
    "rim_gate",
    "rim_color",
    "rim_scalar",
    "toon_luma",
    "shadow_mask",
    "shadow_target",
  ].includes(normalized) ? normalized : undefined;
}

function normalizeFaceSdfDebugMode(value) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const normalized = String(value);
  return ["sdf", "mask", "limit", "basis", "range"].includes(normalized)
    ? normalized
    : undefined;
}

function normalizeFaceSdfDebugLightMode(value) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const normalized = String(value);
  return ["scene", "front", "left", "right", "back"].includes(normalized)
    ? normalized
    : undefined;
}

function normalizeCameraPreset(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  return value === "default" ? "default" : "capture";
}

function normalizeCameraProfile(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  return value === "official-default" ? "official-default" : "full-body";
}

function normalizeCharacterYawMode(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const normalized = String(value);
  return ["0", "45", "-45", "90", "-90", "180", "face-camera"].includes(normalized)
    ? normalized
    : fallback;
}

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "haruki-3d-http-capture-"));
}

async function removePathWithRetry(targetPath) {
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
  fs.rmSync(targetPath, { recursive: true, force: true });
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
      server.close(() => resolve(address.port));
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

async function waitForPageTarget(debugPort, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const targets = await fetchJson(`http://127.0.0.1:${debugPort}/json/list`);
      const target = targets.find((entry) => entry.type === "page" && entry.webSocketDebuggerUrl);
      if (target) {
        return target;
      }
    } catch {
      // Chromium may not be ready yet.
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
        for (const { reject: rejectPending, timer } of this.pending.values()) {
          clearTimeout(timer);
          rejectPending(new Error("DevTools socket closed."));
        }
        this.pending.clear();
      });
    });
  }

  send(method, params = {}, timeoutMs = defaultTimeoutMs) {
    const id = this.nextId;
    this.nextId += 1;
    const payload = JSON.stringify({ id, method, params });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`DevTools command timed out: ${method}`));
      }, timeoutMs);
      timer.unref?.();
      this.pending.set(id, { resolve, reject, timer });
      this.socket.write(this.encodeFrame(Buffer.from(payload, "utf8")));
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
    clearTimeout(pending.timer);
    if (parsed.error) {
      pending.reject(new Error(parsed.error.message ?? JSON.stringify(parsed.error)));
    } else {
      pending.resolve(parsed.result);
    }
  }
}

async function waitForRuntimeReady(client, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await client.send("Runtime.evaluate", {
      expression: `(() => ({
        ready: typeof window.__HARUKI_CAPTURE_REQUEST__ === "function",
        error: typeof window.__HARUKI_CAPTURE_REQUEST__ === "function"
          ? ""
          : window.__PJSK_CAPTURE_ERROR__ || document.body?.dataset?.captureError || ""
      }))()`,
      returnByValue: true,
    }, Math.max(deadline - Date.now(), 1));
    const value = result.result?.value;
    if (value?.error) {
      throw new Error(value.error);
    }
    if (value?.ready) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Timed out waiting for capture runtime readiness.");
}

class CaptureRuntimeSession {
  constructor() {
    this.client = null;
    this.chromium = null;
    this.chromiumLog = "";
    this.tempRoot = "";
    this.ready = false;
    this.restarting = false;
    this.idleStopped = false;
    this.startPromise = null;
  }

  status() {
    return {
      ready: this.ready,
      restarting: this.restarting,
      idleStopped: this.idleStopped,
    };
  }

  async ensureStarted(timeoutMs = defaultTimeoutMs) {
    if (this.ready && this.client && this.chromium) {
      return;
    }
    if (!this.startPromise) {
      this.startPromise = this.start(timeoutMs).finally(() => {
        this.startPromise = null;
      });
    }
    await this.startPromise;
  }

  async start(timeoutMs = defaultTimeoutMs) {
    this.restarting = true;
    await this.stop(false);
    this.ready = false;
    this.idleStopped = false;
    this.chromiumLog = "";
    this.tempRoot = makeTempDir();
    const debugPort = await getFreePort();
    const pageParams = new URLSearchParams({
      captureBase: "/runtime/",
      capturePhase: String(defaultPhase),
      captureClip: defaultClip,
      captureWarmupMs: String(defaultWarmupMs),
      captureWarmupFrames: String(defaultWarmupFrames),
      captureWarmupMode: defaultWarmupMode,
      springRuntimeMode: defaultSpringRuntimeMode,
      cameraPreset: defaultCameraPreset,
      cameraProfile: defaultCameraProfile,
      projectedShadowWidth: String(defaultProjectedShadow.width),
      projectedShadowHeight: String(defaultProjectedShadow.height),
      projectedShadowOpacity: String(defaultProjectedShadow.opacity),
      crossShadowSize: String(defaultProjectedShadow.crossSize),
      crossShadowOpacity: String(defaultProjectedShadow.crossOpacity),
      projectedShadowFloorY: String(defaultProjectedShadow.floorY),
      projectedShadowAdjust: defaultProjectedShadow.adjustShadow ? "true" : "false",
      projectedShadowAdjustAlpha: defaultProjectedShadow.adjustAlpha ? "true" : "false",
      projectedShadowInvisibleHeight: String(defaultProjectedShadow.invisibleHeight),
      projectedShadowDirectional: defaultProjectedShadow.directionalShadow ? "true" : "false",
    });
    const pageUrl = `http://127.0.0.1:${port}/capture.html?${pageParams.toString()}`;
    this.chromium = spawn(chromiumPath, [
      "--headless=new",
      "--hide-scrollbars",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-dev-shm-usage",
      "--no-sandbox",
      "--enable-unsafe-swiftshader",
      "--use-gl=angle",
      "--use-angle=swiftshader",
      `--user-data-dir=${path.join(this.tempRoot, "profile")}`,
      `--disk-cache-dir=${path.join(this.tempRoot, "cache")}`,
      `--media-cache-dir=${path.join(this.tempRoot, "media-cache")}`,
      "--disable-application-cache",
      "--aggressive-cache-discard",
      "--disk-cache-size=1",
      "--media-cache-size=1",
      `--remote-debugging-port=${debugPort}`,
      `--window-size=${defaultWidth},${defaultHeight}`,
      "about:blank",
    ], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    this.chromium.stderr.on("data", (chunk) => {
      this.chromiumLog += chunk.toString("utf8");
    });
    this.chromium.once("exit", () => {
      this.ready = false;
    });

    try {
      const target = await waitForPageTarget(debugPort, timeoutMs);
      this.client = new DevToolsSocket(target.webSocketDebuggerUrl);
      await this.client.connect();
      await this.client.send("Page.enable", {}, timeoutMs);
      await this.client.send("Runtime.enable", {}, timeoutMs);
      await this.client.send("Emulation.setDeviceMetricsOverride", {
        width: defaultWidth,
        height: defaultHeight,
        deviceScaleFactor: defaultScale,
        mobile: false,
      }, timeoutMs);
      await this.client.send("Page.navigate", { url: pageUrl }, timeoutMs);
      await waitForRuntimeReady(this.client, timeoutMs);
      this.ready = true;
    } catch (error) {
      if (this.chromiumLog.trim()) {
        console.error(this.chromiumLog.trim());
      }
      await this.stop(false);
      throw error;
    } finally {
      this.restarting = false;
    }
  }

  async restart(timeoutMs = defaultTimeoutMs) {
    await this.start(timeoutMs);
  }

  async stop(idleStopped = false) {
    this.ready = false;
    this.idleStopped = idleStopped;
    this.client?.close();
    this.client = null;
    const chromium = this.chromium;
    this.chromium = null;
    const oldTempRoot = this.tempRoot;
    this.tempRoot = "";
    if (chromium) {
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
    }
    if (oldTempRoot) {
      await removePathWithRetry(oldTempRoot);
    }
  }

  async capture(request) {
    await this.ensureStarted(request.timeoutMs);
    await this.client.send("Emulation.setDeviceMetricsOverride", {
      width: request.width,
      height: request.height,
      deviceScaleFactor: request.scale,
      mobile: false,
    }, request.timeoutMs);
    const result = await this.client.send("Runtime.evaluate", {
      expression: `window.__HARUKI_CAPTURE_REQUEST__(${JSON.stringify(request)})`,
      awaitPromise: true,
      returnByValue: true,
    }, request.timeoutMs);
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text ?? "Capture request failed.");
    }
    await this.client.send("Runtime.evaluate", {
      expression: "new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
      awaitPromise: true,
    }, request.timeoutMs);
    const image = await this.client.send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
    }, request.timeoutMs);
    return {
      png: Buffer.from(image.data, "base64"),
      snapshots: result.result?.value?.snapshots ?? null,
    };
  }
}

const captureSession = new CaptureRuntimeSession();
let idleShutdownTimer = null;

function clearIdleShutdownTimer() {
  if (!idleShutdownTimer) {
    return;
  }
  clearTimeout(idleShutdownTimer);
  idleShutdownTimer = null;
}

function scheduleIdleShutdown() {
  clearIdleShutdownTimer();
  if (idleShutdownMs <= 0) {
    return;
  }
  idleShutdownTimer = setTimeout(() => {
    idleShutdownTimer = null;
    captureSession.stop(true).catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
    });
  }, idleShutdownMs);
  idleShutdownTimer.unref?.();
}

async function captureRoleParts(input) {
  const request = validateCaptureRequest(input);
  fs.mkdirSync(captureOutputDir, { recursive: true });
  const outputPath = path.join(captureOutputDir, `${request.imageId}.png`);
  const tempOutputPath = path.join(
    captureOutputDir,
    `.${request.imageId}.${process.pid}.${crypto.randomUUID()}.tmp`
  );
  try {
    let result;
    try {
      result = await captureSession.capture(request);
    } catch (error) {
      await captureSession.restart(request.timeoutMs);
      result = await captureSession.capture(request);
    }
    fs.writeFileSync(tempOutputPath, ensurePngRgba(result.png), { flag: "wx" });
    fs.renameSync(tempOutputPath, outputPath);
    if (request.cacheMode === "temporary" && request.ttlMs > 0) {
      const expiresAt = Date.now() + request.ttlMs;
      const gcRelativeMtime = new Date(expiresAt - tempCaptureTtlMs);
      fs.utimesSync(outputPath, gcRelativeMtime, gcRelativeMtime);
    }
    return {
      imageId: request.imageId,
      cacheMode: request.cacheMode,
      output: outputPath,
      snapshots: result.snapshots,
    };
  } finally {
    if (fs.existsSync(tempOutputPath)) {
      fs.rmSync(tempOutputPath, { force: true });
    }
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
    const route = resolveRegionRoute(requestUrl.pathname, runtimeRoot);
    if (!route) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    const requestPath = route.pathname;
    if (req.method === "GET" && requestPath === "/healthz") {
      sendJson(res, 200, { ok: true, ...captureSession.status() });
      return;
    }
    if (req.method === "POST" && requestPath === "/capture") {
      clearIdleShutdownTimer();
      const body = applyRouteRegion(await readRequestJson(req), route.region);
      const result = await enqueue(async () => {
        clearIdleShutdownTimer();
        try {
          return await captureRoleParts(body);
        } finally {
          scheduleIdleShutdown();
        }
      });
      sendJson(res, 200, result);
      return;
    }
    if ((req.method === "GET" || req.method === "HEAD") && requestPath.startsWith("/captures/")) {
      serveFile(captureOutputDir, requestPath.slice("/captures/".length), req, res);
      return;
    }
    if ((req.method === "GET" || req.method === "HEAD") && requestPath.startsWith("/runtime/")) {
      serveRuntimeFile(route.runtimeRoot, requestPath.slice("/runtime/".length), req, res);
      return;
    }
    if (req.method === "GET" || req.method === "HEAD") {
      const relativePath = requestPath === "/" ? "capture.html" : requestPath;
      serveFile(distDir, relativePath, req, res);
      return;
    }
    res.writeHead(405);
    res.end("method not allowed");
  } catch (error) {
    scheduleIdleShutdown();
    sendJson(res, 500, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(JSON.stringify({
    service: "haruki-3d-capture",
    port,
    runtimeRoot,
    captureOutputDir,
    chromium: chromiumPath,
    tempCaptureTtlMs,
    tempCaptureMaxBytes,
    captureGCIntervalMs,
    idleShutdownMs,
  }));
  startTemporaryCaptureGC();
  void captureSession.ensureStarted()
    .then(scheduleIdleShutdown)
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
    });
});

function startTemporaryCaptureGC() {
  if (captureGCIntervalMs <= 0 || (tempCaptureTtlMs <= 0 && tempCaptureMaxBytes <= 0)) {
    return;
  }
  const cleanup = () => {
    cleanupExpiredTemporaryCaptures(Date.now()).catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
    });
  };
  cleanup();
  const timer = setInterval(cleanup, captureGCIntervalMs);
  timer.unref?.();
}

async function cleanupExpiredTemporaryCaptures(nowMs) {
  let entries;
  try {
    entries = await fs.promises.readdir(captureOutputDir, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") {
      return;
    }
    throw error;
  }
  const files = [];
  for (const entry of entries) {
    if (!entry.isFile() || !/^tmp_[A-Za-z0-9._-]+\.png$/.test(entry.name)) {
      continue;
    }
    const filePath = path.join(captureOutputDir, entry.name);
    let stat;
    try {
      stat = await fs.promises.stat(filePath);
    } catch (error) {
      if (error?.code === "ENOENT") {
        continue;
      }
      throw error;
    }
    if (tempCaptureTtlMs > 0 && nowMs - stat.mtimeMs > tempCaptureTtlMs) {
      await fs.promises.rm(filePath, { force: true });
      continue;
    }
    files.push({
      filePath,
      createdMs: Number.isFinite(stat.birthtimeMs) ? stat.birthtimeMs : stat.ctimeMs,
      size: stat.size,
    });
  }
  if (tempCaptureMaxBytes <= 0) {
    return;
  }
  let total = files.reduce((sum, file) => sum + file.size, 0);
  files.sort((a, b) => a.createdMs - b.createdMs);
  for (const file of files) {
    if (total <= tempCaptureMaxBytes) {
      break;
    }
    await fs.promises.rm(file.filePath, { force: true });
    total -= file.size;
  }
}

async function shutdown(signal) {
  clearIdleShutdownTimer();
  await captureSession.stop();
  process.kill(process.pid, signal);
}

process.once("SIGINT", () => {
  void shutdown("SIGINT");
});
process.once("SIGTERM", () => {
  void shutdown("SIGTERM");
});

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
} = resolveCaptureServerOptions(engineConfig);

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

let queue = Promise.resolve();

function enqueue(task) {
  const run = queue.then(task, task);
  queue = run.catch(() => {});
  return run;
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

function serveFile(root, relativePath, req, res) {
  const filePath = safeJoin(root, relativePath);
  if (!filePath) {
    res.writeHead(403);
    res.end("forbidden");
    return;
  }
  fs.stat(filePath, (error, stat) => {
    if (error || !stat.isFile()) {
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
  const imageId = String(input.imageId ?? "");
  if (!/^[A-Za-z0-9._-]+$/.test(imageId) || imageId === "." || imageId === "..") {
    throw new Error("imageId must match /^[A-Za-z0-9._-]+$/.");
  }
  const roleId = String(input.roleId ?? "");
  if (!/^\d+(?::[A-Za-z0-9_/-]+)?$/.test(roleId)) {
    throw new Error("roleId must be '<characterId>:<unit>' or '<characterId>'.");
  }
  const readId = (name) => {
    const value = Number(input[name]);
    if (!Number.isInteger(value) || value <= 0) {
      throw new Error(`${name} must be a positive integer.`);
    }
    return value;
  };
  const optionalHeadOptional = input.headOptionalCostume3dId;
  return {
    imageId,
    roleId,
    bodyCostume3dId: readId("bodyCostume3dId"),
    headCostume3dId: readId("headCostume3dId"),
    hairCostume3dId: readId("hairCostume3dId"),
    headOptionalCostume3dId:
      optionalHeadOptional === undefined || optionalHeadOptional === null
        ? null
        : readId("headOptionalCostume3dId"),
    phase: 0.5,
    width: Math.max(Math.trunc(Number(input.width) || defaultWidth), 320),
    height: Math.max(Math.trunc(Number(input.height) || defaultHeight), 320),
    scale: Math.min(Math.max(Number(input.scale) || defaultScale, 1), 2),
    timeoutMs: Math.max(Math.trunc(Number(input.timeoutMs) || defaultTimeoutMs), 5000),
  };
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

async function waitForRuntimeReady(client, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await client.send("Runtime.evaluate", {
      expression: `(() => ({
        ready: typeof window.__HARUKI_CAPTURE_REQUEST__ === "function" &&
          window.__PJSK_CAPTURE_READY__ === true,
        error: window.__PJSK_CAPTURE_ERROR__ || document.body?.dataset?.captureError || ""
      }))()`,
      returnByValue: true,
    });
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
    this.startPromise = null;
  }

  status() {
    return {
      ready: this.ready,
      restarting: this.restarting,
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
    await this.stop();
    this.ready = false;
    this.chromiumLog = "";
    this.tempRoot = makeTempDir();
    const debugPort = await getFreePort();
    const pageUrl = `http://127.0.0.1:${port}/capture.html?captureBase=/runtime/&capturePhase=0.5&captureClip=motion_loop&springRuntimeMode=unity-prefab&cameraPreset=id5-debug`;
    this.chromium = spawn(chromiumPath, [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-dev-shm-usage",
      "--no-sandbox",
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
      await this.client.send("Page.enable");
      await this.client.send("Runtime.enable");
      await this.client.send("Emulation.setDeviceMetricsOverride", {
        width: defaultWidth,
        height: defaultHeight,
        deviceScaleFactor: defaultScale,
        mobile: false,
      });
      await this.client.send("Page.navigate", { url: pageUrl });
      await waitForRuntimeReady(this.client, timeoutMs);
      this.ready = true;
    } catch (error) {
      if (this.chromiumLog.trim()) {
        console.error(this.chromiumLog.trim());
      }
      await this.stop();
      throw error;
    } finally {
      this.restarting = false;
    }
  }

  async restart(timeoutMs = defaultTimeoutMs) {
    await this.start(timeoutMs);
  }

  async stop() {
    this.ready = false;
    this.client?.close();
    this.client = null;
    const chromium = this.chromium;
    this.chromium = null;
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
    if (this.tempRoot) {
      const oldTempRoot = this.tempRoot;
      this.tempRoot = "";
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
    });
    const result = await this.client.send("Runtime.evaluate", {
      expression: `window.__HARUKI_CAPTURE_REQUEST__(${JSON.stringify(request)})`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text ?? "Capture request failed.");
    }
    await this.client.send("Runtime.evaluate", {
      expression: "new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
      awaitPromise: true,
    });
    const image = await this.client.send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
    });
    return {
      png: Buffer.from(image.data, "base64"),
      snapshots: result.result?.value?.snapshots ?? null,
    };
  }
}

const captureSession = new CaptureRuntimeSession();

async function captureRoleParts(input) {
  const request = validateCaptureRequest(input);
  fs.mkdirSync(captureOutputDir, { recursive: true });
  const outputPath = path.join(captureOutputDir, `${request.imageId}.png`);
  const tempOutputPath = path.join(captureOutputDir, `.${request.imageId}.${process.pid}.tmp`);
  try {
    let result;
    try {
      result = await captureSession.capture(request);
    } catch (error) {
      await captureSession.restart(request.timeoutMs);
      result = await captureSession.capture(request);
    }
    fs.writeFileSync(tempOutputPath, result.png);
    fs.renameSync(tempOutputPath, outputPath);
    return {
      imageId: request.imageId,
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
    if (req.method === "GET" && requestUrl.pathname === "/healthz") {
      sendJson(res, 200, { ok: true, ...captureSession.status() });
      return;
    }
    if (req.method === "POST" && requestUrl.pathname === "/capture") {
      const body = await readRequestJson(req);
      const result = await enqueue(() => captureRoleParts(body));
      sendJson(res, 200, result);
      return;
    }
    if ((req.method === "GET" || req.method === "HEAD") && requestUrl.pathname.startsWith("/captures/")) {
      serveFile(captureOutputDir, requestUrl.pathname.slice("/captures/".length), req, res);
      return;
    }
    if ((req.method === "GET" || req.method === "HEAD") && requestUrl.pathname.startsWith("/runtime/")) {
      serveFile(runtimeRoot, requestUrl.pathname.slice("/runtime/".length), req, res);
      return;
    }
    if (req.method === "GET" || req.method === "HEAD") {
      const relativePath = requestUrl.pathname === "/" ? "capture.html" : requestUrl.pathname;
      serveFile(distDir, relativePath, req, res);
      return;
    }
    res.writeHead(405);
    res.end("method not allowed");
  } catch (error) {
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
  }));
  void captureSession.ensureStarted().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
  });
});

async function shutdown(signal) {
  await captureSession.stop();
  process.kill(process.pid, signal);
}

process.once("SIGINT", () => {
  void shutdown("SIGINT");
});
process.once("SIGTERM", () => {
  void shutdown("SIGTERM");
});

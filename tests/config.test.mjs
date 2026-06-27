import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { parseArgs } from "../capture-runtime.mjs";
import {
  loadEngineConfig,
  resolveCaptureRuntimeOptions,
  resolveCaptureServerOptions,
} from "../config/haruki-3d-engine-config.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");

test("loads engine config JSON and applies capture runtime CLI overrides", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "haruki-engine-config-test-"));
  const configPath = path.join(dir, "engine.config.json");
  fs.writeFileSync(configPath, JSON.stringify({
    capture: {
      runtimeRoot: "/data/runtime-from-config",
      outputDir: "/data/captures-from-config",
      width: 700,
      height: 500,
      scale: 2,
      timeoutMs: 12000,
      phase: 0.25,
      clip: "motion_loop",
      springRuntimeMode: "unity-prefab",
      cameraPreset: "id5-debug"
    },
    chromium: {
      executable: "/usr/bin/chromium"
    },
    server: {
      port: 18080
    }
  }));

  const config = loadEngineConfig(configPath);
  const runtime = resolveCaptureRuntimeOptions(config, {
    input: "/tmp/input",
    out: "/tmp/out.png",
    width: 900,
  });
  const server = resolveCaptureServerOptions(config, {});

  assert.equal(runtime.width, 900);
  assert.equal(runtime.height, 500);
  assert.equal(runtime.scale, 2);
  assert.equal(runtime.phase, 0.25);
  assert.equal(runtime.chromium, "/usr/bin/chromium");
  assert.equal(server.runtimeRoot, "/data/runtime-from-config");
  assert.equal(server.captureOutputDir, "/data/captures-from-config");
  assert.equal(server.port, 18080);
});

test("experimental neck contact shadow cannot be enabled in production shading", () => {
  const engineSource = fs.readFileSync(
    path.join(repoRoot, "src/engine/Haruki3DEngine.ts"),
    "utf8"
  );
  const shaderSource = fs.readFileSync(
    path.join(repoRoot, "src/materials/sekaiCharacterShader.ts"),
    "utf8"
  );

  assert.match(engineSource, /const NECK_CONTACT_SHADOW_STRENGTH = 0\.0;/);
  assert.match(
    engineSource,
    /if \(this\.bodyDebugMode === "off" && NECK_CONTACT_SHADOW_STRENGTH <= 0\.0\) \{\s+return;\s+\}/
  );
  assert.match(
    shaderSource,
    /Experimental neck\/contact shadow is kept debuggable but disabled until its data path is complete\./
  );
  assert.doesNotMatch(
    shaderSource,
    /shadowBand\s*=\s*(?:max|mix)\([^;]*uNeckContactStrength/s
  );
  assert.match(
    shaderSource,
    /material\.uniforms\.uNeckContactStrength\.value = 0\.0;/
  );
});

test("capture runtime parser allows config to replace built-in defaults", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "haruki-engine-cli-config-test-"));
  const configPath = path.join(dir, "engine.config.json");
  fs.writeFileSync(configPath, JSON.stringify({
    capture: {
      width: 640,
      height: 480,
      scale: 2,
      timeoutMs: 12000
    },
    chromium: {
      executable: "/usr/bin/chromium-from-config"
    }
  }));

  const options = parseArgs([
    "--config", configPath,
    "--input", dir,
    "--out", path.join(dir, "capture.png"),
  ]);

  assert.equal(options.width, 640);
  assert.equal(options.height, 480);
  assert.equal(options.scale, 2);
  assert.equal(options.timeoutMs, 12000);
  assert.equal(options.chromium, "/usr/bin/chromium-from-config");
});

test("part registry runtime path keeps role motion separate from part packages", () => {
  const composerSource = fs.readFileSync(
    path.join(repoRoot, "src/parts/runtimePartComposer.ts"),
    "utf8"
  );
  const loaderSource = fs.readFileSync(
    path.join(repoRoot, "src/runtime/runtimePackageLoader.ts"),
    "utf8"
  );
  const engineSource = fs.readFileSync(
    path.join(repoRoot, "src/engine/Haruki3DEngine.ts"),
    "utf8"
  );

  assert.match(composerSource, /type RoleRuntimePackage =/);
  assert.match(composerSource, /resolveHeadOptionalAttachPath/);
  assert.match(composerSource, /sourceRendererTransformPath/);
  assert.match(loaderSource, /roleRuntimePath/);
  assert.match(loaderSource, /loadRoleRuntimePackages/);
  assert.match(engineSource, /applyCustomRoleDefaultMotion/);
  assert.match(engineSource, /nativeMeshes: this\.lastNativeMeshInstallDiagnostics/);
});

test("docker runtime image includes capture server config module", () => {
  const dockerfile = fs.readFileSync(path.join(repoRoot, "Dockerfile"), "utf8");

  assert.match(dockerfile, /COPY\s+config\s+\.\/config/);
});

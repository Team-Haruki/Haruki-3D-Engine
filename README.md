# Haruki 3D Engine

Runtime engine for rendering converted Project SEKAI 3D character packages in a browser.

This package is not a product GUI. Its public entry is a browser rendering kernel that owns package loading, scene assembly, animation, SpringBone, camera state, and rendering. The capture stack uses a separate internal adapter around the same kernel implementation.

The engine does not parse Unity bundles. It loads only the final, role-scoped
Haruki runtime package:

- `parts/by-role/<characterId>/<unit>/part-registry.msgpack.br`
- `parts/by-role/<characterId>/<unit>/character3d-index.msgpack.br`
- `parts/compat/by-unit/<unit>/head-hair-compatibility.msgpack.br`
- `parts/**/part-runtime.msgpack.br`
- `parts/_cores/**/part-runtime-core.msgpack.br`
- role and motion runtimes referenced by those registries, also as `.msgpack.br`

## Quick Start

```bash
npm install
npm run build
```

Use the public entry from `src/index.ts` during local development, or from the built package after `npm run build`:

```ts
import {
  createHaruki3DKernel,
} from "haruki-3d-engine";

const kernel = createHaruki3DKernel({
  canvas: document.querySelector("canvas")!,
  assetBaseUrl: "/assets/runtime/jp/",
});

await kernel.load({
  roleId: "5:light_sound",
  bodyCostume3dId: 10,
  headCostume3dId: 105,
  hairCostume3dId: 205,
  headOptionalCostume3dId: null,
});
kernel.play();
```

Full API notes are in [docs/api.md](docs/api.md).

## Capture Harness

The repository keeps one intentionally minimal browser harness for automated capture:

```bash
npm run dev:capture
```

The production capture path is the persistent HTTP service:

```bash
node capture-server.mjs
```

Useful capture request fields:

- `--config <json>` loads capture defaults from a JSON config file.
- `--phase <0..1>` seeks the selected loop phase.
- `--scale <1..2>` renders with a higher device pixel ratio for sharper PNGs.
- `--warmup-frames <n>` steps the runtime at 60fps before capture.
- `--warmup-mode animation` advances animation and runtime.
- `--warmup-mode runtime` freezes animation and only settles runtime systems.
- `--yaw <0|45|-45|90|-90|180>` sets character yaw.
- `--spring-runtime-mode unity-prefab` enables the Unity Prefab SpringBone runtime.

SpringBone defaults to `unity-prefab` in current engine and capture defaults. Use `springRuntimeMode: "off"` or the capture flag when a caller needs a static pose.

## Configuration

Runtime-local defaults live in `haruki-3d-engine.config.json`. This file is ignored by git. Copy `haruki-3d-engine.config.example.json` when preparing a local, Docker, or server deployment.

The example file is safe for public use and should not contain machine-specific paths. The real config can define:

- `capture.runtimeRoot` and `capture.outputDir` for the capture server.
- capture defaults such as `width`, `height`, `scale`, `timeoutMs`, `phase`, `clip`, `springRuntimeMode`, `cameraPreset`, `faceSdfEnabled`, and `idleShutdown`.
- `chromium.executable` when Chromium is not on `PATH`.
- `server.port` for the HTTP capture service.

For the HTTP service, set `HARUKI_ENGINE_CONFIG=<json>` or place `haruki-3d-engine.config.json` in the working directory. Server environment variables such as `HARUKI_RUNTIME_ROOT`, `HARUKI_CAPTURE_OUTPUT_DIR`, `HARUKI_CAPTURE_SCALE`, `HARUKI_CAPTURE_TIMEOUT_MS`, `HARUKI_CAPTURE_IDLE_SHUTDOWN`, `CHROMIUM`, and `PORT` override config values.

Current product 3D previews keep FaceSDF disabled by default. Use `capture.faceSdfEnabled: true`, `HARUKI_CAPTURE_FACE_SDF_ENABLED=true`, or a per-request `faceSdfEnabled: true` only for explicit FaceSDF research captures.

## Runtime Behavior

The engine reads exact PJSK semantics from `PJSK_sekai_runtime`:

- body/head assembly metadata
- material slot kinds and C/S/H texture roles
- face SDF texture role
- morph hash/channel bindings
- embedded face/light motion data
- SpringBone metadata and Unity Prefab runtime data

Motion behavior:

- The role runtime selects its Unity motion `.msgpack.br` package.
- Embedded face clips are promoted with the body loop, so `face_loop` is active when the body loop is active.

Custom wardrobe behavior:

- Part registry packages enable body/head/hair/head-optional switching.
- Custom switching is limited to parts for the currently loaded role. A role is `characterId:unit`, so Miku's unit variants are separate roles.
- Switching to another role first selects/reloads that role, then applies the requested parts.
- Switching parts inside the same role preserves animation playback state and rebuilds SpringBone for the new combined character.
- SpringBone is rebuilt after a new combined character is imported.

## Docker

The Docker image runs the capture HTTP service. Mount an exported runtime package at `/data/runtime` and a final PNG output directory at `/data/captures`:

```bash
docker build -t haruki-3d-engine .
docker run --rm -p 8080:8080 \
  -e HARUKI_ENGINE_CONFIG=/app/haruki-3d-engine.config.json \
  -e HARUKI_CAPTURE_SCALE=2 \
  -v /path/to/haruki-3d-engine.config.json:/app/haruki-3d-engine.config.json:ro \
  -v /path/to/runtime:/data/runtime:ro \
  -v /path/to/captures:/data/captures \
  haruki-3d-engine
```

The service keeps Chromium warm for capture requests and stops it after `HARUKI_CAPTURE_IDLE_SHUTDOWN` of inactivity. The default is `1h`; use `30m` for a shorter idle window or `0` to disable idle shutdown.

Capture API:

```bash
curl -X POST http://localhost:8080/capture \
  -H 'content-type: application/json' \
  -d '{
    "imageId": "21_light_sound_1001",
    "roleId": "21:light_sound",
    "bodyCostume3dId": 1001,
    "headCostume3dId": 1001,
    "hairCostume3dId": 1001,
    "headOptionalCostume3dId": null,
    "scale": 2
  }'
```

For a runtime root containing region directories such as `/data/runtime/jp` and
`/data/runtime/tw`, prefix any route with `/regions/<region>`. For example,
`/regions/jp/capture` uses the JP runtime and
`/regions/jp/runtime/parts/by-role/5/light_sound/part-registry.msgpack.br`
serves its role registry. Runtime metadata is exclusively Brotli-compressed
MessagePack; part packages must use core+delta and declare `corePath`.

The service starts one persistent headless Chromium page and keeps the engine loaded. Requests reuse that page, write only the final `/data/captures/<imageId>.png`, and atomically replace an existing file with the same id. `width` and `height` control CSS framing; `scale` controls output DPR, so `700x500` with `scale: 2` writes a `1400x1000` PNG. The service-owned Chromium profile/cache directory is removed on shutdown or session restart. Open `http://localhost:8080/capture.html` only when inspecting the harness manually.

## Development Notes

Build:

```bash
npm run build
```

Current constraints:

- Browser code should load converted packages only, not raw bundles.
- `character/character.vrm` is a transport container with PJSK custom extras, not a guarantee of generic VRM visual parity.
- Exact rendering depends on engine shaders and `PJSK_sekai_runtime`.
- The public API should remain usable by multiple frontends without requiring direct Three.js object mutation.

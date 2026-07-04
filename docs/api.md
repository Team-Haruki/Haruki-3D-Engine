# Haruki 3D Engine API

`Haruki3DEngine` is the public runtime boundary. External viewers decide layout and controls; the engine owns package loading, scene assembly, rendering, camera state, animation stepping, SpringBone, and capture framing.

## Entry Point

```ts
import {
  Haruki3DEngine,
  previewLightDefaults,
  type HarukiCaptureRolePartsRequest,
  type HarukiEngineSnapshots,
  type HarukiRuntimePackageRequest,
} from "haruki-3d-engine";
```

The local source entry is `src/index.ts`; package builds emit `dist/haruki-3d-engine.js` and declarations under `dist/types`.

## Lifecycle

```ts
const engine = new Haruki3DEngine({
  container,
  initialLight: { ...previewLightDefaults },
  presentationMode: "interactive",
  cameraPreset: "capture",
});

await engine.loadRuntimePackage({ baseUrl: "/assets/runtime/001/" });

engine.renderFrame();
engine.destroy();
```

Constructor options:

- `container`: DOM element that receives the WebGL canvas.
- `initialLight`: initial scene light state.
- `presentationMode`: `"interactive"` or `"capture"`.
- `cameraPreset`: `"default"` or `"capture"`. The legacy `"id5-debug"` value is accepted by CLI/config callers as an alias for `"capture"`.
- `autoRender`: starts the internal render loop when true.
- `manageResize`: installs resize handling when true.

## Package Loading

```ts
await engine.loadRuntimePackage({
  baseUrl: "/assets/runtime/001/",
  fullRuntimeOnly: false,
  applyDefaultAnimation: true,
  applyFaceMotion: true,
});
```

`baseUrl` may point to either:

- a full runtime package with `pjsk-sekai-runtime.extension.json`
- a part registry package with `parts/part-registry.json`

The loader first tries part registry mode unless `fullRuntimeOnly` is true. If the package is a registry, the returned result includes a wardrobe controller and the engine imports the default same-character part selection.

## Custom Wardrobe

Use engine methods for wardrobe changes. External callers should not mutate Three.js scene objects directly.

```ts
await engine.updateCustomSelection("body", 1001);
await engine.setCustomSelection({
  characterId: 21,
  unit: "light_sound",
  bodyCostume3dId: 1001,
  headCostume3dId: 1001,
  hairCostume3dId: 1001,
  headOptionalCostume3dId: null,
  origin: "custom",
});
```

Custom selection is only valid inside the currently loaded role. The role key is `characterId:unit`; this matters for Miku because each unit variant is a separate role with separate availability rules. Same-role part switching preserves animation playback state and rebuilds SpringBone. Cross-role switching should call `captureRoleParts` or explicitly select/reload the role before applying parts.

## Role Capture API

For the Docker/batch use case, call the role-part capture API instead of scripting individual scene operations:

```ts
const request: HarukiCaptureRolePartsRequest = {
  imageId: "21_light_sound_1001",
  roleId: "21:light_sound",
  bodyCostume3dId: 1001,
  headCostume3dId: 1001,
  hairCostume3dId: 1001,
  headOptionalCostume3dId: null,
};

const result = await engine.captureRoleParts(request);
```

`captureRoleParts` fixes the capture defaults used by the current pipeline:

- animation: `motion_loop` at phase `0.5`
- camera: official CostumeShop perspective camera data (`fov=25`, default `zoomValue=0`, `zoomMoveValue=1`)
- SpringBone: `unity-prefab`
- output state: capture presentation mode

## Rendering And Capture

For interactive viewers, let `autoRender` run or call `stepRuntimeFrame` plus `renderFrame` yourself.

```ts
engine.stepRuntimeFrame(1 / 60, { advanceAnimation: true });
engine.renderFrame();
```

For deterministic capture:

```ts
engine.setPresentationMode("capture");
engine.setSpringRuntimeMode("unity-prefab");
engine.seekAnimationLoopPhase(0.5);
engine.stepCaptureFrame(1 / 60, true);
engine.frameCurrentCharacterForCapture();
engine.applyCameraPreset("capture");
engine.renderFrame();
```

The included `capture.html` and `capture-runtime.mjs` are reference callers for automated screenshots. They are not the product GUI.

The Docker service exposes the same capture path over HTTP:

```http
POST /capture
content-type: application/json

{
  "imageId": "21_light_sound_1001",
  "roleId": "21:light_sound",
  "bodyCostume3dId": 1001,
  "headCostume3dId": 1001,
  "hairCostume3dId": 1001,
  "headOptionalCostume3dId": null,
  "width": 700,
  "height": 500,
  "scale": 2,
  "cacheMode": "persistent"
}
```

It writes `/data/captures/<imageId>.png` and serves it back from `GET /captures/<imageId>.png`.
Use `cacheMode: "temporary"` plus optional `ttlSeconds` for free-form combinations that should not enter the long-lived preview cache; temporary image ids are written with a `tmp_` prefix and are removed by the capture GC after the configured TTL.
`width` and `height` control the capture framing in CSS pixels. `scale` controls output DPR from `1` to `2`; use `scale: 2` for thumbnails that will be inspected or resized by downstream UI.
The service keeps one Chromium page and one engine instance warm, so repeated requests do not create per-request browser profile or cache directories. `/healthz` returns `ready` and `restarting` flags for startup and crash-recovery checks.

## Camera And Background

Camera and presentation are part of the engine API because capture and external viewers need identical output:

```ts
engine.applyCameraPreset("capture");
engine.shiftCameraRight(1);
engine.setViewportSize(1400, 1000);
engine.setPresentationMode("capture");
```

Callers can read camera state from snapshots instead of duplicating OrbitControls math.

## Debug Snapshots

```ts
const snapshots: HarukiEngineSnapshots = engine.getSnapshots();
```

Snapshots include:

- `animation`
- `faceMotion`
- `springBone`
- `camera`
- `runtimeDebug`

Specialized debug accessors such as `getUtjSpringBoneTraceSnapshot()` remain available for capture diagnostics.

## External Caller Shape

A frontend should keep its own GUI state, translate user actions into engine calls, and render snapshots as read-only debug data:

```ts
async function selectBody(costume3dId: number) {
  await engine.updateCustomSelection("body", costume3dId);
  state.snapshots = engine.getSnapshots();
}
```

This keeps visual design separate from runtime behavior while preserving one shared renderer for browser preview and capture.

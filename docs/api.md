# Haruki 3D Kernel Interface

The default package entry exposes only the browser rendering kernel. Product
pages own layout, controls, command parsing, localization, and user-facing
errors.

## Create And Load

```ts
import { createHaruki3DKernel } from "haruki-3d-engine";

const kernel = createHaruki3DKernel({
  canvas: document.querySelector("canvas")!,
  assetBaseUrl: "/assets/runtime/jp/",
});

await kernel.load({
  roleId: "5:light_sound",
  bodyCostume3dId: 797001,
  headCostume3dId: 105,
  headPackagePath: "parts/_sources/head/105",
  hairCostume3dId: 205,
  headOptionalCostume3dId: null,
});

kernel.play();
```

`load()` is the single character seam. It handles initial loading, exact part
selection, same-role updates, and cross-role reconstruction. Callers do not
choose between the underlying loader, wardrobe, composer, or model-combine
paths.

`headPackagePath` is required when independent head or accessory sources share
the same raw ID. Ambiguous IDs are rejected instead of selecting a source by
registry order.

## Lifecycle

```ts
kernel.pause();
kernel.resize(width, height);
kernel.play();
kernel.destroy();
```

- `play()` owns the render loop and advances the runtime at a fixed 60 Hz step.
- `pause()` stops scheduling frames without destroying the loaded character.
- `resize()` updates the viewport explicitly; the kernel does not own page
  resize observers or layout.
- `destroy()` releases Three.js, WebGL, texture, geometry, animation, and
  SpringBone resources. It never clears the caller's DOM container.

The supplied canvas remains owned by the caller. The kernel does not attach
OrbitControls or pointer handlers to it.

## Runtime Assets

`assetBaseUrl` points to one final Exporter runtime root. The kernel reads only
the final role-scoped package:

- `parts/by-role/<characterId>/<unit>/part-registry.msgpack.br`
- `parts/by-role/<characterId>/<unit>/character3d-index.msgpack.br`
- `parts/compat/by-unit/<unit>/head-hair-compatibility.msgpack.br`
- referenced part core/delta packages, textures, role runtime, and motion

Raw Unity bundles are not a supported browser input.

## Capture Adapter

The Docker capture service is not part of the public browser interface. It uses
`HarukiCaptureAdapter` from the internal entry to apply capture-only concerns:

- phase seeking
- warmup frames or warmup time
- capture camera/profile
- debug isolation settings
- SpringBone traces and snapshots

The capture harness/service performs the final canvas-to-PNG conversion after
the adapter has prepared and rendered the frame.

```ts
import {
  Haruki3DEngine,
  HarukiCaptureAdapter,
} from "haruki-3d-engine/internal";
```

The internal entry exists for the repository's capture harness and tests. Web
products should not depend on it.

The HTTP service remains:

```http
POST /capture
GET /captures/<imageId>.png
GET /healthz
```

It keeps one Chromium session warm, serializes capture requests, writes the
final PNG atomically, and leaves rendering semantics to the shared engine
implementation.

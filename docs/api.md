# Haruki 3D Browser API

The default package entry is the stable browser rendering boundary. It owns
runtime loading, character assembly, animation, SpringBone, camera state, and
WebGL rendering. The product owns layout, controls, command parsing,
localization, loading indicators, and user-facing errors.

The browser API does not accept raw Unity bundles and does not call the Docker
capture service.

## Browser Requirements

- a modern Chrome, Firefox, or Safari release
- WebGL 2
- ES modules, `fetch`, WebAssembly, and `requestAnimationFrame`

The engine uses Three.js/WebGL. It does not require WebGPU. Feature-detect
WebGL 2 before creating the kernel and show the product's own unsupported
browser message when it is unavailable.

## Install And Import

Build or consume the package with an ESM-aware bundler. Deploy the generated
JavaScript and WASM assets together.

```ts
import {
  createHaruki3DKernel,
  previewLightDefaults,
  type Haruki3DKernel,
  type Haruki3DKernelOptions,
  type HarukiRenderRecipe,
} from "haruki-3d-engine";
```

The public entry intentionally exports only the kernel factory, its public
types, and the default preview light. Do not import from
`haruki-3d-engine/internal` in a product page.

## Minimal Integration

```html
<div id="viewer">
  <canvas id="pjsk-3d"></canvas>
</div>
```

```css
#viewer {
  width: 100%;
  aspect-ratio: 7 / 5;
}

#pjsk-3d {
  display: block;
  width: 100%;
  height: 100%;
}
```

```ts
import { createHaruki3DKernel } from "haruki-3d-engine";

const canvas = document.querySelector<HTMLCanvasElement>("#pjsk-3d")!;
const host = document.querySelector<HTMLElement>("#viewer")!;

const kernel = createHaruki3DKernel({
  canvas,
  assetBaseUrl: "/assets/pjsk-3d/6.6.0.30/jp/",
});

const resize = () => {
  const { width, height } = host.getBoundingClientRect();
  kernel.resize(width, height);
};
const observer = new ResizeObserver(resize);
observer.observe(host);
resize();

await kernel.load({
  roleId: "14:theme_park",
  bodyCostume3dId: 28,
  headCostume3dId: 114,
  hairCostume3dId: 214,
  headOptionalCostume3dId: null,
});
kernel.play();

// On page/component disposal:
// observer.disconnect();
// kernel.destroy();
```

`load()` resolves after the selected character has been assembled and one
initial frame has been rendered. Call `play()` afterwards to start continuous
animation.

## Public API

### `createHaruki3DKernel(options)`

```ts
type Haruki3DKernelOptions = {
  canvas: HTMLCanvasElement;
  assetBaseUrl: string;
  initialLight?: PreviewLightState;
};
```

| Field | Meaning |
| --- | --- |
| `canvas` | Caller-owned canvas used for WebGL output. |
| `assetBaseUrl` | Versioned final Exporter runtime root for exactly one region. |
| `initialLight` | Optional initial character light; defaults to `previewLightDefaults`. |

`assetBaseUrl` is fixed for the lifetime of the kernel. To switch region or
runtime version, destroy the old kernel and create a new one with the new base
URL.

### `kernel.load(recipe)`

```ts
type HarukiRenderRecipe = {
  roleId: string;
  bodyCostume3dId: number;
  headCostume3dId: number;
  headPackagePath?: string | null;
  hairCostume3dId: number;
  headOptionalCostume3dId?: number | null;
};
```

| Field | Meaning |
| --- | --- |
| `roleId` | Runtime role in `<characterId>:<unit>` form, for example `14:theme_park`. |
| `bodyCostume3dId` | Exact body `costume3dId` from the selected runtime registry. |
| `headCostume3dId` | Exact head/accessory `costume3dId` from the selected runtime registry. |
| `headPackagePath` | Exact registry package path when a raw head ID has multiple independent sources. |
| `hairCostume3dId` | Exact hair `costume3dId` from the selected runtime registry. |
| `headOptionalCostume3dId` | Optional separately mounted head accessory, or `null`. |

All part IDs are positive integer runtime IDs. They are not the normalized
outfit, accessory, hair, or color IDs accepted by Haruki Bot commands. A
product backend should resolve user-facing selections into one complete
`HarukiRenderRecipe`; the browser should not reimplement masterdata grouping,
color selection, role aliases, or head/hair compatibility.

`headPackagePath` is required when independent head or accessory sources share
the same raw ID. Ambiguous IDs are rejected instead of selecting a source by
registry order.

`load()` is the single character mutation seam:

- the first recipe loads the role package and selected parts;
- a same-role recipe preserves compatible animation playback and rebuilds the
  complete character/SpringBone graph with the new parts;
- a cross-role recipe releases the previous role and reconstructs the new one;
- recipe mutations are serialized, not cancelled. Debounce rapid UI changes
  if intermediate selections are not useful.

Callers do not choose between the underlying loader, wardrobe, composer, or
model-combine paths.

### Lifecycle Methods

```ts
interface Haruki3DKernel {
  load(recipe: HarukiRenderRecipe): Promise<void>;
  play(): void;
  pause(): void;
  resize(width: number, height: number): void;
  destroy(): void;
}
```

- `play()` starts the render loop and advances the runtime in fixed 60 Hz
  steps. Repeated calls are harmless.
- `pause()` stops scheduling frames without releasing the loaded character.
- `resize(width, height)` accepts CSS-pixel dimensions, updates the camera and
  renders one frame. The engine caps output device pixel ratio at `2`.
- `destroy()` is idempotent. It stops rendering and releases Three.js, WebGL,
  texture, geometry, animation, and SpringBone resources after any in-flight
  load settles.

The canvas and its CSS remain caller-owned. The kernel does not install a
`ResizeObserver`, pointer handlers, OrbitControls, page visibility handlers,
or product UI.

For page visibility handling, pause only when the product wants to stop
animation work:

```ts
document.addEventListener("visibilitychange", () => {
  if (document.hidden) kernel.pause();
  else kernel.play();
});
```

## Runtime Asset Contract

The runtime root must be one final Exporter output for one region. The kernel
loads:

- `parts/by-role/<characterId>/<unit>/part-registry.msgpack.br`
- `parts/by-role/<characterId>/<unit>/character3d-index.msgpack.br`
- `parts/compat/by-unit/<unit>/head-hair-compatibility.msgpack.br`
- referenced `part-runtime.msgpack.br` core/delta packages and textures
- referenced role runtime and Unity motion packages

Raw Unity bundles, masterdata JSON, Bot normalized IDs, and Capture PNGs are
not browser-kernel inputs.

### Static Server Headers

Same-origin hosting is the simplest deployment. For a separate asset origin,
allow the web origin with CORS.

Serve `.msgpack.br` as already-compressed binary data:

```http
Content-Type: application/msgpack
```

Do **not** attach `Content-Encoding: br`. The `.br` bytes are part of the
runtime format and are decompressed by the engine; browser-level Brotli
decoding would cause a second decompression attempt.

The optional response header below lets the engine reuse parsed role metadata
when the URL is fetched again:

```http
X-Haruki-File-Version: <stable-version-for-this-file>
Access-Control-Expose-Headers: X-Haruki-File-Version
```

Without it the runtime still works; only the small in-memory parsed-metadata
reuse is skipped.

Use versioned runtime URLs and the browser's normal HTTP cache:

```text
/assets/pjsk-3d/<export-version>/<region>/
```

Versioned files may use long-lived immutable caching. Registries at an
unversioned URL must instead be revalidated with `ETag` or `Last-Modified`.
The kernel does not create IndexedDB, Cache Storage, a service worker, or a
second persistent asset cache. Browser eviction remains controlled by the
browser; old runtime versions should be retired by the asset host's retention
policy.

## Error Handling

Creation throws synchronously for an empty `assetBaseUrl` or a WebGL setup
failure. `load()` rejects for invalid recipes, missing runtime files,
incompatible parts, ambiguous head sources, decode failures, or WebGL/runtime
errors.

```ts
try {
  await kernel.load(recipe);
  kernel.play();
} catch (error) {
  kernel.pause();
  showViewerError(error instanceof Error ? error.message : String(error));
}
```

Error strings are diagnostic and may change. Map them to stable product error
codes in the product backend or UI boundary instead of treating English text
as an API enum. A later valid `load()` may retry the kernel; destroy and
recreate it after a WebGL context loss or runtime-version switch.

## Capture Service Boundary

The Docker capture service is not part of the public browser API. It uses
`HarukiCaptureAdapter` from `haruki-3d-engine/internal` for phase seeking,
warmup, capture framing, opt-in debug snapshots, and PNG output. Normal
service captures do not request snapshots; direct internal Adapter/Harness
diagnostics may set `includeDebugSnapshots` to `true` and read the result in
the capture page. PNG encoding is performed by Chromium's DevTools screenshot
command after the capture frame is ready.

The server endpoints remain:

```http
POST /capture
GET /captures/<imageId>.png
GET /healthz
```

Product pages should use `createHaruki3DKernel`; repository capture code and
tests may use the internal entry. This keeps one rendering implementation
without exposing capture-only controls as a permanent Web API.

import { previewLightDefaults, type PreviewLightState } from "../data/sampleScene";
import {
  Haruki3DEngine,
} from "../engine/Haruki3DEngine";
import type { HarukiRenderRecipe } from "./renderRecipe";

export type Haruki3DKernelOptions = {
  canvas: HTMLCanvasElement;
  assetBaseUrl: string;
  initialLight?: PreviewLightState;
  ktx2TranscoderPath?: string;
};

export type Haruki3DKernel = {
  prepare(recipe: HarukiRenderRecipe): Promise<void>;
  load(recipe: HarukiRenderRecipe): Promise<void>;
  play(): void;
  pause(): void;
  resize(width: number, height: number): void;
  destroy(): Promise<void>;
};

const FIXED_FRAME_SECONDS = 1 / 60;
const MAX_FRAME_STEPS = 5;

type Haruki3DKernelEngine = Pick<
  Haruki3DEngine,
  | "destroy"
  | "loadRenderRecipe"
  | "renderFrame"
  | "setViewportSize"
  | "stepRuntimeFrame"
>;

export function createHaruki3DKernel(
  options: Haruki3DKernelOptions
): Haruki3DKernel {
  const assetBaseUrl = String(options.assetBaseUrl ?? "").trim();
  if (!assetBaseUrl) {
    throw new Error("assetBaseUrl is required to create the Haruki 3D kernel.");
  }

  const engine = new Haruki3DEngine({
    canvas: options.canvas,
    initialLight: { ...(options.initialLight ?? previewLightDefaults) },
    autoRender: false,
    manageResize: false,
    ktx2TranscoderPath: options.ktx2TranscoderPath,
  });
  return createHaruki3DKernelRuntime(engine, assetBaseUrl);
}

export function createHaruki3DKernelRuntime(
  engine: Haruki3DKernelEngine,
  assetBaseUrl: string
): Haruki3DKernel {
  let animationFrame = 0;
  let running = false;
  let destroyed = false;
  let loadSettled: Promise<void> = Promise.resolve();
  let destroySettled: Promise<void> | null = null;
  let prepared: { key: string; promise: Promise<void> } | null = null;
  let lastFrameMs: number | null = null;
  let accumulator = 0;
  let elapsedTime = 0;

  const assertActive = () => {
    if (destroyed) {
      throw new Error("Haruki 3D kernel has been destroyed.");
    }
  };

  const prepare = (recipe: HarukiRenderRecipe) => {
    assertActive();
    const key = renderRecipeKey(recipe);
    if (prepared?.key === key) {
      return prepared.promise;
    }
    const loading = engine.loadRenderRecipe({ ...recipe, baseUrl: assetBaseUrl })
      .then(() => undefined);
    prepared = { key, promise: loading };
    loadSettled = loading.then(() => undefined, () => undefined);
    void loading.catch(() => {
      if (prepared?.promise === loading) {
        prepared = null;
      }
    });
    return loading;
  };

  const render = (frameMs: number) => {
    if (!running || destroyed) {
      return;
    }
    if (lastFrameMs === null) {
      lastFrameMs = frameMs;
    }
    accumulator += Math.min(
      Math.max((frameMs - lastFrameMs) / 1000, 0),
      FIXED_FRAME_SECONDS * MAX_FRAME_STEPS
    );
    lastFrameMs = frameMs;

    let steps = 0;
    while (accumulator >= FIXED_FRAME_SECONDS && steps < MAX_FRAME_STEPS) {
      elapsedTime += FIXED_FRAME_SECONDS;
      engine.stepRuntimeFrame(FIXED_FRAME_SECONDS, {
        advanceAnimation: true,
        elapsedTime,
      });
      accumulator -= FIXED_FRAME_SECONDS;
      steps += 1;
    }
    engine.renderFrame();
    animationFrame = requestAnimationFrame(render);
  };

  return {
    prepare,
    async load(recipe) {
      await prepare(recipe);
      if (destroyed) {
        return;
      }
      engine.stepRuntimeFrame(0, { advanceAnimation: false, elapsedTime });
      engine.renderFrame();
    },
    play() {
      assertActive();
      if (running) {
        return;
      }
      running = true;
      lastFrameMs = null;
      accumulator = 0;
      animationFrame = requestAnimationFrame(render);
    },
    pause() {
      if (!running) {
        return;
      }
      running = false;
      cancelAnimationFrame(animationFrame);
      animationFrame = 0;
      lastFrameMs = null;
      accumulator = 0;
    },
    resize(width, height) {
      assertActive();
      engine.setViewportSize(width, height);
      engine.renderFrame();
    },
    destroy() {
      if (destroySettled) return destroySettled;
      destroyed = true;
      prepared = null;
      running = false;
      cancelAnimationFrame(animationFrame);
      animationFrame = 0;
      destroySettled = loadSettled.then(() => {
        engine.destroy();
      });
      return destroySettled;
    },
  };
}

function renderRecipeKey(recipe: HarukiRenderRecipe) {
  return [
    recipe.roleId,
    recipe.bodyCostume3dId,
    recipe.headCostume3dId,
    recipe.headPackagePath ?? "",
    recipe.hairCostume3dId,
    recipe.headOptionalCostume3dId ?? "",
  ].join("\u0000");
}

import { previewLightDefaults, type PreviewLightState } from "../data/sampleScene";
import {
  Haruki3DEngine,
} from "../engine/Haruki3DEngine";
import type { HarukiRenderRecipe } from "./renderRecipe";

export type Haruki3DKernelOptions = {
  canvas: HTMLCanvasElement;
  assetBaseUrl: string;
  initialLight?: PreviewLightState;
};

export type Haruki3DKernel = {
  load(recipe: HarukiRenderRecipe): Promise<void>;
  play(): void;
  pause(): void;
  resize(width: number, height: number): void;
  destroy(): void;
};

const FIXED_FRAME_SECONDS = 1 / 60;
const MAX_FRAME_STEPS = 5;

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
  });
  let animationFrame = 0;
  let running = false;
  let destroyed = false;
  let lastFrameMs: number | null = null;
  let accumulator = 0;
  let elapsedTime = 0;

  const assertActive = () => {
    if (destroyed) {
      throw new Error("Haruki 3D kernel has been destroyed.");
    }
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
    async load(recipe) {
      assertActive();
      await engine.loadRenderRecipe({ ...recipe, baseUrl: assetBaseUrl });
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
      if (destroyed) {
        return;
      }
      running = false;
      cancelAnimationFrame(animationFrame);
      animationFrame = 0;
      engine.destroy();
      destroyed = true;
    },
  };
}

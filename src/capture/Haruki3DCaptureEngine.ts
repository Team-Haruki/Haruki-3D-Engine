import type { PreviewLightState } from "../data/sampleScene";
import {
  Haruki3DEngine as Haruki3DEngineCore,
  type PjskEngineOptions,
} from "../engine/Haruki3DEngine";
import { createOrbitControls } from "../host/orbitControlsFactory";
import { HarukiCaptureAdapter } from "./captureAdapter";
import type {
  HarukiCaptureRolePartsRequest,
  HarukiPrepareCaptureFrameRequest,
} from "./captureTypes";

export type Haruki3DCaptureEngineOptions = PjskEngineOptions & {
  enableControls?: boolean;
};

/** @deprecated Prefer HarukiCaptureAdapter with Haruki3DEngineCore. */
export class Haruki3DEngine extends Haruki3DEngineCore {
  private readonly captureAdapter = new HarukiCaptureAdapter(this);

  constructor(
    containerOrOptions: HTMLElement | Haruki3DCaptureEngineOptions,
    initialLight?: PreviewLightState
  ) {
    const options: PjskEngineOptions = containerOrOptions instanceof HTMLElement
      ? {
        container: containerOrOptions,
        initialLight: initialLight!,
        controlsFactory: createOrbitControls,
      }
      : resolveCaptureEngineOptions(containerOrOptions);
    super(options);
  }

  captureRoleParts(request: HarukiCaptureRolePartsRequest) {
    return this.captureAdapter.captureRoleParts(request);
  }

  prepareCaptureFrame(request: HarukiPrepareCaptureFrameRequest = {}) {
    return this.captureAdapter.prepareCaptureFrame(request);
  }
}

export { Haruki3DEngineCore };

function resolveCaptureEngineOptions(
  input: Haruki3DCaptureEngineOptions
): PjskEngineOptions {
  const { enableControls, ...options } = input;
  return {
    ...options,
    controlsFactory: options.controlsFactory ?? (
      (enableControls ?? options.canvas === undefined)
        ? createOrbitControls
        : undefined
    ),
  };
}

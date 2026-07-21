import { createHaruki3DKernel } from "haruki-3d-engine";

const canvas = document.querySelector<HTMLCanvasElement>("#viewer");
if (!canvas) throw new Error("Missing #viewer canvas.");

const params = new URLSearchParams(location.search);
const kernel = createHaruki3DKernel({
  canvas,
  assetBaseUrl: params.get("assets") ?? "/runtime/jp/",
  ktx2TranscoderPath: params.get("basis") ?? "/basis/",
});
const resize = () => kernel.resize(innerWidth, innerHeight);
addEventListener("resize", resize);
addEventListener("pagehide", () => {
  void kernel.destroy();
}, { once: true });
document.addEventListener("visibilitychange", () => {
  if (document.hidden) kernel.pause();
  else kernel.play();
});

resize();
await kernel.load({
  roleId: "14:theme_park",
  bodyCostume3dId: 28,
  headCostume3dId: 114,
  hairCostume3dId: 214,
  headOptionalCostume3dId: null,
});
kernel.play();
document.body.dataset.harukiReady = "true";

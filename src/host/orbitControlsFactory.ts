import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import * as THREE from "three";
import type { HarukiCameraControlsFactory } from "../engine/Haruki3DEngine";

export const createOrbitControls: HarukiCameraControlsFactory = ({
  camera,
  canvas,
  target,
  onChange,
}) => {
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.minPolarAngle = THREE.MathUtils.degToRad(82);
  controls.maxPolarAngle = THREE.MathUtils.degToRad(100);
  controls.target.copy(target);
  controls.addEventListener("change", () => onChange(controls.target));
  controls.update();
  return controls;
};

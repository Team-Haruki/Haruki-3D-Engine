import * as THREE from "three";

const DEFAULT_TARGET_SCALE = new THREE.Vector3(0.04835, 0.48222, 0.07241);
const DEFAULT_OFFSET_SCALE = new THREE.Vector3(-0.08532, 0.12848, 1.93551);
const DEFAULT_FOV = 35;
const CAPTURE_LATERAL_SHIFT_SCALE = -0.0245;
const COSTUME_SHOP_CAMERA = {
  zoomDuration: 0.35,
  bottomLowerLimitPosition: 0.4,
  bottomUpperLimitPosition: 0.85,
  topLowerLimitPosition: 1.25,
  topUpperLimitPosition: 0.85,
  nearZ: 2.3,
  farZ: 4.5,
  fov: 25,
} as const;

export type PjskCameraPreset = "default" | "capture";
export type PjskCameraProfile = "official-default" | "full-body";

export type RuntimeCameraDebug = {
  preset: PjskCameraPreset;
  profile: PjskCameraProfile | null;
  costumeShopState: {
    cameraRootYawDegrees: number;
    zoomValue: number;
    zoomMoveValue: number;
    zoomRatio: number;
    localCameraPosition: { x: number; y: number; z: number };
    localCameraRotationYDegrees: number;
  } | null;
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
  offset: { x: number; y: number; z: number };
  distance: number;
  polarDegrees: number;
  azimuthDegrees: number;
  fovDegrees: number;
  aspect: number;
  zoom: number;
  minPolarDegrees: number;
  maxPolarDegrees: number;
  characterHeight: number;
};

type HarukiCameraPose = {
  target: THREE.Vector3;
  position: THREE.Vector3;
  fov: number;
  costumeShopState: {
    cameraRootYawDegrees: number;
    zoomValue: number;
    zoomMoveValue: number;
    zoomRatio: number;
    localCameraPosition: THREE.Vector3;
    localCameraRotationYDegrees: number;
  } | null;
};

export function getDefaultCameraPose(characterHeight: number): HarukiCameraPose {
  const target = DEFAULT_TARGET_SCALE.clone().multiplyScalar(characterHeight);
  return {
    target,
    position: target.clone().add(DEFAULT_OFFSET_SCALE.clone().multiplyScalar(characterHeight)),
    fov: DEFAULT_FOV,
    costumeShopState: null,
  };
}

export function getCostumeShopCameraPose(
  profile: PjskCameraProfile
): HarukiCameraPose {
  const state = profile === "official-default"
    ? { cameraRootYawDegrees: 0, zoomValue: 0, zoomMoveValue: 1 }
    : {
        cameraRootYawDegrees: 0,
        zoomValue: COSTUME_SHOP_CAMERA.zoomDuration,
        zoomMoveValue: 0,
      };
  const zoomValue = THREE.MathUtils.clamp(
    state.zoomValue,
    0,
    COSTUME_SHOP_CAMERA.zoomDuration
  );
  const zoomRatio = COSTUME_SHOP_CAMERA.zoomDuration > 0
    ? zoomValue / COSTUME_SHOP_CAMERA.zoomDuration
    : 0;
  const bottomY = THREE.MathUtils.lerp(
    COSTUME_SHOP_CAMERA.bottomLowerLimitPosition,
    COSTUME_SHOP_CAMERA.bottomUpperLimitPosition,
    zoomRatio
  );
  const topY = THREE.MathUtils.lerp(
    COSTUME_SHOP_CAMERA.topLowerLimitPosition,
    COSTUME_SHOP_CAMERA.topUpperLimitPosition,
    zoomRatio
  );
  const zoomMoveValue = THREE.MathUtils.clamp(state.zoomMoveValue, 0, 1);
  const y = THREE.MathUtils.lerp(bottomY, topY, zoomMoveValue);
  const z = THREE.MathUtils.lerp(
    COSTUME_SHOP_CAMERA.nearZ,
    COSTUME_SHOP_CAMERA.farZ,
    zoomRatio
  );
  const rotationY = THREE.MathUtils.degToRad(state.cameraRootYawDegrees);
  const localCameraPosition = new THREE.Vector3(0, y, z);
  return {
    target: new THREE.Vector3(0, y, 0),
    position: localCameraPosition.clone()
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), rotationY),
    fov: COSTUME_SHOP_CAMERA.fov,
    costumeShopState: {
      cameraRootYawDegrees: state.cameraRootYawDegrees,
      zoomValue,
      zoomMoveValue,
      zoomRatio,
      localCameraPosition,
      localCameraRotationYDegrees: 180,
    },
  };
}

export function shiftCameraPoseRight(
  position: THREE.Vector3,
  target: THREE.Vector3,
  amount: number,
  characterHeight: number
) {
  const forward = target.clone().sub(position).normalize();
  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
  const shift = right.multiplyScalar(
    CAPTURE_LATERAL_SHIFT_SCALE * amount * characterHeight
  );
  return {
    target: target.clone().add(shift),
    position: position.clone().add(shift),
  };
}

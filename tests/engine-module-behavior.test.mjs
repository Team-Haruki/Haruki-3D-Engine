import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import {
  CharacterProjectedShadowController,
  createCaptureBackgroundTexture,
  getCostumeShopCameraPose,
  getDefaultCameraPose,
  shiftCameraPoseRight,
} from "../dist/haruki-3d-engine-internal.js";

const vector = (value) => [value.x, value.y, value.z].map((entry) => Number(entry.toFixed(5)));

test("camera poses retain the official default and full-body framing", () => {
  const defaultPose = getDefaultCameraPose(1);
  assert.deepEqual(vector(defaultPose.target), [0.04835, 0.48222, 0.07241]);
  assert.deepEqual(vector(defaultPose.position), [-0.03697, 0.6107, 2.00792]);
  assert.equal(defaultPose.fov, 35);

  const official = getCostumeShopCameraPose("official-default");
  assert.deepEqual(vector(official.target), [0, 1.25, 0]);
  assert.deepEqual(vector(official.position), [0, 1.25, 2.3]);
  assert.equal(official.fov, 25);
  assert.equal(official.costumeShopState.zoomRatio, 0);

  const fullBody = getCostumeShopCameraPose("full-body");
  assert.deepEqual(vector(fullBody.target), [0, 0.85, 0]);
  assert.deepEqual(vector(fullBody.position), [0, 0.85, 4.5]);
  assert.equal(fullBody.costumeShopState.zoomRatio, 1);

  const shifted = shiftCameraPoseRight(fullBody.position, fullBody.target, 1, 1);
  assert.deepEqual(
    vector(shifted.position.clone().sub(fullBody.position)),
    vector(shifted.target.clone().sub(fullBody.target))
  );
});

test("projected shadow updates retain official toe-layer state", () => {
  installFakeCanvasDocument();
  const shadow = new CharacterProjectedShadowController();
  shadow.update({
    targetWorldPositions: [
      new THREE.Vector3(-0.1, 0.05, 0.2),
      new THREE.Vector3(0.1, 0.05, 0.2),
    ],
    lightWorldPosition: new THREE.Vector3(1, 2, -1),
    characterHeight: 1,
    visible: true,
  });

  const snapshot = shadow.getDebugSnapshot(1);
  assert.equal(snapshot.visible, true);
  assert.deepEqual(snapshot.targetPosition, { x: 0, y: 0.05, z: 0.2 });
  assert.equal(snapshot.settings.directionalShadow, false);
  assert.equal(snapshot.cross.opacity, 0.165);
  assert.equal(shadow.group.children[0].visible, false);
  assert.equal(shadow.group.children[1].visible, true);
  shadow.dispose();
});

test("capture backgrounds retain deterministic dimensions and draw operations", () => {
  const firstLog = installFakeCanvasDocument();
  const first = createCaptureBackgroundTexture(700, 500);
  const secondLog = installFakeCanvasDocument();
  const second = createCaptureBackgroundTexture(700, 500);

  assert.equal(first.image.width, 700);
  assert.equal(first.image.height, 500);
  assert.equal(first.colorSpace, THREE.SRGBColorSpace);
  assert.deepEqual(firstLog, secondLog);
  assert.deepEqual(firstLog[0], [
    "linear",
    0,
    500,
    700,
    0,
    [[0, "#f9fffe"], [0.52, "#edfaff"], [1, "#fff8fe"]],
  ]);
  assert.deepEqual(firstLog[2], [
    "linear",
    0,
    0,
    700,
    500,
    [[0, "rgba(255, 246, 252, 0.34)"], [1, "rgba(219, 246, 255, 0.40)"]],
  ]);
  assert.equal(firstLog.filter(([operation]) => operation === "fillRect").length, 3);
  assert.equal(firstLog.filter(([operation]) => operation === "beginPath").length, 49);
  first.dispose();
  second.dispose();
});

function installFakeCanvasDocument() {
  const log = [];
  globalThis.document = {
    createElement(name) {
      assert.equal(name, "canvas");
      const context = {
        fillStyle: "",
        createLinearGradient: (...args) => gradient("linear", args),
        createRadialGradient: (...args) => gradient("radial", args),
        fillRect: (...args) => log.push(["fillRect", ...args, String(context.fillStyle)]),
        save: () => log.push(["save"]),
        translate: (...args) => log.push(["translate", ...args]),
        rotate: (angle) => log.push(["rotate", angle]),
        beginPath: () => log.push(["beginPath"]),
        moveTo: (...args) => log.push(["moveTo", ...args]),
        lineTo: (...args) => log.push(["lineTo", ...args]),
        closePath: () => log.push(["closePath"]),
        fill: () => log.push(["fill", String(context.fillStyle)]),
        restore: () => log.push(["restore"]),
      };
      return {
        width: 0,
        height: 0,
        getContext: (kind) => kind === "2d" ? context : null,
      };
    },
  };
  return log;

  function gradient(kind, args) {
    const stops = [];
    log.push([kind, ...args, stops]);
    return {
      addColorStop: (offset, color) => stops.push([offset, color]),
      toString: () => `${kind}:${JSON.stringify(stops)}`,
    };
  }
}

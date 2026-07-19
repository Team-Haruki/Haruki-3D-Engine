import * as THREE from "three";

export const projectedShadowTargetBoneNames = ["Left_Toe", "Right_Toe"] as const;
const CROSS_OFFSET_FLOOR = 0.015;
const DIRECTIONAL_OFFSET_FLOOR = 0.01;
const INVISIBLE_HEIGHT = 0.2;

export type ProjectedShadowSettings = {
  width: number;
  height: number;
  opacity: number;
  crossSize: number;
  crossOpacity: number;
  floorY: number;
  adjustShadow: boolean;
  adjustAlpha: boolean;
  invisibleHeight: number;
  directionalShadow: boolean;
};

export type ProjectedShadowSettingsInput = Partial<ProjectedShadowSettings>;

export type RuntimeProjectedShadowDebug = {
  visible: boolean;
  floorY: number;
  characterHeight: number;
  settings: ProjectedShadowSettings;
  targetPosition: { x: number; y: number; z: number };
  targetPositions: Array<{ x: number; y: number; z: number }>;
  directional: {
    position: { x: number; y: number; z: number };
    forward: { x: number; y: number; z: number };
    scale: { x: number; y: number; z: number };
    opacity: number;
    alpha: number;
  };
  cross: {
    position: { x: number; y: number; z: number };
    scale: { x: number; y: number; z: number };
    opacity: number;
  };
};

export const defaultProjectedShadowSettings: ProjectedShadowSettings = {
  width: 0.72,
  height: 1.06,
  opacity: 0.28,
  crossSize: 0.46,
  crossOpacity: 0.22,
  floorY: 0,
  adjustShadow: false,
  adjustAlpha: true,
  invisibleHeight: INVISIBLE_HEIGHT,
  directionalShadow: false,
};

type CharacterProjectedShadowUpdate = {
  targetWorldPositions: THREE.Vector3[];
  lightWorldPosition: THREE.Vector3 | null;
  characterHeight: number;
  visible: boolean;
};

type ProjectedShadowPair = {
  targetWorldPosition: THREE.Vector3;
  initialToeHeight: number | null;
  directionalAnchor: THREE.Group;
  crossAnchor: THREE.Group;
  directionalMaterial: THREE.MeshBasicMaterial;
  crossMaterial: THREE.MeshBasicMaterial;
  directionalAlpha: number;
};

export class CharacterProjectedShadowController {
  readonly group = new THREE.Group();

  private readonly defaultDirection = new THREE.Vector3(-0.35, 0, 0.94).normalize();
  private settings = { ...defaultProjectedShadowSettings };
  private readonly pairs: ProjectedShadowPair[] = [];

  constructor() {
    const shadowTexture = createProjectedShadowTexture();
    for (const boneName of projectedShadowTargetBoneNames) {
      const directionalMaterial = this.createShadowMaterial(shadowTexture, this.settings.opacity);
      const crossMaterial = this.createShadowMaterial(shadowTexture, this.settings.crossOpacity);
      const directionalAnchor = new THREE.Group();
      const crossAnchor = new THREE.Group();

      const directionalMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), directionalMaterial);
      directionalMesh.name = `CharacterDirectionalShadow_${boneName}`;
      directionalMesh.rotation.x = -Math.PI / 2;
      directionalMesh.renderOrder = -100;
      directionalMesh.scale.set(this.settings.width, this.settings.height, 1);
      directionalAnchor.add(directionalMesh);

      const crossMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), crossMaterial);
      crossMesh.name = `CharacterCrossShadow_${boneName}`;
      crossMesh.rotation.x = -Math.PI / 2;
      crossMesh.renderOrder = -99;
      crossMesh.scale.set(this.settings.crossSize, this.settings.crossSize, 1);
      crossAnchor.add(crossMesh);

      directionalAnchor.visible = this.settings.directionalShadow;
      crossAnchor.visible = !this.settings.directionalShadow;
      this.group.add(directionalAnchor, crossAnchor);
      this.pairs.push({
        targetWorldPosition: new THREE.Vector3(),
        initialToeHeight: null,
        directionalAnchor,
        crossAnchor,
        directionalMaterial,
        crossMaterial,
        directionalAlpha: this.settings.opacity,
      });
    }

    this.group.name = "CharacterProjectedShadow";
    this.group.visible = false;
  }

  setSettings(input: ProjectedShadowSettingsInput = {}) {
    this.settings = normalizeSettings(input, this.settings);
    for (const pair of this.pairs) {
      pair.directionalAnchor.children[0]?.scale.set(this.settings.width, this.settings.height, 1);
      pair.crossAnchor.children[0]?.scale.set(this.settings.crossSize, this.settings.crossSize, 1);
      pair.directionalAnchor.visible = this.settings.directionalShadow;
      pair.crossAnchor.visible = !this.settings.directionalShadow;
    }
  }

  update(state: CharacterProjectedShadowUpdate) {
    const targets = state.targetWorldPositions;
    this.group.visible = state.visible && targets.length > 0;
    if (!this.group.visible) {
      for (const pair of this.pairs) {
        pair.initialToeHeight = null;
        pair.targetWorldPosition.set(0, 0, 0);
      }
      return;
    }

    for (const [index, pair] of this.pairs.entries()) {
      const target = targets[Math.min(index, targets.length - 1)];
      pair.targetWorldPosition.copy(target);
      pair.initialToeHeight ??= target.y;
      pair.directionalAnchor.visible = this.settings.directionalShadow;
      pair.crossAnchor.visible = !this.settings.directionalShadow;

      const direction = this.resolveDirection(target, state.lightWorldPosition);
      const heightRatio = (target.y - this.settings.floorY) /
        Math.max(0.001, state.characterHeight);
      const distanceToFloor = this.settings.height * heightRatio;
      const directionalX = target.x + direction.x * distanceToFloor;
      const directionalZ = target.z + direction.z * distanceToFloor;
      pair.directionalAnchor.position.set(
        this.settings.adjustShadow ? target.x : directionalX,
        this.settings.floorY + DIRECTIONAL_OFFSET_FLOOR,
        this.settings.adjustShadow ? target.z : directionalZ
      );
      pair.directionalAnchor.rotation.y = Math.atan2(direction.x, direction.z);
      pair.directionalAlpha = this.calculateDirectionalAlpha(pair, target.y);
      pair.directionalMaterial.opacity = pair.directionalAlpha;

      const crossHeightRatio = (target.y - this.settings.floorY) /
        this.settings.invisibleHeight;
      const crossAlpha = crossHeightRatio < 0 ? 1 : 1 - Math.min(crossHeightRatio, 1);
      pair.crossAnchor.position.set(
        target.x,
        this.settings.floorY + CROSS_OFFSET_FLOOR,
        target.z
      );
      pair.crossMaterial.opacity = this.settings.crossOpacity * crossAlpha;
    }
  }

  getDebugSnapshot(characterHeight: number): RuntimeProjectedShadowDebug {
    const pair = this.pairs[0];
    pair.directionalAnchor.updateMatrixWorld(true);
    pair.crossAnchor.updateMatrixWorld(true);
    const directionalForward = new THREE.Vector3(0, 0, 1)
      .applyQuaternion(pair.directionalAnchor.getWorldQuaternion(new THREE.Quaternion()))
      .normalize();
    const targetPosition = this.pairs
      .reduce((sum, current) => sum.add(current.targetWorldPosition), new THREE.Vector3())
      .multiplyScalar(1 / Math.max(this.pairs.length, 1));
    return {
      visible: this.group.visible,
      floorY: Number(this.settings.floorY.toFixed(4)),
      characterHeight: Number(characterHeight.toFixed(4)),
      settings: { ...this.settings },
      targetPosition: vectorSnapshot(targetPosition),
      targetPositions: this.pairs.map((current) => vectorSnapshot(current.targetWorldPosition)),
      directional: {
        position: vectorSnapshot(pair.directionalAnchor.position),
        forward: vectorSnapshot(directionalForward),
        scale: vectorSnapshot(new THREE.Vector3(this.settings.width, 1, this.settings.height)),
        opacity: Number(pair.directionalMaterial.opacity.toFixed(4)),
        alpha: Number(pair.directionalAlpha.toFixed(4)),
      },
      cross: {
        position: vectorSnapshot(pair.crossAnchor.position),
        scale: vectorSnapshot(new THREE.Vector3(this.settings.crossSize, 1, this.settings.crossSize)),
        opacity: Number(pair.crossMaterial.opacity.toFixed(4)),
      },
    };
  }

  dispose() {
    const textures = new Set<THREE.Texture>();
    this.group.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) {
        return;
      }
      mesh.geometry.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        const map = (material as THREE.MeshBasicMaterial).map;
        if (map) {
          textures.add(map);
        }
        material.dispose();
      }
    });
    for (const texture of textures) {
      texture.dispose();
    }
  }

  private createShadowMaterial(shadowTexture: THREE.Texture, opacity: number) {
    return new THREE.MeshBasicMaterial({
      color: "#000000",
      map: shadowTexture,
      transparent: true,
      opacity,
      depthWrite: false,
      depthTest: true,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      side: THREE.DoubleSide,
    });
  }

  private calculateDirectionalAlpha(pair: ProjectedShadowPair, targetY: number) {
    if (!this.settings.adjustAlpha) {
      return this.settings.opacity;
    }
    const t = (targetY - (pair.initialToeHeight ?? this.settings.floorY)) /
      this.settings.invisibleHeight;
    const factor = t < 0 ? 1 : 1 - Math.min(t, 1);
    return this.settings.opacity * factor;
  }

  private resolveDirection(
    targetWorldPosition: THREE.Vector3,
    lightWorldPosition: THREE.Vector3 | null
  ) {
    if (!lightWorldPosition) {
      return this.defaultDirection.clone();
    }
    const direction = new THREE.Vector3(
      targetWorldPosition.x - lightWorldPosition.x,
      0,
      targetWorldPosition.z - lightWorldPosition.z
    );
    return direction.lengthSq() < 0.000001
      ? this.defaultDirection.clone()
      : direction.normalize();
  }
}

function createProjectedShadowTexture(size = 128) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas 2D context is required for projected shadow texture.");
  }
  const gradient = context.createRadialGradient(
    size * 0.5,
    size * 0.5,
    size * 0.05,
    size * 0.5,
    size * 0.5,
    size * 0.5
  );
  gradient.addColorStop(0, "rgba(0, 0, 0, 0.72)");
  gradient.addColorStop(0.45, "rgba(0, 0, 0, 0.32)");
  gradient.addColorStop(1, "rgba(0, 0, 0, 0.0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

function normalizeSettings(
  input: ProjectedShadowSettingsInput,
  base: ProjectedShadowSettings
): ProjectedShadowSettings {
  const positive = (value: number | undefined, fallback: number, min = 0) =>
    Number.isFinite(value) ? Math.max(value!, min) : fallback;
  const unit = (value: number | undefined, fallback: number) =>
    Number.isFinite(value) ? THREE.MathUtils.clamp(value!, 0, 1) : fallback;
  return {
    width: positive(input.width, base.width, 0.001),
    height: positive(input.height, base.height, 0.001),
    opacity: unit(input.opacity, base.opacity),
    crossSize: positive(input.crossSize, base.crossSize, 0.001),
    crossOpacity: unit(input.crossOpacity, base.crossOpacity),
    floorY: Number.isFinite(input.floorY) ? input.floorY! : base.floorY,
    adjustShadow: input.adjustShadow ?? base.adjustShadow,
    adjustAlpha: input.adjustAlpha ?? base.adjustAlpha,
    invisibleHeight: positive(input.invisibleHeight, base.invisibleHeight, 0.001),
    directionalShadow: input.directionalShadow ?? base.directionalShadow,
  };
}

function vectorSnapshot(vector: THREE.Vector3) {
  return {
    x: Number(vector.x.toFixed(5)),
    y: Number(vector.y.toFixed(5)),
    z: Number(vector.z.toFixed(5)),
  };
}

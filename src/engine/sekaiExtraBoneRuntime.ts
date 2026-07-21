import * as THREE from "three";

type JsonRecord = Record<string, unknown>;

type SpringObjectRef = {
  Name?: string | null;
  name?: string | null;
  TransformPath?: string | null;
  transformPath?: string | null;
};

type SpringExtraBoneEntry = {
  GameObject?: SpringObjectRef | null;
  gameObject?: SpringObjectRef | null;
  ReferenceBone?: SpringObjectRef | null;
  referenceBone?: SpringObjectRef | null;
  RotationOrder?: number | null;
  rotationOrder?: number | null;
  Coefficient?: number | null;
  coefficient?: number | null;
  DefaultEulerAngles?: { X?: number; Y?: number; Z?: number } | null;
  defaultEulerAngles?: { x?: number; y?: number; z?: number } | null;
  AxisX?: number | null;
  axisX?: number | null;
  AxisY?: number | null;
  axisY?: number | null;
  AxisZ?: number | null;
  axisZ?: number | null;
};

type RuntimeExtraBone = {
  node: THREE.Object3D;
  referenceNode: THREE.Object3D;
  coefficient: number;
  defaultQuaternion: THREE.Quaternion;
  axisX: boolean;
  axisY: boolean;
  axisZ: boolean;
  order: THREE.EulerOrder;
};

type NodeResolution = {
  nodeByPath: Map<string, THREE.Object3D>;
  nodeByName: Map<string, THREE.Object3D[]>;
};

const DEG2RAD = Math.PI / 180;
const ROTATION_ORDERS: THREE.EulerOrder[] = [
  "XYZ",
  "XZY",
  "YXZ",
  "YZX",
  "ZXY",
  "ZYX",
];

export class SekaiExtraBoneRuntime {
  private readonly entries: RuntimeExtraBone[];
  private readonly sourceEuler = new THREE.Euler();
  private readonly targetEuler = new THREE.Euler();
  private readonly targetQuaternion = new THREE.Quaternion();

  private constructor(entries: RuntimeExtraBone[]) {
    this.entries = entries;
  }

  static fromPjskRuntimeExtension(
    extension: unknown,
    root: THREE.Object3D
  ): SekaiExtraBoneRuntime | null {
    const entries = readExtraBoneEntries(extension);
    if (!entries.length) {
      return null;
    }

    root.updateMatrixWorld(true);
    const resolution = buildNodeResolution(root);
    const runtimeEntries: RuntimeExtraBone[] = [];

    for (const entry of entries) {
      const gameObject = entry.GameObject ?? entry.gameObject ?? null;
      const referenceBone = entry.ReferenceBone ?? entry.referenceBone ?? null;
      const node = resolveNode(
        resolution,
        readString(gameObject?.TransformPath ?? gameObject?.transformPath),
        readString(gameObject?.Name ?? gameObject?.name)
      );
      const referenceNode = resolveNode(
        resolution,
        readString(referenceBone?.TransformPath ?? referenceBone?.transformPath),
        readString(referenceBone?.Name ?? referenceBone?.name)
      );
      if (!node || !referenceNode) {
        continue;
      }

      const order = ROTATION_ORDERS[readNumber(entry.RotationOrder ?? entry.rotationOrder, 0)]
        ?? "XYZ";
      const defaultEuler = readDefaultEuler(entry, order);
      runtimeEntries.push({
        node,
        referenceNode,
        coefficient: readNumber(entry.Coefficient ?? entry.coefficient, 1),
        defaultQuaternion: new THREE.Quaternion().setFromEuler(defaultEuler),
        axisX: readBoolean(entry.AxisX ?? entry.axisX, true),
        axisY: readBoolean(entry.AxisY ?? entry.axisY, true),
        axisZ: readBoolean(entry.AxisZ ?? entry.axisZ, true),
        order,
      });
    }

    runtimeEntries.sort((a, b) => getObjectDepth(a.referenceNode) - getObjectDepth(b.referenceNode));
    return runtimeEntries.length ? new SekaiExtraBoneRuntime(runtimeEntries) : null;
  }

  update(): void {
    for (const entry of this.entries) {
      this.sourceEuler.setFromQuaternion(entry.referenceNode.quaternion, entry.order);
      const sign = Math.sign(entry.coefficient);
      this.targetEuler.set(0, 0, 0, entry.order);
      if (entry.axisX) {
        this.targetEuler.x = this.sourceEuler.x * sign;
      }
      if (entry.axisY) {
        this.targetEuler.y = this.sourceEuler.y * sign;
      }
      if (entry.axisZ) {
        this.targetEuler.z = this.sourceEuler.z * sign;
      }
      this.targetQuaternion.setFromEuler(this.targetEuler);
      lerpQuaternion(
        entry.node.quaternion,
        entry.defaultQuaternion,
        this.targetQuaternion,
        Math.abs(entry.coefficient)
      );
      entry.node.updateMatrix();
      entry.node.updateMatrixWorld(true);
    }
  }

  getControlledTrackNodeNames(): Set<string> {
    return new Set(this.entries.map((entry) => entry.node.name).filter(Boolean));
  }
}

function lerpQuaternion(
  target: THREE.Quaternion,
  from: THREE.Quaternion,
  to: THREE.Quaternion,
  alpha: number
): THREE.Quaternion {
  const t = THREE.MathUtils.clamp(alpha, 0, 1);
  const sign = from.dot(to) < 0 ? -1 : 1;
  return target.set(
    THREE.MathUtils.lerp(from.x, to.x * sign, t),
    THREE.MathUtils.lerp(from.y, to.y * sign, t),
    THREE.MathUtils.lerp(from.z, to.z * sign, t),
    THREE.MathUtils.lerp(from.w, to.w * sign, t)
  ).normalize();
}

function readExtraBoneEntries(extension: unknown): SpringExtraBoneEntry[] {
  const payload = asRecord(extension);
  const springBone = asRecord(payload?.pjskSpringBone ?? payload?.PjskSpringBone);
  const raw = asRecord(springBone?.raw ?? springBone?.Raw);
  const entries: SpringExtraBoneEntry[] = [];
  for (const part of [raw?.body ?? raw?.Body, raw?.head ?? raw?.Head]) {
    const partRecord = asRecord(part);
    const extraBones = partRecord?.extraBones ?? partRecord?.ExtraBones;
    if (Array.isArray(extraBones)) {
      entries.push(...extraBones.filter(isRecord) as SpringExtraBoneEntry[]);
    }
  }
  return entries;
}

function readDefaultEuler(entry: SpringExtraBoneEntry, order: THREE.EulerOrder): THREE.Euler {
  const raw = asRecord(entry.DefaultEulerAngles ?? entry.defaultEulerAngles) ?? {};
  const x = readNumber(raw.X ?? raw.x, 0);
  const y = readNumber(raw.Y ?? raw.y, 0);
  const z = readNumber(raw.Z ?? raw.z, 0);
  return new THREE.Euler(x * DEG2RAD, -y * DEG2RAD, -z * DEG2RAD, order);
}

function buildNodeResolution(root: THREE.Object3D): NodeResolution {
  const nodeByPath = new Map<string, THREE.Object3D>();
  const nodeByName = new Map<string, THREE.Object3D[]>();

  root.traverse((node) => {
    if (node !== root) {
      const byName = nodeByName.get(node.name) ?? [];
      byName.push(node);
      nodeByName.set(node.name, byName);
    }
    for (const path of buildNodePaths(root, node)) {
      nodeByPath.set(path, node);
    }
  });

  return { nodeByPath, nodeByName };
}

function buildNodePaths(root: THREE.Object3D, node: THREE.Object3D): string[] {
  const path = getObjectPath(node, root);
  if (!path) {
    return [];
  }
  const paths = [path];
  if (path.startsWith("body/")) {
    paths.push(`sit_body/${path.slice("body/".length)}`);
  }
  return paths;
}

function getObjectPath(node: THREE.Object3D, stopAt?: THREE.Object3D): string {
  const names: string[] = [];
  let current: THREE.Object3D | null = node;
  while (current && current !== stopAt) {
    if (current.name && !current.name.startsWith("Loaded:")) {
      names.unshift(current.name);
    }
    current = current.parent;
  }
  return names.join("/");
}

function resolveNode(
  resolution: NodeResolution,
  sourcePath?: string | null,
  sourceName?: string | null
): THREE.Object3D | null {
  for (const candidate of enumeratePathCandidates(sourcePath)) {
    const node = resolution.nodeByPath.get(candidate);
    if (node) {
      return node;
    }
  }

  if (sourceName) {
    return resolution.nodeByName.get(sourceName)?.[0] ?? null;
  }
  return null;
}

function enumeratePathCandidates(sourcePath?: string | null): string[] {
  if (!sourcePath) {
    return [];
  }
  const paths = [sourcePath];
  if (sourcePath.startsWith("sit_body/")) {
    paths.push(`body/${sourcePath.slice("sit_body/".length)}`);
  }
  return paths;
}

function getObjectDepth(node: THREE.Object3D): number {
  let depth = 0;
  let current = node.parent;
  while (current) {
    depth += 1;
    current = current.parent;
  }
  return depth;
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" ? value as JsonRecord : null;
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(asRecord(value));
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  return fallback;
}

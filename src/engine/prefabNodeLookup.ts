import * as THREE from "three";

export function buildPrefabNodePathLookup(root: THREE.Object3D) {
  const nodeByPath = new Map<string, THREE.Object3D>();

  root.traverse((node) => {
    if (node === root || !node.name) {
      return;
    }

    const rawSegments: string[] = [];
    const canonicalSegments: string[] = [];
    let current: THREE.Object3D | null = node;
    while (current && current !== root) {
      if (current.name) {
        rawSegments.push(current.name);
        canonicalSegments.push(current.name.replace(/_\d+$/, ""));
      }
      current = current.parent;
    }
    rawSegments.reverse();
    canonicalSegments.reverse();
    for (let index = 0; index < rawSegments.length; index += 1) {
      const rawPath = rawSegments.slice(index).join("/");
      if (rawPath) {
        nodeByPath.set(rawPath, node);
      }
      const canonicalPath = canonicalSegments.slice(index).join("/");
      if (canonicalPath) {
        nodeByPath.set(canonicalPath, node);
      }
    }
  });

  return nodeByPath;
}

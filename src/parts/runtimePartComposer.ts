import type {
  BodyAssetManifest,
  HeadAssetManifest,
} from "../data/sampleScene";
import type { RuntimeCombinedCharacterAsset } from "../engine/Haruki3DEngine";

export type RuntimePartType = "body" | "head" | "hair" | "head_optional";
export type CustomPartSelectionOrigin = "custom" | "official_preset";

export type PartRegistryEntry = {
  costume3dId: number;
  partType: RuntimePartType | string;
  characterId: number;
  unit?: string | null;
  name?: string | null;
  packagePath: string;
  status?: string;
};

export type Character3dIndexEntry = {
  id: number;
  characterId: number;
  bodyCostume3dId?: number;
  headCostume3dId?: number;
  hairCostume3dId?: number;
  headOptionalCostume3dId?: number | null;
  unit?: string | null;
  name?: string | null;
};

export type Character3dIndex = {
  version?: string;
  entries?: Character3dIndexEntry[];
  character3ds?: Character3dIndexEntry[];
};

export type HeadHairCompatibility = {
  version?: string;
  allowed?: Array<{
    unit?: string | null;
    headCostume3dId: number;
    hairCostume3dId: number;
  }>;
  denied?: Array<{
    unit?: string | null;
    headCostume3dId: number;
    hairCostume3dId: number;
  }>;
  rules?: Array<{
    unit?: string | null;
    headCostume3dId: number;
    hairCostume3dId: number;
    state?: string | null;
  }>;
};

export type PartRuntimePackage = {
  version: string;
  part: {
    costume3dId: number;
    partType: RuntimePartType | string;
    characterId: number;
    unit?: string | null;
    name?: string | null;
  };
  mount?: Record<string, unknown>;
  manifest: unknown;
  nativeMeshes?: Record<string, unknown>;
  materialSlots?: unknown[];
  textureRoles?: unknown[];
  characterTextures?: Record<string, string>;
  springBone?: Record<string, unknown>;
  morphChannelBindings?: unknown[];
  warnings?: string[];
};

export type PartPackageSet = {
  registry: PartRegistryEntry[];
  characterIndex: Character3dIndexEntry[];
  compatibility: HeadHairCompatibility | null;
  packages: Map<string, PartRuntimePackage>;
  baseUrl: string;
};

export type CustomPartSelection = {
  characterId: number;
  unit: string | null;
  bodyCostume3dId: number;
  headCostume3dId: number;
  hairCostume3dId: number;
  headOptionalCostume3dId?: number | null;
  origin?: CustomPartSelectionOrigin;
};

export type ComposePartAssetInput = {
  partSet: PartPackageSet;
  selection: CustomPartSelection;
  activeRoleId: string | null;
  resolveUrl: (path: string) => string;
};

type RuntimeSetup = {
  version?: string;
  prefabGraphs?: unknown[];
  rootSelectionProfile?: Record<string, unknown>;
  setupPlan?: Record<string, unknown>;
  activeRootProfile?: Record<string, unknown>;
  bindingDecisions?: RuntimeBindingDecision[];
  managers?: RuntimeManager[];
  bones?: RuntimeBone[];
  colliders?: RuntimeCollider[];
  colliderBindings?: RuntimeColliderBinding[];
  managerColliderCaches?: RuntimeManagerColliderCache[];
  warnings?: string[];
  [key: string]: unknown;
};

type RuntimeManager = Record<string, unknown> & {
  partKind?: string;
  pathId?: number;
  nodeName?: string | null;
  nodePath?: string | null;
  poseRoot?: string | null;
  bonePathIds?: number[];
};

type RuntimeBone = Record<string, unknown> & {
  partKind?: string;
  pathId?: number;
  nodeName?: string | null;
  nodePath?: string | null;
  poseRoot?: string | null;
  colliderFlag?: number;
  directColliderPathIds?: number[];
};

type RuntimeCollider = Record<string, unknown> & {
  partKind?: string;
  index?: number;
  pathId?: number;
  scriptName?: string;
  nodeName?: string | null;
  nodePath?: string | null;
  poseRoot?: string | null;
};

type RuntimeColliderBinding = Record<string, unknown> & {
  sourceKind?: string | null;
  partKind?: string;
  sourceSpringBonePathId?: number;
  colliderFlag?: number | null;
  matchedPrefixes?: string[] | null;
  collidersByRoot?: Record<string, number[]> | null;
  defaultRoot?: string | null;
  sourceColliderPathIds?: number[];
  colliders?: number[];
};

type RuntimeBindingDecision = Record<string, unknown> & {
  sourceKind?: string | null;
  partKind?: string;
  sourceSpringBonePathId?: number;
  nodePath?: string | null;
  poseRoot?: string | null;
  colliderFlag?: number | null;
  directColliderPathIds?: number[];
  candidateRoots?: Record<string, number[]> | null;
  defaultRoot?: string | null;
  selectedColliderIndexes?: number[];
  reason?: string;
};

type RuntimeManagerColliderCache = Record<string, unknown> & {
  managerPathId?: number;
  partKind?: string;
  sourcePoseRoot?: string | null;
  managerNodeName?: string | null;
  managerNodePath?: string | null;
  springBonePathIds?: number[];
  sphereColliderIndexes?: number[];
  capsuleColliderIndexes?: number[];
  panelColliderIndexes?: number[];
};

type RuntimePartWithIndex = {
  runtime: PartRuntimePackage;
  partIndex: number;
  partType: RuntimePartType;
};

type RemappedRuntimePart = RuntimePartWithIndex & {
  setup: RuntimeSetup;
  managers: RuntimeManager[];
  bones: RuntimeBone[];
  colliders: RuntimeCollider[];
  colliderBindings: RuntimeColliderBinding[];
  managerColliderCaches: RuntimeManagerColliderCache[];
  activeRoots: string[];
};

export function normalizeRuntimePartType(value: string): RuntimePartType {
  const normalized = value.toLowerCase();
  if (normalized === "head_optional" || normalized === "accessory") {
    return "head_optional";
  }
  if (normalized === "body" || normalized === "head" || normalized === "hair") {
    return normalized;
  }
  throw new Error(`Unsupported runtime part type: ${value}`);
}

export function tryNormalizeRuntimePartType(value: string): RuntimePartType | null {
  try {
    return normalizeRuntimePartType(value);
  } catch {
    return null;
  }
}

export function runtimeRoleId(characterId: number, unit: string | null | undefined) {
  return `${characterId}:${normalizeUnit(unit)}`;
}

export function getCharacterIndexEntries(index: Character3dIndex): Character3dIndexEntry[] {
  return index.entries ?? index.character3ds ?? [];
}

export function getDefaultCustomSelection(partSet: PartPackageSet): CustomPartSelection | null {
  const preset = partSet.characterIndex.find((entry) =>
    hasCompletePresetParts(entry) &&
    hasLoadedPart(partSet, entry.characterId, entry.unit ?? null, "body", entry.bodyCostume3dId) &&
    hasLoadedPart(partSet, entry.characterId, entry.unit ?? null, "head", entry.headCostume3dId) &&
    hasLoadedPart(partSet, entry.characterId, entry.unit ?? null, "hair", entry.hairCostume3dId) &&
    (
      !entry.headOptionalCostume3dId ||
      hasLoadedPart(partSet, entry.characterId, entry.unit ?? null, "head_optional", entry.headOptionalCostume3dId)
    )
  );
  if (preset) {
    const bodyCostume3dId = preset.bodyCostume3dId!;
    const headCostume3dId = preset.headCostume3dId!;
    const hairCostume3dId = preset.hairCostume3dId!;
    return {
      characterId: preset.characterId,
      unit: preset.unit ?? null,
      bodyCostume3dId,
      headCostume3dId,
      hairCostume3dId,
      headOptionalCostume3dId: preset.headOptionalCostume3dId ?? null,
      origin: "official_preset",
    };
  }

  const body = findFirstLoadedPart(partSet, "body");
  if (!body) {
    return null;
  }
  const headHairPair = findFirstCompatibleLoadedHeadHair(partSet, body.characterId, body.unit ?? null);
  if (!headHairPair) {
    return null;
  }
  const { head, hair } = headHairPair;
  return {
    characterId: body.characterId,
    unit: body.unit ?? head.unit ?? hair.unit ?? null,
    bodyCostume3dId: body.costume3dId,
    headCostume3dId: head.costume3dId,
    hairCostume3dId: hair.costume3dId,
    headOptionalCostume3dId: null,
    origin: "custom",
  };
}

export function listSelectableParts(
  partSet: PartPackageSet,
  characterId: number,
  partType: RuntimePartType,
  options: { unit?: string | null; loadedOnly?: boolean } = {}
): PartRegistryEntry[] {
  return partSet.registry
    .filter((entry) => entry.characterId === characterId)
    .filter((entry) => options.unit === undefined || sameUnit(entry.unit, options.unit))
    .filter((entry) => tryNormalizeRuntimePartType(entry.partType) === partType)
    .filter((entry) => entry.status !== "missing")
    .filter((entry) => !options.loadedOnly || partSet.packages.has(entry.packagePath))
    .sort((left, right) => left.costume3dId - right.costume3dId);
}

export function composeRuntimeCombinedCharacterAsset(
  input: ComposePartAssetInput
): RuntimeCombinedCharacterAsset {
  const { partSet, selection, activeRoleId, resolveUrl } = input;
  const selectionRoleId = runtimeRoleId(selection.characterId, selection.unit);
  if (activeRoleId !== null && selectionRoleId !== activeRoleId) {
    throw new Error(
      `Custom switching is limited to role ${activeRoleId}. Reload/select another role before switching to ${selectionRoleId}.`
    );
  }

  const body = requirePart(partSet, selection.characterId, selection.unit, "body", selection.bodyCostume3dId);
  const head = requirePart(partSet, selection.characterId, selection.unit, "head", selection.headCostume3dId);
  const hair = requirePart(partSet, selection.characterId, selection.unit, "hair", selection.hairCostume3dId);
  const optional = selection.headOptionalCostume3dId
    ? requirePart(partSet, selection.characterId, selection.unit, "head_optional", selection.headOptionalCostume3dId)
    : null;

  assertSameRole(selection.characterId, selection.unit, [body, head, hair, optional].filter(Boolean) as PartRuntimePackage[]);
  assertHeadHairCompatible(partSet.compatibility, selection);

  const bodyManifest = normalizeBodyManifestFromPart(body, resolveUrl);
  const headManifest = normalizeHeadManifestFromParts(
    [head, hair, optional].filter(Boolean) as PartRuntimePackage[],
    selection,
    resolveUrl
  );
  const runtimeExtension = composeRuntimeExtension(
    [body, head, hair, optional].filter(Boolean) as PartRuntimePackage[],
    bodyManifest,
    headManifest
  );

  return {
    id: `custom-${selectionRoleId}-${selection.bodyCostume3dId}-${selection.headCostume3dId}-${selection.hairCostume3dId}-${selection.headOptionalCostume3dId ?? "none"}`,
    displayName: `Custom ${selectionRoleId}`,
    meshUrl: "",
    unityRuntimeJsonUrl: `haruki-composed://role-${selectionRoleId}/unity-runtime.json`,
    unityRuntimeJsonPath: "viewer-composed-part-runtime",
    bodyAsset: bodyManifest,
    headAsset: headManifest,
    runtimeExtension,
  };
}

function findFirstLoadedPart(
  partSet: PartPackageSet,
  partType: RuntimePartType,
  characterId?: number,
  unit?: string | null
) {
  return partSet.registry.find((entry) =>
    tryNormalizeRuntimePartType(entry.partType) === partType &&
    (characterId === undefined || entry.characterId === characterId) &&
    (unit === undefined || sameUnit(entry.unit, unit)) &&
    entry.status !== "missing" &&
    partSet.packages.has(entry.packagePath)
  );
}

function findFirstCompatibleLoadedHeadHair(partSet: PartPackageSet, characterId: number, unit: string | null) {
  const heads = listSelectableParts(partSet, characterId, "head", { unit, loadedOnly: true });
  const hairs = listSelectableParts(partSet, characterId, "hair", { unit, loadedOnly: true });
  for (const head of heads) {
    for (const hair of hairs) {
      const selection = {
        characterId,
        unit,
        bodyCostume3dId: 0,
        headCostume3dId: head.costume3dId,
        hairCostume3dId: hair.costume3dId,
        headOptionalCostume3dId: null,
      };
      try {
        assertHeadHairCompatible(partSet.compatibility, selection);
        return { head, hair };
      } catch {
        // Continue searching for a compatible default pair.
      }
    }
  }
  return null;
}

function hasLoadedPart(
  partSet: PartPackageSet,
  characterId: number,
  unit: string | null | undefined,
  partType: RuntimePartType,
  costume3dId: number
) {
  return Boolean(findLoadedPart(partSet, characterId, unit, partType, costume3dId));
}

function hasCompletePresetParts(entry: Character3dIndexEntry): entry is Character3dIndexEntry & {
  bodyCostume3dId: number;
  headCostume3dId: number;
  hairCostume3dId: number;
} {
  return typeof entry.characterId === "number" &&
    typeof entry.bodyCostume3dId === "number" &&
    typeof entry.headCostume3dId === "number" &&
    typeof entry.hairCostume3dId === "number";
}

function requirePart(
  partSet: PartPackageSet,
  characterId: number,
  unit: string | null | undefined,
  partType: RuntimePartType,
  costume3dId: number
): PartRuntimePackage {
  const entry = findLoadedPart(partSet, characterId, unit, partType, costume3dId);
  if (!entry) {
    throw new Error(`Missing loaded ${partType} package for role ${runtimeRoleId(characterId, unit)}, costume3dId ${costume3dId}.`);
  }
  const runtime = partSet.packages.get(entry.packagePath);
  return runtime!;
}

function findLoadedPart(
  partSet: PartPackageSet,
  characterId: number,
  unit: string | null | undefined,
  partType: RuntimePartType,
  costume3dId: number
) {
  return partSet.registry.find(
    (candidate) =>
      candidate.characterId === characterId &&
      sameUnit(candidate.unit, unit) &&
      candidate.costume3dId === costume3dId &&
      tryNormalizeRuntimePartType(candidate.partType) === partType &&
      candidate.status !== "missing" &&
      partSet.packages.has(candidate.packagePath)
  );
}

function assertSameRole(characterId: number, unit: string | null | undefined, packages: PartRuntimePackage[]) {
  const mismatch = packages.find((runtime) =>
    runtime.part.characterId !== characterId || !sameUnit(runtime.part.unit, unit)
  );
  if (mismatch) {
    throw new Error(
      `Part ${mismatch.part.partType}/${mismatch.part.costume3dId} belongs to role ${runtimeRoleId(mismatch.part.characterId, mismatch.part.unit)}, not ${runtimeRoleId(characterId, unit)}.`
    );
  }
}

function assertHeadHairCompatible(
  compatibility: HeadHairCompatibility | null,
  selection: CustomPartSelection
) {
  if (!compatibility) {
    return;
  }
  if (selection.origin === "official_preset") {
    return;
  }
  const key = compatibilityKey(selection.unit, selection.headCostume3dId, selection.hairCostume3dId);
  const { availableKeys, deniedKeys, availableHeadKeys } = buildCompatibilityKeys(compatibility);
  if (deniedKeys.has(key)) {
    throw new Error(`Head ${selection.headCostume3dId} and hair ${selection.hairCostume3dId} are not available together.`);
  }
  const availableHeadKey = compatibilityHeadKey(selection.unit, selection.headCostume3dId);
  if (availableHeadKeys.has(availableHeadKey) && !availableKeys.has(key)) {
    throw new Error(`Head ${selection.headCostume3dId} and hair ${selection.hairCostume3dId} are not in the available pattern list for unit ${selection.unit ?? ""}.`);
  }
}

function buildDeniedCompatibilityKeys(compatibility: HeadHairCompatibility | null) {
  if (!compatibility) {
    return new Set<string>();
  }
  return new Set(
    [
      ...(compatibility.denied ?? []),
      ...(compatibility.rules ?? []).filter((entry) => entry.state === "not_available"),
    ].map((entry) =>
      compatibilityKey(entry.unit, entry.headCostume3dId, entry.hairCostume3dId)
    )
  );
}

function buildCompatibilityKeys(compatibility: HeadHairCompatibility) {
  const availableKeys = new Set<string>();
  const availableHeadKeys = new Set<string>();
  const deniedKeys = buildDeniedCompatibilityKeys(compatibility);
  const availableEntries = [
    ...(compatibility.allowed ?? []),
    ...(compatibility.rules ?? []).filter((entry) => entry.state === "available"),
  ];
  for (const entry of availableEntries) {
    availableKeys.add(compatibilityKey(entry.unit, entry.headCostume3dId, entry.hairCostume3dId));
    availableHeadKeys.add(compatibilityHeadKey(entry.unit, entry.headCostume3dId));
  }
  return { availableKeys, availableHeadKeys, deniedKeys };
}

function compatibilityKey(unit: string | null | undefined, headCostume3dId: number, hairCostume3dId: number) {
  return `${normalizeUnit(unit)}|${headCostume3dId}|${hairCostume3dId}`;
}

function compatibilityHeadKey(unit: string | null | undefined, headCostume3dId: number) {
  return `${normalizeUnit(unit)}|${headCostume3dId}`;
}

function normalizeUnit(unit: string | null | undefined) {
  return unit ?? "";
}

function sameUnit(left: string | null | undefined, right: string | null | undefined) {
  return normalizeUnit(left) === normalizeUnit(right);
}

function normalizeBodyManifestFromPart(
  runtime: PartRuntimePackage,
  resolveUrl: (path: string) => string
): BodyAssetManifest {
  const manifest = cloneRecord(runtime.manifest) as BodyAssetManifest;
  manifest.id ||= `body-${runtime.part.costume3dId}`;
  manifest.displayName ||= runtime.part.name ?? manifest.id;
  manifest.characterId = String(runtime.part.characterId).padStart(2, "0");
  manifest.source ||= { bundleRoot: "", manifestUrl: "", meshUrl: "" };
  manifest.neckAnchor = normalizeVec3(manifest.neckAnchor, { x: 0, y: 1.75, z: 0.15 });
  manifest.skeleton ||= {} as BodyAssetManifest["skeleton"];
  manifest.skeleton.neckAttach ||= { fallbackPosition: { x: 0, y: 1.75, z: 0.15 } };
  manifest.skeleton.neckAttach.fallbackPosition = normalizeVec3(
    manifest.skeleton.neckAttach.fallbackPosition,
    { x: 0, y: 1.75, z: 0.15 }
  );
  manifest.bodyMaterials ||= [];
  const resolvePartUrl = createPartUrlResolver(runtime, resolveUrl);
  manifest.source = {
    ...manifest.source,
    meshUrl: resolveRequiredUrl(manifest.source?.meshUrl, resolvePartUrl),
    skeletonUrl: resolveMaybeUrl(manifest.source?.skeletonUrl, resolvePartUrl),
    animationUrls: manifest.source?.animationUrls?.map((url) => resolveRequiredUrl(url, resolvePartUrl)),
  };
  manifest.bodyMaterials = mergeMaterialSlots(manifest.bodyMaterials, [runtime]);
  return manifest;
}

function normalizeHeadManifestFromParts(
  runtimes: PartRuntimePackage[],
  selection: CustomPartSelection,
  resolveUrl: (path: string) => string
): HeadAssetManifest {
  const head = runtimes.find((runtime) => normalizeRuntimePartType(runtime.part.partType) === "head") ?? runtimes[0];
  const manifest = cloneRecord(head.manifest) as HeadAssetManifest;
  manifest.id = `head-${selection.headCostume3dId}-hair-${selection.hairCostume3dId}`;
  manifest.displayName = `Head ${selection.headCostume3dId} / Hair ${selection.hairCostume3dId}`;
  manifest.characterId = String(selection.characterId).padStart(2, "0");
  manifest.source ||= { bundleRoot: "", manifestUrl: "", meshUrl: "" };
  manifest.rawImportOffset = normalizeVec3(manifest.rawImportOffset, { x: 0, y: 0, z: 0 });
  manifest.assembly ||= {} as HeadAssetManifest["assembly"];
  manifest.assembly.attachOrigin ||= { fallbackPosition: { x: 0, y: 1.75, z: 0.15 } };
  manifest.assembly.attachOrigin.fallbackPosition = normalizeVec3(
    manifest.assembly.attachOrigin.fallbackPosition,
    { x: 0, y: 1.75, z: 0.15 }
  );
  manifest.faceMaterials ||= [];
  const resolveHeadUrl = createPartUrlResolver(head, resolveUrl);
  manifest.source = {
    ...manifest.source,
    meshUrl: resolveRequiredUrl(manifest.source?.meshUrl, resolveHeadUrl),
    skeletonUrl: resolveMaybeUrl(manifest.source?.skeletonUrl, resolveHeadUrl),
    animationUrls: manifest.source?.animationUrls?.map((url) => resolveRequiredUrl(url, resolveHeadUrl)),
  };
  manifest.faceMaterials = mergeMaterialSlots(manifest.faceMaterials, runtimes);
  manifest.morphChannelBindings = runtimes.flatMap((runtime) =>
    Array.isArray(runtime.morphChannelBindings) ? runtime.morphChannelBindings : []
  ) as HeadAssetManifest["morphChannelBindings"];
  return manifest;
}

function createPartUrlResolver(
  runtime: PartRuntimePackage,
  resolveUrl: (path: string) => string
) {
  const packagePath = readOptionalString(runtime.mount?.packagePath) || "";
  return (path: string) => resolveUrl(resolvePackageRelativePath(packagePath, path));
}

function resolvePackageRelativePath(packagePath: string, path: string) {
  if (!path || /^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith("/")) {
    return path;
  }
  const normalizedPackagePath = packagePath.replace(/\/+$/, "");
  if (!normalizedPackagePath || path.startsWith(`${normalizedPackagePath}/`)) {
    return path;
  }
  return `${normalizedPackagePath}/${path.replace(/^\/+/, "")}`;
}

function normalizeVec3(
  value: { x?: number; y?: number; z?: number } | undefined,
  fallback: { x: number; y: number; z: number }
) {
  return {
    x: typeof value?.x === "number" ? value.x : fallback.x,
    y: typeof value?.y === "number" ? value.y : fallback.y,
    z: typeof value?.z === "number" ? value.z : fallback.z,
  };
}

function readOptionalString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function composeRuntimeExtension(
  runtimes: PartRuntimePackage[],
  bodyAsset: BodyAssetManifest,
  headAsset: HeadAssetManifest
) {
  const runtimeSetup = mergeRuntimeSetup(runtimes);
  return {
    version: "0414",
    sourceKind: "viewer_composed_part_runtime_package",
    bodyAsset,
    headAsset,
    bodyManifest: bodyAsset,
    headManifest: headAsset,
    materialSlots: runtimes.flatMap((runtime) => runtime.materialSlots ?? []),
    textureRoles: runtimes.flatMap((runtime) => runtime.textureRoles ?? []),
    characterTextures: Object.assign({}, ...runtimes.map((runtime) => runtime.characterTextures ?? {})),
    nativeMeshes: mergeNativeMeshes(runtimes),
    morphChannelBindings: headAsset.morphChannelBindings ?? [],
    pjskSpringBone: {
      runtimeUnitySetup: runtimeSetup,
    },
    warnings: runtimes.flatMap((runtime) => runtime.warnings ?? []),
  };
}

function mergeRuntimeSetup(runtimes: PartRuntimePackage[]): RuntimeSetup {
  const remappedParts = runtimes.map((runtime, partIndex) => remapRuntimePart(runtime, partIndex));
  const firstSetup = remappedParts[0]?.setup ?? {};
  const warnings = runtimes.flatMap((runtime) => [
    ...(runtime.warnings ?? []),
    ...((runtime.springBone?.warnings as string[] | undefined) ?? []),
  ]);
  const activeRoots = uniqueStrings(remappedParts.flatMap((part) => part.activeRoots));
  const managers = remappedParts.flatMap((part) => part.managers);
  const bones = remappedParts.flatMap((part) => part.bones);
  const colliders = remappedParts.flatMap((part) => part.colliders);
  const colliderBindings = rebuildColliderBindings(remappedParts);
  const managerColliderCaches = rebuildManagerColliderCaches(remappedParts);
  const bindingDecisions = rebuildBindingDecisions(bones, colliderBindings);
  return {
    ...firstSetup,
    version: "0414",
    prefabGraphs: remappedParts
      .map((part) => part.runtime.springBone?.prefabGraph)
      .filter((value) => value !== undefined),
    rootSelectionProfile: {
      policy: "viewer_composed_active_parts",
      rootCandidates: [],
    },
    setupPlan: {
      discoveryMode: "viewer_composed_part_runtime_package",
      rootPolicy: "active_custom_parts",
      orderedSteps: [
        "load active part packages",
        "merge part native meshes",
        "merge active part springbone records",
        "rebind colliderFlag springs to current body colliders",
        "reset spring runtime",
      ],
      directBindingCount: colliderBindings.filter((binding) => binding.sourceKind === "direct").length,
      colliderFlagBindingCount: colliderBindings.filter((binding) => binding.sourceKind === "colliderFlag").length,
    },
    activeRootProfile: {
      defaultBodyRoot: activeRoots[0] ?? "body",
      activeRoots: activeRoots.length ? activeRoots : ["body", "face"],
      inactiveRoots: [],
    },
    managers,
    bones,
    colliders,
    colliderBindings,
    bindingDecisions,
    managerColliderCaches,
    warnings,
  };
}

function getPartRuntimeSetup(runtime: PartRuntimePackage): RuntimeSetup {
  const springBone = runtime.springBone ?? {};
  return {
    managers: springBone.managers as RuntimeManager[] | undefined,
    bones: springBone.bones as RuntimeBone[] | undefined,
    colliders: springBone.colliders as RuntimeCollider[] | undefined,
    colliderBindings: springBone.colliderBindings as RuntimeColliderBinding[] | undefined,
    managerColliderCaches: springBone.managerColliderCaches as RuntimeManagerColliderCache[] | undefined,
    activeRootProfile: springBone.activeRootProfile as Record<string, unknown> | undefined,
    bindingDecisions: springBone.bindingDecisions as RuntimeBindingDecision[] | undefined,
  };
}

function remapRuntimePart(runtime: PartRuntimePackage, partIndex: number): RemappedRuntimePart {
  const setup = getPartRuntimeSetup(runtime);
  const partType = normalizeRuntimePartType(runtime.part.partType);
  return {
    runtime,
    partIndex,
    partType,
    setup,
    managers: cloneArrayWithPartPrefix(setup.managers, partIndex) as RuntimeManager[],
    bones: cloneArrayWithPartPrefix(setup.bones, partIndex) as RuntimeBone[],
    colliders: cloneArrayWithPartPrefix(setup.colliders, partIndex) as RuntimeCollider[],
    colliderBindings: cloneArrayWithPartPrefix(setup.colliderBindings, partIndex) as RuntimeColliderBinding[],
    managerColliderCaches: cloneArrayWithPartPrefix(setup.managerColliderCaches, partIndex) as RuntimeManagerColliderCache[],
    activeRoots: readStringArray(setup.activeRootProfile?.activeRoots),
  };
}

function cloneArrayWithPartPrefix<T = unknown>(value: unknown, partIndex: number): T[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry) => {
    if (!isRecord(entry)) {
      return entry;
    }
    const cloned = { ...entry };
    if (typeof cloned.pathId === "number") {
      cloned.pathId = remapNumericId(cloned.pathId, partIndex);
    }
    if (typeof cloned.index === "number") {
      cloned.index = remapNumericId(cloned.index, partIndex);
    }
    if (typeof cloned.managerPathId === "number") {
      cloned.managerPathId = remapNumericId(cloned.managerPathId, partIndex);
    }
    if (typeof cloned.pivotSourcePathId === "number") {
      cloned.pivotSourcePathId = remapNumericId(cloned.pivotSourcePathId, partIndex);
    }
    if (typeof cloned.sourceSpringBonePathId === "number") {
      cloned.sourceSpringBonePathId = remapNumericId(cloned.sourceSpringBonePathId, partIndex);
    }
    if (Array.isArray(cloned.bonePathIds)) {
      cloned.bonePathIds = cloned.bonePathIds.map((id) =>
        typeof id === "number" ? remapNumericId(id, partIndex) : id
      );
    }
    if (Array.isArray(cloned.directColliderPathIds)) {
      cloned.directColliderPathIds = cloned.directColliderPathIds.map((id) =>
        typeof id === "number" ? remapNumericId(id, partIndex) : id
      );
    }
    if (Array.isArray(cloned.sourceColliderPathIds)) {
      cloned.sourceColliderPathIds = cloned.sourceColliderPathIds.map((id) =>
        typeof id === "number" ? remapNumericId(id, partIndex) : id
      );
    }
    if (Array.isArray(cloned.colliders)) {
      cloned.colliders = cloned.colliders.map((id) =>
        typeof id === "number" ? remapNumericId(id, partIndex) : id
      );
    }
    if (Array.isArray(cloned.selectedColliderIndexes)) {
      cloned.selectedColliderIndexes = cloned.selectedColliderIndexes.map((id) =>
        typeof id === "number" ? remapNumericId(id, partIndex) : id
      );
    }
    if (Array.isArray(cloned.sphereColliderIndexes)) {
      cloned.sphereColliderIndexes = cloned.sphereColliderIndexes.map((id) =>
        typeof id === "number" ? remapNumericId(id, partIndex) : id
      );
    }
    if (Array.isArray(cloned.capsuleColliderIndexes)) {
      cloned.capsuleColliderIndexes = cloned.capsuleColliderIndexes.map((id) =>
        typeof id === "number" ? remapNumericId(id, partIndex) : id
      );
    }
    if (Array.isArray(cloned.panelColliderIndexes)) {
      cloned.panelColliderIndexes = cloned.panelColliderIndexes.map((id) =>
        typeof id === "number" ? remapNumericId(id, partIndex) : id
      );
    }
    if (Array.isArray(cloned.springBonePathIds)) {
      cloned.springBonePathIds = cloned.springBonePathIds.map((id) =>
        typeof id === "number" ? remapNumericId(id, partIndex) : id
      );
    }
    if (isRecord(cloned.collidersByRoot)) {
      cloned.collidersByRoot = remapColliderRoots(cloned.collidersByRoot, partIndex);
    }
    if (isRecord(cloned.candidateRoots)) {
      cloned.candidateRoots = remapColliderRoots(cloned.candidateRoots, partIndex);
    }
    return cloned as T;
  });
}

function remapNumericId(value: number, partIndex: number) {
  return (partIndex + 1) * 1_000_000_000 + value;
}

function remapColliderRoots(value: Record<string, unknown>, partIndex: number): Record<string, number[]> {
  return Object.fromEntries(
    Object.entries(value).map(([root, indexes]) => [
      root,
      Array.isArray(indexes)
        ? indexes.map((id) => typeof id === "number" ? remapNumericId(id, partIndex) : id)
            .filter((id): id is number => typeof id === "number")
        : [],
    ])
  );
}

function rebuildColliderBindings(parts: RemappedRuntimePart[]): RuntimeColliderBinding[] {
  const bodyColliders = parts
    .filter((part) => part.partType === "body")
    .flatMap((part) => part.colliders);
  const currentBodyRoots = collidersByRoot(bodyColliders);
  return parts.flatMap((part) =>
    part.colliderBindings.map((binding) => {
      if (binding.sourceKind !== "colliderFlag" || part.partType === "body" || !hasColliderRoots(currentBodyRoots)) {
        return binding;
      }
      const selected = firstColliderRoot(currentBodyRoots);
      return {
        ...binding,
        collidersByRoot: currentBodyRoots,
        defaultRoot: selected.root,
        colliders: selected.indexes,
        sourceColliderPathIds: selected.indexes
          .map((index) => bodyColliders.find((collider) => collider.index === index)?.pathId)
          .filter((pathId): pathId is number => typeof pathId === "number"),
        rebindReason: "viewer_composed_current_body_colliders",
      };
    })
  );
}

function rebuildBindingDecisions(
  bones: RuntimeBone[],
  bindings: RuntimeColliderBinding[]
): RuntimeBindingDecision[] {
  const boneByPathId = new Map(
    bones
      .filter((bone) => typeof bone.pathId === "number")
      .map((bone) => [bone.pathId as number, bone])
  );
  return bindings
    .filter((binding) => typeof binding.sourceSpringBonePathId === "number")
    .map((binding) => {
      const bone = boneByPathId.get(binding.sourceSpringBonePathId!);
      const candidateRoots = hasColliderRoots(binding.collidersByRoot)
        ? binding.collidersByRoot!
        : {
            [binding.defaultRoot ?? bone?.poseRoot ?? "unknown"]: binding.colliders ?? [],
          };
      return {
        sourceKind: binding.sourceKind ?? "direct",
        partKind: binding.partKind ?? bone?.partKind ?? "Unknown",
        sourceSpringBonePathId: binding.sourceSpringBonePathId,
        nodePath: bone?.nodePath ?? null,
        poseRoot: bone?.poseRoot ?? null,
        colliderFlag: typeof binding.colliderFlag === "number" ? binding.colliderFlag : null,
        directColliderPathIds: binding.sourceKind === "direct" ? binding.sourceColliderPathIds ?? [] : [],
        candidateRoots,
        defaultRoot: binding.defaultRoot ?? null,
        selectedColliderIndexes: binding.colliders ?? [],
        reason: binding.sourceKind === "colliderFlag"
          ? "viewer custom composer rebound colliderFlag candidates to current body colliders"
          : "direct serialized collider references",
      };
    });
}

function rebuildManagerColliderCaches(parts: RemappedRuntimePart[]): RuntimeManagerColliderCache[] {
  const colliderByIndex = new Map(
    parts
      .flatMap((part) => part.colliders)
      .filter((collider) => typeof collider.index === "number")
      .map((collider) => [collider.index as number, collider])
  );
  return parts.flatMap((part) =>
    part.managerColliderCaches.map((cache) => filterManagerCache(cache, colliderByIndex))
  );
}

function filterManagerCache(
  cache: RuntimeManagerColliderCache,
  colliderByIndex: ReadonlyMap<number, RuntimeCollider>
): RuntimeManagerColliderCache {
  return {
    ...cache,
    sphereColliderIndexes: readNumberArray(cache.sphereColliderIndexes)
      .filter((index) => colliderByIndex.has(index)),
    capsuleColliderIndexes: readNumberArray(cache.capsuleColliderIndexes)
      .filter((index) => colliderByIndex.has(index)),
    panelColliderIndexes: readNumberArray(cache.panelColliderIndexes)
      .filter((index) => colliderByIndex.has(index)),
    reason: "viewer_composed_active_parts_manager_cache",
  };
}

function collidersByRoot(colliders: RuntimeCollider[]): Record<string, number[]> {
  const roots = new Map<string, number[]>();
  for (const collider of colliders) {
    if (typeof collider.index !== "number") {
      continue;
    }
    const root = normalizeRootName(firstPathSegment(collider.nodePath) ?? collider.poseRoot ?? "body");
    const indexes = roots.get(root) ?? [];
    indexes.push(collider.index);
    roots.set(root, indexes);
  }
  return Object.fromEntries(
    [...roots.entries()].map(([root, indexes]) => [root, [...new Set(indexes)].sort((a, b) => a - b)])
  );
}

function hasColliderRoots(value: Record<string, number[]> | null | undefined): value is Record<string, number[]> {
  return Boolean(value && Object.values(value).some((indexes) => indexes.length > 0));
}

function firstColliderRoot(value: Record<string, number[]>): { root: string; indexes: number[] } {
  const [root, indexes] = Object.entries(value)
    .sort(([left], [right]) => rootPriority(left) - rootPriority(right) || left.localeCompare(right))[0];
  return { root, indexes };
}

function rootPriority(root: string): number {
  return root === "body" ? 0 : root === "sit_body" ? 1 : root === "guitar_body" ? 2 : 10;
}

function normalizeRootName(value: string | null | undefined): string {
  return (value ?? "").trim() || "body";
}

function firstPathSegment(value: string | null | undefined): string | null {
  const segment = value?.split("/").find(Boolean);
  return segment ?? null;
}

function mergeNativeMeshes(runtimes: PartRuntimePackage[]) {
  return {
    version: "0414",
    meshes: runtimes.flatMap((runtime) =>
      readRecordArray(runtime.nativeMeshes?.meshes)
    ),
    warnings: runtimes.flatMap((runtime) => runtime.warnings ?? []),
  };
}

function mergeMaterialSlots<T>(base: T[] | undefined, runtimes: PartRuntimePackage[]): T[] {
  const exported = runtimes.flatMap((runtime) => runtime.materialSlots ?? []) as T[];
  return exported.length ? exported : [...(base ?? [])];
}

function resolveMaybeUrl(value: string | undefined, resolveUrl: (path: string) => string) {
  return value ? resolveUrl(value) : value;
}

function resolveRequiredUrl(value: string | undefined, resolveUrl: (path: string) => string) {
  return value ? resolveUrl(value) : "";
}

function cloneRecord<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function readRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is Record<string, unknown> => isRecord(entry))
    : [];
}

function readNumberArray(value: unknown): number[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is number => typeof entry === "number")
    : [];
}

function uniqueStrings(values: string[]) {
  return [...new Set(values)];
}

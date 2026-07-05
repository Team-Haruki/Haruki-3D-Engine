import type {
  BodyAssetManifest,
  HeadAssetManifest,
} from "../data/sampleScene";
import { characterHeightMetersById } from "../data/sampleScene";
import type { RuntimeCombinedCharacterAsset } from "../engine/Haruki3DEngine";

export type RuntimePartType = "body" | "head" | "hair" | "head_optional";
export type CustomPartSelectionOrigin = "custom" | "official_preset";

export type PartRegistryEntry = {
  costume3dId: number;
  partType: RuntimePartType | string;
  characterId: number;
  unit?: string | null;
  name?: string | null;
  colorId?: number | null;
  colorName?: string | null;
  costume3dGroupId?: number | null;
  modelAssetbundleName?: string | null;
  headCostume3dAssetbundleType?: string | null;
  baseSourceKey?: string | null;
  sourceKey?: string | null;
  sourcePackagePath?: string | null;
  packagePath: string;
  status?: string;
};

export type Character3dIndexEntry = {
  id: number;
  character3dId?: number;
  characterId: number;
  bodyCostume3dId?: number;
  headCostume3dId?: number;
  hairCostume3dId?: number;
  headOptionalCostume3dId?: number | null;
  unit?: string | null;
  name?: string | null;
  roleRuntimePath?: string | null;
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
    headCompositionKind?: string | null;
    mainHeadCostume3dId?: number | null;
    mainHairCostume3dId?: number | null;
    activeContributors?: string[] | null;
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
    headCompositionKind?: string | null;
    mainHeadCostume3dId?: number | null;
    mainHairCostume3dId?: number | null;
    activeContributors?: string[] | null;
  }>;
};

export type PartRuntimePackage = {
  version: string;
  packagePath?: string;
  part: {
    costume3dId: number;
    partType: RuntimePartType | string;
    characterId: number;
    unit?: string | null;
    name?: string | null;
    colorId?: number | null;
    colorName?: string | null;
    costume3dGroupId?: number | null;
    modelAssetbundleName?: string | null;
    headCostume3dAssetbundleType?: string | null;
  };
  source?: {
    bundlePath?: string | null;
    colorVariationBundlePath?: string | null;
    assetRootRelativeBundlePath?: string | null;
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

export type RoleRuntimePackage = {
  version: string;
  role: {
    characterId: number;
    unit?: string | null;
  };
  sourceCharacter3dId?: number;
  motionPackage?: {
    sourcePath?: string;
    unityMotionJson?: string | null;
    bodyMotionBindings?: unknown;
    faceMotion?: unknown;
    lightMotion?: unknown;
  } | null;
  warnings?: string[];
};

export type PartPackageSet = {
  registry: PartRegistryEntry[];
  characterIndex: Character3dIndexEntry[];
  compatibility: HeadHairCompatibility | null;
  packages: Map<string, PartRuntimePackage>;
  roleRuntimes: Map<string, RoleRuntimePackage>;
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
  constraintSetup?: RuntimeConstraintSetup;
  warnings?: string[];
  [key: string]: unknown;
};

type RuntimePrefabGraph = Record<string, unknown> & {
  transforms?: RuntimePrefabTransform[];
  monoBehaviours?: RuntimePrefabMonoBehaviour[];
};

type RuntimePrefabTransform = Record<string, unknown> & {
  pathId?: number;
  parentPathId?: number | null;
  childPathIds?: number[];
  runtimePartIndex?: number;
};

type RuntimePrefabMonoBehaviour = Record<string, unknown> & {
  pathId?: number;
  runtimePartIndex?: number;
};

type AccessoryTransformAdjustment = {
  position?: VectorLike | null;
  rotationEulerDegrees?: VectorLike | null;
  scale?: VectorLike | null;
};

type VectorLike = {
  x?: number;
  y?: number;
  z?: number;
  X?: number;
  Y?: number;
  Z?: number;
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

type RuntimeConstraintSetup = Record<string, unknown> & {
  version?: string | number;
  sourceKind?: string;
  constraints?: RuntimeConstraint[];
  warnings?: string[];
};

type RuntimeConstraint = Record<string, unknown> & {
  partKind?: string;
  type?: string;
  pathId?: number;
  ownerPath?: string | null;
  ownerName?: string | null;
  enabled?: boolean | null;
  active?: boolean | null;
  worldUpObjectPathId?: number | null;
  sources?: RuntimeConstraintSource[];
  status?: string;
  reason?: string;
  runtimePartIndex?: number;
};

type RuntimeConstraintSource = Record<string, unknown> & {
  sourcePathId?: number | null;
  sourceName?: string | null;
  sourcePath?: string | null;
  weight?: number;
  translationOffset?: VectorLike | null;
};

type RuntimePartWithIndex = {
  runtime: PartRuntimePackage;
  partIndex: number;
  partType: RuntimePartType;
};

type RemappedRuntimePart = RuntimePartWithIndex & {
  setup: RuntimeSetup;
  prefabGraph: RuntimePrefabGraph | null;
  managers: RuntimeManager[];
  bones: RuntimeBone[];
  colliders: RuntimeCollider[];
  colliderBindings: RuntimeColliderBinding[];
  managerColliderCaches: RuntimeManagerColliderCache[];
  constraints: RuntimeConstraint[];
  activeRoots: string[];
};

type HeadHairComposition = {
  kind: string;
  activePartTypes: ReadonlySet<RuntimePartType>;
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
    .filter(isUsableRegistryEntry)
    .filter((entry) => !options.loadedOnly || isEmptyHeadOptionalEntry(entry) || partSet.packages.has(entry.packagePath))
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
  const optional = resolveOptionalHeadRuntime(partSet, selection);

  assertPartRuntimeProxyMetadata(body, "body");
  assertPartRuntimeProxyMetadata(head, "head");
  assertSameRole(selection.characterId, selection.unit, [body, head, hair, optional].filter(Boolean) as PartRuntimePackage[]);
  assertHeadHairCompatible(partSet.compatibility, selection);
  const allRuntimes = [body, head, hair, optional].filter(Boolean) as PartRuntimePackage[];
  const headHairComposition = resolveHeadHairComposition(partSet, selection, allRuntimes);
  const contributingRuntimes = filterRuntimeContributors(allRuntimes, headHairComposition);

  const roleRuntime = partSet.roleRuntimes.get(selectionRoleId) ?? null;
  const bodyManifest = normalizeBodyManifestFromPart(body, resolveUrl);
  applyRoleRuntimeMotion(bodyManifest, roleRuntime);
  const headManifest = normalizeHeadManifestFromParts(
    filterRuntimeContributors([head, hair, optional].filter(Boolean) as PartRuntimePackage[], headHairComposition),
    selection,
    resolveUrl
  );
  const runtimeExtension = composeRuntimeExtension(
    contributingRuntimes,
    bodyManifest,
    headManifest,
    roleRuntime
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
  const entry = findRegistryPart(partSet, characterId, unit, partType, costume3dId);
  return Boolean(entry && (isEmptyHeadOptionalEntry(entry) || partSet.packages.has(entry.packagePath)));
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
  return withRegistryEntryRuntimeMetadata(runtime!, entry);
}

function resolveOptionalHeadRuntime(
  partSet: PartPackageSet,
  selection: CustomPartSelection
): PartRuntimePackage | null {
  if (!selection.headOptionalCostume3dId) {
    return null;
  }

  const entry = findRegistryPart(
    partSet,
    selection.characterId,
    selection.unit,
    "head_optional",
    selection.headOptionalCostume3dId
  );
  if (!entry) {
    throw new Error(`Missing loaded head_optional package for role ${runtimeRoleId(selection.characterId, selection.unit)}, costume3dId ${selection.headOptionalCostume3dId}.`);
  }
  if (isEmptyHeadOptionalEntry(entry)) {
    return null;
  }

  return requirePart(partSet, selection.characterId, selection.unit, "head_optional", selection.headOptionalCostume3dId);
}

function withRegistryEntryRuntimeMetadata(
  runtime: PartRuntimePackage,
  entry: PartRegistryEntry
): PartRuntimePackage {
  const partType = tryNormalizeRuntimePartType(entry.partType) ?? runtime.part.partType;
  const manifest = isRecord(runtime.manifest)
    ? cloneRecord(runtime.manifest)
    : runtime.manifest;
  if (isRecord(manifest)) {
    manifest.id = `${partType}-${entry.characterId}-${entry.costume3dId}-${entry.unit ?? "default"}`;
    manifest.displayName = entry.name ?? readOptionalString(manifest.displayName) ?? manifest.id;
    manifest.characterId = String(entry.characterId).padStart(2, "0");
    manifest.characterHeightMeters = resolveRuntimePartCharacterHeightMeters(entry.characterId);
  }

  return {
    ...runtime,
    packagePath: entry.packagePath,
    part: {
      ...runtime.part,
      costume3dId: entry.costume3dId,
      partType,
      characterId: entry.characterId,
      unit: entry.unit,
      name: entry.name ?? runtime.part.name,
      colorId: typeof entry.colorId === "number" ? entry.colorId : runtime.part.colorId,
      colorName: entry.colorName ?? runtime.part.colorName,
      costume3dGroupId: typeof entry.costume3dGroupId === "number"
        ? entry.costume3dGroupId
        : runtime.part.costume3dGroupId,
      modelAssetbundleName: entry.modelAssetbundleName ?? runtime.part.modelAssetbundleName,
      headCostume3dAssetbundleType: entry.headCostume3dAssetbundleType ?? runtime.part.headCostume3dAssetbundleType,
    },
    manifest,
    mount: {
      ...(runtime.mount ?? {}),
      packagePath: entry.packagePath,
      expectedSkeletonId: String(entry.characterId).padStart(2, "0"),
    },
  };
}

function assertPartRuntimeProxyMetadata(
  runtime: PartRuntimePackage,
  expectedPartType: "body" | "head"
) {
  const manifest = isRecord(runtime.manifest) ? runtime.manifest : {};
  const proxy = manifest.proxy ?? manifest.Proxy;
  if (!isRecord(proxy)) {
    throw new Error(
      `Part runtime package '${runtime.packagePath ?? runtime.part.costume3dId}' is missing manifest.proxy material metadata for ${expectedPartType}; regenerate it with a current Haruki-3D-Exporter before capture.`
    );
  }
}

function findLoadedPart(
  partSet: PartPackageSet,
  characterId: number,
  unit: string | null | undefined,
  partType: RuntimePartType,
  costume3dId: number
) {
  const entry = findRegistryPart(partSet, characterId, unit, partType, costume3dId);
  return entry && partSet.packages.has(entry.packagePath) ? entry : undefined;
}

function findRegistryPart(
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
      isUsableRegistryEntry(candidate)
  );
}

function isUsableRegistryEntry(entry: PartRegistryEntry) {
  return entry.status !== "missing";
}

function isEmptyHeadOptionalEntry(entry: PartRegistryEntry) {
  return entry.status === "empty" &&
    tryNormalizeRuntimePartType(entry.partType) === "head_optional";
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
  manifest.characterHeightMeters ??= resolveRuntimePartCharacterHeightMeters(runtime.part.characterId);
  manifest.materialPipeline ??= "embedded";
  manifest.source ||= { bundleRoot: "", manifestUrl: "", meshUrl: "" };
  manifest.neckAnchor = normalizeVec3(manifest.neckAnchor, { x: 0, y: 1.75, z: 0.15 });
  manifest.skeleton ||= {} as BodyAssetManifest["skeleton"];
  manifest.skeleton.neckAttach ||= { fallbackPosition: { x: 0, y: 1.75, z: 0.15 } };
  manifest.skeleton.neckAttach.fallbackPosition = normalizeVec3(
    manifest.skeleton.neckAttach.fallbackPosition,
    { x: 0, y: 1.75, z: 0.15 }
  );
  manifest.proxy ||= {} as BodyAssetManifest["proxy"];
  manifest.proxy = {
    bodyColor: manifest.proxy.bodyColor ?? "#f2d0c3",
    shadowColor: manifest.proxy.shadowColor ?? "#bf958a",
    bodyScale: manifest.proxy.bodyScale ?? 1,
    torsoLength: manifest.proxy.torsoLength ?? 2.2,
    shoulderWidth: manifest.proxy.shoulderWidth ?? 1.1,
  };
  manifest.bodyMaterials ||= [];
  const resolvePartUrl = createPartUrlResolver(runtime, resolveUrl);
  manifest.source = {
    ...manifest.source,
    meshUrl: resolveRequiredUrl(manifest.source?.meshUrl, resolvePartUrl),
    skeletonUrl: resolveMaybeUrl(manifest.source?.skeletonUrl, resolvePartUrl),
    animationUrls: manifest.source?.animationUrls?.map((url) => resolveRequiredUrl(url, resolvePartUrl)),
  };
  manifest.bodyMaterials = mergeMaterialSlots(manifest.bodyMaterials, [runtime], resolveUrl);
  return manifest;
}

function applyRoleRuntimeMotion(
  manifest: BodyAssetManifest,
  roleRuntime: RoleRuntimePackage | null
) {
  const unityMotionJson = roleRuntime?.motionPackage?.unityMotionJson;
  if (!unityMotionJson) {
    return;
  }
  manifest.source = {
    ...manifest.source,
    animationUrls: [unityMotionJson],
  };
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
  manifest.characterHeightMeters ??= resolveRuntimePartCharacterHeightMeters(selection.characterId);
  manifest.materialPipeline ??= "embedded";
  manifest.source ||= { bundleRoot: "", manifestUrl: "", meshUrl: "" };
  manifest.rawImportOffset = normalizeVec3(manifest.rawImportOffset, { x: 0, y: 0, z: 0 });
  manifest.assembly ||= {} as HeadAssetManifest["assembly"];
  manifest.assembly.attachOrigin ||= { fallbackPosition: { x: 0, y: 1.75, z: 0.15 } };
  manifest.assembly.attachOrigin.fallbackPosition = normalizeVec3(
    manifest.assembly.attachOrigin.fallbackPosition,
    { x: 0, y: 1.75, z: 0.15 }
  );
  manifest.proxy ||= {} as HeadAssetManifest["proxy"];
  manifest.proxy = {
    faceColor: manifest.proxy.faceColor ?? "#fde2d9",
    faceShadeColor: manifest.proxy.faceShadeColor ?? "#f7cdbf",
    skinColorDefault: manifest.proxy.skinColorDefault ?? manifest.proxy.faceColor ?? "#fde2d9",
    skinColor1: manifest.proxy.skinColor1 ?? manifest.proxy.faceShadeColor ?? "#f7cdbf",
    skinColor2: manifest.proxy.skinColor2 ?? manifest.proxy.faceShadeColor ?? "#f7cdbf",
    hairColor: manifest.proxy.hairColor ?? "#7b5b4a",
    hairShadowColor: manifest.proxy.hairShadowColor ?? "#513d33",
    headRadius: manifest.proxy.headRadius ?? 0.74,
    faceDepth: manifest.proxy.faceDepth ?? 0.82,
    hairArc: manifest.proxy.hairArc ?? 0.98,
  };
  manifest.faceMaterials ||= [];
  const resolveHeadUrl = createPartUrlResolver(head, resolveUrl);
  manifest.source = {
    ...manifest.source,
    meshUrl: resolveRequiredUrl(manifest.source?.meshUrl, resolveHeadUrl),
    skeletonUrl: resolveMaybeUrl(manifest.source?.skeletonUrl, resolveHeadUrl),
    animationUrls: manifest.source?.animationUrls?.map((url) => resolveRequiredUrl(url, resolveHeadUrl)),
  };
  manifest.faceMaterials = mergeMaterialSlots(manifest.faceMaterials, runtimes, resolveUrl);
  manifest.morphChannelBindings = runtimes.flatMap((runtime) =>
    Array.isArray(runtime.morphChannelBindings) ? runtime.morphChannelBindings : []
  ) as HeadAssetManifest["morphChannelBindings"];
  return manifest;
}

function createPartUrlResolver(
  runtime: PartRuntimePackage,
  resolveUrl: (path: string) => string
) {
  const packagePath = readOptionalString(runtime.packagePath) || readOptionalString(runtime.mount?.packagePath) || "";
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

function resolveHeadHairComposition(
  partSet: PartPackageSet,
  selection: CustomPartSelection,
  runtimes: PartRuntimePackage[]
): HeadHairComposition {
  const metadata = findHeadHairCompositionMetadata(partSet.compatibility, selection);
  const activeFromMetadata = metadata?.activeContributors
    ?.map((value) => tryNormalizeRuntimePartType(value))
    .filter((value): value is RuntimePartType => Boolean(value));
  if (activeFromMetadata?.length) {
    return {
      kind: metadata?.headCompositionKind ?? "registry_metadata",
      activePartTypes: new Set(["body", "head_optional", ...activeFromMetadata]),
    };
  }

  const exactPreset = partSet.characterIndex.find((entry) =>
    entry.characterId === selection.characterId &&
    sameUnit(entry.unit, selection.unit) &&
    entry.bodyCostume3dId === selection.bodyCostume3dId &&
    entry.headCostume3dId === selection.headCostume3dId &&
    entry.hairCostume3dId === selection.hairCostume3dId &&
    (entry.headOptionalCostume3dId ?? null) === (selection.headOptionalCostume3dId ?? null)
  );
  const head = runtimes.find((runtime) => normalizeRuntimePartType(runtime.part.partType) === "head");
  if (
    exactPreset &&
    head &&
    isCompleteHeadRuntime(head)
  ) {
    return {
      kind: metadata?.headCompositionKind ?? "complete_head",
      activePartTypes: new Set(["body", "head", "head_optional"]),
    };
  }

  return {
    kind: metadata?.headCompositionKind ?? "custom_head_hair",
    activePartTypes: new Set(["body", "head", "hair", "head_optional"]),
  };
}

function findHeadHairCompositionMetadata(
  compatibility: HeadHairCompatibility | null,
  selection: CustomPartSelection
) {
  if (!compatibility) {
    return null;
  }
  const matches = [
    ...(compatibility.rules ?? []),
    ...(compatibility.allowed ?? []),
  ].filter((entry) =>
    compatibilityKey(entry.unit, entry.headCostume3dId, entry.hairCostume3dId) ===
    compatibilityKey(selection.unit, selection.headCostume3dId, selection.hairCostume3dId)
  );
  return matches.find((entry) =>
    entry.headCompositionKind || entry.activeContributors?.length
  ) ?? null;
}

function filterRuntimeContributors(
  runtimes: PartRuntimePackage[],
  composition: HeadHairComposition
): PartRuntimePackage[] {
  return runtimes.filter((runtime) =>
    isRuntimeContributor(runtime, composition)
  );
}

function isRuntimeContributor(
  runtime: PartRuntimePackage,
  composition: HeadHairComposition
) {
  return composition.activePartTypes.has(normalizeRuntimePartType(runtime.part.partType));
}

function isCompleteHeadRuntime(runtime: PartRuntimePackage) {
  const type = readOptionalString(runtime.part.headCostume3dAssetbundleType);
  if (
    type &&
    !["head_and_hair", "head_all", "head_front", "head_back"].includes(type)
  ) {
    return false;
  }
  const rendererPaths = readRecordArray(runtime.nativeMeshes?.meshes)
    .map((mesh) => readOptionalString(mesh.rendererTransformPath));
  return rendererPaths.includes("face/Face") && rendererPaths.includes("face/Hair");
}

function resolveRuntimePartCharacterHeightMeters(characterId: number | string | null | undefined) {
  const normalized = String(characterId ?? "").padStart(2, "0");
  return characterHeightMetersById[normalized] ?? 1;
}

function readOptionalString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function composeRuntimeExtension(
  contributorRuntimes: PartRuntimePackage[],
  bodyAsset: BodyAssetManifest,
  headAsset: HeadAssetManifest,
  roleRuntime: RoleRuntimePackage | null
) {
  const runtimeSetup = mergeRuntimeSetup(contributorRuntimes);
  return {
    version: "0414",
    sourceKind: "viewer_composed_part_runtime_package",
    bodyAsset,
    headAsset,
    bodyManifest: bodyAsset,
    headManifest: headAsset,
    materialSlots: {
      body: bodyAsset.bodyMaterials,
      head: headAsset.faceMaterials,
      accessory: [],
    },
    textureRoles: contributorRuntimes.flatMap((runtime) => runtime.textureRoles ?? []),
    characterTextures: Object.assign({}, ...contributorRuntimes.map((runtime) => runtime.characterTextures ?? {})),
    nativeMeshes: mergeNativeMeshes(contributorRuntimes, runtimeSetup),
    motionPackage: roleRuntime?.motionPackage ?? null,
    morphChannelBindings: headAsset.morphChannelBindings ?? [],
    pjskSpringBone: {
      runtimeUnitySetup: runtimeSetup,
    },
    warnings: [
      ...contributorRuntimes.flatMap((runtime) => runtime.warnings ?? []),
      ...(roleRuntime?.warnings ?? []),
    ],
  };
}

function mergeRuntimeSetup(runtimes: PartRuntimePackage[]): RuntimeSetup {
  const remappedParts = runtimes.map((runtime, partIndex) => remapRuntimePart(runtime, partIndex));
  const firstSetup = remappedParts[0]?.setup ?? {};
  const prefabGraphs = remappedParts
    .map((part) => part.prefabGraph)
    .filter((value): value is RuntimePrefabGraph => value !== null);
  const warnings = runtimes.flatMap((runtime) => [
    ...(runtime.warnings ?? []),
    ...((runtime.springBone?.warnings as string[] | undefined) ?? []),
  ]);
  const activeRoots = uniqueStrings(remappedParts.flatMap((part) => part.activeRoots));
  const managers = remappedParts.flatMap((part) => part.managers);
  const bones = remappedParts.flatMap((part) => part.bones);
  const colliders = remappedParts.flatMap((part) => part.colliders);
  const constraints = remappedParts.flatMap((part) => part.constraints);
  const colliderBindings = rebuildColliderBindings(remappedParts);
  const managerColliderCaches = rebuildManagerColliderCaches(remappedParts, colliderBindings);
  const bindingDecisions = rebuildBindingDecisions(bones, colliderBindings);
  return {
    ...firstSetup,
    version: "0414",
    prefabGraphs,
    bodyHeadAssembly: firstSetup.bodyHeadAssembly ?? resolveComposedBodyHeadAssembly(prefabGraphs),
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
        "repair constraints after composition",
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
    constraintSetup: {
      version: "0414",
      sourceKind: "viewer_composed_part_runtime_package",
      constraints,
      warnings: uniqueStrings(remappedParts.flatMap((part) =>
        readStringArray(part.setup.constraintSetup?.warnings)
      )),
    },
    managerColliderCaches,
    warnings,
  };
}

function resolveComposedBodyHeadAssembly(prefabGraphs: unknown[]) {
  const parentAttachPath = resolveComposedBodyAttachPath(prefabGraphs);
  const childOriginPath = resolveComposedHeadOriginPath(prefabGraphs);
  if (
    !parentAttachPath ||
    !hasRuntimeSetupTransformPath(prefabGraphs, "face") ||
    !childOriginPath
  ) {
    return null;
  }
  return {
    version: "0414",
    sourceKind: "viewer_composed_part_runtime_package",
    parentRootPath: "body",
    parentAttachPath,
    childRootPath: "face",
    childOriginPath,
    runtimeMountPath: null,
    parentingMode: "model_combine_setup",
    coordinateSpace: "unity-left-handed",
    faceRendererName: "Face",
    combineNodeAName: "Neck",
    combineNodeBName: "Head",
    childMoveSuffix: "_target",
    parentCombineNodeAPath: parentAttachPath,
    parentCombineNodeBPath: `${parentAttachPath}/Head`,
    childCombineNodeAPath: childOriginPath,
    childCombineNodeBPath: `${childOriginPath}/Head`,
  };
}

function resolveComposedBodyAttachPath(prefabGraphs: unknown[]) {
  return [
    "body/Position/PositionOffset/Hip/Waist/Spine/Chest/Neck",
    "body/Position/Hip/Waist/Spine/Chest/Neck",
  ].find((path) => hasRuntimeSetupTransformPath(prefabGraphs, path)) ?? null;
}

function resolveComposedHeadOriginPath(prefabGraphs: unknown[]) {
  return [
    "face/Position/Hip/Waist/Spine/Chest/Neck",
    "face/Position",
  ].find((path) => hasRuntimeSetupTransformPath(prefabGraphs, path)) ?? null;
}

function hasRuntimeSetupTransformPath(prefabGraphs: unknown[], path: string) {
  return prefabGraphs.some((graph) =>
    readRecordArray((graph as Record<string, unknown>)?.transforms)
      .some((transform) => readOptionalString(transform.transformPath) === path)
  );
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
    constraintSetup: springBone.constraintSetup as RuntimeConstraintSetup | undefined,
  };
}

function remapRuntimePart(runtime: PartRuntimePackage, partIndex: number): RemappedRuntimePart {
  const setup = getPartRuntimeSetup(runtime);
  const partType = normalizeRuntimePartType(runtime.part.partType);
  const selectedActiveRoots = selectRuntimePartActiveRoots(
    partType,
    readStringArray(setup.activeRootProfile?.activeRoots)
  );
  const managers = filterRuntimeRecordsByActiveRoots(
    cloneArrayWithPartPrefix(setup.managers, partIndex, partType) as RuntimeManager[],
    selectedActiveRoots
  );
  const bones = filterRuntimeRecordsByActiveRoots(
    cloneArrayWithPartPrefix(setup.bones, partIndex, partType) as RuntimeBone[],
    selectedActiveRoots
  );
  const colliders = filterRuntimeRecordsByActiveRoots(
    cloneArrayWithPartPrefix(setup.colliders, partIndex, partType) as RuntimeCollider[],
    selectedActiveRoots
  );
  const colliderBindings = filterColliderBindingsByActiveBones(
    cloneArrayWithPartPrefix(setup.colliderBindings, partIndex, partType) as RuntimeColliderBinding[],
    bones
  );
  const managerColliderCaches = filterManagerColliderCachesByActiveManagers(
    cloneArrayWithPartPrefix(
    setup.managerColliderCaches,
    partIndex,
    partType
    ) as RuntimeManagerColliderCache[],
    managers
  );
  const constraints = remapRuntimeConstraints(setup.constraintSetup, partIndex, partType, selectedActiveRoots);
  withInferredSpringManagerBoneRefs(managers, bones, managerColliderCaches);
  return {
    runtime,
    partIndex,
    partType,
    setup,
    prefabGraph: remapPrefabGraph(runtime.springBone?.prefabGraph, partIndex),
    managers,
    bones,
    colliders,
    colliderBindings,
    managerColliderCaches,
    constraints,
    activeRoots: selectedActiveRoots,
  };
}

function selectRuntimePartActiveRoots(partType: RuntimePartType, activeRoots: string[]): string[] {
  if (partType === "body" && activeRoots.includes("body")) {
    return ["body"];
  }
  if ((partType === "head" || partType === "hair") && activeRoots.includes("face")) {
    return ["face"];
  }
  if (activeRoots.length) {
    return [activeRoots[0]];
  }
  return [partType === "body" ? "body" : "face"];
}

function filterRuntimeRecordsByActiveRoots<T extends { nodePath?: string | null; poseRoot?: string | null }>(
  records: T[],
  activeRoots: string[]
): T[] {
  const roots = new Set(activeRoots.map((root) => normalizeRootName(root)));
  return records.filter((record) => {
    const root = normalizeRootName(firstPathSegment(record.nodePath) ?? record.poseRoot);
    return roots.has(root);
  });
}

function filterColliderBindingsByActiveBones(
  bindings: RuntimeColliderBinding[],
  bones: RuntimeBone[]
): RuntimeColliderBinding[] {
  const activeBonePathIds = new Set(
    bones
      .map((bone) => bone.pathId)
      .filter((pathId): pathId is number => typeof pathId === "number")
  );
  return bindings.filter((binding) =>
    typeof binding.sourceSpringBonePathId !== "number" ||
    activeBonePathIds.has(binding.sourceSpringBonePathId)
  );
}

function filterManagerColliderCachesByActiveManagers(
  caches: RuntimeManagerColliderCache[],
  managers: RuntimeManager[]
): RuntimeManagerColliderCache[] {
  const activeManagerPathIds = new Set(
    managers
      .map((manager) => manager.pathId)
      .filter((pathId): pathId is number => typeof pathId === "number")
  );
  return caches.filter((cache) =>
    typeof cache.managerPathId !== "number" ||
    activeManagerPathIds.has(cache.managerPathId)
  );
}

function remapRuntimeConstraints(
  setup: RuntimeConstraintSetup | undefined,
  partIndex: number,
  partType: RuntimePartType,
  activeRoots: string[]
): RuntimeConstraint[] {
  const roots = new Set(activeRoots.map((root) => normalizeRootName(root)));
  return (cloneArrayWithPartPrefix(setup?.constraints, partIndex, partType) as RuntimeConstraint[])
    .map((constraint) => {
      const sources = readRecordArray(constraint.sources).map((source) => {
        const cloned = { ...source } as RuntimeConstraintSource;
        if (typeof cloned.sourcePathId === "number") {
          cloned.sourcePathId = remapNumericId(cloned.sourcePathId, partIndex);
        }
        return cloned;
      });
      if (typeof constraint.worldUpObjectPathId === "number") {
        constraint.worldUpObjectPathId = remapNumericId(constraint.worldUpObjectPathId, partIndex);
      }
      return { ...constraint, sources };
    })
    .filter((constraint) => {
      const ownerRoot = normalizeRootName(firstPathSegment(constraint.ownerPath));
      const sourceRoots = readRecordArray(constraint.sources)
        .map((source) => normalizeRootName(firstPathSegment(readOptionalString(source.sourcePath))));
      return (!ownerRoot || roots.has(ownerRoot)) &&
        sourceRoots.every((sourceRoot) => !sourceRoot || roots.has(sourceRoot));
    });
}

function remapPrefabGraph(value: unknown, partIndex: number): RuntimePrefabGraph | null {
  if (!isRecord(value)) {
    return null;
  }
  const graph = { ...value } as RuntimePrefabGraph;
  graph.runtimePartIndex = partIndex;
  graph.transforms = readRecordArray(value.transforms).map((entry) => {
    const cloned = { ...entry, runtimePartIndex: partIndex } as RuntimePrefabTransform;
    if (typeof cloned.pathId === "number") {
      cloned.pathId = remapNumericId(cloned.pathId, partIndex);
    }
    if (typeof cloned.parentPathId === "number") {
      cloned.parentPathId = remapNumericId(cloned.parentPathId, partIndex);
    }
    if (Array.isArray(cloned.childPathIds)) {
      cloned.childPathIds = cloned.childPathIds.map((id) =>
        typeof id === "number" ? remapNumericId(id, partIndex) : id
      );
    }
    return cloned;
  });
  graph.monoBehaviours = readRecordArray(value.monoBehaviours).map((entry) => {
    const cloned = { ...entry, runtimePartIndex: partIndex } as RuntimePrefabMonoBehaviour;
    if (typeof cloned.pathId === "number") {
      cloned.pathId = remapNumericId(cloned.pathId, partIndex);
    }
    return cloned;
  });
  return graph;
}

function withInferredSpringManagerBoneRefs(
  managers: RuntimeManager[],
  bones: RuntimeBone[],
  managerColliderCaches: RuntimeManagerColliderCache[]
) {
  const bonesByManagerPathId = new Map<number, number[]>();
  for (const manager of managers) {
    const managerPath = manager.nodePath;
    const inferredBonePathIds = bones
      .filter((bone) => isSameOrDescendantRuntimePath(bone.nodePath, managerPath))
      .map((bone) => bone.pathId)
      .filter((pathId): pathId is number => typeof pathId === "number");
    if (!inferredBonePathIds.length) {
      continue;
    }
    if (!Array.isArray(manager.bonePathIds) || manager.bonePathIds.length === 0) {
      manager.bonePathIds = inferredBonePathIds;
    }
    if (typeof manager.pathId === "number") {
      bonesByManagerPathId.set(manager.pathId, inferredBonePathIds);
    }
  }

  for (const cache of managerColliderCaches) {
    if (Array.isArray(cache.springBonePathIds) && cache.springBonePathIds.length > 0) {
      continue;
    }
    const inferredBonePathIds = typeof cache.managerPathId === "number"
      ? bonesByManagerPathId.get(cache.managerPathId)
      : undefined;
    if (inferredBonePathIds?.length) {
      cache.springBonePathIds = inferredBonePathIds;
    }
  }
}

function isSameOrDescendantRuntimePath(
  childPath: string | null | undefined,
  parentPath: string | null | undefined
) {
  if (!childPath || !parentPath) {
    return false;
  }
  return childPath === parentPath || childPath.startsWith(`${parentPath}/`);
}

function cloneArrayWithPartPrefix<T = unknown>(
  value: unknown,
  partIndex: number,
  partType: RuntimePartType
): T[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry) => {
    if (!isRecord(entry)) {
      return entry;
    }
    const cloned = { ...entry };
    cloned.runtimePartIndex = partIndex;
    cloned.runtimePartType = partType;
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
      if (binding.sourceKind === "deferred_body_colliderFlag" && part.partType !== "body") {
        return rebuildDeferredColliderFlagBinding(binding, bodyColliders);
      }
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

function rebuildDeferredColliderFlagBinding(
  binding: RuntimeColliderBinding,
  bodyColliders: RuntimeCollider[]
): RuntimeColliderBinding {
  const selected = selectBodyCollidersForColliderFlag(binding, bodyColliders);
  return {
    ...binding,
    sourceKind: "colliderFlag",
    originalSourceKind: "deferred_body_colliderFlag",
    collidersByRoot: selected.byRoot,
    defaultRoot: selected.defaultRoot,
    colliders: selected.indexes,
    sourceColliderPathIds: selected.indexes
      .map((index) => bodyColliders.find((collider) => collider.index === index)?.pathId)
      .filter((pathId): pathId is number => typeof pathId === "number"),
    rebindReason: "viewer_composed_deferred_body_colliderFlag",
  };
}

function selectBodyCollidersForColliderFlag(
  binding: RuntimeColliderBinding,
  bodyColliders: RuntimeCollider[]
): { byRoot: Record<string, number[]>; defaultRoot: string; indexes: number[] } {
  const matchedPrefixes = readStringArray(binding.matchedPrefixes);
  const colliders = bodyColliders.filter((collider) =>
    typeof collider.index === "number" &&
    matchesColliderFlagPrefix(collider, matchedPrefixes)
  );
  const byRoot = collidersByRoot(colliders);
  const defaultRoot = hasColliderRoots(byRoot)
    ? firstColliderRoot(byRoot).root
    : normalizeRootName(binding.defaultRoot ?? "body");
  return {
    byRoot,
    defaultRoot,
    indexes: byRoot[defaultRoot] ?? [],
  };
}

function matchesColliderFlagPrefix(collider: RuntimeCollider, matchedPrefixes: string[]) {
  if (!matchedPrefixes.length) {
    return false;
  }
  const nodeName = readOptionalString(collider.nodeName);
  return matchedPrefixes.some((prefix) => nodeName.startsWith(prefix));
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

function rebuildManagerColliderCaches(
  parts: RemappedRuntimePart[],
  colliderBindings: RuntimeColliderBinding[]
): RuntimeManagerColliderCache[] {
  const colliderByIndex = new Map(
    parts
      .flatMap((part) => part.colliders)
      .filter((collider) => typeof collider.index === "number")
      .map((collider) => [collider.index as number, collider])
  );
  return parts.flatMap((part) =>
    part.managerColliderCaches.map((cache) =>
      part.partType === "head" || part.partType === "hair"
        ? rebuildHeadManagerColliderCache(cache, colliderBindings, colliderByIndex)
        : filterManagerCache(cache, colliderByIndex)
    )
  );
}

function rebuildHeadManagerColliderCache(
  cache: RuntimeManagerColliderCache,
  colliderBindings: RuntimeColliderBinding[],
  colliderByIndex: ReadonlyMap<number, RuntimeCollider>
): RuntimeManagerColliderCache {
  const springBonePathIds = new Set(readNumberArray(cache.springBonePathIds));
  const selectedIndexes = uniqueNumbers(
    colliderBindings
      .filter((binding) =>
        typeof binding.sourceSpringBonePathId === "number" &&
        springBonePathIds.has(binding.sourceSpringBonePathId) &&
        binding.sourceKind === "colliderFlag"
      )
      .flatMap((binding) => readNumberArray(binding.colliders))
      .filter((index) => colliderByIndex.has(index))
  );
  if (!selectedIndexes.length) {
    return filterManagerCache(cache, colliderByIndex);
  }
  return {
    ...cache,
    sphereColliderIndexes: selectedIndexes.filter((index) =>
      readOptionalString(colliderByIndex.get(index)?.scriptName).includes("Sphere")
    ),
    capsuleColliderIndexes: selectedIndexes.filter((index) =>
      readOptionalString(colliderByIndex.get(index)?.scriptName).includes("Capsule")
    ),
    panelColliderIndexes: selectedIndexes.filter((index) =>
      readOptionalString(colliderByIndex.get(index)?.scriptName).includes("Panel")
    ),
    reason: "viewer_composed_head_body_collider_cache",
  };
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

function mergeNativeMeshes(runtimes: PartRuntimePackage[], runtimeSetup: RuntimeSetup) {
  const warnings = runtimes.flatMap((runtime) => runtime.warnings ?? []);
  const meshes: Record<string, unknown>[] = [];
  const optionalMeshKeys = new Set<string>();
  const headOptionalFaceId = resolveHeadOptionalFaceId(runtimes);
  for (const runtime of runtimes) {
    const partType = normalizeRuntimePartType(runtime.part.partType);
    for (const mesh of readRecordArray(runtime.nativeMeshes?.meshes)) {
      if (partType !== "head_optional") {
        meshes.push(mesh);
        continue;
      }

      const sourceRendererTransformPath = readOptionalString(mesh.rendererTransformPath);
      const attachPath = resolveHeadOptionalAttachPath(
        readOptionalString(runtime.mount?.attachNode),
        runtimeSetup,
        sourceRendererTransformPath
      );
      if (!attachPath) {
        warnings.push(
          `Head optional mesh '${readOptionalString(mesh.meshPath) || readOptionalString(mesh.meshName) || "<unnamed>"}' kept at '${sourceRendererTransformPath || "<missing>"}': attach node '${readOptionalString(runtime.mount?.attachNode) || "<missing>"}' was not found in composed head graph.`
        );
        meshes.push(mesh);
        continue;
      }

      const dedupeKey = [
        readOptionalString(mesh.meshName),
        readOptionalString(mesh.meshPath),
        readRecordArray(mesh.submeshes).map((submesh) => readOptionalString(submesh.materialKey)).join(","),
      ].join("|");
      if (optionalMeshKeys.has(dedupeKey)) {
        warnings.push(
          `Head optional duplicate native mesh '${readOptionalString(mesh.meshPath) || readOptionalString(mesh.meshName) || "<unnamed>"}' skipped after mount remap.`
        );
        continue;
      }
      optionalMeshKeys.add(dedupeKey);
      const adjustment = resolveAccessoryTransformAdjustment(runtime, headOptionalFaceId);
      if (hasAccessoryTransformAdjustments(runtime) && !headOptionalFaceId) {
        warnings.push(
          `Head optional mesh '${readOptionalString(mesh.meshPath) || readOptionalString(mesh.meshName) || "<unnamed>"}' kept without accessory transform adjustment: face id could not be resolved from the active head package.`
        );
      }
      meshes.push({
        ...applyAccessoryTransformAdjustment(mesh, adjustment),
        sourceRendererTransformPath,
        rendererTransformPath: attachPath,
      });
    }
  }
  return {
    version: "0414",
    meshes,
    warnings,
  };
}

function resolveHeadOptionalFaceId(runtimes: PartRuntimePackage[]) {
  const candidates = [
    ...runtimes.filter((runtime) => normalizeRuntimePartType(runtime.part.partType) === "head"),
    ...runtimes.filter((runtime) => normalizeRuntimePartType(runtime.part.partType) === "hair"),
    ...runtimes.filter((runtime) => normalizeRuntimePartType(runtime.part.partType) !== "head_optional"),
  ];
  for (const runtime of candidates) {
    const fromBundle = extractFaceIdFromBundlePath(readOptionalString(runtime.source?.bundlePath));
    if (fromBundle) {
      return fromBundle;
    }
    const fromModelName = extractFaceIdFromBundlePath(readOptionalString(runtime.part.modelAssetbundleName));
    if (fromModelName) {
      return fromModelName;
    }
  }
  return null;
}

function extractFaceIdFromBundlePath(value: string) {
  const normalized = value.replace(/\\/g, "/").replace(/\.bundle$/i, "");
  const match = normalized.match(/(?:^|\/)face\/([^/]+)\/([^/]+)$/i);
  if (!match) {
    return null;
  }
  return `${match[1]}/${match[2]}`;
}

function hasAccessoryTransformAdjustments(runtime: PartRuntimePackage) {
  return Object.keys(readAccessoryTransformAdjustments(runtime)).length > 0;
}

function resolveAccessoryTransformAdjustment(
  runtime: PartRuntimePackage,
  faceId: string | null
): AccessoryTransformAdjustment | null {
  if (!faceId) {
    return null;
  }
  const adjustments = readAccessoryTransformAdjustments(runtime);
  const adjustment = adjustments[faceId];
  return isRecord(adjustment) ? adjustment as AccessoryTransformAdjustment : null;
}

function readAccessoryTransformAdjustments(runtime: PartRuntimePackage) {
  return asRecord(runtime.mount?.accessoryTransformAdjustments);
}

function applyAccessoryTransformAdjustment(
  mesh: Record<string, unknown>,
  adjustment: AccessoryTransformAdjustment | null
) {
  if (!adjustment) {
    return mesh;
  }
  const position = readVectorLike(adjustment.position, 0, 0, 0);
  const rotation = readVectorLike(adjustment.rotationEulerDegrees, 0, 0, 0);
  const scale = readVectorLike(adjustment.scale, 1, 1, 1);
  const matrix = buildEulerRotationMatrix(
    degreesToRadians(rotation.x),
    degreesToRadians(rotation.y),
    degreesToRadians(rotation.z)
  );
  const transformed = { ...mesh };
  const positions = readStrictNumberArray(mesh.positions);
  if (positions) {
    transformed.positions = transformVectorArray(positions, matrix, scale, position, true);
  }
  const normals = readStrictNumberArray(mesh.normals);
  if (normals) {
    transformed.normals = transformVectorArray(normals, matrix, inverseScale(scale), { x: 0, y: 0, z: 0 }, false);
  }
  return transformed;
}

function readStrictNumberArray(value: unknown) {
  return Array.isArray(value) && value.every((entry) => typeof entry === "number")
    ? value
    : null;
}

function readVectorLike(
  value: unknown,
  defaultX: number,
  defaultY: number,
  defaultZ: number
) {
  const record = asRecord(value);
  return {
    x: readNumber(record.x ?? record.X, defaultX),
    y: readNumber(record.y ?? record.Y, defaultY),
    z: readNumber(record.z ?? record.Z, defaultZ),
  };
}

function readNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function degreesToRadians(value: number) {
  return value * Math.PI / 180;
}

function inverseScale(scale: { x: number; y: number; z: number }) {
  return {
    x: Math.abs(scale.x) > 0.000001 ? 1 / scale.x : 1,
    y: Math.abs(scale.y) > 0.000001 ? 1 / scale.y : 1,
    z: Math.abs(scale.z) > 0.000001 ? 1 / scale.z : 1,
  };
}

function buildEulerRotationMatrix(rx: number, ry: number, rz: number) {
  const cx = Math.cos(rx);
  const sx = Math.sin(rx);
  const cy = Math.cos(ry);
  const sy = Math.sin(ry);
  const cz = Math.cos(rz);
  const sz = Math.sin(rz);
  return [
    cy * cz,
    sx * sy * cz - cx * sz,
    cx * sy * cz + sx * sz,
    cy * sz,
    sx * sy * sz + cx * cz,
    cx * sy * sz - sx * cz,
    -sy,
    sx * cy,
    cx * cy,
  ] as const;
}

function transformVectorArray(
  values: number[],
  matrix: readonly number[],
  scale: { x: number; y: number; z: number },
  translation: { x: number; y: number; z: number },
  includeTranslation: boolean
) {
  const result = values.slice();
  for (let index = 0; index + 2 < result.length; index += 3) {
    const x = result[index] * scale.x;
    const y = result[index + 1] * scale.y;
    const z = result[index + 2] * scale.z;
    result[index] = matrix[0] * x + matrix[1] * y + matrix[2] * z + (includeTranslation ? translation.x : 0);
    result[index + 1] = matrix[3] * x + matrix[4] * y + matrix[5] * z + (includeTranslation ? translation.y : 0);
    result[index + 2] = matrix[6] * x + matrix[7] * y + matrix[8] * z + (includeTranslation ? translation.z : 0);
    if (!includeTranslation) {
      const length = Math.hypot(result[index], result[index + 1], result[index + 2]);
      if (length > 0.000001) {
        result[index] /= length;
        result[index + 1] /= length;
        result[index + 2] /= length;
      }
    }
  }
  return result;
}

function resolveHeadOptionalAttachPath(
  attachNode: string | null | undefined,
  runtimeSetup: RuntimeSetup,
  sourceRendererTransformPath?: string | null
): string | null {
  const candidates = collectRuntimeSetupTransformPaths(runtimeSetup);
  const requested = normalizePathSegment(attachNode) || normalizePathSegment(sourceRendererTransformPath);
  if (!requested) {
    return null;
  }
  const exact = candidates.find((path) => path === requested);
  if (exact) {
    return exact;
  }
  const byLeaf = candidates
    .filter((path) => path.split("/").filter(Boolean).pop() === requested)
    .sort((left, right) => attachPathPriority(left) - attachPathPriority(right) || left.localeCompare(right));
  return byLeaf[0] ?? null;
}

function collectRuntimeSetupTransformPaths(runtimeSetup: RuntimeSetup): string[] {
  return uniqueStrings(readRecordArray(runtimeSetup.prefabGraphs).flatMap((graph) =>
    readRecordArray(graph.transforms).map((transform) =>
      readOptionalString(transform.transformPath)
    )
  ).filter(Boolean));
}

function normalizePathSegment(value: string | null | undefined): string | null {
  const normalized = value?.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? "";
  return normalized || null;
}

function attachPathPriority(path: string): number {
  const root = firstPathSegment(path);
  if (root === "body" || root === "sit_body" || root === "guitar_body") {
    return 0;
  }
  if (path.startsWith("face/Position/")) {
    return 1;
  }
  if (path.startsWith("face/")) {
    return 2;
  }
  return 10;
}

type MaterialSlotWithTextures = {
  mainTex?: string | null;
  shadowTex?: string | null;
  valueTex?: string | null;
  faceShadowTex?: string | null;
};

function mergeMaterialSlots<T extends MaterialSlotWithTextures>(
  base: T[] | undefined,
  runtimes: PartRuntimePackage[],
  resolveUrl: (path: string) => string
): T[] {
  const exported = runtimes.flatMap((runtime) => {
    const resolvePartUrl = createPartUrlResolver(runtime, resolveUrl);
    return ((runtime.materialSlots ?? []) as T[]).map((slot) =>
      resolveMaterialSlotTextureUrls(slot, resolvePartUrl)
    );
  });
  if (exported.length) {
    return exported;
  }
  const resolveFallbackUrl = runtimes[0] ? createPartUrlResolver(runtimes[0], resolveUrl) : resolveUrl;
  return [...(base ?? [])].map((slot) =>
    resolveMaterialSlotTextureUrls(slot, resolveFallbackUrl)
  );
}

function resolveMaterialSlotTextureUrls<T extends MaterialSlotWithTextures>(
  slot: T,
  resolveUrl: (path: string) => string
): T {
  return {
    ...slot,
    mainTex: resolveMaybeUrl(slot.mainTex ?? undefined, resolveUrl) ?? slot.mainTex,
    shadowTex: resolveMaybeUrl(slot.shadowTex ?? undefined, resolveUrl) ?? slot.shadowTex,
    valueTex: resolveMaybeUrl(slot.valueTex ?? undefined, resolveUrl) ?? slot.valueTex,
    faceShadowTex: resolveMaybeUrl(slot.faceShadowTex ?? undefined, resolveUrl) ?? slot.faceShadowTex,
  };
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

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
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

function uniqueNumbers(values: number[]) {
  return [...new Set(values)].sort((left, right) => left - right);
}

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
  colorId?: number | null;
  colorName?: string | null;
  costume3dGroupId?: number | null;
  modelAssetbundleName?: string | null;
  headCostume3dAssetbundleType?: string | null;
  bundlePath?: string | null;
  colorVariationBundlePath?: string | null;
  baseSourceKey?: string | null;
  sourceKey?: string | null;
  sourcePackagePath?: string | null;
  packagePath: string;
  status?: string;
  warnings?: string[] | null;
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

const deniedHeadHairCompatibilityKeys = new WeakMap<HeadHairCompatibility, ReadonlySet<string>>();

export type PartRuntimePackage = {
  version: string;
  corePath?: string;
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
  headPackagePath?: string | null;
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
  raw?: {
    body?: { extraBones?: RuntimeExtraBone[] };
    head?: { extraBones?: RuntimeExtraBone[] };
  };
  rootSelectionProfile?: Record<string, unknown>;
  setupPlan?: Record<string, unknown>;
  activeRootProfile?: Record<string, unknown>;
  bindingDecisions?: RuntimeBindingDecision[];
  managers?: RuntimeManager[];
  bones?: RuntimeBone[];
  extraBones?: RuntimeExtraBone[];
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
  gameObjectPathId?: number | null;
  name?: string | null;
  transformPath?: string | null;
  parentPathId?: number | null;
  childPathIds?: number[];
  localPosition?: VectorLike | null;
  localRotation?: QuaternionLike | null;
  localScale?: VectorLike | null;
  runtimePartIndex?: number;
};

type RuntimePrefabMonoBehaviour = Record<string, unknown> & {
  pathId?: number;
  scriptName?: string | null;
  transformPath?: string | null;
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

type QuaternionLike = {
  x?: number;
  y?: number;
  z?: number;
  w?: number;
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

type RuntimeObjectRef = Record<string, unknown> & {
  pathId?: number;
  PathId?: number;
  transformPath?: string | null;
  TransformPath?: string | null;
};

type RuntimeExtraBone = Record<string, unknown> & {
  pathId?: number;
  PathId?: number;
  gameObject?: RuntimeObjectRef | null;
  GameObject?: RuntimeObjectRef | null;
  referenceBone?: RuntimeObjectRef | null;
  ReferenceBone?: RuntimeObjectRef | null;
  nodePath?: string | null;
  poseRoot?: string | null;
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
  extraBones: RuntimeExtraBone[];
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

export function runtimePartSlot(part: {
  partType: RuntimePartType | string;
  headCostume3dAssetbundleType?: string | null;
}): RuntimePartType {
  const slot = normalizeRuntimePartType(part.partType);
  if (
    (slot === "head" || slot === "head_optional") &&
    isCompleteHeadCostumeType(part.headCostume3dAssetbundleType)
  ) {
    return "head";
  }
  if (
    slot === "head" &&
    isAccessoryHeadCostumeType(part.headCostume3dAssetbundleType)
  ) {
    return "head_optional";
  }
  return slot;
}

export function tryRuntimePartSlot(part: {
  partType: RuntimePartType | string;
  headCostume3dAssetbundleType?: string | null;
}): RuntimePartType | null {
  try {
    return runtimePartSlot(part);
  } catch {
    return null;
  }
}

function isCompleteHeadCostumeType(value: string | null | undefined) {
  const type = (value ?? "").trim().toLowerCase();
  return type === "head_and_hair";
}

function isAccessoryHeadCostumeType(value: string | null | undefined) {
  const type = (value ?? "").trim().toLowerCase();
  return type === "head_only" ||
    type === "head_all" ||
    type === "head_front" ||
    type === "head_back";
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
    hasLoadedHeadPart(partSet, entry.characterId, entry.unit ?? null, entry.headCostume3dId) &&
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
      headPackagePath: uniqueHeadPackagePath(
        partSet,
        preset.characterId,
        preset.unit ?? null,
        headCostume3dId
      ),
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
    headPackagePath: head.packagePath,
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
    .filter((entry) => tryRuntimePartSlot(entry) === partType)
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
  const hair = requirePart(partSet, selection.characterId, selection.unit, "hair", selection.hairCostume3dId);
  const selectedHeadEntry = resolveHeadRegistryEntry(partSet, selection);
  const resolvedSelection = {
    ...selection,
    headPackagePath: selectedHeadEntry.packagePath,
  };
  const selectedHead = resolveHeadRuntime(partSet, resolvedSelection, selectedHeadEntry);
  const head = selectedHead && runtimePartSlot(selectedHead.part) === "head" ? selectedHead : hair;
  const accessory = selectedHead && runtimePartSlot(selectedHead.part) === "head_optional" ? selectedHead : null;
  const optional = resolveOptionalHeadRuntime(partSet, selection);

  assertPartRuntimeProxyMetadata(body, "body");
  if (head) {
    assertPartRuntimeProxyMetadata(head, "head");
  }
  assertSameRole(selection.characterId, selection.unit, [body, head, accessory, optional].filter(Boolean) as PartRuntimePackage[]);
  assertHeadHairCompatible(partSet.compatibility, resolvedSelection, runtimePartSlot(selectedHeadEntry));
  const allRuntimes = [body, head, accessory, optional].filter(Boolean) as PartRuntimePackage[];
  const headHairComposition = resolveHeadHairComposition(selectedHeadEntry);
  const contributingRuntimes = filterRuntimeContributors(allRuntimes, headHairComposition);

  const roleRuntime = partSet.roleRuntimes.get(selectionRoleId) ?? null;
  const bodyManifest = normalizeBodyManifestFromPart(body, resolveUrl);
  applyRoleRuntimeMotion(bodyManifest, roleRuntime);
  const headManifest = normalizeHeadManifestFromParts(
    filterRuntimeContributors([head, accessory, optional].filter(Boolean) as PartRuntimePackage[], headHairComposition),
    resolvedSelection,
    resolveUrl
  );
  const runtimeExtension = composeRuntimeExtension(
    contributingRuntimes,
    bodyManifest,
    headManifest,
    roleRuntime
  );

  return {
    id: `custom-${selectionRoleId}-${selection.bodyCostume3dId}-${selection.headCostume3dId}-${encodeURIComponent(resolvedSelection.headPackagePath)}-${selection.hairCostume3dId}-${selection.headOptionalCostume3dId ?? "none"}`,
    displayName: `Custom ${selectionRoleId}`,
    meshUrl: "",
    unityRuntimeJsonUrl: `haruki-composed://role-${selectionRoleId}/unity-runtime.msgpack.br`,
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
    tryRuntimePartSlot(entry) === partType &&
    (characterId === undefined || entry.characterId === characterId) &&
    (unit === undefined || sameUnit(entry.unit, unit)) &&
    entry.status !== "missing" &&
    partSet.packages.has(entry.packagePath)
  );
}

function findFirstCompatibleLoadedHeadHair(partSet: PartPackageSet, characterId: number, unit: string | null) {
  const allHeadCandidates = [
    ...listSelectableParts(partSet, characterId, "head", { unit, loadedOnly: false }),
    ...listSelectableParts(partSet, characterId, "head_optional", { unit, loadedOnly: false }),
  ];
  const loadedHeadCandidates = [
    ...listSelectableParts(partSet, characterId, "head", { unit, loadedOnly: true }),
    ...listSelectableParts(partSet, characterId, "head_optional", { unit, loadedOnly: true })
      .filter((entry) => !isEmptyHeadOptionalEntry(entry)),
  ];
  const identitiesByRawId = new Map<number, Set<string>>();
  for (const entry of allHeadCandidates) {
    const identities = identitiesByRawId.get(entry.costume3dId) ?? new Set<string>();
    identities.add(`${runtimePartSlot(entry)}|${entry.packagePath}`);
    identitiesByRawId.set(entry.costume3dId, identities);
  }
  const heads = loadedHeadCandidates
    .filter((entry) => identitiesByRawId.get(entry.costume3dId)?.size === 1)
    .sort((left, right) =>
      left.costume3dId - right.costume3dId || left.packagePath.localeCompare(right.packagePath)
    );
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
        assertHeadHairCompatible(partSet.compatibility, selection, runtimePartSlot(head));
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

function hasLoadedHeadPart(
  partSet: PartPackageSet,
  characterId: number,
  unit: string | null | undefined,
  costume3dId: number
) {
  return hasLoadedPart(partSet, characterId, unit, "head", costume3dId) ||
    hasLoadedPart(partSet, characterId, unit, "head_optional", costume3dId);
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
  const entry = findRegistryPart(partSet, characterId, unit, partType, costume3dId);
  if (!entry) {
    throw new Error(`Missing ${partType} registry entry for role ${runtimeRoleId(characterId, unit)}, costume3dId ${costume3dId}.`);
  }
  if (!partSet.packages.has(entry.packagePath)) {
    throw new Error(`Missing loaded ${partType} package for role ${runtimeRoleId(characterId, unit)}, ${partRegistryDiagnostic(entry)}.`);
  }
  const runtime = partSet.packages.get(entry.packagePath);
  return withRegistryEntryRuntimeMetadata(runtime!, entry);
}

export function resolveHeadRegistryEntry(
  partSet: PartPackageSet,
  selection: CustomPartSelection
): PartRegistryEntry {
  const requestedPackagePath = selection.headPackagePath?.trim() || null;
  const candidates = partSet.registry
    .filter((candidate) =>
      candidate.characterId === selection.characterId &&
      sameUnit(candidate.unit, selection.unit) &&
      candidate.costume3dId === selection.headCostume3dId &&
      ["head", "head_optional"].includes(tryRuntimePartSlot(candidate) ?? "") &&
      isUsableRegistryEntry(candidate) &&
      (requestedPackagePath === null || candidate.packagePath === requestedPackagePath)
    )
    .sort((left, right) => {
      const packageOrder = left.packagePath.localeCompare(right.packagePath);
      return packageOrder !== 0
        ? packageOrder
        : runtimePartSlot(left).localeCompare(runtimePartSlot(right));
    });

  if (candidates.length === 0) {
    const packageDiagnostic = requestedPackagePath
      ? `, packagePath ${requestedPackagePath}`
      : "";
    throw new Error(
      `Missing head registry entry for role ${runtimeRoleId(selection.characterId, selection.unit)}, costume3dId ${selection.headCostume3dId}${packageDiagnostic}.`
    );
  }

  const identities = new Set(
    candidates.map((candidate) => `${runtimePartSlot(candidate)}|${candidate.packagePath}`)
  );
  if (identities.size > 1) {
    const diagnostic = candidates
      .map((candidate) => `${runtimePartSlot(candidate)}:${candidate.packagePath}`)
      .join(", ");
    throw new Error(
      `Ambiguous head registry entry for role ${runtimeRoleId(selection.characterId, selection.unit)}, costume3dId ${selection.headCostume3dId}; specify headPackagePath. Candidates: ${diagnostic}.`
    );
  }
  return candidates[0]!;
}

function resolveHeadRuntime(
  partSet: PartPackageSet,
  selection: CustomPartSelection,
  entry = resolveHeadRegistryEntry(partSet, selection)
): PartRuntimePackage | null {
  if (isEmptyHeadOptionalEntry(entry)) {
    return null;
  }
  if (!partSet.packages.has(entry.packagePath)) {
    throw new Error(`Missing loaded head package for role ${runtimeRoleId(selection.characterId, selection.unit)}, ${partRegistryDiagnostic(entry)}.`);
  }
  return withRegistryEntryRuntimeMetadata(partSet.packages.get(entry.packagePath)!, entry);
}

function resolveOptionalHeadRuntime(
  partSet: PartPackageSet,
  selection: CustomPartSelection
): PartRuntimePackage | null {
  const entry = resolveOptionalHeadRegistryEntry(partSet, selection);
  if (!entry) {
    return null;
  }
  if (isEmptyHeadOptionalEntry(entry)) {
    return null;
  }
  if (!partSet.packages.has(entry.packagePath)) {
    throw new Error(`Missing loaded head_optional package for role ${runtimeRoleId(selection.characterId, selection.unit)}, ${partRegistryDiagnostic(entry)}.`);
  }
  return withRegistryEntryRuntimeMetadata(partSet.packages.get(entry.packagePath)!, entry);
}

export function resolveOptionalHeadRegistryEntry(
  partSet: PartPackageSet,
  selection: CustomPartSelection
): PartRegistryEntry | null {
  if (!selection.headOptionalCostume3dId) {
    return null;
  }
  const candidates = partSet.registry
    .filter((candidate) =>
      candidate.characterId === selection.characterId &&
      sameUnit(candidate.unit, selection.unit) &&
      candidate.costume3dId === selection.headOptionalCostume3dId &&
      tryRuntimePartSlot(candidate) === "head_optional" &&
      isUsableRegistryEntry(candidate)
    )
    .sort((left, right) => left.packagePath.localeCompare(right.packagePath));
  if (candidates.length === 0) {
    throw new Error(`Missing head_optional registry entry for role ${runtimeRoleId(selection.characterId, selection.unit)}, costume3dId ${selection.headOptionalCostume3dId}.`);
  }
  const packagePaths = new Set(candidates.map((candidate) => candidate.packagePath));
  if (packagePaths.size > 1) {
    throw new Error(
      `Ambiguous head_optional registry entry for role ${runtimeRoleId(selection.characterId, selection.unit)}, costume3dId ${selection.headOptionalCostume3dId}; the legacy selector cannot identify one original source. Candidates: ${[...packagePaths].join(", ")}.`
    );
  }
  return candidates[0]!;
}

function partRegistryDiagnostic(entry: PartRegistryEntry) {
  const details = [
    `costume3dId ${entry.costume3dId}`,
    `partType ${runtimePartSlot(entry)}`,
    `packagePath ${entry.packagePath}`,
  ];
  if (entry.bundlePath) {
    details.push(`bundlePath ${entry.bundlePath}`);
  }
  if (entry.colorVariationBundlePath) {
    details.push(`colorVariationBundlePath ${entry.colorVariationBundlePath}`);
  }
  const firstWarning = entry.warnings?.[0];
  if (firstWarning) {
    details.push(`warning ${firstWarning}`);
  }
  return details.join(", ");
}

function withRegistryEntryRuntimeMetadata(
  runtime: PartRuntimePackage,
  entry: PartRegistryEntry
): PartRuntimePackage {
  const partType = tryRuntimePartSlot(entry) ?? runtime.part.partType;
  const manifest = isRecord(runtime.manifest)
    ? cloneRecord(runtime.manifest)
    : runtime.manifest;
  if (isRecord(manifest)) {
    manifest.id = `${partType}-${entry.characterId}-${entry.costume3dId}-${entry.unit ?? "default"}`;
    manifest.displayName = entry.name ?? readOptionalString(manifest.displayName) ?? manifest.id;
    manifest.characterId = String(entry.characterId).padStart(2, "0");
    if (typeof manifest.characterHeightMeters !== "number" || manifest.characterHeightMeters <= 0) {
      throw new Error(`Part runtime ${entry.packagePath} is missing characterHeightMeters.`);
    }
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
      tryRuntimePartSlot(candidate) === partType &&
      isUsableRegistryEntry(candidate)
  );
}

function uniqueHeadPackagePath(
  partSet: PartPackageSet,
  characterId: number,
  unit: string | null | undefined,
  costume3dId: number
): string | null {
  const packagePaths = new Set(
    partSet.registry
      .filter((candidate) =>
        candidate.characterId === characterId &&
        sameUnit(candidate.unit, unit) &&
        candidate.costume3dId === costume3dId &&
        ["head", "head_optional"].includes(tryRuntimePartSlot(candidate) ?? "") &&
        isUsableRegistryEntry(candidate)
      )
      .map((candidate) => candidate.packagePath)
  );
  return packagePaths.size === 1 ? [...packagePaths][0]! : null;
}

function isUsableRegistryEntry(entry: PartRegistryEntry) {
  return entry.status !== "missing";
}

function isEmptyHeadOptionalEntry(entry: PartRegistryEntry) {
  return entry.status === "empty" &&
    tryRuntimePartSlot(entry) === "head_optional";
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
  selection: CustomPartSelection,
  selectedHeadSlot?: RuntimePartType
) {
  if (!compatibility) {
    return;
  }
  if (selection.origin === "official_preset") {
    return;
  }
  if (selectedHeadSlot === "head") {
    return;
  }
  const key = headHairCompatibilityKey(selection.unit, selection.headCostume3dId, selection.hairCostume3dId);
  const deniedKeys = getDeniedHeadHairCompatibilityKeys(compatibility);
  if (deniedKeys.has(key)) {
    throw new Error(`Head ${selection.headCostume3dId} and hair ${selection.hairCostume3dId} are not available together.`);
  }
}

export function getDeniedHeadHairCompatibilityKeys(compatibility: HeadHairCompatibility | null): ReadonlySet<string> {
  if (!compatibility) {
    return new Set<string>();
  }
  const cached = deniedHeadHairCompatibilityKeys.get(compatibility);
  if (cached) {
    return cached;
  }
  const keys = new Set(
    [
      ...(compatibility.denied ?? []),
      ...(compatibility.rules ?? []).filter((entry) => entry.state === "not_available"),
    ].map((entry) =>
      headHairCompatibilityKey(entry.unit, entry.headCostume3dId, entry.hairCostume3dId)
    )
  );
  deniedHeadHairCompatibilityKeys.set(compatibility, keys);
  return keys;
}

export function headHairCompatibilityKey(unit: string | null | undefined, headCostume3dId: number, hairCostume3dId: number) {
  return `${normalizeUnit(unit)}|${headCostume3dId}|${hairCostume3dId}`;
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
  if (typeof manifest.characterHeightMeters !== "number" || manifest.characterHeightMeters <= 0) {
    throw new Error(`Body part runtime ${runtime.packagePath} is missing characterHeightMeters.`);
  }
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
  const head = runtimes.find((runtime) => runtimePartSlot(runtime.part) === "head") ?? runtimes[0];
  const manifest = cloneRecord(head.manifest) as HeadAssetManifest;
  manifest.id = `head-${selection.headCostume3dId}-source-${encodeURIComponent(selection.headPackagePath ?? "auto")}-hair-${selection.hairCostume3dId}`;
  manifest.displayName = `Head ${selection.headCostume3dId} / Hair ${selection.hairCostume3dId}`;
  manifest.characterId = String(selection.characterId).padStart(2, "0");
  if (typeof manifest.characterHeightMeters !== "number" || manifest.characterHeightMeters <= 0) {
    throw new Error(`Head part runtime ${head.packagePath} is missing characterHeightMeters.`);
  }
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
  selectedHeadEntry: PartRegistryEntry
): HeadHairComposition {
  if (runtimePartSlot(selectedHeadEntry) === "head_optional") {
    return {
      kind: "resolved_head_optional_source",
      activePartTypes: new Set(["body", "hair", "head_optional"]),
    };
  }
  return {
    kind: "resolved_complete_head_source",
    activePartTypes: new Set(["body", "head", "head_optional"]),
  };
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
  return composition.activePartTypes.has(runtimePartSlot(runtime.part));
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
      raw: runtimeSetup.raw,
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
  const extraBones = remappedParts.flatMap((part) => part.extraBones);
  const colliders = remappedParts.flatMap((part) => part.colliders);
  const constraints = remappedParts.flatMap((part) => part.constraints);
  const colliderBindings = rebuildColliderBindings(remappedParts);
  const managerColliderCaches = rebuildManagerColliderCaches(remappedParts, colliderBindings);
  const bindingDecisions = rebuildBindingDecisions(bones, colliderBindings);
  const bodyHeadAssembly = resolveComposedBodyHeadAssembly(prefabGraphs);
  if (!bodyHeadAssembly) {
    throw new Error("Composed parts do not provide the official model_combine_setup body/head paths.");
  }
  const runtimeSetup: RuntimeSetup = {
    ...firstSetup,
    version: "0414",
    prefabGraphs,
    bodyHeadAssembly,
    rootSelectionProfile: {
      policy: "viewer_composed_active_parts",
      rootCandidates: [],
    },
    setupPlan: {
      discoveryMode: "viewer_composed_part_runtime_package",
      rootPolicy: "active_custom_parts; manager ownership is rebuilt from composed hierarchy",
      orderedSteps: [
        "load active part packages",
        "merge part native meshes",
        "merge active part springbone records",
        "rebuild SpringManager ownership from composed hierarchy",
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
    funit: mergeRuntimeFUnitSummaries(runtimes),
    raw: mergeRuntimeRawSpringBone(remappedParts),
    managers,
    bones,
    extraBones,
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
  mountHeadOptionalPrefabGraphs(
    remappedParts,
    runtimeSetup,
    resolveHeadOptionalFaceId(runtimes)
  );
  return runtimeSetup;
}

function mountHeadOptionalPrefabGraphs(
  parts: RemappedRuntimePart[],
  runtimeSetup: RuntimeSetup,
  faceId: string | null
) {
  for (const part of parts.filter((entry) => entry.partType === "head_optional")) {
    const graph = part.prefabGraph;
    const attachNode = normalizePathSegment(readOptionalString(part.runtime.mount?.attachNode));
    const target = attachNode ? findHeadOptionalAttachTransform(parts, attachNode) : null;
    const prefabRoot = (graph?.transforms ?? []).find((transform) =>
      transform.parentPathId == null && readOptionalString(transform.transformPath) === "optional"
    );
    if (!graph || !target || !prefabRoot || typeof target.pathId !== "number" || typeof prefabRoot.pathId !== "number") {
      runtimeSetup.warnings?.push(
        `Head optional prefab '${readOptionalString(part.runtime.part.modelAssetbundleName) || "<unknown>"}' was not instantiated: official prefab root 'optional' or active attach node '${attachNode || "<missing>"}' was not found.`
      );
      continue;
    }

    const controller = (graph.monoBehaviours ?? []).find((entry) =>
      readOptionalString(entry.scriptName) === "CharacterAccessoryTransformController" &&
      isSameOrDescendantPath(readOptionalString(entry.transformPath), "optional")
    );
    if (controller) {
      const controllerPath = readOptionalString(controller.transformPath);
      const controllerTarget = (graph.transforms ?? []).find((transform) =>
        readOptionalString(transform.transformPath) === controllerPath
      );
      if (controllerTarget) {
        applyAccessoryControllerTransform(
          controllerTarget,
          resolveAccessoryTransformAdjustment(part.runtime, faceId)
        );
        graph.headOptionalControllerPath = controllerPath;
      } else {
        runtimeSetup.warnings?.push(
          `Head optional controller target '${controllerPath || "<missing>"}' was not found in prefab 'optional'.`
        );
      }
    } else {
      prefabRoot.localPosition = { X: 0, Y: 0, Z: 0 };
      prefabRoot.localRotation = { x: 0, y: 0, z: 0, w: 1 };
    }

    retainHeadOptionalPrefabSubtree(graph, "optional");
    prefabRoot.parentPathId = target.pathId;
    target.childPathIds = [...new Set([...(target.childPathIds ?? []), prefabRoot.pathId])];
    graph.headOptionalAttachPath = readOptionalString(target.transformPath);
    graph.headOptionalPrefabRootPath = "optional";
  }
}

function findHeadOptionalAttachTransform(
  parts: RemappedRuntimePart[],
  attachNode: string
): RuntimePrefabTransform | null {
  for (const part of parts) {
    if (part.partType === "head_optional" || !part.prefabGraph) {
      continue;
    }
    const transforms = part.prefabGraph.transforms ?? [];
    const transformsById = new Map(
      transforms
        .filter((transform): transform is RuntimePrefabTransform & { pathId: number } =>
          typeof transform.pathId === "number"
        )
        .map((transform) => [transform.pathId, transform])
    );
    const activeByGameObjectPathId = new Map(
      readRecordArray(part.prefabGraph.gameObjects).map((gameObject) => [
        readNumber(gameObject.pathId, Number.NaN),
        gameObject.activeSelf !== false && gameObject.activeInHierarchy !== false,
      ])
    );
    const isActive = (transform: RuntimePrefabTransform) =>
      typeof transform.gameObjectPathId !== "number" ||
      activeByGameObjectPathId.get(transform.gameObjectPathId) !== false;
    const visit = (transform: RuntimePrefabTransform): RuntimePrefabTransform | null => {
      if (!isActive(transform)) {
        return null;
      }
      if (readOptionalString(transform.name) === attachNode || normalizePathSegment(readOptionalString(transform.transformPath)) === attachNode) {
        return transform;
      }
      for (const childPathId of transform.childPathIds ?? []) {
        const child = transformsById.get(childPathId);
        const match = child ? visit(child) : null;
        if (match) {
          return match;
        }
      }
      return null;
    };
    for (const activeRoot of part.activeRoots) {
      const root = transforms.find((transform) =>
        transform.parentPathId == null && readOptionalString(transform.transformPath) === activeRoot
      );
      const match = root ? visit(root) : null;
      if (match) {
        return match;
      }
    }
  }
  return null;
}

function retainHeadOptionalPrefabSubtree(graph: RuntimePrefabGraph, prefabRootPath: string) {
  const belongsToPrefab = (entry: Record<string, unknown>) =>
    isSameOrDescendantPath(readOptionalString(entry.transformPath), prefabRootPath);
  graph.transforms = (graph.transforms ?? []).filter(belongsToPrefab);
  graph.gameObjects = readRecordArray(graph.gameObjects).filter(belongsToPrefab);
  graph.renderers = readRecordArray(graph.renderers).filter(belongsToPrefab);
  graph.animators = readRecordArray(graph.animators).filter(belongsToPrefab);
  graph.monoBehaviours = (graph.monoBehaviours ?? []).filter(belongsToPrefab);
  graph.constraints = readRecordArray(graph.constraints).filter(belongsToPrefab);
  graph.rootTransformPathIds = graph.transforms
    .filter((transform) => readOptionalString(transform.transformPath) === prefabRootPath)
    .map((transform) => transform.pathId)
    .filter((pathId): pathId is number => typeof pathId === "number");
}

function isSameOrDescendantPath(path: string, rootPath: string) {
  return path === rootPath || path.startsWith(`${rootPath}/`);
}

function applyAccessoryControllerTransform(
  target: RuntimePrefabTransform,
  adjustment: AccessoryTransformAdjustment | null
) {
  const position = readVectorLike(adjustment?.position, 0, 0, 0);
  const rotation = readVectorLike(adjustment?.rotationEulerDegrees, 0, 0, 0);
  const scale = readVectorLike(adjustment?.scale, 1, 1, 1);
  target.localPosition = { X: position.x, Y: position.y, Z: position.z };
  target.localRotation = unityQuaternionFromEulerDegrees(rotation);
  target.localScale = { X: Math.abs(scale.x), Y: Math.abs(scale.y), Z: Math.abs(scale.z) };
}

function unityQuaternionFromEulerDegrees(rotation: { x: number; y: number; z: number }) {
  const x = rotation.x * Math.PI / 180;
  const y = rotation.y * Math.PI / 180;
  const z = rotation.z * Math.PI / 180;
  const c1 = Math.cos(x / 2);
  const c2 = Math.cos(y / 2);
  const c3 = Math.cos(z / 2);
  const s1 = Math.sin(x / 2);
  const s2 = Math.sin(y / 2);
  const s3 = Math.sin(z / 2);
  return {
    x: s1 * c2 * c3 - c1 * s2 * s3,
    y: c1 * s2 * c3 + s1 * c2 * s3,
    z: c1 * c2 * s3 + s1 * s2 * c3,
    w: c1 * c2 * c3 - s1 * s2 * s3,
  };
}

function mergeRuntimeFUnitSummaries(runtimes: PartRuntimePackage[]) {
  const summaries = runtimes
    .map((runtime) => asRecord(runtime.springBone?.funit))
    .filter((summary) => Object.keys(summary).length > 0);
  const readCount = (summary: Record<string, unknown>, key: string) =>
    typeof summary[key] === "number" && Number.isFinite(summary[key])
      ? Math.max(Math.trunc(summary[key]), 0)
      : 0;
  const detectedScripts = uniqueStrings(summaries.flatMap((summary) =>
    readStringArray(summary.detectedScripts)
  )).sort((left, right) => left.localeCompare(right));
  return {
    present: summaries.some((summary) => summary.present === true),
    scriptCount: summaries.reduce((total, summary) => total + readCount(summary, "scriptCount"), 0),
    springManagerCount: summaries.reduce((total, summary) => total + readCount(summary, "springManagerCount"), 0),
    springBoneCount: summaries.reduce((total, summary) => total + readCount(summary, "springBoneCount"), 0),
    sphereColliderCount: summaries.reduce((total, summary) => total + readCount(summary, "sphereColliderCount"), 0),
    capsuleColliderCount: summaries.reduce((total, summary) => total + readCount(summary, "capsuleColliderCount"), 0),
    panelColliderCount: summaries.reduce((total, summary) => total + readCount(summary, "panelColliderCount"), 0),
    detectedScripts,
    policy: "metadata_only; do not merge with UTJ/Sekai SpringBone runtime",
  };
}

function mergeRuntimeRawSpringBone(parts: RemappedRuntimePart[]) {
  const bodyExtraBones = parts
    .filter((part) => part.partType === "body")
    .flatMap((part) => part.extraBones);
  const headExtraBones = parts
    .filter((part) => part.partType === "head" || part.partType === "hair" || part.partType === "head_optional")
    .flatMap((part) => part.extraBones);
  return {
    body: { extraBones: bodyExtraBones },
    head: { extraBones: headExtraBones },
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
    extraBones: springBone.extraBones as RuntimeExtraBone[] | undefined,
    colliders: springBone.colliders as RuntimeCollider[] | undefined,
    colliderBindings: springBone.colliderBindings as RuntimeColliderBinding[] | undefined,
    managerColliderCaches: springBone.managerColliderCaches as RuntimeManagerColliderCache[] | undefined,
    activeRootProfile: springBone.activeRootProfile as Record<string, unknown> | undefined,
    funit: springBone.funit as Record<string, unknown> | undefined,
    bindingDecisions: springBone.bindingDecisions as RuntimeBindingDecision[] | undefined,
    constraintSetup: springBone.constraintSetup as RuntimeConstraintSetup | undefined,
  };
}

function remapRuntimePart(runtime: PartRuntimePackage, partIndex: number): RemappedRuntimePart {
  const setup = getPartRuntimeSetup(runtime);
  const partType = runtimePartSlot(runtime.part);
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
  const extraBones = filterRuntimeRecordsByActiveRoots(
    remapRuntimeExtraBones(setup.extraBones, partIndex, partType),
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
    extraBones,
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
  if (partType === "head_optional" && activeRoots.includes("optional")) {
    return ["optional"];
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

function remapRuntimeExtraBones(
  value: unknown,
  partIndex: number,
  partType: RuntimePartType
): RuntimeExtraBone[] {
  return cloneArrayWithPartPrefix(value, partIndex, partType).map((entry) => {
    const extraBone = entry as RuntimeExtraBone;
    const gameObject = remapRuntimeObjectRef(extraBone.gameObject ?? extraBone.GameObject, partIndex);
    const referenceBone = remapRuntimeObjectRef(extraBone.referenceBone ?? extraBone.ReferenceBone, partIndex);
    extraBone.gameObject = gameObject;
    extraBone.GameObject = gameObject;
    extraBone.referenceBone = referenceBone;
    extraBone.ReferenceBone = referenceBone;
    extraBone.nodePath = gameObject?.transformPath ?? gameObject?.TransformPath ?? null;
    extraBone.poseRoot = firstPathSegment(extraBone.nodePath) ?? null;
    return extraBone;
  });
}

function remapRuntimeObjectRef(
  value: RuntimeObjectRef | null | undefined,
  partIndex: number
): RuntimeObjectRef | null | undefined {
  if (!isRecord(value)) {
    return value;
  }
  const cloned = { ...value } as RuntimeObjectRef;
  if (typeof cloned.pathId === "number") {
    cloned.pathId = remapNumericId(cloned.pathId, partIndex);
  }
  if (typeof cloned.PathId === "number") {
    cloned.PathId = remapNumericId(cloned.PathId, partIndex);
  }
  return cloned;
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
    if (typeof cloned.PathId === "number") {
      cloned.PathId = remapNumericId(cloned.PathId, partIndex);
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
    manager.bonePathIds = inferredBonePathIds;
    if (typeof manager.pathId === "number") {
      bonesByManagerPathId.set(manager.pathId, inferredBonePathIds);
    }
  }

  for (const cache of managerColliderCaches) {
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
  for (const [runtimeIndex, runtime] of runtimes.entries()) {
    const partType = runtimePartSlot(runtime.part);
    for (const mesh of readRecordArray(runtime.nativeMeshes?.meshes)) {
      if (partType !== "head_optional") {
        meshes.push(mesh);
        continue;
      }

      const sourceRendererTransformPath = readOptionalString(mesh.rendererTransformPath);
      const mountedGraph = readRecordArray(runtimeSetup.prefabGraphs).find((graph) =>
        readNumber(graph.runtimePartIndex, -1) === runtimeIndex &&
        Boolean(readOptionalString(graph.headOptionalAttachPath))
      );
      const prefabRootPath = readOptionalString(mountedGraph?.headOptionalPrefabRootPath);
      if (!mountedGraph || !prefabRootPath) {
        warnings.push(
          `Head optional mesh '${readOptionalString(mesh.meshPath) || readOptionalString(mesh.meshName) || "<unnamed>"}' was skipped because the official prefab could not be mounted.`
        );
        continue;
      }
      if (
        sourceRendererTransformPath !== prefabRootPath &&
        !sourceRendererTransformPath.startsWith(`${prefabRootPath}/`)
      ) {
        continue;
      }
      meshes.push({
        ...mesh,
        sourceRendererTransformPath,
        rendererTransformPath: sourceRendererTransformPath,
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
    ...runtimes.filter((runtime) => runtimePartSlot(runtime.part) === "head"),
    ...runtimes.filter((runtime) => runtimePartSlot(runtime.part) === "hair"),
    ...runtimes.filter((runtime) => runtimePartSlot(runtime.part) !== "head_optional"),
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


function normalizePathSegment(value: string | null | undefined): string | null {
  const normalized = value?.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? "";
  return normalized || null;
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

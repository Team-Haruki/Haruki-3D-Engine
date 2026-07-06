import {
  characterHeightMetersById,
  previewLightDefaults,
  sekaiPluginLightLocationToThreeDirection,
  type BodyAssetManifest,
  type HeadAssetManifest,
  type MaterialLightingSettings,
  type PreviewLightState,
  type Vec3,
} from "../data/sampleScene";
import type {
  FaceMotionSet,
  RuntimeCombinedCharacterAsset,
} from "../engine/Haruki3DEngine";
import { CustomWardrobeController } from "../parts/customWardrobeController";
import {
  getCharacterIndexEntries,
  getDefaultCustomSelection,
  runtimeRoleId,
  tryRuntimePartSlot,
  type Character3dIndex,
  type HeadHairCompatibility,
  type PartPackageSet,
  type PartRegistryEntry,
  type PartRuntimePackage,
  type RoleRuntimePackage,
  type RuntimePartType,
} from "../parts/runtimePartComposer";

type UnknownRecord = Record<string, unknown>;

type PartRegistryInput = PartRegistryEntry[] | {
  entries?: PartRegistryEntry[];
  parts?: PartRegistryEntry[];
};

export type RuntimePackageLoadResult = {
  kind: "part-registry" | "full-runtime";
  combinedCharacter: RuntimeCombinedCharacterAsset | null;
  previewLight: PreviewLightState | null;
  faceMotion: FaceMotionSet | null;
  displayNameByUrl: Map<string, string>;
  partSet: PartPackageSet | null;
  wardrobe: CustomWardrobeController | null;
};

export type RuntimePackageLoadOptions = {
  fullRuntimeOnly?: boolean;
  deferDefaultSelection?: boolean;
  roleId?: string | null;
};

export async function loadRuntimePackageFromBaseUrl(
  baseUrl: string,
  options: RuntimePackageLoadOptions = {}
): Promise<RuntimePackageLoadResult> {
  const displayNameByUrl = new Map<string, string>();
  let partRegistryError: unknown = null;

  if (!options.fullRuntimeOnly) {
    try {
      const partSet = await loadPartPackageSetFromBaseUrl(baseUrl, {
        deferDefaultSelection: options.deferDefaultSelection,
        roleId: options.roleId,
      });
      const wardrobe = new CustomWardrobeController({
        resolveUrl: (path) => resolveRuntimePackageUrl(baseUrl, path),
        loadPartRuntime: async (entry) =>
          loadPartRuntimePackage(partSet, entry, baseUrl),
        ensureCompatibility: async (selection) =>
          ensureCompatibilityForSelection(partSet, selection.unit, baseUrl),
      });
      const combinedCharacter = wardrobe.loadPartPackageSet(partSet, {
        composeDefault: !options.deferDefaultSelection,
      });
      if (!combinedCharacter && !options.deferDefaultSelection) {
        throw new Error(`Part registry package did not expose a default custom selection from ${baseUrl}.`);
      }
      return {
        kind: "part-registry",
        combinedCharacter,
        previewLight: null,
        faceMotion: null,
        displayNameByUrl,
        partSet,
        wardrobe,
      };
    } catch (error) {
      partRegistryError = error;
    }
  }

  try {
    return await loadFullRuntimePackageFromBaseUrl(baseUrl, displayNameByUrl);
  } catch (error) {
    if (!partRegistryError) {
      throw error;
    }
    const registryMessage = partRegistryError instanceof Error
      ? partRegistryError.message
      : String(partRegistryError);
    const runtimeMessage = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to load part registry package: ${registryMessage}. Full runtime fallback also failed: ${runtimeMessage}`
    );
  }
}

export function resolveRuntimePackageUrl(baseUrl: string, relativePath: string) {
  const base = new URL(baseUrl, window.location.href);
  if (!base.pathname.endsWith("/")) {
    base.pathname = `${base.pathname}/`;
  }
  const normalized = relativePath
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return new URL(normalized, base).toString();
}

async function loadFullRuntimePackageFromBaseUrl(
  baseUrl: string,
  displayNameByUrl: Map<string, string>
): Promise<RuntimePackageLoadResult> {
  const extensionUrl = resolveRuntimePackageUrl(baseUrl, "pjsk-sekai-runtime.extension.json");
  const baseRuntimeExtension = asRecord(await fetchRuntimeJson(extensionUrl));
  const unityRuntimeJsonPath = readUnityRuntimeJsonPath(baseRuntimeExtension);
  if (!unityRuntimeJsonPath) {
    throw new Error("Pure Unity converter output must contain character/unity-runtime.json.");
  }
  const unityRuntimeJsonUrl = resolveRuntimePackageUrl(baseUrl, unityRuntimeJsonPath);
  displayNameByUrl.set(
    unityRuntimeJsonUrl,
    unityRuntimeJsonPath.split("/").pop() ?? unityRuntimeJsonPath
  );

  const runtime = await normalizeRuntimeWithUnityRuntimeJson(
    baseRuntimeExtension,
    unityRuntimeJsonUrl,
    (path) => resolveRuntimePackageUrl(baseUrl, path)
  );
  const unityMotionJsonPath = readEmbeddedUnityMotionPath(runtime.extension);
  const unityMotionJsonUrl = unityMotionJsonPath
    ? resolveRuntimePackageUrl(baseUrl, unityMotionJsonPath)
    : undefined;
  if (unityMotionJsonUrl && unityMotionJsonPath) {
    displayNameByUrl.set(
      unityMotionJsonUrl,
      unityMotionJsonPath.split("/").pop() ?? unityMotionJsonPath
    );
    runtime.bodyAsset = {
      ...runtime.bodyAsset,
      source: {
        ...runtime.bodyAsset.source,
        animationUrls: [unityMotionJsonUrl],
      },
    };
  }

  return {
    kind: "full-runtime",
    combinedCharacter: {
      id: `runtime-${runtime.bodyAsset.characterId ?? "unknown"}-unity-runtime.json`,
      displayName: "Runtime unity-runtime.json",
      meshUrl: "",
      unityRuntimeJsonUrl,
      unityRuntimeJsonPath,
      unityMotionJsonUrl,
      unityMotionJsonPath: unityMotionJsonPath ?? undefined,
      bodyAsset: runtime.bodyAsset,
      headAsset: runtime.headAsset,
      runtimeExtension: runtime.extension,
    },
    previewLight: readRuntimePreviewLight(runtime.extension),
    faceMotion: readEmbeddedFaceMotion(runtime.extension),
    displayNameByUrl,
    partSet: null,
    wardrobe: null,
  };
}

async function loadPartPackageSetFromBaseUrl(
  baseUrl: string,
  options: { deferDefaultSelection?: boolean; roleId?: string | null } = {}
): Promise<PartPackageSet> {
  const role = parseRuntimeRoleIdOption(options.roleId);
  const scopedRoot = role
    ? `parts/by-role/${role.characterId}/${runtimePathUnitSegment(role.unit)}`
    : null;
  const scopedRegistry = scopedRoot
    ? await fetchOptionalJson<PartRegistryInput>(
      resolveRuntimePackageUrl(baseUrl, `${scopedRoot}/part-registry.json`)
    )
    : null;
  const registry = scopedRegistry
    ? normalizePartRegistry(scopedRegistry)
    : normalizePartRegistry(await fetchRuntimeJson(
      resolveRuntimePackageUrl(baseUrl, "parts/part-registry.json")
    ) as PartRegistryInput);
  const characterIndex = scopedRoot
    ? (
      await fetchOptionalJson<Character3dIndex>(
        resolveRuntimePackageUrl(baseUrl, `${scopedRoot}/character3d-index.json`)
      ) ??
      await fetchOptionalJson<Character3dIndex>(
        resolveRuntimePackageUrl(baseUrl, "character3d-index.json")
      )
    )
    : await fetchOptionalJson<Character3dIndex>(
      resolveRuntimePackageUrl(baseUrl, "character3d-index.json")
    );
  const compatibility = role
    ? null
    : await fetchOptionalJson<HeadHairCompatibility>(
      resolveRuntimePackageUrl(baseUrl, "parts/head-hair-compatibility.json")
    );
  const characterIndexEntries = characterIndex ? getCharacterIndexEntries(characterIndex) : [];
  const packages = new Map<string, PartRuntimePackage>();
  if (options.deferDefaultSelection) {
    return {
      registry,
      characterIndex: characterIndexEntries,
      compatibility,
      packages,
      roleRuntimes: new Map<string, RoleRuntimePackage>(),
      baseUrl,
    };
  }
  const candidates = selectPartRuntimeCandidates(registry, characterIndex, compatibility);
  const batchSize = 24;
  const maxCandidates = 720;
  for (let offset = 0; offset < Math.min(candidates.length, maxCandidates); offset += batchSize) {
    const batch = candidates.slice(offset, offset + batchSize);
    const results = await Promise.all(batch.map(async (entry) => ({
      entry,
      runtime: await fetchOptionalJson<PartRuntimePackage>(
        resolveRuntimePackageUrl(baseUrl, `${entry.packagePath}/part-runtime.json`)
      ),
    })));
    for (const result of results) {
      if (result.runtime) {
        packages.set(
          result.entry.packagePath,
          withPartRuntimePackagePath(result.runtime, result.entry)
        );
      }
    }
    if (hasUsableCustomPartSelection(registry, characterIndex, compatibility, packages, baseUrl)) {
      break;
    }
  }
  if (!hasUsableCustomPartSelection(registry, characterIndex, compatibility, packages, baseUrl)) {
    throw new Error(
      `Part registry package did not expose a compatible loaded body/head/hair selection from ${baseUrl}.`
    );
  }
  const defaultSelection = getDefaultCustomSelection({
    registry,
    characterIndex: characterIndexEntries,
    compatibility,
    packages,
    roleRuntimes: new Map<string, RoleRuntimePackage>(),
    baseUrl,
  });
  const targetRoleIds = defaultSelection
    ? new Set([runtimeRoleId(defaultSelection.characterId, defaultSelection.unit)])
    : null;
  const roleRuntimes = await loadRoleRuntimePackages(
    baseUrl,
    characterIndexEntries,
    targetRoleIds
  );
  return {
    registry,
    characterIndex: characterIndexEntries,
    compatibility,
    packages,
    roleRuntimes,
    baseUrl,
  };
}

export async function ensureRoleRuntimePackage(
  partSet: PartPackageSet,
  characterId: number,
  unit: string | null
): Promise<RoleRuntimePackage | null> {
  const roleId = runtimeRoleId(characterId, unit);
  const existing = partSet.roleRuntimes.get(roleId);
  if (existing) {
    return existing;
  }
  const entry = partSet.characterIndex.find((candidate) =>
    candidate.roleRuntimePath &&
    candidate.characterId === characterId &&
    runtimeRoleId(candidate.characterId, candidate.unit ?? null) === roleId
  );
  if (!entry?.roleRuntimePath) {
    return null;
  }
  const runtime = await fetchOptionalJson<RoleRuntimePackage>(
    resolveRuntimePackageUrl(partSet.baseUrl, entry.roleRuntimePath)
  );
  if (!runtime) {
    return null;
  }
  const normalized = normalizeRoleRuntimePackage(partSet.baseUrl, entry.roleRuntimePath, runtime);
  const normalizedCharacterId = normalized.role?.characterId ?? characterId;
  const normalizedUnit = normalized.role?.unit ?? unit;
  partSet.roleRuntimes.set(runtimeRoleId(normalizedCharacterId, normalizedUnit), normalized);
  return normalized;
}

async function loadRoleRuntimePackages(
  baseUrl: string,
  characterIndex: ReturnType<typeof getCharacterIndexEntries>,
  targetRoleIds: ReadonlySet<string> | null = null
): Promise<Map<string, RoleRuntimePackage>> {
  const result = new Map<string, RoleRuntimePackage>();
  const entries = characterIndex.filter((entry) =>
    entry.roleRuntimePath &&
    (!targetRoleIds || targetRoleIds.has(runtimeRoleId(entry.characterId, entry.unit ?? null)))
  );
  const loaded = await Promise.all(entries.map(async (entry) => ({
    entry,
    runtime: await fetchOptionalJson<RoleRuntimePackage>(
      resolveRuntimePackageUrl(baseUrl, entry.roleRuntimePath!)
    ),
  })));
  for (const item of loaded) {
    if (!item.runtime) {
      continue;
    }
    const characterId = item.runtime.role?.characterId ?? item.entry.characterId;
    const unit = item.runtime.role?.unit ?? item.entry.unit ?? null;
    const runtime = normalizeRoleRuntimePackage(baseUrl, item.entry.roleRuntimePath!, item.runtime);
    result.set(runtimeRoleId(characterId, unit), runtime);
  }
  return result;
}

function normalizeRoleRuntimePackage(
  baseUrl: string,
  roleRuntimePath: string,
  runtime: RoleRuntimePackage
): RoleRuntimePackage {
  const motionPackage = runtime.motionPackage;
  const unityMotionJson = motionPackage?.unityMotionJson;
  if (!unityMotionJson || /^[a-z][a-z0-9+.-]*:/i.test(unityMotionJson) || unityMotionJson.startsWith("/")) {
    return runtime;
  }
  return {
    ...runtime,
    motionPackage: {
      ...motionPackage,
      unityMotionJson: resolveRuntimePackageUrl(
        baseUrl,
        resolveSiblingRuntimePath(roleRuntimePath, unityMotionJson)
      ),
    },
  };
}

function resolveSiblingRuntimePath(packageFilePath: string, relativePath: string) {
  const normalizedPackagePath = packageFilePath.replace(/\\/g, "/");
  const directory = normalizedPackagePath.split("/").slice(0, -1).join("/");
  if (!directory) {
    return relativePath;
  }
  return `${directory}/${relativePath.replace(/^\/+/, "")}`;
}

async function loadPartRuntimePackage(
  partSet: PartPackageSet,
  entry: PartRegistryEntry,
  baseUrl = partSet.baseUrl
) {
  const cached = partSet.packages.get(entry.packagePath);
  if (cached) {
    return cached;
  }
  const runtime = await fetchRuntimeJson(
    resolveRuntimePackageUrl(baseUrl, `${entry.packagePath}/part-runtime.json`)
  ) as PartRuntimePackage;
  const normalized = withPartRuntimePackagePath(runtime, entry);
  partSet.packages.set(entry.packagePath, normalized);
  return normalized;
}

async function ensureCompatibilityForSelection(
  partSet: PartPackageSet,
  unit: string | null | undefined,
  baseUrl = partSet.baseUrl
) {
  if (partSet.compatibility) {
    return;
  }
  const scoped = await fetchOptionalJson<HeadHairCompatibility>(
    resolveRuntimePackageUrl(
      baseUrl,
      `parts/compat/by-unit/${runtimePathUnitSegment(unit)}/head-hair-compatibility.json`
    )
  );
  const fallback = scoped ?? await fetchOptionalJson<HeadHairCompatibility>(
    resolveRuntimePackageUrl(baseUrl, "parts/head-hair-compatibility.json")
  );
  if (!fallback) {
    throw new Error(`Head-hair compatibility registry is required for unit ${unit ?? ""}.`);
  }
  partSet.compatibility = fallback;
}

function parseRuntimeRoleIdOption(roleId: string | null | undefined) {
  if (!roleId) {
    return null;
  }
  const [characterIdPart, ...unitParts] = roleId.split(":");
  const characterId = Number(characterIdPart);
  if (!Number.isInteger(characterId) || characterId <= 0) {
    return null;
  }
  const unit = unitParts.join(":") || null;
  return { characterId, unit };
}

function runtimePathUnitSegment(unit: string | null | undefined) {
  return unit || "default";
}

function withPartRuntimePackagePath(
  runtime: PartRuntimePackage,
  entry: PartRegistryEntry
): PartRuntimePackage {
  return {
    ...runtime,
    packagePath: entry.packagePath,
    mount: {
      ...(runtime.mount ?? {}),
      packagePath: entry.packagePath,
    },
  };
}

async function fetchRuntimeJson(url: string) {
  const gzipUrl = `${url}.gz`;
  const gzipResponse = await fetch(gzipUrl, { cache: "no-store" });
  let gzipError: Error | null = null;
  if (gzipResponse.ok) {
    try {
      return JSON.parse(await readGzipRuntimeJson(gzipResponse, gzipUrl));
    } catch (error) {
      gzipError = error instanceof Error
        ? error
        : new Error(`Failed to parse ${gzipUrl}: ${String(error)}`);
    }
  }

  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    if (gzipError) {
      throw gzipError;
    }
    throw new Error(`Failed to load ${url}: HTTP ${response.status}`);
  }
  return response.json();
}

async function readGzipRuntimeJson(response: Response, url: string) {
  if (!response.body || typeof DecompressionStream === "undefined") {
    throw new Error(`Failed to load ${url}: gzip runtime JSON requires DecompressionStream.`);
  }
  const stream = response.body.pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

async function fetchOptionalJson<T>(url: string): Promise<T | null> {
  try {
    return await fetchRuntimeJson(url) as T;
  } catch {
    return null;
  }
}

function normalizePartRegistry(input: PartRegistryInput): PartRegistryEntry[] {
  return Array.isArray(input) ? input : input.entries ?? input.parts ?? [];
}

function selectPartRuntimeCandidates(
  registry: PartRegistryEntry[],
  characterIndex: Character3dIndex | null,
  compatibility: HeadHairCompatibility | null
) {
  const indexEntries = characterIndex ? getCharacterIndexEntries(characterIndex) : [];
  const preferredCharacterId = indexEntries.find((entry) =>
    typeof entry.characterId === "number"
  )?.characterId ?? registry.find(isLoadableRegistryEntry)?.characterId ?? null;
  const ordered: PartRegistryEntry[] = [];
  const seen = new Set<string>();
  const addEntry = (entry: PartRegistryEntry | undefined) => {
    if (!entry || !isLoadableRegistryEntry(entry)) {
      return;
    }
    const key = entry.packagePath;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    ordered.push(entry);
  };
  const findRegistryEntry = (
    characterId: number,
    partType: RuntimePartType,
    costume3dId: number,
    unit?: string | null
  ) => registry.find((entry) =>
    entry.characterId === characterId &&
    entry.costume3dId === costume3dId &&
    tryRuntimePartSlot(entry) === partType &&
    (unit === undefined || entry.unit === unit) &&
    isUsableRegistryEntry(entry)
  );
  const deniedHeadHairKeys = buildDeniedHeadHairKeys(compatibility);

  if (preferredCharacterId !== null) {
    for (const entry of indexEntries) {
      if (entry.characterId !== preferredCharacterId) {
        continue;
      }
      if (typeof entry.bodyCostume3dId === "number") {
        addEntry(findRegistryEntry(entry.characterId, "body", entry.bodyCostume3dId, entry.unit));
      }
      if (typeof entry.headCostume3dId === "number") {
        addEntry(
          findRegistryEntry(entry.characterId, "head", entry.headCostume3dId, entry.unit) ??
          findRegistryEntry(entry.characterId, "head_optional", entry.headCostume3dId, entry.unit)
        );
      }
      if (typeof entry.hairCostume3dId === "number") {
        addEntry(findRegistryEntry(entry.characterId, "hair", entry.hairCostume3dId, entry.unit));
      }
      if (typeof entry.headOptionalCostume3dId === "number") {
        addEntry(findRegistryEntry(entry.characterId, "head_optional", entry.headOptionalCostume3dId, entry.unit));
      }
    }
    addEntry(registry
      .filter((entry) =>
        entry.characterId === preferredCharacterId &&
        tryRuntimePartSlot(entry) === "body" &&
        isUsableRegistryEntry(entry)
      )
      .sort((left, right) => left.costume3dId - right.costume3dId)[0]);

    const heads = registry
      .filter((entry) =>
        entry.characterId === preferredCharacterId &&
        tryRuntimePartSlot(entry) === "head" &&
        isUsableRegistryEntry(entry)
      )
      .sort((left, right) => left.costume3dId - right.costume3dId);
    const hairs = registry
      .filter((entry) =>
        entry.characterId === preferredCharacterId &&
        tryRuntimePartSlot(entry) === "hair" &&
        isUsableRegistryEntry(entry)
      )
      .sort((left, right) => left.costume3dId - right.costume3dId);
    for (const head of heads) {
      for (const hair of hairs) {
        if (deniedHeadHairKeys.has(headHairCandidateKey(head.unit ?? hair.unit, head.costume3dId, hair.costume3dId))) {
          continue;
        }
        addEntry(head);
        addEntry(hair);
      }
    }
  }

  const preferredCostumeIds = new Set<number>();
  for (const entry of indexEntries) {
    if (preferredCharacterId !== null && entry.characterId !== preferredCharacterId) {
      continue;
    }
    for (const id of [
      entry.bodyCostume3dId,
      entry.headCostume3dId,
      entry.hairCostume3dId,
      entry.headOptionalCostume3dId,
    ]) {
      if (typeof id === "number") {
        preferredCostumeIds.add(id);
      }
    }
  }

  const scored = registry
    .filter(isLoadableRegistryEntry)
    .filter((entry) => {
      const key = `${entry.characterId}|${entry.partType}|${entry.costume3dId}|${entry.packagePath}`;
      return !seen.has(key);
    })
    .map((entry, index) => ({
      entry,
      index,
      score:
        (preferredCharacterId !== null && entry.characterId === preferredCharacterId ? 0 : 1000000) +
        (preferredCostumeIds.has(entry.costume3dId) ? 0 : 10000) +
        partTypePriority(entry) +
        Math.min(entry.costume3dId, 9999),
    }))
    .sort((left, right) => left.score - right.score || left.index - right.index);
  return [...ordered, ...scored.map((item) => item.entry)];
}

function isUsableRegistryEntry(entry: PartRegistryEntry) {
  return entry.status !== "missing";
}

function isLoadableRegistryEntry(entry: PartRegistryEntry) {
  return isUsableRegistryEntry(entry) && entry.status !== "empty";
}

function hasUsableCustomPartSelection(
  registry: PartRegistryEntry[],
  characterIndex: Character3dIndex | null,
  compatibility: HeadHairCompatibility | null,
  packages: Map<string, PartRuntimePackage>,
  baseUrl: string
) {
  const loadedTypes = new Set(
    registry
      .filter((entry) => packages.has(entry.packagePath))
      .map((entry) => tryRuntimePartSlot(entry))
      .filter(Boolean)
  );
  if (!loadedTypes.has("body") || !loadedTypes.has("head") || !loadedTypes.has("hair")) {
    return false;
  }
  const partSet = {
    registry,
    characterIndex: characterIndex ? getCharacterIndexEntries(characterIndex) : [],
    compatibility,
    packages,
    roleRuntimes: new Map<string, RoleRuntimePackage>(),
    baseUrl,
  };
  return Boolean(getDefaultCustomSelection(partSet));
}

function buildDeniedHeadHairKeys(compatibility: HeadHairCompatibility | null) {
  const keys = new Set<string>();
  if (!compatibility) {
    return keys;
  }
  for (const entry of compatibility.denied ?? []) {
    keys.add(headHairCandidateKey(entry.unit, entry.headCostume3dId, entry.hairCostume3dId));
  }
  for (const entry of compatibility.rules ?? []) {
    if (entry.state === "not_available") {
      keys.add(headHairCandidateKey(entry.unit, entry.headCostume3dId, entry.hairCostume3dId));
    }
  }
  return keys;
}

function headHairCandidateKey(
  unit: string | null | undefined,
  headCostume3dId: number,
  hairCostume3dId: number
) {
  return `${unit ?? ""}|${headCostume3dId}|${hairCostume3dId}`;
}

function partTypePriority(entry: PartRegistryEntry) {
  switch (tryRuntimePartSlot(entry)) {
    case "body":
      return 0;
    case "head":
      return 100;
    case "hair":
      return 200;
    case "head_optional":
      return 300;
    default:
      return 1000;
  }
}

function asRecord(value: unknown): UnknownRecord {
  return (value && typeof value === "object" ? value : {}) as UnknownRecord;
}

function readString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function readNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readBoolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function readRequiredMaterialIdentity(slot: UnknownRecord, context: string) {
  const materialKey = readString(slot.materialKey ?? slot.MaterialKey);
  const materialFileId = slot.materialFileId ?? slot.MaterialFileId;
  const materialPathId = slot.materialPathId ?? slot.MaterialPathId;
  if (
    !materialKey ||
    typeof materialFileId !== "number" ||
    !Number.isFinite(materialFileId) ||
    typeof materialPathId !== "number" ||
    !Number.isFinite(materialPathId)
  ) {
    throw new Error(`${context} is missing material identity; regenerate it with Haruki-3D-Exporter materialKey runtime support.`);
  }
  return {
    slotIndex: readNumber(slot.slotIndex ?? slot.SlotIndex, 0),
    materialKey,
    materialFileId,
    materialPathId,
  };
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function readUnknownArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function normalizeCharacterId(value: unknown) {
  const raw = readString(value).trim();
  return raw ? raw.padStart(2, "0") : undefined;
}

function inferCharacterIdFromText(value: string | undefined) {
  if (!value) {
    return undefined;
  }
  const match = value.match(/characterv2[_/-](\d{1,2})\b/i)
    ?? value.match(/\b(?:body|head|face)-(\d{1,2})\b/i);
  return match ? match[1].padStart(2, "0") : undefined;
}

function resolveCharacterHeightMeters(explicit: unknown, characterId: string | undefined) {
  const value = readNumber(explicit, Number.NaN);
  if (Number.isFinite(value) && value > 0) {
    return value > 10 ? value / 100 : value;
  }
  return characterId ? characterHeightMetersById[characterId] : undefined;
}

function readVec3Record(value: unknown, fallback: Vec3): Vec3 {
  const record = asRecord(value);
  const readComponent = (camel: string, pascal: string, defaultValue: number) => {
    const next = record[camel] ?? record[pascal];
    return typeof next === "number" ? next : defaultValue;
  };
  return {
    x: readComponent("x", "X", fallback.x),
    y: readComponent("y", "Y", fallback.y),
    z: readComponent("z", "Z", fallback.z),
  };
}

function readMaterialLighting(value: unknown): MaterialLightingSettings {
  const record = asRecord(value);
  return {
    specularPower: readNumber(record.specularPower ?? record.SpecularPower, 0),
    rimThreshold: readNumber(record.rimThreshold ?? record.RimThreshold, 0.2),
    shadowTexWeight: readNumber(record.shadowTexWeight ?? record.ShadowTexWeight, 1),
    fadeMode: readNumber(record.fadeMode ?? record.FadeMode, 0),
    hueSinAngle: readNumber(record.hueSinAngle ?? record.HueSinAngle, 0),
    hueCosAngle: readNumber(record.hueCosAngle ?? record.HueCosAngle, 1),
    saturation: readNumber(record.saturation ?? record.Saturation, 0.5),
    value: readNumber(record.value ?? record.Value, 0.5),
    contrast: readNumber(record.contrast ?? record.Contrast, 0.5),
    partsAmbientColor: readString(record.partsAmbientColor ?? record.PartsAmbientColor, "#ffffff"),
    reflectionBlendColor: readString(record.reflectionBlendColor ?? record.ReflectionBlendColor, "#ffffff"),
    outlineWidth: readNumber(record.outlineWidth ?? record.OutlineWidth, 0.001),
    outlineOffset: readNumber(record.outlineOffset ?? record.OutlineOffset, 0),
    outlineLightness: readNumber(record.outlineLightness ?? record.OutlineLightness, 0.5),
    shadowWidth: readNumber(record.shadowWidth ?? record.ShadowWidth, 0),
    useOutlineSecondNormal: readNumber(record.useOutlineSecondNormal ?? record.UseOutlineSecondNormal, 0),
    distortionFps: readNumber(record.distortionFps ?? record.DistortionFps, 12),
    distortionIntensity: readNumber(record.distortionIntensity ?? record.DistortionIntensity, 0),
    distortionIntensityX: readNumber(record.distortionIntensityX ?? record.DistortionIntensityX, 0),
    distortionIntensityY: readNumber(record.distortionIntensityY ?? record.DistortionIntensityY, 0),
    distortionOffsetX: readNumber(record.distortionOffsetX ?? record.DistortionOffsetX, 0),
    distortionOffsetY: readNumber(record.distortionOffsetY ?? record.DistortionOffsetY, 0),
    distortionScrollSpeed: readNumber(record.distortionScrollSpeed ?? record.DistortionScrollSpeed, 1),
    distortionScrollX: readNumber(record.distortionScrollX ?? record.DistortionScrollX, 0),
    distortionScrollY: readNumber(record.distortionScrollY ?? record.DistortionScrollY, 0),
    distortionTexTilingX: readNumber(record.distortionTexTilingX ?? record.DistortionTexTilingX, 1),
    distortionTexTilingY: readNumber(record.distortionTexTilingY ?? record.DistortionTexTilingY, 1),
    threshold: readNumber(record.threshold ?? record.Threshold, 0.5),
    lightInfluence: readNumber(record.lightInfluence ?? record.LightInfluence, 1),
    lightInfluenceForEyeHighlight: readNumber(record.lightInfluenceForEyeHighlight ?? record.LightInfluenceForEyeHighlight, 1),
  };
}

function normalizeBodyManifest(
  raw: unknown,
  resolvePath: (path: string) => string
): BodyAssetManifest {
  const record = asRecord(raw);
  const source = asRecord(record.source ?? record.Source);
  const skeleton = asRecord(record.skeleton ?? record.Skeleton);
  const neckAttach = asRecord(skeleton.neckAttach ?? skeleton.NeckAttach);
  const proxy = asRecord(record.proxy ?? record.Proxy);
  const characterId = normalizeCharacterId(record.characterId ?? record.CharacterId)
    ?? inferCharacterIdFromText(readString(skeleton.skeletonId ?? skeleton.SkeletonId));
  const bodyMaterialsRaw = readUnknownArray(record.bodyMaterials ?? record.BodyMaterials);
  const animationUrls = readStringArray(source.animationUrls ?? source.AnimationUrls);

  return {
    id: readString(record.id ?? record.Id),
    displayName: readString(record.displayName ?? record.DisplayName),
    characterId,
    characterHeightMeters: resolveCharacterHeightMeters(
      record.characterHeightMeters ?? record.CharacterHeightMeters ?? record.height ?? record.Height,
      characterId
    ),
    materialPipeline: readString(record.materialPipeline ?? record.MaterialPipeline, "embedded") as BodyAssetManifest["materialPipeline"],
    source: {
      bundleRoot: readString(source.bundleRoot ?? source.BundleRoot),
      manifestUrl: readString(source.manifestUrl ?? source.ManifestUrl),
      meshUrl: resolveRequiredPath(readString(source.meshUrl ?? source.MeshUrl), resolvePath),
      skeletonUrl: resolveOptionalPath(readString(source.skeletonUrl ?? source.SkeletonUrl), resolvePath),
      animationUrls: animationUrls.map((path) => resolvePath(path)),
    },
    neckAnchor: readVec3Record(record.neckAnchor ?? record.NeckAnchor, { x: 0, y: 1.75, z: 0.15 }),
    skeleton: {
      skeletonId: readString(skeleton.skeletonId ?? skeleton.SkeletonId),
      rootNodeName: readString(skeleton.rootNodeName ?? skeleton.RootNodeName) || undefined,
      neckAttach: {
        nodeName: readString(neckAttach.nodeName ?? neckAttach.NodeName) || undefined,
        fallbackPosition: readVec3Record(
          neckAttach.fallbackPosition ?? neckAttach.FallbackPosition,
          { x: 0, y: 1.75, z: 0.15 }
        ),
      },
    },
    bodyMaterials: bodyMaterialsRaw.map((entry) => {
      const slot = asRecord(entry);
      const identity = readRequiredMaterialIdentity(slot, "body material slot");
      return {
        meshName: readString(slot.meshName ?? slot.MeshName),
        ...identity,
        materialName: readString(slot.materialName ?? slot.MaterialName) || undefined,
        materialKind: readString(slot.materialKind ?? slot.MaterialKind) || undefined,
        mainTex: resolveOptionalPath(readString(slot.mainTex ?? slot.MainTex), resolvePath),
        shadowTex: resolveOptionalPath(readString(slot.shadowTex ?? slot.ShadowTex), resolvePath),
        valueTex: resolveOptionalPath(readString(slot.valueTex ?? slot.ValueTex), resolvePath),
        lighting: readMaterialLighting(slot.lighting ?? slot.Lighting),
      };
    }),
    proxy: {
      bodyColor: readString(proxy.bodyColor ?? proxy.BodyColor, "#f2d0c3"),
      shadowColor: readString(proxy.shadowColor ?? proxy.ShadowColor, "#bf958a"),
      bodyScale: readNumber(proxy.bodyScale ?? proxy.BodyScale, 1),
      torsoLength: readNumber(proxy.torsoLength ?? proxy.TorsoLength, 2.2),
      shoulderWidth: readNumber(proxy.shoulderWidth ?? proxy.ShoulderWidth, 1.1),
    },
  };
}

function normalizeHeadManifest(
  raw: unknown,
  resolvePath: (path: string) => string
): HeadAssetManifest {
  const record = asRecord(raw);
  const source = asRecord(record.source ?? record.Source);
  const assembly = asRecord(record.assembly ?? record.Assembly);
  const attachOrigin = asRecord(assembly.attachOrigin ?? assembly.AttachOrigin);
  const boneRemapRecord = asRecord(assembly.boneRemap ?? assembly.BoneRemap);
  const proxy = asRecord(record.proxy ?? record.Proxy);
  const characterId = normalizeCharacterId(record.characterId ?? record.CharacterId)
    ?? inferCharacterIdFromText(readString(assembly.expectedSkeletonId ?? assembly.ExpectedSkeletonId));
  const faceMaterialsRaw = readUnknownArray(record.faceMaterials ?? record.FaceMaterials);

  return {
    id: readString(record.id ?? record.Id),
    displayName: readString(record.displayName ?? record.DisplayName),
    characterId,
    characterHeightMeters: resolveCharacterHeightMeters(
      record.characterHeightMeters ?? record.CharacterHeightMeters ?? record.height ?? record.Height,
      characterId
    ),
    materialPipeline: readString(record.materialPipeline ?? record.MaterialPipeline, "embedded") as HeadAssetManifest["materialPipeline"],
    source: {
      bundleRoot: readString(source.bundleRoot ?? source.BundleRoot),
      manifestUrl: readString(source.manifestUrl ?? source.ManifestUrl),
      meshUrl: resolveRequiredPath(readString(source.meshUrl ?? source.MeshUrl), resolvePath),
      skeletonUrl: resolveOptionalPath(readString(source.skeletonUrl ?? source.SkeletonUrl), resolvePath),
      animationUrls: readStringArray(source.animationUrls ?? source.AnimationUrls).map((path) => resolvePath(path)),
    },
    rawImportOffset: readVec3Record(record.rawImportOffset ?? record.RawImportOffset, { x: 0, y: 0, z: 0 }),
    assembly: {
      expectedSkeletonId: readString(assembly.expectedSkeletonId ?? assembly.ExpectedSkeletonId),
      attachOrigin: {
        nodeName: readString(attachOrigin.nodeName ?? attachOrigin.NodeName) || undefined,
        fallbackPosition: readVec3Record(
          attachOrigin.fallbackPosition ?? attachOrigin.FallbackPosition,
          { x: 0, y: 0.08, z: 0.02 }
        ),
      },
      rootNodeName: readString(assembly.rootNodeName ?? assembly.RootNodeName) || undefined,
      boneRemap: Object.fromEntries(
        Object.entries(boneRemapRecord).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string"
        )
      ),
    },
    defaultFaceMode: readString(record.defaultFaceMode ?? record.DefaultFaceMode, "clean") as HeadAssetManifest["defaultFaceMode"],
    morphChannels: readStringArray(record.morphChannels ?? record.MorphChannels),
    morphChannelBindings: readUnknownArray(record.morphChannelBindings ?? record.MorphChannelBindings)
      .map((entry) => asRecord(entry))
      .filter((entry) => typeof entry.nameHash === "number" || typeof entry.NameHash === "number")
      .map((entry) => ({
        name: readString(entry.name ?? entry.Name),
        sourceName: readString(entry.sourceName ?? entry.SourceName),
        nameHash: Number(entry.nameHash ?? entry.NameHash),
        curveHash: Number(entry.curveHash ?? entry.CurveHash),
      })),
    faceMaterials: faceMaterialsRaw.map((entry) => {
      const slot = asRecord(entry);
      const identity = readRequiredMaterialIdentity(slot, "head material slot");
      return {
        meshName: readString(slot.meshName ?? slot.MeshName),
        ...identity,
        materialName: readString(slot.materialName ?? slot.MaterialName) || undefined,
        materialKind: readString(slot.materialKind ?? slot.MaterialKind) || undefined,
        mainTex: resolveOptionalPath(readString(slot.mainTex ?? slot.MainTex), resolvePath),
        shadowTex: resolveOptionalPath(readString(slot.shadowTex ?? slot.ShadowTex), resolvePath),
        valueTex: resolveOptionalPath(readString(slot.valueTex ?? slot.ValueTex), resolvePath),
        faceShadowTex: resolveOptionalPath(readString(slot.faceShadowTex ?? slot.FaceShadowTex), resolvePath),
        mode: readString(slot.mode ?? slot.Mode, "clean") as HeadAssetManifest["defaultFaceMode"],
        lighting: readMaterialLighting(slot.lighting ?? slot.Lighting),
      };
    }),
    proxy: {
      faceColor: readString(proxy.faceColor ?? proxy.FaceColor, "#fde2d9"),
      faceShadeColor: readString(proxy.faceShadeColor ?? proxy.FaceShadeColor, "#f7cdbf"),
      skinColorDefault: readString(proxy.skinColorDefault ?? proxy.SkinColorDefault, readString(proxy.faceColor ?? proxy.FaceColor, "#fde2d9")),
      skinColor1: readString(proxy.skinColor1 ?? proxy.SkinColor1, readString(proxy.faceShadeColor ?? proxy.FaceShadeColor, "#f7cdbf")),
      skinColor2: readString(proxy.skinColor2 ?? proxy.SkinColor2, readString(proxy.faceShadeColor ?? proxy.FaceShadeColor, "#f7cdbf")),
      hairColor: readString(proxy.hairColor ?? proxy.HairColor, "#7b5b4a"),
      hairShadowColor: readString(proxy.hairShadowColor ?? proxy.HairShadowColor, "#513d33"),
      headRadius: readNumber(proxy.headRadius ?? proxy.HeadRadius, 0.74),
      faceDepth: readNumber(proxy.faceDepth ?? proxy.FaceDepth, 0.82),
      hairArc: readNumber(proxy.hairArc ?? proxy.HairArc, 0.98),
    },
  };
}

function resolveOptionalPath(path: string, resolvePath: (path: string) => string) {
  return path ? resolvePath(path) : undefined;
}

function resolveRequiredPath(path: string, resolvePath: (path: string) => string) {
  return path ? resolvePath(path) : "";
}

function normalizeRuntimeExtension(
  raw: unknown,
  resolvePath: (path: string) => string
) {
  const extension = asRecord(raw);
  const bodyAsset = normalizeBodyManifest(
    extension.bodyManifest ?? extension.BodyManifest,
    resolvePath
  );
  const headAsset = normalizeHeadManifest(
    extension.headManifest ?? extension.HeadManifest,
    resolvePath
  );
  applyRuntimeMaterialSlots(bodyAsset, headAsset, extension, resolvePath);
  return { extension, bodyAsset, headAsset };
}

async function normalizeRuntimeWithUnityRuntimeJson(
  runtimeExtension: UnknownRecord,
  unityRuntimeJsonUrl: string | null | undefined,
  resolvePath: (path: string) => string
) {
  if (!unityRuntimeJsonUrl) {
    return normalizeRuntimeExtension(runtimeExtension, resolvePath);
  }
  const unityRuntimeExtension = asRecord(await fetchRuntimeJson(unityRuntimeJsonUrl));
  return normalizeRuntimeExtension({
    ...unityRuntimeExtension,
    ...runtimeExtension,
    bodyManifest:
      runtimeExtension.bodyManifest ??
      runtimeExtension.BodyManifest ??
      unityRuntimeExtension.bodyManifest ??
      unityRuntimeExtension.BodyManifest,
    headManifest:
      runtimeExtension.headManifest ??
      runtimeExtension.HeadManifest ??
      unityRuntimeExtension.headManifest ??
      unityRuntimeExtension.HeadManifest,
    materialSlots:
      runtimeExtension.materialSlots ??
      runtimeExtension.MaterialSlots ??
      unityRuntimeExtension.materialSlots ??
      unityRuntimeExtension.MaterialSlots,
  }, resolvePath);
}

function applyRuntimeMaterialSlots(
  bodyAsset: BodyAssetManifest,
  headAsset: HeadAssetManifest,
  runtimeExtension: UnknownRecord,
  resolvePath: (path: string) => string
) {
  const materialSlots = asRecord(runtimeExtension.materialSlots ?? runtimeExtension.MaterialSlots);
  const bodySlots = readUnknownArray(materialSlots.body ?? materialSlots.Body);
  const headSlots = readUnknownArray(materialSlots.head ?? materialSlots.Head);
  const accessorySlots = readUnknownArray(materialSlots.accessory ?? materialSlots.Accessory);

  if (bodySlots.length) {
    bodyAsset.bodyMaterials = bodySlots.map((entry) => {
      const slot = asRecord(entry);
      const identity = readRequiredMaterialIdentity(slot, "runtime body material slot");
      return {
        meshName: readString(slot.meshName ?? slot.MeshName),
        ...identity,
        materialName: readString(slot.materialName ?? slot.MaterialName) || undefined,
        materialKind: readString(slot.materialKind ?? slot.MaterialKind) || undefined,
        mainTex: resolveOptionalPath(readString(slot.mainTex ?? slot.MainTex), resolvePath),
        shadowTex: resolveOptionalPath(readString(slot.shadowTex ?? slot.ShadowTex), resolvePath),
        valueTex: resolveOptionalPath(readString(slot.valueTex ?? slot.ValueTex), resolvePath),
        lighting: readMaterialLighting(slot.lighting ?? slot.Lighting),
      };
    });
  }

  const readHeadMaterialSlot = (entry: unknown, fallbackMaterialKind?: string) => {
    const slot = asRecord(entry);
    const identity = readRequiredMaterialIdentity(slot, "runtime head material slot");
    return {
      meshName: readString(slot.meshName ?? slot.MeshName),
      ...identity,
      materialName: readString(slot.materialName ?? slot.MaterialName) || undefined,
      materialKind: readString(slot.materialKind ?? slot.MaterialKind) || fallbackMaterialKind || undefined,
      mainTex: resolveOptionalPath(readString(slot.mainTex ?? slot.MainTex), resolvePath),
      shadowTex: resolveOptionalPath(readString(slot.shadowTex ?? slot.ShadowTex), resolvePath),
      valueTex: resolveOptionalPath(readString(slot.valueTex ?? slot.ValueTex), resolvePath),
      faceShadowTex: resolveOptionalPath(readString(slot.faceShadowTex ?? slot.FaceShadowTex), resolvePath),
      mode: headAsset.defaultFaceMode,
      isAccessory: readBoolean(slot.isAccessory ?? slot.IsAccessory) || fallbackMaterialKind === "accessory" || undefined,
      lighting: readMaterialLighting(slot.lighting ?? slot.Lighting),
    };
  };

  if (headSlots.length || accessorySlots.length) {
    headAsset.faceMaterials = [
      ...(headSlots.length
        ? headSlots.map((entry) => readHeadMaterialSlot(entry))
        : headAsset.faceMaterials),
      ...accessorySlots.map((entry) => readHeadMaterialSlot(entry, "accessory")),
    ];
  }
}

function readRuntimePreviewLight(extension: UnknownRecord): PreviewLightState | null {
  const profile = asRecord(extension.sekaiRuntimeMaterialProfile ?? extension.SekaiRuntimeMaterialProfile);
  const preview = asRecord(profile.viewerTunedPreview ?? profile.ViewerTunedPreview);
  const pluginPreview = asRecord(profile.pluginPreview ?? profile.PluginPreview);
  const hasPreview = Object.keys(preview).length > 0;
  const hasPluginPreview = Object.keys(pluginPreview).length > 0;
  if (!hasPreview && !hasPluginPreview) {
    return null;
  }
  const pluginDirectionalLocation = readVec3Record(
    pluginPreview.directionalLocation ?? pluginPreview.DirectionalLocation,
    {
      x: previewLightDefaults.x,
      y: -previewLightDefaults.z,
      z: previewLightDefaults.y,
    }
  );
  const pluginLightDirection =
    sekaiPluginLightLocationToThreeDirection(pluginDirectionalLocation);
  const readProfileNumber = (
    previewCamel: string,
    previewPascal: string,
    pluginCamel: string,
    pluginPascal: string,
    fallback: number
  ) =>
    readNumber(
      preview[previewCamel] ?? preview[previewPascal],
      readNumber(pluginPreview[pluginCamel] ?? pluginPreview[pluginPascal], fallback)
    );
  return {
    x: readNumber(preview.x ?? preview.X, pluginLightDirection.x),
    y: readNumber(preview.y ?? preview.Y, pluginLightDirection.y),
    z: readNumber(preview.z ?? preview.Z, pluginLightDirection.z),
    intensity: readProfileNumber("intensity", "Intensity", "directionalEnergy", "DirectionalEnergy", previewLightDefaults.intensity),
    ambient: readProfileNumber("ambient", "Ambient", "ambientIntensity", "AmbientIntensity", previewLightDefaults.ambient),
    shadowThreshold: readProfileNumber("shadowThreshold", "ShadowThreshold", "shadowThreshold", "ShadowThreshold", previewLightDefaults.shadowThreshold),
    shadowWeight: readProfileNumber("shadowWeight", "ShadowWeight", "shadowWeight", "ShadowWeight", previewLightDefaults.shadowWeight),
    characterAmbient: readProfileNumber("characterAmbient", "CharacterAmbient", "characterAmbientIntensity", "CharacterAmbientIntensity", previewLightDefaults.characterAmbient),
    rimIntensity: readProfileNumber("rimIntensity", "RimIntensity", "rimIntensity", "RimIntensity", previewLightDefaults.rimIntensity),
    rimThreshold: readProfileNumber("rimThreshold", "RimThreshold", "rimThreshold", "RimThreshold", previewLightDefaults.rimThreshold),
    rimDirectionality: readProfileNumber("rimDirectionality", "RimDirectionality", "rimDirectionality", "RimDirectionality", previewLightDefaults.rimDirectionality),
    faceSoftness: readNumber(preview.faceSoftness ?? preview.FaceSoftness, previewLightDefaults.faceSoftness),
    faceSdfUseLightDirection: readNumber(
      preview.faceSdfUseLightDirection ?? preview.FaceSdfUseLightDirection,
      previewLightDefaults.faceSdfUseLightDirection
    ),
    characterHeight: readNumber(
      preview.characterHeight ?? preview.CharacterHeight,
      previewLightDefaults.characterHeight
    ),
  };
}

function readRuntimeMotionPackage(extension: UnknownRecord) {
  return asRecord(extension.motionPackage ?? extension.MotionPackage);
}

function readEmbeddedFaceMotion(extension: UnknownRecord): FaceMotionSet | null {
  const motionPackage = readRuntimeMotionPackage(extension);
  const faceMotion = motionPackage.faceMotion ?? motionPackage.FaceMotion;
  return faceMotion ? faceMotion as FaceMotionSet : null;
}

function readEmbeddedUnityMotionPath(extension: UnknownRecord) {
  const motionPackage = readRuntimeMotionPackage(extension);
  return readString(motionPackage.unityMotionJson ?? motionPackage.UnityMotionJson) || null;
}

function readUnityRuntimeJsonPath(extension: UnknownRecord) {
  const container = asRecord(extension.container ?? extension.Container);
  return readString(container.unityRuntimeJson ?? container.UnityRuntimeJson) || null;
}

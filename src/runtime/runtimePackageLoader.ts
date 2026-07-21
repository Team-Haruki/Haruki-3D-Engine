import { mergePartRuntimeCore } from "../../part-runtime-core.mjs";
import type { RuntimeCombinedCharacterAsset } from "./runtimeTypes";
import { CustomWardrobeController } from "../parts/customWardrobeController";
import { decodeRuntimeMessagePackBrotli } from "./runtimeMessagePackDecoder";
import {
  getDefaultCustomSelection,
  getDeniedHeadHairCompatibilityKeys,
  headHairCompatibilityKey,
  runtimeRoleId,
  tryRuntimePartSlot,
  type HeadHairCompatibility,
  type PartPackageSet,
  type PartRegistryEntry,
  type PartRuntimePackage,
  type RoleRuntimePackage,
  type RuntimePartType,
  type RuntimeRoleCatalog,
  type RuntimeRoleCatalogEntry,
} from "../parts/runtimePartComposer";

type PartRegistryInput = PartRegistryEntry[] | {
  entries?: PartRegistryEntry[];
  parts?: PartRegistryEntry[];
};

export type RuntimePackageLoadResult = {
  kind: "part-registry";
  combinedCharacter: RuntimeCombinedCharacterAsset | null;
  previewLight: null;
  faceMotion: null;
  displayNameByUrl: Map<string, string>;
  partSet: PartPackageSet | null;
  wardrobe: CustomWardrobeController | null;
};

export type RuntimePackageLoadOptions = {
  deferDefaultSelection?: boolean;
  roleId: string;
};

const parsedRuntimeMetadata = new Map<string, { version: string; value: unknown }>();
const parsedRuntimeMetadataLimit = 16;

export async function loadRuntimePackageFromBaseUrl(
  baseUrl: string,
  options: RuntimePackageLoadOptions
): Promise<RuntimePackageLoadResult> {
  const displayNameByUrl = new Map<string, string>();
  const partSet = await loadPartPackageSetFromBaseUrl(baseUrl, options);
  const wardrobe = new CustomWardrobeController({
    resolveUrl: (path) => resolveRuntimePackageUrl(baseUrl, path),
    loadPartRuntime: async (entry) => loadPartRuntimePackage(partSet, entry, baseUrl),
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
}

export function resolveRuntimePackageUrl(baseUrl: string, relativePath: string) {
  const base = new URL(baseUrl, window.location.href);
  if (!base.pathname.endsWith("/")) {
    base.pathname = `${base.pathname}/`;
  }
  const parts = relativePath
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .split("/")
    .filter((part) => part.length > 0);
  if (parts.length === 0 || parts.some((part) => part === "." || part === "..")) {
    throw new Error(`Invalid runtime package relative path: ${relativePath}`);
  }
  const normalized = parts
    .map((part) => encodeURIComponent(part))
    .join("/");
  return new URL(normalized, base).toString();
}

async function loadPartPackageSetFromBaseUrl(
  baseUrl: string,
  options: RuntimePackageLoadOptions
): Promise<PartPackageSet> {
  const role = parseRuntimeRoleIdOption(options.roleId);
  const scopedRoot = `parts/by-role/${role.characterId}/${runtimePathUnitSegment(role.unit)}`;
  const [registryInput, roleCatalog] = await Promise.all([
    fetchRuntimeMessagePack(
      resolveRuntimePackageUrl(baseUrl, `${scopedRoot}/part-registry.msgpack.br`)
    ) as Promise<PartRegistryInput>,
    fetchRuntimeMessagePack(
      resolveRuntimePackageUrl(baseUrl, `${scopedRoot}/runtime-role-catalog.msgpack.br`)
    ) as Promise<RuntimeRoleCatalog>,
  ]);
  const registry = normalizePartRegistry(registryInput);
  const compatibility = null;
  const roles = validateScopedRoleCatalog(roleCatalog, role.characterId, role.unit);
  const packages = new Map<string, PartRuntimePackage>();
  if (options.deferDefaultSelection) {
    return {
      registry,
      roles,
      compatibility,
      packages,
      roleRuntimes: new Map<string, RoleRuntimePackage>(),
      baseUrl,
    };
  }
  const candidates = selectPartRuntimeCandidates(registry, roles, compatibility);
  const batchSize = 24;
  const maxCandidates = 720;
  for (let offset = 0; offset < Math.min(candidates.length, maxCandidates); offset += batchSize) {
    const batch = candidates.slice(offset, offset + batchSize);
    const results = await Promise.all(batch.map(async (entry) => ({
      entry,
      runtime: await fetchOptionalPartRuntime(baseUrl, entry),
    })));
    for (const result of results) {
      if (result.runtime) {
        packages.set(
          result.entry.packagePath,
          withPartRuntimePackagePath(result.runtime, result.entry)
        );
      }
    }
    if (hasUsableCustomPartSelection(registry, roles, compatibility, packages, baseUrl)) {
      break;
    }
  }
  if (!hasUsableCustomPartSelection(registry, roles, compatibility, packages, baseUrl)) {
    throw new Error(
      `Part registry package did not expose a compatible loaded body/head/hair selection from ${baseUrl}.`
    );
  }
  const defaultSelection = getDefaultCustomSelection({
    registry,
    roles,
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
    roles,
    targetRoleIds
  );
  return {
    registry,
    roles,
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
  const entry = partSet.roles.find((candidate) =>
    candidate.roleRuntimePath &&
    candidate.characterId === characterId &&
    runtimeRoleId(candidate.characterId, candidate.unit ?? null) === roleId
  );
  if (!entry?.roleRuntimePath) {
    return null;
  }
  const runtime = await fetchOptionalRuntimeMessagePack<RoleRuntimePackage>(
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
  roles: RuntimeRoleCatalogEntry[],
  targetRoleIds: ReadonlySet<string> | null = null
): Promise<Map<string, RoleRuntimePackage>> {
  const result = new Map<string, RoleRuntimePackage>();
  const entries = roles.filter((entry) =>
    entry.roleRuntimePath &&
    (!targetRoleIds || targetRoleIds.has(runtimeRoleId(entry.characterId, entry.unit ?? null)))
  );
  const loaded = await Promise.all(entries.map(async (entry) => ({
    entry,
    runtime: await fetchOptionalRuntimeMessagePack<RoleRuntimePackage>(
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
  const runtime = await fetchPartRuntime(baseUrl, entry);
  const normalized = withPartRuntimePackagePath(runtime, entry);
  partSet.packages.set(entry.packagePath, normalized);
  return normalized;
}
async function fetchPartRuntime(baseUrl: string, entry: PartRegistryEntry) {
  const runtime = await fetchRuntimeMessagePack(
    resolveRuntimePackageUrl(baseUrl, `${entry.packagePath}/part-runtime.msgpack.br`)
  ) as PartRuntimePackage;
  if (!runtime.corePath?.endsWith(".msgpack.br")) {
    throw new Error(`Part runtime must reference a .msgpack.br shared core: ${entry.packagePath}.`);
  }
  const core = await fetchRuntimeMessagePack(
    resolveRuntimePackageUrl(baseUrl, runtime.corePath)
  ) as Record<string, unknown>;
  return mergePartRuntimeCore(runtime, core) as PartRuntimePackage;
}

async function fetchOptionalPartRuntime(baseUrl: string, entry: PartRegistryEntry) {
  try {
    return await fetchPartRuntime(baseUrl, entry);
  } catch {
    return null;
  }
}

async function ensureCompatibilityForSelection(
  partSet: PartPackageSet,
  unit: string | null | undefined,
  baseUrl = partSet.baseUrl
) {
  if (partSet.compatibility) {
    return;
  }
  partSet.compatibility = await fetchRuntimeMessagePack(
    resolveRuntimePackageUrl(
      baseUrl,
      `parts/compat/by-unit/${runtimePathUnitSegment(unit)}/head-hair-compatibility.msgpack.br`
    )
  ) as HeadHairCompatibility;
}

function parseRuntimeRoleIdOption(roleId: string) {
  if (!roleId) {
    throw new Error("Runtime role id is required.");
  }
  const [characterIdPart, ...unitParts] = roleId.split(":");
  const characterId = Number(characterIdPart);
  if (!Number.isInteger(characterId) || characterId <= 0) {
    throw new Error(`Invalid runtime role id: ${roleId}`);
  }
  const unit = unitParts.join(":") || null;
  return { characterId, unit };
}

function validateScopedRoleCatalog(
  catalog: RuntimeRoleCatalog,
  characterId: number,
  unit: string | null
): RuntimeRoleCatalogEntry[] {
  const roles = catalog?.version === 2 && typeof catalog.masterVersion === "string" && catalog.masterVersion.length > 0 && Array.isArray(catalog.roles)
    ? catalog.roles
    : [];
  if (roles.length !== 1) {
    throw new Error(`Runtime role catalog must contain exactly one scoped role for ${runtimeRoleId(characterId, unit)}.`);
  }
  const role = roles[0]!;
  const expected = expectedRuntimeRoleIdentity(role.roleId);
  const expectedRuntimePath = expected
    ? `roles/${expected.characterId}/${runtimePathUnitSegment(expected.unit)}/role-runtime.msgpack.br`
    : "";
  if (
    !expected ||
    role.characterId !== characterId ||
    runtimeRoleId(role.characterId, role.unit) !== runtimeRoleId(characterId, unit) ||
    role.characterId !== expected.characterId ||
    runtimeRoleId(role.characterId, role.unit) !== runtimeRoleId(expected.characterId, expected.unit) ||
    !Number.isInteger(role.roleId) || role.roleId < 1 || role.roleId > 31 ||
    !Number.isInteger(role.bodyCostume3dId) || role.bodyCostume3dId <= 0 ||
    !Number.isInteger(role.headCostume3dId) || role.headCostume3dId <= 0 ||
    !Number.isInteger(role.hairCostume3dId) || role.hairCostume3dId <= 0 ||
    role.roleRuntimePath !== expectedRuntimePath
  ) {
    throw new Error(`Runtime role catalog is invalid for ${runtimeRoleId(characterId, unit)}.`);
  }
  return roles;
}

function expectedRuntimeRoleIdentity(roleId: number): { characterId: number; unit: string } | null {
  if (!Number.isInteger(roleId) || roleId < 1 || roleId > 31) return null;
  if (roleId <= 20) {
    const unit = roleId <= 4
      ? "light_sound"
      : roleId <= 8
        ? "idol"
        : roleId <= 12
          ? "street"
          : roleId <= 16
            ? "theme_park"
            : "school_refusal";
    return { characterId: roleId, unit };
  }
  if (roleId <= 26) {
    return {
      characterId: 21,
      unit: ["piapro", "idol", "light_sound", "street", "theme_park", "school_refusal"][roleId - 21]!,
    };
  }
  return { characterId: roleId - 5, unit: "piapro" };
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

export async function fetchRuntimeMessagePack(url: string) {
  if (!url.endsWith(".msgpack.br")) {
    throw new Error(`Runtime metadata must use .msgpack.br: ${url}`);
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: HTTP ${response.status}`);
  }
  return readMessagePackBrotliRuntime(response, url);
}

async function readMessagePackBrotliRuntime(response: Response, url: string) {
  try {
    const version = response.headers.get("x-haruki-file-version");
    const cached = version && isCacheableRuntimeMetadataUrl(url)
      ? parsedRuntimeMetadata.get(url)
      : null;
    if (cached?.version === version) {
      parsedRuntimeMetadata.delete(url);
      parsedRuntimeMetadata.set(url, cached);
      await response.body?.cancel();
      return cached.value;
    }
    const value = await decodeRuntimeMessagePackBrotli(await response.arrayBuffer());
    if (version && isCacheableRuntimeMetadataUrl(url)) {
      parsedRuntimeMetadata.delete(url);
      parsedRuntimeMetadata.set(url, { version, value });
      while (parsedRuntimeMetadata.size > parsedRuntimeMetadataLimit) {
        parsedRuntimeMetadata.delete(parsedRuntimeMetadata.keys().next().value!);
      }
    }
    return value;
  } catch (error) {
    throw error instanceof Error
      ? error
      : new Error(`Failed to decode ${url}: ${String(error)}`);
  }
}

function isCacheableRuntimeMetadataUrl(url: string) {
  const path = url.split(/[?#]/, 1)[0] ?? url;
  return /\/parts\/by-role\/[^/]+\/[^/]+\/(?:part-registry|runtime-role-catalog)\.msgpack\.br$/.test(path) ||
    /\/parts\/compat\/by-unit\/[^/]+\/head-hair-compatibility\.msgpack\.br$/.test(path) ||
    /\/roles\/[^/]+\/[^/]+\/(?:role-runtime|motion\/unity-motion)\.msgpack\.br$/.test(path);
}

async function fetchOptionalRuntimeMessagePack<T>(url: string): Promise<T | null> {
  try {
    return await fetchRuntimeMessagePack(url) as T;
  } catch {
    return null;
  }
}

function normalizePartRegistry(input: PartRegistryInput): PartRegistryEntry[] {
  return Array.isArray(input) ? input : input.entries ?? input.parts ?? [];
}

function selectPartRuntimeCandidates(
  registry: PartRegistryEntry[],
  roles: RuntimeRoleCatalogEntry[],
  compatibility: HeadHairCompatibility | null
) {
  const preferredCharacterId = roles.find((entry) =>
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
  const deniedHeadHairKeys = getDeniedHeadHairCompatibilityKeys(compatibility);

  if (preferredCharacterId !== null) {
    for (const entry of roles) {
      if (entry.characterId !== preferredCharacterId) {
        continue;
      }
      if (typeof entry.bodyCostume3dId === "number") {
        addEntry(findRegistryEntry(entry.characterId, "body", entry.bodyCostume3dId, entry.unit));
      }
      if (typeof entry.headCostume3dId === "number") {
        addEntry(findRegistryEntry(entry.characterId, "head", entry.headCostume3dId, entry.unit));
        addEntry(findRegistryEntry(entry.characterId, "head_optional", entry.headCostume3dId, entry.unit));
      }
      if (typeof entry.hairCostume3dId === "number") {
        addEntry(findRegistryEntry(entry.characterId, "hair", entry.hairCostume3dId, entry.unit));
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
        ["head", "head_optional"].includes(tryRuntimePartSlot(entry) ?? "") &&
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
        if (
          tryRuntimePartSlot(head) !== "head" &&
          deniedHeadHairKeys.has(headHairCompatibilityKey(head.unit ?? hair.unit, head.costume3dId, hair.costume3dId))
        ) {
          continue;
        }
        addEntry(head);
        addEntry(hair);
      }
    }
  }

  const preferredCostumeIds = new Set<number>();
  for (const entry of roles) {
    if (preferredCharacterId !== null && entry.characterId !== preferredCharacterId) {
      continue;
    }
    for (const id of [
      entry.bodyCostume3dId,
      entry.headCostume3dId,
      entry.hairCostume3dId,
    ]) {
      if (typeof id === "number") {
        preferredCostumeIds.add(id);
      }
    }
  }

  const scored = registry
    .filter(isLoadableRegistryEntry)
    .filter((entry) => {
      return !seen.has(entry.packagePath);
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
  roles: RuntimeRoleCatalogEntry[],
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
  if (
    !loadedTypes.has("body") ||
    (!loadedTypes.has("head") && !loadedTypes.has("head_optional")) ||
    !loadedTypes.has("hair")
  ) {
    return false;
  }
  const partSet = {
    registry,
    roles,
    compatibility,
    packages,
    roleRuntimes: new Map<string, RoleRuntimePackage>(),
    baseUrl,
  };
  return Boolean(getDefaultCustomSelection(partSet));
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

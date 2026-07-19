export type HarukiRenderRecipe = {
  roleId: string;
  bodyCostume3dId: number;
  headCostume3dId: number;
  headPackagePath?: string | null;
  hairCostume3dId: number;
  headOptionalCostume3dId?: number | null;
};

export type HarukiRuntimeRenderRecipe = HarukiRenderRecipe & {
  baseUrl: string;
};

export type NormalizedHarukiRenderRecipe = {
  roleId: string;
  bodyCostume3dId: number;
  headCostume3dId: number;
  headPackagePath: string | null;
  hairCostume3dId: number;
  headOptionalCostume3dId: number | null;
};

export function normalizeHarukiRenderRecipe(
  recipe: HarukiRenderRecipe
): NormalizedHarukiRenderRecipe {
  const roleId = String(recipe.roleId ?? "").trim();
  if (!/^\d+(?::[A-Za-z0-9_/-]+)?$/.test(roleId)) {
    throw new Error("roleId must be '<characterId>:<unit>' or '<characterId>'.");
  }

  const readPartId = (name: keyof HarukiRenderRecipe) => {
    const value = recipe[name];
    if (!Number.isInteger(value) || Number(value) <= 0) {
      throw new Error(`${name} must be a positive integer.`);
    }
    return Number(value);
  };

  const rawHeadPackagePath = recipe.headPackagePath;
  const headPackagePath = rawHeadPackagePath == null
    ? null
    : String(rawHeadPackagePath).trim();
  if (headPackagePath !== null && (
    headPackagePath.length === 0 ||
    headPackagePath.length > 1024 ||
    headPackagePath.includes("\0")
  )) {
    throw new Error("headPackagePath must be null or a non-empty string of at most 1024 characters without NUL bytes.");
  }

  const rawOptionalId = recipe.headOptionalCostume3dId;
  const headOptionalCostume3dId = rawOptionalId == null
    ? null
    : readPartId("headOptionalCostume3dId");

  return {
    roleId,
    bodyCostume3dId: readPartId("bodyCostume3dId"),
    headCostume3dId: readPartId("headCostume3dId"),
    headPackagePath,
    hairCostume3dId: readPartId("hairCostume3dId"),
    headOptionalCostume3dId,
  };
}

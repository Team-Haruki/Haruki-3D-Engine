import type { RuntimeCombinedCharacterAsset } from "../runtime/runtimeTypes";
import {
  composeRuntimeCombinedCharacterAsset,
  getDefaultCustomSelection,
  listSelectableParts,
  resolveHeadRegistryEntry,
  resolveOptionalHeadRegistryEntry,
  runtimeRoleId,
  type CustomPartSelection,
  type PartPackageSet,
  type PartRegistryEntry,
  type PartRuntimePackage,
  type RuntimePartType,
} from "./runtimePartComposer";

export type CustomWardrobeControllerOptions = {
  resolveUrl: (path: string) => string;
  loadPartRuntime?: (entry: PartRegistryEntry) => Promise<PartRuntimePackage | null>;
  ensureCompatibility?: (selection: CustomPartSelection) => Promise<void>;
};

export class CustomWardrobeController {
  private partSet: PartPackageSet | null = null;
  private selection: CustomPartSelection | null = null;
  private activeRoleId: string | null = null;
  private combined: RuntimeCombinedCharacterAsset | null = null;

  constructor(private readonly options: CustomWardrobeControllerOptions) {
  }

  loadPartPackageSet(
    partSet: PartPackageSet,
    options: { composeDefault?: boolean } = {}
  ): RuntimeCombinedCharacterAsset | null {
    this.partSet = partSet;
    const composeDefault = options.composeDefault ?? true;
    this.selection = composeDefault ? getDefaultCustomSelection(partSet) : null;
    this.activeRoleId = this.selection
      ? runtimeRoleId(this.selection.characterId, this.selection.unit)
      : null;
    this.combined = this.selection ? this.compose(this.selection) : null;
    return this.combined;
  }

  clear(): void {
    this.partSet = null;
    this.selection = null;
    this.activeRoleId = null;
    this.combined = null;
  }

  getPartPackageSet(): PartPackageSet | null {
    return this.partSet;
  }

  getCustomSelection(): CustomPartSelection | null {
    return this.selection ? { ...this.selection } : null;
  }

  getActiveCharacterId(): number | null {
    return this.selection?.characterId ?? null;
  }

  getActiveRoleId(): string | null {
    return this.activeRoleId;
  }

  selectRole(characterId: number, unit: string | null): void {
    if (!this.partSet) {
      throw new Error("No custom part package set is loaded.");
    }
    this.activeRoleId = runtimeRoleId(characterId, unit);
    if (
      this.selection &&
      runtimeRoleId(this.selection.characterId, this.selection.unit) !== this.activeRoleId
    ) {
      this.selection = null;
      this.combined = null;
    }
  }

  getCombinedCharacter(): RuntimeCombinedCharacterAsset | null {
    return this.combined;
  }

  listCustomParts(
    characterId: number,
    partType: RuntimePartType,
    options: { unit?: string | null; loadedOnly?: boolean } = {}
  ): PartRegistryEntry[] {
    if (!this.partSet) {
      return [];
    }
    return listSelectableParts(this.partSet, characterId, partType, options);
  }

  async setCustomSelection(selection: CustomPartSelection): Promise<RuntimeCombinedCharacterAsset> {
    if (!this.partSet) {
      throw new Error("No custom part package set is loaded.");
    }
    const resolvedSelection = this.resolveHeadSource(selection);
    this.assertSameActiveCharacter(resolvedSelection);
    this.activeRoleId ??= runtimeRoleId(resolvedSelection.characterId, resolvedSelection.unit);
    await this.ensureSelectionPackages(resolvedSelection);
    await this.options.ensureCompatibility?.(resolvedSelection);
    const combined = this.compose(resolvedSelection);
    this.selection = { ...resolvedSelection };
    this.combined = combined;
    return combined;
  }

  updateCustomSelection(
    partType: RuntimePartType,
    costume3dId: number | null
  ): Promise<RuntimeCombinedCharacterAsset> {
    if (!this.selection) {
      throw new Error("No custom selection is active.");
    }
    const next: CustomPartSelection = {
      ...this.selection,
      bodyCostume3dId: partType === "body" && costume3dId !== null
        ? costume3dId
        : this.selection.bodyCostume3dId,
      headCostume3dId: partType === "head" && costume3dId !== null
        ? costume3dId
        : this.selection.headCostume3dId,
      headPackagePath: partType === "head" && costume3dId !== null
        ? null
        : this.selection.headPackagePath,
      hairCostume3dId: partType === "hair" && costume3dId !== null
        ? costume3dId
        : this.selection.hairCostume3dId,
      headOptionalCostume3dId: partType === "head_optional"
        ? costume3dId
        : this.selection.headOptionalCostume3dId,
    };
    return this.setCustomSelection(next);
  }

  async composeCustomCharacter(selection: CustomPartSelection): Promise<RuntimeCombinedCharacterAsset> {
    const resolvedSelection = this.resolveHeadSource(selection);
    this.assertSameActiveCharacter(resolvedSelection);
    await this.ensureSelectionPackages(resolvedSelection);
    await this.options.ensureCompatibility?.(resolvedSelection);
    return this.compose(resolvedSelection);
  }

  private resolveHeadSource(selection: CustomPartSelection): CustomPartSelection {
    if (!this.partSet) {
      throw new Error("No custom part package set is loaded.");
    }
    const entry = resolveHeadRegistryEntry(this.partSet, selection);
    return { ...selection, headPackagePath: entry.packagePath };
  }

  private assertSameActiveCharacter(selection: CustomPartSelection): void {
    const nextRoleId = runtimeRoleId(selection.characterId, selection.unit);
    if (this.activeRoleId !== null && nextRoleId !== this.activeRoleId) {
      throw new Error(
        `Custom switching is limited to active role ${this.activeRoleId}. Select/reload role ${nextRoleId} before switching parts.`
      );
    }
  }

  private async ensureSelectionPackages(selection: CustomPartSelection): Promise<void> {
    if (!this.partSet || !this.options.loadPartRuntime) {
      return;
    }
    const entries = [
      this.findRegistryEntry(selection, "body", selection.bodyCostume3dId),
      resolveHeadRegistryEntry(this.partSet, selection),
      this.findRegistryEntry(selection, "hair", selection.hairCostume3dId),
      resolveOptionalHeadRegistryEntry(this.partSet, selection),
    ].filter((entry): entry is PartRegistryEntry =>
      entry !== null && entry.status !== "empty"
    );

    await Promise.all(entries.map(async (entry) => {
      if (this.partSet!.packages.has(entry.packagePath)) {
        return;
      }
      const loaded = await this.options.loadPartRuntime!(entry);
      if (!loaded) {
        throw new Error(`Failed to load ${entry.partType} package ${entry.packagePath}.`);
      }
    }));
  }

  private findRegistryEntry(
    selection: CustomPartSelection,
    partType: RuntimePartType,
    costume3dId: number
  ): PartRegistryEntry {
    if (!this.partSet) {
      throw new Error("No custom part package set is loaded.");
    }
    const entry = listSelectableParts(this.partSet, selection.characterId, partType, {
      unit: selection.unit,
      loadedOnly: false,
    }).find((candidate) => candidate.costume3dId === costume3dId);
    if (!entry) {
      throw new Error(
        `No ${partType} registry entry for role ${runtimeRoleId(selection.characterId, selection.unit)}, costume3dId ${costume3dId}.`
      );
    }
    return entry;
  }

  private compose(selection: CustomPartSelection): RuntimeCombinedCharacterAsset {
    if (!this.partSet) {
      throw new Error("No custom part package set is loaded.");
    }
    return composeRuntimeCombinedCharacterAsset({
      partSet: this.partSet,
      selection,
      activeRoleId: this.activeRoleId ?? runtimeRoleId(selection.characterId, selection.unit),
      resolveUrl: this.options.resolveUrl,
    });
  }
}

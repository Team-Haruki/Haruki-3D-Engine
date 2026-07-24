import type {
  RawMaterialProperties,
  RawMaterialTextureProperty,
} from "../data/sampleScene";

function matchesPropertyName(name: string, propertyName: string) {
  return name.toLowerCase() === propertyName.toLowerCase();
}

export function readRawMaterialFloat(
  rawMaterial: RawMaterialProperties | null | undefined,
  propertyName: string
) {
  const floatProperty = rawMaterial?.floatProperties?.find((entry) =>
    matchesPropertyName(entry.name, propertyName)
  );
  if (Number.isFinite(floatProperty?.value)) {
    return floatProperty!.value;
  }
  const intProperty = rawMaterial?.intProperties?.find((entry) =>
    matchesPropertyName(entry.name, propertyName)
  );
  return Number.isFinite(intProperty?.value) ? intProperty!.value : null;
}

export function readRawMaterialBoolean(
  rawMaterial: RawMaterialProperties | null | undefined,
  propertyName: string,
  keyword?: string
) {
  const value = readRawMaterialFloat(rawMaterial, propertyName);
  if (value !== null) {
    return value > 0.5;
  }
  if (!keyword) {
    return null;
  }
  if (rawMaterial?.validKeywords?.some((entry) => matchesPropertyName(entry, keyword))) {
    return true;
  }
  if (rawMaterial?.invalidKeywords?.some((entry) => matchesPropertyName(entry, keyword))) {
    return false;
  }
  return null;
}

export function readRawMaterialColor(
  rawMaterial: RawMaterialProperties | null | undefined,
  propertyName: string
) {
  const property = rawMaterial?.colorProperties?.find((entry) =>
    matchesPropertyName(entry.name, propertyName)
  );
  if (
    !property ||
    !Number.isFinite(property.r) ||
    !Number.isFinite(property.g) ||
    !Number.isFinite(property.b) ||
    !Number.isFinite(property.a)
  ) {
    return null;
  }
  return { r: property.r, g: property.g, b: property.b, a: property.a };
}

export function readRawMaterialTexture(
  rawMaterial: RawMaterialProperties | null | undefined,
  propertyName: string
): RawMaterialTextureProperty | null {
  return rawMaterial?.textureProperties?.find((entry) =>
    matchesPropertyName(entry.name, propertyName)
  ) ?? null;
}

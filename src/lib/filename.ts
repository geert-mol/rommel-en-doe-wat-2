import type { ElementType, EngineeringElement, Product, Project, ReleaseState } from "./types";

export interface FilenameParts {
  state: ReleaseState;
  projectCode: string;
  productCode: string;
  conceptCode: string;
  type: ElementType;
  partNumber: string;
  descriptionSlug: string;
  majorVersion: number;
  minorVersion: number;
}

export const padProjectOrProductId = (value: string): string =>
  value.trim().replace(/\D/g, "").padStart(3, "0").slice(-3);

export const normalizePartNumber = (value: string): string => {
  const cleaned = value.trim().replace(/\D/g, "");
  if (cleaned.length === 0) return "00";
  return cleaned.length === 1 ? `0${cleaned}` : cleaned;
};

export const slugify = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

export const formatVersionLabel = (majorVersion: number, minorVersion: number): string =>
  minorVersion > 0 ? `v${majorVersion}-${minorVersion}` : `v${majorVersion}`;

export const generateFileName = (parts: FilenameParts): string => {
  const version = formatVersionLabel(parts.majorVersion, parts.minorVersion);
  return [
    parts.state,
    `${parts.projectCode}-${parts.productCode}`,
    parts.conceptCode,
    parts.type,
    parts.partNumber,
    parts.descriptionSlug,
    version
  ].join("_");
};

export const extensionForType = (type: ElementType): string => {
  if (type === "PA" || type === "MM") return ".sldprt";
  return ".sldasm";
};

export const buildSuggestedFilePath = (
  fileName: string,
  element: EngineeringElement,
  _project: Project,
  product: Product
): string => {
  const ext = extensionForType(element.type);
  const explicitProductFolder = product.folderPath?.trim().replace(/[\\/]+$/, "");
  if (explicitProductFolder) {
    return `${explicitProductFolder}/${fileName}${ext}`;
  }
  return `${fileName}${ext}`;
};

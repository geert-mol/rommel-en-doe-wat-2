export const RELEASE_STATES = ["PT", "PR", "RL", "RR"] as const;
export type ReleaseState = (typeof RELEASE_STATES)[number];

export const ELEMENT_TYPES = ["MM", "HA", "SA", "PA"] as const;
export type ElementType = (typeof ELEMENT_TYPES)[number];

export const VERSION_EXPORT_KINDS = [
  "solidworksDrawing",
  "step",
  "drawing",
  "sheetMetal",
  "stl"
] as const;
export type VersionExportKind = (typeof VERSION_EXPORT_KINDS)[number];
export type VersionExports = Partial<Record<VersionExportKind, true>>;

export type VersionKind = "major" | "minor";

export interface AppSettings {
  defaultRootPath: string;
}

export interface Project {
  id: string;
  projectId: string;
  name: string;
  rootPath?: string;
}

export interface Product {
  id: string;
  productId: string;
  projectId: string;
  name: string;
}

export interface ElementVersion {
  id: string;
  majorVersion: number;
  minorVersion: number;
  releaseState: ReleaseState;
  createdAt: string;
  availableExports?: VersionExports;
}

export interface ElementConcept {
  id: string;
  conceptCode: string;
  versions: ElementVersion[];
}

export interface EngineeringElement {
  id: string;
  projectId: string;
  productId: string;
  parentElementIds: string[];
  type: ElementType;
  partNumber: string;
  descriptionSlug: string;
  concepts: ElementConcept[];
}

export interface AppState {
  settings: AppSettings;
  projects: Project[];
  products: Product[];
  elements: EngineeringElement[];
  selectedProjectId?: string;
  selectedProductId?: string;
}

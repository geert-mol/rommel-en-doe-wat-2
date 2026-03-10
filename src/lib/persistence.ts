import {
  ELEMENT_TYPES,
  RELEASE_STATES,
  VERSION_EXPORT_KINDS,
  type AppState,
  type ElementType,
  type ReleaseState,
  type VersionExports
} from "./types";

export const STORAGE_KEY = "rnd-pdm-state-v1";

export const createInitialAppState = (): AppState => ({
  projects: [],
  products: [],
  elements: []
});

const formatFolderCode = (value: string): string => {
  const cleaned = value.trim().replace(/\D/g, "");
  if (cleaned.length === 0) return "0000";
  return cleaned.padStart(4, "0");
};

const deriveLegacyProductFolder = (
  rootPath: string | undefined,
  projectId: string,
  projectName: string,
  productId: string,
  productName: string
): string | undefined => {
  const trimmedRoot = rootPath?.trim().replace(/[\\/]+$/, "");
  if (!trimmedRoot) return undefined;

  const projectFolder = `${formatFolderCode(projectId)} - ${projectName}`;
  const productFolder = `${formatFolderCode(productId)}-${productName}`;
  return `${trimmedRoot}/${projectFolder}/${productFolder}/03. Engineering/3D Modellen`;
};

const sanitizeElementParents = (elements: AppState["elements"]): AppState["elements"] => {
  const byId = new Map(elements.map((element) => [element.id, element]));

  return elements.map((element) => ({
    ...element,
    parentElementIds: [...new Set(element.parentElementIds)].filter((parentId) => {
      if (parentId === element.id) return false;
      const parent = byId.get(parentId);
      if (!parent) return false;
      return parent.projectId === element.projectId && parent.productId === element.productId;
    })
  }));
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isReleaseState = (value: unknown): value is ReleaseState =>
  typeof value === "string" && RELEASE_STATES.includes(value as ReleaseState);

const isElementType = (value: unknown): value is ElementType =>
  typeof value === "string" && ELEMENT_TYPES.includes(value as ElementType);

const normalizeVersionExports = (value: unknown): VersionExports | undefined => {
  if (!isRecord(value)) return undefined;

  const enabledEntries = VERSION_EXPORT_KINDS.filter((kind) => value[kind] === true).map((kind) => [
    kind,
    true
  ]);

  if (enabledEntries.length === 0) return undefined;
  return Object.fromEntries(enabledEntries) as VersionExports;
};

export const parseAppState = (value: unknown): AppState | null => {
  if (!isRecord(value)) return null;
  if (!Array.isArray(value.projects) || !Array.isArray(value.products) || !Array.isArray(value.elements)) {
    return null;
  }

  const legacyDefaultRootPath =
    isRecord(value.settings) && typeof value.settings.defaultRootPath === "string"
      ? value.settings.defaultRootPath
      : undefined;

  const legacyProjectRootById = new Map<string, string | undefined>();
  const projects = value.projects.map((project) => {
    if (!isRecord(project)) return null;
    if (typeof project.id !== "string") return null;
    if (typeof project.projectId !== "string") return null;
    if (typeof project.name !== "string") return null;
    if (project.rootPath !== undefined && typeof project.rootPath !== "string") return null;

    legacyProjectRootById.set(project.id, project.rootPath);

    return {
      id: project.id,
      projectId: project.projectId,
      name: project.name
    };
  });

  if (projects.some((project) => project === null)) return null;
  const projectById = new Map((projects as AppState["projects"]).map((project) => [project.id, project]));

  const products = value.products.map((product) => {
    if (!isRecord(product)) return null;
    if (typeof product.id !== "string") return null;
    if (typeof product.projectId !== "string") return null;
    if (typeof product.productId !== "string") return null;
    if (typeof product.name !== "string") return null;
    if (product.folderPath !== undefined && typeof product.folderPath !== "string") return null;

    return {
      id: product.id,
      projectId: product.projectId,
      productId: product.productId,
      name: product.name,
      folderPath:
        product.folderPath ??
        deriveLegacyProductFolder(
          legacyProjectRootById.get(product.projectId) ?? legacyDefaultRootPath,
          projectById.get(product.projectId)?.projectId ?? "",
          projectById.get(product.projectId)?.name ?? "",
          product.productId,
          product.name
        )
    };
  });

  const elements = value.elements.map((element) => {
    if (!isRecord(element)) return null;
    if (typeof element.id !== "string") return null;
    if (typeof element.projectId !== "string") return null;
    if (typeof element.productId !== "string") return null;
    const parentElementIds = Array.isArray(element.parentElementIds)
      ? element.parentElementIds
      : element.parentElementId !== undefined
        ? [element.parentElementId]
        : [];
    if (
      !Array.isArray(parentElementIds) ||
      parentElementIds.some((parentId) => typeof parentId !== "string")
    ) {
      return null;
    }
    if (!isElementType(element.type)) return null;
    if (typeof element.partNumber !== "string") return null;
    if (typeof element.descriptionSlug !== "string") return null;
    if (!Array.isArray(element.concepts)) return null;

    const concepts = element.concepts.map((concept) => {
      if (!isRecord(concept)) return null;
      if (typeof concept.id !== "string") return null;
      if (typeof concept.conceptCode !== "string") return null;
      if (!Array.isArray(concept.versions)) return null;

      const versions = concept.versions.map((version) => {
        if (!isRecord(version)) return null;
        if (typeof version.id !== "string") return null;
        if (typeof version.majorVersion !== "number") return null;
        if (typeof version.minorVersion !== "number") return null;
        if (!isReleaseState(version.releaseState)) return null;
        if (typeof version.createdAt !== "string") return null;
        const availableExports = normalizeVersionExports(version.availableExports);

        return {
          id: version.id,
          majorVersion: version.majorVersion,
          minorVersion: version.minorVersion,
          releaseState: version.releaseState,
          createdAt: version.createdAt,
          ...(availableExports ? { availableExports } : {})
        };
      });

      if (versions.some((version) => version === null)) return null;

      return {
        id: concept.id,
        conceptCode: concept.conceptCode,
        versions
      };
    });

    if (concepts.some((concept) => concept === null)) return null;

    return {
      id: element.id,
      projectId: element.projectId,
      productId: element.productId,
      parentElementIds: [...new Set(parentElementIds)],
      type: element.type,
      partNumber: element.partNumber,
      descriptionSlug: element.descriptionSlug,
      concepts
    };
  });

  if (products.some((product) => product === null)) return null;
  if (elements.some((element) => element === null)) return null;

  if (value.selectedProjectId !== undefined && typeof value.selectedProjectId !== "string") return null;
  if (value.selectedProductId !== undefined && typeof value.selectedProductId !== "string") return null;

  const sanitizedElements = sanitizeElementParents(elements as AppState["elements"]);

  return {
    projects,
    products,
    elements: sanitizedElements,
    selectedProjectId: value.selectedProjectId,
    selectedProductId: value.selectedProductId
  };
};

export const coerceAppState = (value: unknown): AppState =>
  parseAppState(value) ?? createInitialAppState();

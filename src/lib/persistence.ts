import { ELEMENT_TYPES, RELEASE_STATES, type AppState, type ElementType, type ReleaseState } from "./types";

export const STORAGE_KEY = "rnd-pdm-state-v1";

export const createInitialAppState = (): AppState => ({
  settings: { defaultRootPath: "C:/Engineering" },
  projects: [],
  products: [],
  elements: []
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isReleaseState = (value: unknown): value is ReleaseState =>
  typeof value === "string" && RELEASE_STATES.includes(value as ReleaseState);

const isElementType = (value: unknown): value is ElementType =>
  typeof value === "string" && ELEMENT_TYPES.includes(value as ElementType);

export const parseAppState = (value: unknown): AppState | null => {
  if (!isRecord(value)) return null;
  if (!isRecord(value.settings)) return null;
  if (typeof value.settings.defaultRootPath !== "string") return null;
  if (!Array.isArray(value.projects) || !Array.isArray(value.products) || !Array.isArray(value.elements)) {
    return null;
  }

  const projects = value.projects.map((project) => {
    if (!isRecord(project)) return null;
    if (typeof project.id !== "string") return null;
    if (typeof project.projectId !== "string") return null;
    if (typeof project.name !== "string") return null;
    if (project.rootPath !== undefined && typeof project.rootPath !== "string") return null;

    return {
      id: project.id,
      projectId: project.projectId,
      name: project.name,
      rootPath: project.rootPath
    };
  });

  const products = value.products.map((product) => {
    if (!isRecord(product)) return null;
    if (typeof product.id !== "string") return null;
    if (typeof product.projectId !== "string") return null;
    if (typeof product.productId !== "string") return null;
    if (typeof product.name !== "string") return null;

    return {
      id: product.id,
      projectId: product.projectId,
      productId: product.productId,
      name: product.name
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

        return {
          id: version.id,
          majorVersion: version.majorVersion,
          minorVersion: version.minorVersion,
          releaseState: version.releaseState,
          createdAt: version.createdAt
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

  if (projects.some((project) => project === null)) return null;
  if (products.some((product) => product === null)) return null;
  if (elements.some((element) => element === null)) return null;

  if (value.selectedProjectId !== undefined && typeof value.selectedProjectId !== "string") return null;
  if (value.selectedProductId !== undefined && typeof value.selectedProductId !== "string") return null;

  return {
    settings: {
      defaultRootPath: value.settings.defaultRootPath
    },
    projects,
    products,
    elements,
    selectedProjectId: value.selectedProjectId,
    selectedProductId: value.selectedProductId
  };
};

export const coerceAppState = (value: unknown): AppState =>
  parseAppState(value) ?? createInitialAppState();

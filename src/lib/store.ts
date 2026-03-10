import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { isDesktopApp, loadAppState, saveAppState } from "./desktop";
import {
  normalizePartNumber,
  padProjectOrProductId,
  slugify
} from "./filename";
import { createInitialAppState } from "./persistence";
import { collectDescendantIds } from "./structure";
import type {
  AppState,
  EngineeringElement,
  ElementType,
  Product,
  Project,
  ReleaseState,
  VersionExportKind
} from "./types";
import { nextConceptCode, nextVersion } from "./versioning";

const initialState: AppState = createInitialAppState();

interface DeleteVersionPayload {
  elementId: string;
  conceptId: string;
  versionId: string;
}

interface SetElementParentPayload {
  elementId: string;
  parentElementIds: string[];
}

interface SetVersionExportPayload {
  elementId: string;
  conceptId: string;
  versionId: string;
  exportKind: VersionExportKind;
  enabled: boolean;
}

interface DeleteProjectPayload {
  projectId: string;
}

interface UpdateProjectPayload {
  projectId: string;
  name: string;
}

interface DeleteProductPayload {
  productId: string;
}

interface UpdateProductPayload {
  productId: string;
  name: string;
  folderPath: string;
}

type Action =
  | { type: "LOAD"; payload: AppState }
  | { type: "CREATE_PROJECT"; payload: { projectId: string; name: string } }
  | { type: "SELECT_PROJECT"; payload: string }
  | { type: "UPDATE_PROJECT"; payload: UpdateProjectPayload }
  | { type: "DELETE_PROJECT"; payload: DeleteProjectPayload }
  | {
      type: "CREATE_PRODUCT";
      payload: { projectId: string; productId: string; name: string; folderPath: string };
    }
  | { type: "SELECT_PRODUCT"; payload: string }
  | { type: "UPDATE_PRODUCT"; payload: UpdateProductPayload }
  | { type: "DELETE_PRODUCT"; payload: DeleteProductPayload }
  | {
      type: "CREATE_ELEMENT";
      payload: {
        projectId: string;
        productId: string;
        parentElementIds: string[];
        elementType: ElementType;
        partNumber: string;
        description: string;
      };
    }
  | { type: "ADD_CONCEPT"; payload: { elementId: string } }
  | { type: "ADD_VERSION"; payload: { elementId: string; conceptId: string; kind: "major" | "minor" } }
  | {
      type: "SET_RELEASE_STATE";
      payload: { elementId: string; conceptId: string; versionId: string; releaseState: ReleaseState };
    }
  | { type: "SET_VERSION_EXPORT"; payload: SetVersionExportPayload }
  | { type: "DELETE_VERSION"; payload: DeleteVersionPayload }
  | { type: "SET_ELEMENT_PARENT"; payload: SetElementParentPayload };

const createDefaultConcept = () => ({
  id: crypto.randomUUID(),
  conceptCode: "A",
  versions: [
    {
      id: crypto.randomUUID(),
      majorVersion: 1,
      minorVersion: 0,
      releaseState: "PT" as const,
      createdAt: new Date().toISOString()
    }
  ]
});

const sortById = <T extends { name: string }>(values: T[]): T[] =>
  [...values].sort((a, b) => a.name.localeCompare(b.name));

const parentCapableTypes = new Set<ElementType>(["HA", "SA", "MM"]);

const dedupeParentIds = (parentElementIds: string[]): string[] => [...new Set(parentElementIds)];

const resolveValidParentIds = (
  elements: EngineeringElement[],
  target: Pick<EngineeringElement, "id" | "projectId" | "productId">,
  parentElementIds: string[]
): string[] | null => {
  const uniqueParentIds = dedupeParentIds(parentElementIds);
  const descendants = collectDescendantIds(elements, target.id);

  for (const parentId of uniqueParentIds) {
    if (parentId === target.id) return null;

    const parent = elements.find((element) => element.id === parentId);
    if (!parent) return null;
    if (!parentCapableTypes.has(parent.type)) return null;
    if (parent.projectId !== target.projectId || parent.productId !== target.productId) return null;
    if (descendants.has(parentId)) return null;
  }

  return uniqueParentIds;
};

export const deleteVersionAndCleanup = (
  elements: EngineeringElement[],
  payload: DeleteVersionPayload
): EngineeringElement[] => {
  let didDelete = false;

  const updated = elements.flatMap((element) => {
    if (element.id !== payload.elementId) return [element];

    const concepts = element.concepts.flatMap((concept) => {
      if (concept.id !== payload.conceptId) return [concept];

      const versions = concept.versions.filter((version) => version.id !== payload.versionId);
      if (versions.length === concept.versions.length) return [concept];

      didDelete = true;
      if (versions.length === 0) return [];
      return [{ ...concept, versions }];
    });

    if (concepts.length === 0) return [];
    return [{ ...element, concepts }];
  });

  if (!didDelete) return elements;

  const remainingIds = new Set(updated.map((element) => element.id));
  const removedIds = new Set(
    elements.filter((element) => !remainingIds.has(element.id)).map((element) => element.id)
  );

  if (removedIds.size === 0) return updated;

  return updated.map((element) =>
    element.parentElementIds.some((parentId) => removedIds.has(parentId))
      ? {
          ...element,
          parentElementIds: element.parentElementIds.filter((parentId) => !removedIds.has(parentId))
        }
      : element
  );
};

export const setElementParents = (
  elements: EngineeringElement[],
  payload: SetElementParentPayload
): EngineeringElement[] => {
  const { elementId, parentElementIds } = payload;
  const target = elements.find((element) => element.id === elementId);
  if (!target) return elements;
  const nextParentIds = resolveValidParentIds(elements, target, parentElementIds);
  if (nextParentIds === null) return elements;

  return elements.map((element) =>
    element.id === elementId ? { ...element, parentElementIds: nextParentIds } : element
  );
};

export const setVersionExportAvailability = (
  elements: EngineeringElement[],
  payload: SetVersionExportPayload
): EngineeringElement[] =>
  elements.map((element) => {
    if (element.id !== payload.elementId) return element;

    return {
      ...element,
      concepts: element.concepts.map((concept) => {
        if (concept.id !== payload.conceptId) return concept;

        return {
          ...concept,
          versions: concept.versions.map((version) => {
            if (version.id !== payload.versionId) return version;

            const currentExports = version.availableExports ?? {};
            const nextExports = { ...currentExports };

            if (payload.enabled) {
              nextExports[payload.exportKind] = true;
            } else {
              delete nextExports[payload.exportKind];
            }

            return {
              ...version,
              availableExports: Object.keys(nextExports).length > 0 ? nextExports : undefined
            };
          })
        };
      })
    };
  });

export const deleteProjectAndCleanup = (
  state: AppState,
  payload: DeleteProjectPayload
): AppState => {
  const project = state.projects.find((candidate) => candidate.id === payload.projectId);
  if (!project) return state;

  const deletedProductIds = new Set(
    state.products
      .filter((product) => product.projectId === payload.projectId)
      .map((product) => product.id)
  );
  const projectWasSelected = state.selectedProjectId === payload.projectId;
  const productWasDeleted =
    state.selectedProductId !== undefined && deletedProductIds.has(state.selectedProductId);

  return {
    ...state,
    projects: state.projects.filter((candidate) => candidate.id !== payload.projectId),
    products: state.products.filter((product) => product.projectId !== payload.projectId),
    elements: state.elements.filter((element) => element.projectId !== payload.projectId),
    selectedProjectId: projectWasSelected ? undefined : state.selectedProjectId,
    selectedProductId: projectWasSelected || productWasDeleted ? undefined : state.selectedProductId
  };
};

export const updateProjectDetails = (
  state: AppState,
  payload: UpdateProjectPayload
): AppState => {
  const project = state.projects.find((candidate) => candidate.id === payload.projectId);
  if (!project) return state;

  return {
    ...state,
    projects: sortById(
      state.projects.map((candidate) =>
        candidate.id === payload.projectId
          ? {
              ...candidate,
              name: payload.name.trim()
            }
          : candidate
      )
    )
  };
};

export const deleteProductAndCleanup = (
  state: AppState,
  payload: DeleteProductPayload
): AppState => {
  const product = state.products.find((candidate) => candidate.id === payload.productId);
  if (!product) return state;

  return {
    ...state,
    products: state.products.filter((candidate) => candidate.id !== payload.productId),
    elements: state.elements.filter((element) => element.productId !== payload.productId),
    selectedProductId:
      state.selectedProductId === payload.productId ? undefined : state.selectedProductId
  };
};

export const updateProductDetails = (
  state: AppState,
  payload: UpdateProductPayload
): AppState => {
  const product = state.products.find((candidate) => candidate.id === payload.productId);
  if (!product) return state;

  return {
    ...state,
    products: sortById(
      state.products.map((candidate) =>
        candidate.id === payload.productId
          ? {
              ...candidate,
              name: payload.name.trim(),
              folderPath: payload.folderPath.trim()
            }
          : candidate
      )
    )
  };
};

const reducer = (state: AppState, action: Action): AppState => {
  switch (action.type) {
    case "LOAD":
      return action.payload;
    case "CREATE_PROJECT": {
      const project: Project = {
        id: crypto.randomUUID(),
        projectId: padProjectOrProductId(action.payload.projectId),
        name: action.payload.name.trim()
      };
      return {
        ...state,
        projects: sortById([...state.projects, project]),
        selectedProjectId: project.id
      };
    }
    case "SELECT_PROJECT":
      return {
        ...state,
        selectedProjectId: action.payload,
        selectedProductId: undefined
      };
    case "UPDATE_PROJECT":
      return updateProjectDetails(state, action.payload);
    case "DELETE_PROJECT":
      return deleteProjectAndCleanup(state, action.payload);
    case "CREATE_PRODUCT": {
      const product: Product = {
        id: crypto.randomUUID(),
        productId: padProjectOrProductId(action.payload.productId),
        projectId: action.payload.projectId,
        name: action.payload.name.trim(),
        folderPath: action.payload.folderPath.trim()
      };
      return {
        ...state,
        products: sortById([...state.products, product]),
        selectedProductId: product.id
      };
    }
    case "SELECT_PRODUCT":
      return { ...state, selectedProductId: action.payload };
    case "UPDATE_PRODUCT":
      return updateProductDetails(state, action.payload);
    case "DELETE_PRODUCT":
      return deleteProductAndCleanup(state, action.payload);
    case "CREATE_ELEMENT": {
      const elementId = crypto.randomUUID();
      const parentElementIds =
        resolveValidParentIds(
          state.elements,
          {
            id: elementId,
            projectId: action.payload.projectId,
            productId: action.payload.productId
          },
          action.payload.parentElementIds
        ) ?? [];

      const element: EngineeringElement = {
        id: elementId,
        projectId: action.payload.projectId,
        productId: action.payload.productId,
        parentElementIds,
        type: action.payload.elementType,
        partNumber: normalizePartNumber(action.payload.partNumber),
        descriptionSlug: slugify(action.payload.description),
        concepts: [createDefaultConcept()]
      };
      return {
        ...state,
        elements: [...state.elements, element]
      };
    }
    case "ADD_CONCEPT":
      return {
        ...state,
        elements: state.elements.map((element) => {
          if (element.id !== action.payload.elementId) return element;
          return {
            ...element,
            concepts: [
              ...element.concepts,
              {
                id: crypto.randomUUID(),
                conceptCode: nextConceptCode(element.concepts.map((concept) => concept.conceptCode)),
                versions: [
                  {
                    id: crypto.randomUUID(),
                    majorVersion: 1,
                    minorVersion: 0,
                    releaseState: "PT",
                    createdAt: new Date().toISOString()
                  }
                ]
              }
            ]
          };
        })
      };
    case "ADD_VERSION":
      return {
        ...state,
        elements: state.elements.map((element) => {
          if (element.id !== action.payload.elementId) return element;
          return {
            ...element,
            concepts: element.concepts.map((concept) => {
              if (concept.id !== action.payload.conceptId) return concept;
              const latest = [...concept.versions].sort((a, b) =>
                b.majorVersion - a.majorVersion || b.minorVersion - a.minorVersion
              )[0];
              return {
                ...concept,
                versions: [
                  ...concept.versions,
                  nextVersion(concept, action.payload.kind, latest?.releaseState ?? "PT")
                ]
              };
            })
          };
        })
      };
    case "SET_RELEASE_STATE":
      return {
        ...state,
        elements: state.elements.map((element) => {
          if (element.id !== action.payload.elementId) return element;
          return {
            ...element,
            concepts: element.concepts.map((concept) => {
              if (concept.id !== action.payload.conceptId) return concept;
              return {
                ...concept,
                versions: concept.versions.map((version) => {
                  if (version.id !== action.payload.versionId) return version;
                  return { ...version, releaseState: action.payload.releaseState };
                })
              };
            })
          };
        })
      };
    case "SET_VERSION_EXPORT":
      return {
        ...state,
        elements: setVersionExportAvailability(state.elements, action.payload)
      };
    case "DELETE_VERSION":
      return {
        ...state,
        elements: deleteVersionAndCleanup(state.elements, action.payload)
      };
    case "SET_ELEMENT_PARENT":
      return {
        ...state,
        elements: setElementParents(state.elements, action.payload)
      };
    default:
      return state;
  }
};

export const useAppStore = () => {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [isHydrating, setIsHydrating] = useState(true);
  const [storageError, setStorageError] = useState<string | null>(null);
  const skipNextPersist = useRef(true);

  useEffect(() => {
    let isCancelled = false;

    const hydrate = async () => {
      try {
        const storedState = await loadAppState();
        if (isCancelled) return;
        dispatch({ type: "LOAD", payload: storedState });
        skipNextPersist.current = true;
        setStorageError(null);
      } catch (error) {
        if (isCancelled) return;
        setStorageError(error instanceof Error ? error.message : "State load failed.");
      } finally {
        if (!isCancelled) {
          setIsHydrating(false);
        }
      }
    };

    void hydrate();

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    if (isHydrating) return;

    if (skipNextPersist.current) {
      skipNextPersist.current = false;
      return;
    }

    void saveAppState(state).catch((error: unknown) => {
      setStorageError(error instanceof Error ? error.message : "State save failed.");
    });
  }, [isHydrating, state]);

  const selectedProject = useMemo(
    () => state.projects.find((project) => project.id === state.selectedProjectId),
    [state.projects, state.selectedProjectId]
  );

  const selectedProduct = useMemo(
    () => state.products.find((product) => product.id === state.selectedProductId),
    [state.products, state.selectedProductId]
  );

  const selectedElements = useMemo(
    () =>
      state.elements.filter(
        (element) =>
          element.projectId === state.selectedProjectId &&
          element.productId === state.selectedProductId
      ),
    [state.elements, state.selectedProjectId, state.selectedProductId]
  );

  const addProject = (projectId: string, name: string) =>
    dispatch({ type: "CREATE_PROJECT", payload: { projectId, name } });

  const updateProject = (projectId: string, name: string) =>
    dispatch({ type: "UPDATE_PROJECT", payload: { projectId, name } });

  const addProduct = (projectId: string, productId: string, name: string, folderPath: string) =>
    dispatch({ type: "CREATE_PRODUCT", payload: { projectId, productId, name, folderPath } });

  const updateProduct = (productId: string, name: string, folderPath: string) =>
    dispatch({ type: "UPDATE_PRODUCT", payload: { productId, name, folderPath } });

  const deleteProject = (projectId: string) =>
    dispatch({ type: "DELETE_PROJECT", payload: { projectId } });

  const deleteProduct = (productId: string) =>
    dispatch({ type: "DELETE_PRODUCT", payload: { productId } });

  const replaceState = (nextState: AppState) => {
    skipNextPersist.current = true;
    dispatch({ type: "LOAD", payload: nextState });
    setStorageError(null);
  };

  return {
    state,
    selectedProject,
    selectedProduct,
    selectedElements,
    isHydrating,
    storageError,
    storageMode: isDesktopApp() ? "sqlite" : "browser",
    dispatch,
    addProject,
    updateProject,
    addProduct,
    updateProduct,
    deleteProject,
    deleteProduct,
    replaceState
  };
};

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { isDesktopApp, loadAppState, saveAppState } from "./desktop";
import {
  normalizePartNumber,
  padProjectOrProductId,
  slugify
} from "./filename";
import { createInitialAppState } from "./persistence";
import type {
  AppState,
  EngineeringElement,
  ElementType,
  Product,
  Project,
  ReleaseState
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
  parentElementId?: string;
}

type Action =
  | { type: "LOAD"; payload: AppState }
  | { type: "SET_DEFAULT_ROOT"; payload: string }
  | { type: "CREATE_PROJECT"; payload: { projectId: string; name: string; rootPath?: string } }
  | { type: "SELECT_PROJECT"; payload: string }
  | { type: "CREATE_PRODUCT"; payload: { projectId: string; productId: string; name: string } }
  | { type: "SELECT_PRODUCT"; payload: string }
  | {
      type: "CREATE_ELEMENT";
      payload: {
        projectId: string;
        productId: string;
        parentElementId?: string;
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

  let changed = true;
  while (changed) {
    changed = false;
    for (const element of updated) {
      if (!element.parentElementId) continue;
      if (removedIds.has(element.parentElementId) && !removedIds.has(element.id)) {
        removedIds.add(element.id);
        changed = true;
      }
    }
  }

  return updated.filter((element) => !removedIds.has(element.id));
};

export const setElementParent = (
  elements: EngineeringElement[],
  payload: SetElementParentPayload
): EngineeringElement[] => {
  const { elementId, parentElementId } = payload;
  const target = elements.find((element) => element.id === elementId);
  if (!target) return elements;
  if (parentElementId === elementId) return elements;

  if (parentElementId) {
    const parent = elements.find((element) => element.id === parentElementId);
    if (!parent) return elements;
    if (!(parent.type === "HA" || parent.type === "SA" || parent.type === "MM")) return elements;
    if (parent.productId !== target.productId || parent.projectId !== target.projectId) return elements;
  }

  const byId = new Map(elements.map((element) => [element.id, element]));
  let cursor = parentElementId;
  while (cursor) {
    if (cursor === elementId) return elements;
    cursor = byId.get(cursor)?.parentElementId;
  }

  return elements.map((element) =>
    element.id === elementId ? { ...element, parentElementId } : element
  );
};

const reducer = (state: AppState, action: Action): AppState => {
  switch (action.type) {
    case "LOAD":
      return action.payload;
    case "SET_DEFAULT_ROOT":
      return { ...state, settings: { defaultRootPath: action.payload } };
    case "CREATE_PROJECT": {
      const project: Project = {
        id: crypto.randomUUID(),
        projectId: padProjectOrProductId(action.payload.projectId),
        name: action.payload.name.trim(),
        rootPath: action.payload.rootPath?.trim() || undefined
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
    case "CREATE_PRODUCT": {
      const product: Product = {
        id: crypto.randomUUID(),
        productId: padProjectOrProductId(action.payload.productId),
        projectId: action.payload.projectId,
        name: action.payload.name.trim()
      };
      return {
        ...state,
        products: sortById([...state.products, product]),
        selectedProductId: product.id
      };
    }
    case "SELECT_PRODUCT":
      return { ...state, selectedProductId: action.payload };
    case "CREATE_ELEMENT": {
      const element: EngineeringElement = {
        id: crypto.randomUUID(),
        projectId: action.payload.projectId,
        productId: action.payload.productId,
        parentElementId: action.payload.parentElementId,
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
    case "DELETE_VERSION":
      return {
        ...state,
        elements: deleteVersionAndCleanup(state.elements, action.payload)
      };
    case "SET_ELEMENT_PARENT":
      return {
        ...state,
        elements: setElementParent(state.elements, action.payload)
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

  const addProject = (projectId: string, name: string, rootPath?: string) =>
    dispatch({ type: "CREATE_PROJECT", payload: { projectId, name, rootPath } });

  const addProduct = (projectId: string, productId: string, name: string) =>
    dispatch({ type: "CREATE_PRODUCT", payload: { projectId, productId, name } });

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
    addProduct
  };
};

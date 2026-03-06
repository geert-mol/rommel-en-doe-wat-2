import {
  buildSuggestedFilePath,
  formatVersionLabel,
  generateFileName
} from "./filename";
import type {
  AppState,
  EngineeringElement,
  Product,
  Project
} from "./types";
import { byVersionDesc } from "./versioning";

export interface ProjectExportRow {
  parentLabel: string;
  depth: number;
  elementType: EngineeringElement["type"];
  partNumber: string;
  descriptionSlug: string;
  conceptCode: string;
  versionLabel: string;
  releaseState: string;
  fileName: string;
  filePath: string;
  createdAt: string;
}

export interface ProductExportSheet {
  productId: string;
  productCode: string;
  productName: string;
  rows: ProjectExportRow[];
}

export interface ProjectExportPayload {
  projectId: string;
  projectCode: string;
  projectName: string;
  generatedAt: string;
  sheets: ProductExportSheet[];
}

const sortElements = (a: EngineeringElement, b: EngineeringElement): number => {
  if (a.partNumber !== b.partNumber) {
    return a.partNumber.localeCompare(b.partNumber, undefined, { numeric: true });
  }
  if (a.type !== b.type) return a.type.localeCompare(b.type);
  return a.descriptionSlug.localeCompare(b.descriptionSlug);
};

const buildElementOrder = (elements: EngineeringElement[]) => {
  const byId = new Map(elements.map((element) => [element.id, element]));
  const childMap = new Map<string | undefined, EngineeringElement[]>();

  for (const element of elements) {
    const hasKnownParent = element.parentElementId ? byId.has(element.parentElementId) : false;
    const key = hasKnownParent ? element.parentElementId : undefined;
    const bucket = childMap.get(key) ?? [];
    bucket.push(element);
    childMap.set(key, bucket);
  }

  for (const [, children] of childMap) {
    children.sort(sortElements);
  }

  const ordered: Array<{ element: EngineeringElement; depth: number }> = [];
  const visit = (parentId: string | undefined, depth: number) => {
    for (const child of childMap.get(parentId) ?? []) {
      ordered.push({ element: child, depth });
      visit(child.id, depth + 1);
    }
  };

  visit(undefined, 0);
  return ordered;
};

const buildProductSheet = (
  project: Project,
  product: Product,
  elements: EngineeringElement[],
  defaultRootPath: string
): ProductExportSheet => {
  const parentMap = new Map(elements.map((element) => [element.id, element]));
  const ordered = buildElementOrder(elements);

  const rows = ordered.flatMap(({ element, depth }) => {
    const parent = element.parentElementId ? parentMap.get(element.parentElementId) : undefined;
    const parentLabel = parent ? `${parent.type} ${parent.partNumber} ${parent.descriptionSlug}` : "ROOT";

    return [...element.concepts]
      .sort((a, b) => a.conceptCode.localeCompare(b.conceptCode))
      .flatMap((concept) =>
        [...concept.versions].sort(byVersionDesc).map((version) => {
          const fileName = generateFileName({
            state: version.releaseState,
            projectCode: project.projectId,
            productCode: product.productId,
            conceptCode: concept.conceptCode,
            type: element.type,
            partNumber: element.partNumber,
            descriptionSlug: element.descriptionSlug,
            majorVersion: version.majorVersion,
            minorVersion: version.minorVersion
          });

          return {
            parentLabel,
            depth,
            elementType: element.type,
            partNumber: element.partNumber,
            descriptionSlug: element.descriptionSlug,
            conceptCode: concept.conceptCode,
            versionLabel: formatVersionLabel(version.majorVersion, version.minorVersion),
            releaseState: version.releaseState,
            fileName,
            filePath: buildSuggestedFilePath(
              fileName,
              element,
              project,
              product,
              defaultRootPath
            ),
            createdAt: version.createdAt
          };
        })
      );
  });

  return {
    productId: product.id,
    productCode: product.productId,
    productName: product.name,
    rows
  };
};

export const buildProjectExportPayload = (
  state: AppState,
  projectId: string
): ProjectExportPayload | null => {
  const project = state.projects.find((candidate) => candidate.id === projectId);
  if (!project) return null;

  const products = state.products
    .filter((product) => product.projectId === project.id)
    .sort((a, b) => a.productId.localeCompare(b.productId) || a.name.localeCompare(b.name));

  return {
    projectId: project.id,
    projectCode: project.projectId,
    projectName: project.name,
    generatedAt: new Date().toISOString(),
    sheets: products.map((product) =>
      buildProductSheet(
        project,
        product,
        state.elements.filter((element) => element.productId === product.id),
        state.settings.defaultRootPath
      )
    )
  };
};

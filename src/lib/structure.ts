import type { EngineeringElement } from "./types";

export interface ElementUsage {
  usageId: string;
  element: EngineeringElement;
  depth: number;
  parentId?: string;
  parentUsageId?: string;
}

const unique = <T,>(values: T[]): T[] => [...new Set(values)];

const knownParentIdsFor = (
  element: EngineeringElement,
  byId: Map<string, EngineeringElement>
): string[] => unique(element.parentElementIds.filter((parentId) => byId.has(parentId)));

export const sortElements = (a: EngineeringElement, b: EngineeringElement): number => {
  if (a.partNumber !== b.partNumber) {
    return a.partNumber.localeCompare(b.partNumber, undefined, { numeric: true });
  }
  if (a.type !== b.type) return a.type.localeCompare(b.type);
  return a.descriptionSlug.localeCompare(b.descriptionSlug);
};

export const buildUsageOrder = (elements: EngineeringElement[]): ElementUsage[] => {
  const byId = new Map(elements.map((element) => [element.id, element]));
  const childMap = new Map<string | undefined, EngineeringElement[]>();

  for (const element of elements) {
    const parentIds = knownParentIdsFor(element, byId);
    const keys = parentIds.length > 0 ? parentIds : [undefined];

    for (const key of keys) {
      const bucket = childMap.get(key) ?? [];
      bucket.push(element);
      childMap.set(key, bucket);
    }
  }

  for (const [, children] of childMap) {
    children.sort(sortElements);
  }

  const ordered: ElementUsage[] = [];
  const usageSequence = new Map<string, number>();
  const seenElementIds = new Set<string>();

  const visit = (
    element: EngineeringElement,
    depth: number,
    parentId: string | undefined,
    parentUsageId: string | undefined,
    pathIds: Set<string>
  ) => {
    if (pathIds.has(element.id)) return;

    const nextPathIds = new Set(pathIds);
    nextPathIds.add(element.id);
    seenElementIds.add(element.id);

    const usageIndex = (usageSequence.get(element.id) ?? 0) + 1;
    usageSequence.set(element.id, usageIndex);

    const usageId = `${element.id}:${usageIndex}:${parentUsageId ?? "root"}`;
    ordered.push({
      usageId,
      element,
      depth,
      parentId,
      parentUsageId
    });

    for (const child of childMap.get(element.id) ?? []) {
      visit(child, depth + 1, element.id, usageId, nextPathIds);
    }
  };

  for (const root of childMap.get(undefined) ?? []) {
    visit(root, 0, undefined, undefined, new Set<string>());
  }

  for (const element of [...elements].sort(sortElements)) {
    if (seenElementIds.has(element.id)) continue;
    visit(element, 0, undefined, undefined, new Set<string>());
  }

  return ordered;
};

export const collectDescendantIds = (
  elements: EngineeringElement[],
  elementId: string
): Set<string> => {
  const childMap = new Map<string, string[]>();

  for (const element of elements) {
    for (const parentId of element.parentElementIds) {
      const bucket = childMap.get(parentId) ?? [];
      bucket.push(element.id);
      childMap.set(parentId, bucket);
    }
  }

  const result = new Set<string>();
  const stack = [...(childMap.get(elementId) ?? [])];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || result.has(current)) continue;
    result.add(current);
    stack.push(...(childMap.get(current) ?? []));
  }

  return result;
};

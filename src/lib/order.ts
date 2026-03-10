import type { Product, Project } from "./types";

const getSortOrder = (value: number | undefined, fallback: number): number =>
  Number.isFinite(value) ? value : fallback;

export const sortProjects = (projects: Project[]): Project[] =>
  [...projects]
    .map((project, index) => ({
      project,
      index,
      sortOrder: getSortOrder(project.sortOrder, index)
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.index - b.index)
    .map(({ project }) => project);

export const normalizeProjects = (projects: Project[]): Project[] =>
  sortProjects(projects).map((project, index) => ({
    ...project,
    sortOrder: index
  }));

export const sortProductsForProject = (products: Product[], projectId: string | undefined): Product[] => {
  if (!projectId) return [];

  return products
    .filter((product) => product.projectId === projectId)
    .map((product, index) => ({
      product,
      index,
      sortOrder: getSortOrder(product.sortOrder, index)
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.index - b.index)
    .map(({ product }) => product);
};

export const normalizeProducts = (products: Product[]): Product[] => {
  const nextSortOrderById = new Map<string, number>();
  const productsByProject = new Map<string, Product[]>();

  for (const product of products) {
    const bucket = productsByProject.get(product.projectId) ?? [];
    bucket.push(product);
    productsByProject.set(product.projectId, bucket);
  }

  for (const [projectId, projectProducts] of productsByProject) {
    const orderedProducts = sortProductsForProject(projectProducts, projectId);
    orderedProducts.forEach((product, index) => {
      nextSortOrderById.set(product.id, index);
    });
  }

  return products.map((product) => ({
    ...product,
    sortOrder: nextSortOrderById.get(product.id) ?? 0
  }));
};

export const reorderProjects = (projects: Project[], orderedIds: string[]): Project[] => {
  if (orderedIds.length !== projects.length) return projects;

  const projectById = new Map(projects.map((project) => [project.id, project]));
  if (orderedIds.some((id) => !projectById.has(id))) return projects;

  return orderedIds.map((id, index) => ({
    ...projectById.get(id)!,
    sortOrder: index
  }));
};

export const reorderProducts = (
  products: Product[],
  projectId: string,
  orderedIds: string[]
): Product[] => {
  const projectProducts = sortProductsForProject(products, projectId);
  if (orderedIds.length !== projectProducts.length) return products;

  const sortOrderById = new Map<string, number>();
  orderedIds.forEach((id, index) => {
    sortOrderById.set(id, index);
  });

  if (projectProducts.some((product) => !sortOrderById.has(product.id))) return products;

  return products.map((product) =>
    product.projectId === projectId
      ? {
          ...product,
          sortOrder: sortOrderById.get(product.id) ?? product.sortOrder ?? 0
        }
      : product
  );
};

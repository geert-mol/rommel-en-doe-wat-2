import { describe, expect, it } from "vitest";
import {
  updateProjectDetails,
  updateProductDetails,
  deleteProductAndCleanup,
  deleteProjectAndCleanup,
  deleteVersionAndCleanup
} from "../src/lib/store";
import type { AppState, EngineeringElement } from "../src/lib/types";

const baseElement = (id: string): EngineeringElement => ({
  id,
  projectId: "p",
  productId: "prd",
  parentElementIds: [],
  type: "HA",
  partNumber: "00",
  descriptionSlug: id,
  concepts: []
});

describe("deleteVersionAndCleanup", () => {
  it("deletes latest version and keeps previous version visible", () => {
    const elements: EngineeringElement[] = [
      {
        ...baseElement("el-1"),
        concepts: [
          {
            id: "c-a",
            conceptCode: "A",
            versions: [
              {
                id: "v1",
                majorVersion: 1,
                minorVersion: 0,
                releaseState: "PT",
                createdAt: "2025-01-01T00:00:00.000Z"
              },
              {
                id: "v2",
                majorVersion: 2,
                minorVersion: 0,
                releaseState: "PT",
                createdAt: "2025-01-02T00:00:00.000Z"
              }
            ]
          }
        ]
      }
    ];

    const result = deleteVersionAndCleanup(elements, {
      elementId: "el-1",
      conceptId: "c-a",
      versionId: "v2"
    });

    expect(result).toHaveLength(1);
    expect(result[0].concepts[0].versions.map((version) => version.id)).toEqual(["v1"]);
  });

  it("deletes concept when its last version is removed", () => {
    const elements: EngineeringElement[] = [
      {
        ...baseElement("el-1"),
        concepts: [
          {
            id: "c-a",
            conceptCode: "A",
            versions: [
              {
                id: "v-a",
                majorVersion: 1,
                minorVersion: 0,
                releaseState: "PT",
                createdAt: "2025-01-01T00:00:00.000Z"
              }
            ]
          },
          {
            id: "c-b",
            conceptCode: "B",
            versions: [
              {
                id: "v-b",
                majorVersion: 1,
                minorVersion: 0,
                releaseState: "PT",
                createdAt: "2025-01-01T00:00:00.000Z"
              }
            ]
          }
        ]
      }
    ];

    const result = deleteVersionAndCleanup(elements, {
      elementId: "el-1",
      conceptId: "c-a",
      versionId: "v-a"
    });

    expect(result).toHaveLength(1);
    expect(result[0].concepts.map((concept) => concept.id)).toEqual(["c-b"]);
  });

  it("reparents children to root when parent loses its last concept/version", () => {
    const parent: EngineeringElement = {
      ...baseElement("parent"),
      type: "HA",
      concepts: [
        {
          id: "c-a",
          conceptCode: "A",
          versions: [
            {
              id: "v-a",
              majorVersion: 1,
              minorVersion: 0,
              releaseState: "PT",
              createdAt: "2025-01-01T00:00:00.000Z"
            }
          ]
        }
      ]
    };

    const child: EngineeringElement = {
      ...baseElement("child"),
      parentElementIds: ["parent"],
      type: "PA",
      partNumber: "01",
      concepts: [
        {
          id: "c-child",
          conceptCode: "A",
          versions: [
            {
              id: "v-child",
              majorVersion: 1,
              minorVersion: 0,
              releaseState: "PT",
              createdAt: "2025-01-01T00:00:00.000Z"
            }
          ]
        }
      ]
    };

    const grandchild: EngineeringElement = {
      ...baseElement("grandchild"),
      parentElementIds: ["child"],
      type: "PA",
      partNumber: "02",
      concepts: [
        {
          id: "c-grandchild",
          conceptCode: "A",
          versions: [
            {
              id: "v-grandchild",
              majorVersion: 1,
              minorVersion: 0,
              releaseState: "PT",
              createdAt: "2025-01-01T00:00:00.000Z"
            }
          ]
        }
      ]
    };

    const result = deleteVersionAndCleanup([parent, child, grandchild], {
      elementId: "parent",
      conceptId: "c-a",
      versionId: "v-a"
    });

    expect(result.map((element) => element.id)).toEqual(["child", "grandchild"]);
    expect(result.find((element) => element.id === "child")?.parentElementIds).toEqual([]);
    expect(result.find((element) => element.id === "grandchild")?.parentElementIds).toEqual([
      "child"
    ]);
  });
});

describe("deleteProductAndCleanup", () => {
  it("deletes the product, its elements, and clears the product selection", () => {
    const state: AppState = {
      projects: [{ id: "project-1", projectId: "001", name: "Alpha" }],
      products: [
        { id: "product-1", projectId: "project-1", productId: "001", name: "Desk" },
        { id: "product-2", projectId: "project-1", productId: "002", name: "Lamp" }
      ],
      elements: [
        {
          ...baseElement("desk"),
          projectId: "project-1",
          productId: "product-1"
        },
        {
          ...baseElement("lamp"),
          projectId: "project-1",
          productId: "product-2"
        }
      ],
      selectedProjectId: "project-1",
      selectedProductId: "product-1"
    };

    const result = deleteProductAndCleanup(state, { productId: "product-1" });

    expect(result.products.map((product) => product.id)).toEqual(["product-2"]);
    expect(result.elements.map((element) => element.id)).toEqual(["lamp"]);
    expect(result.selectedProjectId).toBe("project-1");
    expect(result.selectedProductId).toBeUndefined();
  });
});

describe("updateProductDetails", () => {
  it("updates the product name and folder path while keeping selection", () => {
    const state: AppState = {
      projects: [{ id: "project-1", projectId: "001", name: "Alpha", sortOrder: 0 }],
      products: [
        {
          id: "product-1",
          projectId: "project-1",
          productId: "001",
          name: "Desk",
          folderPath: "D:/Products/Desk",
          sortOrder: 0
        }
      ],
      elements: [],
      selectedProjectId: "project-1",
      selectedProductId: "product-1"
    };

    const result = updateProductDetails(state, {
      productRef: "product-1",
      productCode: "007",
      name: "Desk XL",
      folderPath: "D:/Products/Desk XL"
    });

    expect(result.products).toEqual([
      {
        id: "product-1",
        projectId: "project-1",
        productId: "007",
        name: "Desk XL",
        folderPath: "D:/Products/Desk XL",
        sortOrder: 0
      }
    ]);
    expect(result.selectedProductId).toBe("product-1");
  });
});

describe("updateProjectDetails", () => {
  it("updates the project name while keeping selection", () => {
    const state: AppState = {
      projects: [{ id: "project-1", projectId: "001", name: "Alpha", sortOrder: 0 }],
      products: [],
      elements: [],
      selectedProjectId: "project-1"
    };

    const result = updateProjectDetails(state, {
      projectRef: "project-1",
      projectCode: "009",
      name: "Alpha Prime"
    });

    expect(result.projects).toEqual([
      { id: "project-1", projectId: "009", name: "Alpha Prime", sortOrder: 0 }
    ]);
    expect(result.selectedProjectId).toBe("project-1");
  });
});

describe("deleteProjectAndCleanup", () => {
  it("deletes the project, its products, its elements, and clears current selection", () => {
    const state: AppState = {
      projects: [
        { id: "project-1", projectId: "001", name: "Alpha" },
        { id: "project-2", projectId: "002", name: "Beta" }
      ],
      products: [
        { id: "product-1", projectId: "project-1", productId: "001", name: "Desk" },
        { id: "product-2", projectId: "project-2", productId: "001", name: "Chair" }
      ],
      elements: [
        {
          ...baseElement("desk"),
          projectId: "project-1",
          productId: "product-1"
        },
        {
          ...baseElement("chair"),
          projectId: "project-2",
          productId: "product-2"
        }
      ],
      selectedProjectId: "project-1",
      selectedProductId: "product-1"
    };

    const result = deleteProjectAndCleanup(state, { projectId: "project-1" });

    expect(result.projects.map((project) => project.id)).toEqual(["project-2"]);
    expect(result.products.map((product) => product.id)).toEqual(["product-2"]);
    expect(result.elements.map((element) => element.id)).toEqual(["chair"]);
    expect(result.selectedProjectId).toBeUndefined();
    expect(result.selectedProductId).toBeUndefined();
  });
});

import { describe, expect, it } from "vitest";
import { reorderProductsInState, reorderProjectsInState } from "../src/lib/store";
import type { AppState } from "../src/lib/types";

describe("reorderProjectsInState", () => {
  it("reorders projects and preserves selection", () => {
    const state: AppState = {
      projects: [
        { id: "project-1", projectId: "001", name: "Alpha", sortOrder: 0 },
        { id: "project-2", projectId: "002", name: "Beta", sortOrder: 1 }
      ],
      products: [],
      elements: [],
      selectedProjectId: "project-2"
    };

    const result = reorderProjectsInState(state, {
      orderedIds: ["project-2", "project-1"]
    });

    expect(result.projects).toEqual([
      { id: "project-2", projectId: "002", name: "Beta", sortOrder: 0 },
      { id: "project-1", projectId: "001", name: "Alpha", sortOrder: 1 }
    ]);
    expect(result.selectedProjectId).toBe("project-2");
  });
});

describe("reorderProductsInState", () => {
  it("reorders products only within the targeted project", () => {
    const state: AppState = {
      projects: [{ id: "project-1", projectId: "001", name: "Alpha", sortOrder: 0 }],
      products: [
        { id: "product-1", projectId: "project-1", productId: "001", name: "Desk", sortOrder: 0 },
        { id: "product-2", projectId: "project-1", productId: "002", name: "Lamp", sortOrder: 1 },
        { id: "product-3", projectId: "project-2", productId: "001", name: "Chair", sortOrder: 0 }
      ],
      elements: [],
      selectedProjectId: "project-1",
      selectedProductId: "product-2"
    };

    const result = reorderProductsInState(state, {
      projectId: "project-1",
      orderedIds: ["product-2", "product-1"]
    });

    expect(result.products).toEqual([
      { id: "product-1", projectId: "project-1", productId: "001", name: "Desk", sortOrder: 1 },
      { id: "product-2", projectId: "project-1", productId: "002", name: "Lamp", sortOrder: 0 },
      { id: "product-3", projectId: "project-2", productId: "001", name: "Chair", sortOrder: 0 }
    ]);
    expect(result.selectedProductId).toBe("product-2");
  });
});

import { describe, expect, it } from "vitest";
import { coerceAppState, createInitialAppState, parseAppState } from "../src/lib/persistence";
import type { AppState } from "../src/lib/types";

describe("parseAppState", () => {
  it("accepts persisted state with nested concept/version data", () => {
    const state: AppState = {
      projects: [{ id: "project-1", projectId: "013", name: "Aquaframe", sortOrder: 0 }],
      products: [
        {
          id: "product-1",
          projectId: "project-1",
          productId: "009",
          name: "Balcony Kit",
          folderPath: "D:/Products/Balcony Kit/Models",
          sortOrder: 0
        }
      ],
      elements: [
        {
          id: "element-1",
          projectId: "project-1",
          productId: "product-1",
          parentElementIds: [],
          type: "HA",
          partNumber: "00",
          descriptionSlug: "frame-top",
          concepts: [
            {
              id: "concept-1",
              conceptCode: "A",
              versions: [
                {
                  id: "version-1",
                  majorVersion: 1,
                  minorVersion: 0,
                  releaseState: "PT",
                  createdAt: "2026-03-06T09:00:00.000Z"
                }
              ]
            }
          ]
        }
      ],
      selectedProjectId: "project-1",
      selectedProductId: "product-1"
    };

    expect(parseAppState(state)).toEqual(state);
  });

  it("falls back to the empty state when persisted data is malformed", () => {
    expect(
      coerceAppState({
        projects: "broken"
      })
    ).toEqual(createInitialAppState());
  });

  it("derives product folders from legacy root settings", () => {
    expect(
      parseAppState({
        settings: { defaultRootPath: "C:/Engineering" },
        projects: [{ id: "project-1", projectId: "013", name: "Aquaframe" }],
        products: [{ id: "product-1", projectId: "project-1", productId: "009", name: "Legacy" }],
        elements: []
      })
    ).toEqual({
      projects: [{ id: "project-1", projectId: "013", name: "Aquaframe", sortOrder: 0 }],
      products: [
        {
          id: "product-1",
          projectId: "project-1",
          productId: "009",
          name: "Legacy",
          folderPath: "C:/Engineering/0013 - Aquaframe/0009-Legacy/03. Engineering/3D Modellen",
          sortOrder: 0
        }
      ],
      elements: []
    });
  });

  it("migrates missing sort orders and honors stored manual order", () => {
    expect(
      parseAppState({
        projects: [
          { id: "project-2", projectId: "014", name: "Beta", sortOrder: 1 },
          { id: "project-1", projectId: "013", name: "Alpha", sortOrder: 0 }
        ],
        products: [
          { id: "product-2", projectId: "project-1", productId: "010", name: "Later", sortOrder: 1 },
          { id: "product-1", projectId: "project-1", productId: "009", name: "Earlier", sortOrder: 0 },
          { id: "product-3", projectId: "project-2", productId: "001", name: "Standalone" }
        ],
        elements: []
      })
    ).toEqual({
      projects: [
        { id: "project-1", projectId: "013", name: "Alpha", sortOrder: 0 },
        { id: "project-2", projectId: "014", name: "Beta", sortOrder: 1 }
      ],
      products: [
        { id: "product-2", projectId: "project-1", productId: "010", name: "Later", sortOrder: 1 },
        {
          id: "product-1",
          projectId: "project-1",
          productId: "009",
          name: "Earlier",
          sortOrder: 0
        },
        {
          id: "product-3",
          projectId: "project-2",
          productId: "001",
          name: "Standalone",
          sortOrder: 0
        }
      ],
      elements: []
    });
  });

  it("migrates legacy parentElementId into parentElementIds", () => {
    expect(
      parseAppState({
        projects: [],
        products: [],
        elements: [
          {
            id: "parent-1",
            projectId: "project-1",
            productId: "product-1",
            type: "HA",
            partNumber: "00",
            descriptionSlug: "root",
            concepts: []
          },
          {
            id: "element-1",
            projectId: "project-1",
            productId: "product-1",
            parentElementId: "parent-1",
            type: "PA",
            partNumber: "01",
            descriptionSlug: "bracket",
            concepts: []
          }
        ]
      })
    ).toEqual({
      projects: [],
      products: [],
      elements: [
        {
          id: "parent-1",
          projectId: "project-1",
          productId: "product-1",
          parentElementIds: [],
          type: "HA",
          partNumber: "00",
          descriptionSlug: "root",
          concepts: []
        },
        {
          id: "element-1",
          projectId: "project-1",
          productId: "product-1",
          parentElementIds: ["parent-1"],
          type: "PA",
          partNumber: "01",
          descriptionSlug: "bracket",
          concepts: []
        }
      ]
    });
  });

  it("drops invalid parent references while parsing", () => {
    expect(
      parseAppState({
        projects: [],
        products: [],
        elements: [
          {
            id: "parent-1",
            projectId: "project-1",
            productId: "product-1",
            parentElementIds: [],
            type: "HA",
            partNumber: "00",
            descriptionSlug: "root",
            concepts: []
          },
          {
            id: "child-1",
            projectId: "project-1",
            productId: "product-1",
            parentElementIds: ["parent-1", "missing-parent"],
            type: "PA",
            partNumber: "01",
            descriptionSlug: "child",
            concepts: []
          }
        ]
      })
    ).toEqual({
      projects: [],
      products: [],
      elements: [
        {
          id: "parent-1",
          projectId: "project-1",
          productId: "product-1",
          parentElementIds: [],
          type: "HA",
          partNumber: "00",
          descriptionSlug: "root",
          concepts: []
        },
        {
          id: "child-1",
          projectId: "project-1",
          productId: "product-1",
          parentElementIds: ["parent-1"],
          type: "PA",
          partNumber: "01",
          descriptionSlug: "child",
          concepts: []
        }
      ]
    });
  });

  it("keeps valid version export flags and defaults missing ones to empty", () => {
    expect(
      parseAppState({
        projects: [],
        products: [],
        elements: [
          {
            id: "element-1",
            projectId: "project-1",
            productId: "product-1",
            parentElementIds: [],
            type: "HA",
            partNumber: "00",
            descriptionSlug: "root",
            concepts: [
              {
                id: "concept-1",
                conceptCode: "A",
                versions: [
                  {
                    id: "version-1",
                    majorVersion: 1,
                    minorVersion: 0,
                    releaseState: "PT",
                    createdAt: "2026-03-06T09:00:00.000Z",
                    availableExports: {
                      solidworksDrawing: true,
                      step: false,
                      drawing: true
                    }
                  },
                  {
                    id: "version-2",
                    majorVersion: 2,
                    minorVersion: 0,
                    releaseState: "PT",
                    createdAt: "2026-03-07T09:00:00.000Z"
                  }
                ]
              }
            ]
          }
        ]
      })
    ).toEqual({
      projects: [],
      products: [],
      elements: [
        {
          id: "element-1",
          projectId: "project-1",
          productId: "product-1",
          parentElementIds: [],
          type: "HA",
          partNumber: "00",
          descriptionSlug: "root",
          concepts: [
            {
              id: "concept-1",
              conceptCode: "A",
              versions: [
                {
                  id: "version-1",
                  majorVersion: 1,
                  minorVersion: 0,
                  releaseState: "PT",
                  createdAt: "2026-03-06T09:00:00.000Z",
                  availableExports: {
                    solidworksDrawing: true,
                    drawing: true
                  }
                },
                {
                  id: "version-2",
                  majorVersion: 2,
                  minorVersion: 0,
                  releaseState: "PT",
                  createdAt: "2026-03-07T09:00:00.000Z",
                  availableExports: undefined
                }
              ]
            }
          ]
        }
      ]
    });
  });
});

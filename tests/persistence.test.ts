import { describe, expect, it } from "vitest";
import { coerceAppState, createInitialAppState, parseAppState } from "../src/lib/persistence";
import type { AppState } from "../src/lib/types";

describe("parseAppState", () => {
  it("accepts persisted state with nested concept/version data", () => {
    const state: AppState = {
      settings: { defaultRootPath: "D:/Engineering" },
      projects: [{ id: "project-1", projectId: "013", name: "Aquaframe" }],
      products: [{ id: "product-1", projectId: "project-1", productId: "009", name: "Balcony Kit" }],
      elements: [
        {
          id: "element-1",
          projectId: "project-1",
          productId: "product-1",
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
        settings: { defaultRootPath: "C:/Engineering" },
        projects: "broken"
      })
    ).toEqual(createInitialAppState());
  });
});

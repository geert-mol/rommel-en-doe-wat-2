import { describe, expect, it } from "vitest";
import { setVersionExportAvailability } from "../src/lib/store";
import type { EngineeringElement } from "../src/lib/types";

const element: EngineeringElement = {
  id: "element-1",
  projectId: "project-1",
  productId: "product-1",
  parentElementIds: [],
  type: "HA",
  partNumber: "00",
  descriptionSlug: "frame",
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
};

describe("setVersionExportAvailability", () => {
  it("enables an export flag on a version", () => {
    const result = setVersionExportAvailability([element], {
      elementId: "element-1",
      conceptId: "concept-1",
      versionId: "version-1",
      exportKind: "drawing",
      enabled: true
    });

    expect(result[0].concepts[0].versions[0].availableExports).toEqual({
      drawing: true
    });
  });

  it("removes an export flag and clears the container when empty", () => {
    const seeded: EngineeringElement = {
      ...element,
      concepts: [
        {
          ...element.concepts[0],
          versions: [
            {
              ...element.concepts[0].versions[0],
              availableExports: {
                drawing: true
              }
            }
          ]
        }
      ]
    };

    const result = setVersionExportAvailability([seeded], {
      elementId: "element-1",
      conceptId: "concept-1",
      versionId: "version-1",
      exportKind: "drawing",
      enabled: false
    });

    expect(result[0].concepts[0].versions[0].availableExports).toBeUndefined();
  });
});

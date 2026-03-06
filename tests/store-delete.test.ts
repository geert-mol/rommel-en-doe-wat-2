import { describe, expect, it } from "vitest";
import { deleteVersionAndCleanup } from "../src/lib/store";
import type { EngineeringElement } from "../src/lib/types";

const baseElement = (id: string): EngineeringElement => ({
  id,
  projectId: "p",
  productId: "prd",
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
      parentElementId: "parent",
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
      parentElementId: "child",
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
    expect(result.find((element) => element.id === "child")?.parentElementId).toBeUndefined();
    expect(result.find((element) => element.id === "grandchild")?.parentElementId).toBe("child");
  });
});

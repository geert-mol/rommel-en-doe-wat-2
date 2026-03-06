import { describe, expect, it } from "vitest";
import { buildUsageOrder, collectDescendantIds } from "../src/lib/structure";
import type { EngineeringElement } from "../src/lib/types";

const makeElement = (
  id: string,
  type: EngineeringElement["type"],
  parentElementIds: string[] = []
): EngineeringElement => ({
  id,
  projectId: "project-1",
  productId: "product-1",
  parentElementIds,
  type,
  partNumber: id.replace(/\D/g, "").padStart(2, "0"),
  descriptionSlug: id,
  concepts: [
    {
      id: `${id}-concept`,
      conceptCode: "A",
      versions: [
        {
          id: `${id}-version`,
          majorVersion: 1,
          minorVersion: 0,
          releaseState: "PT",
          createdAt: "2026-03-06T00:00:00.000Z"
        }
      ]
    }
  ]
});

describe("buildUsageOrder", () => {
  it("duplicates shared elements for each parent usage", () => {
    const usages = buildUsageOrder([
      makeElement("assembly-a", "HA"),
      makeElement("assembly-b", "SA"),
      makeElement("shared-part", "PA", ["assembly-a", "assembly-b"])
    ]);

    expect(usages.filter((usage) => usage.element.id === "shared-part")).toHaveLength(2);
    expect(
      usages
        .filter((usage) => usage.element.id === "shared-part")
        .map((usage) => usage.parentId)
        .sort()
    ).toEqual(["assembly-a", "assembly-b"]);
  });
});

describe("collectDescendantIds", () => {
  it("tracks descendants across multiple parent links", () => {
    const descendants = collectDescendantIds(
      [
        makeElement("root", "HA"),
        makeElement("assembly", "SA", ["root"]),
        makeElement("shared-part", "PA", ["root", "assembly"])
      ],
      "root"
    );

    expect(descendants).toEqual(new Set(["assembly", "shared-part"]));
  });
});

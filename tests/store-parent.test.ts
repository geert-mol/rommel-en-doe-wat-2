import { describe, expect, it } from "vitest";
import { setElementParents } from "../src/lib/store";
import type { EngineeringElement } from "../src/lib/types";

const makeElement = (
  id: string,
  type: EngineeringElement["type"],
  parentElementIds: string[] = []
): EngineeringElement => ({
  id,
  projectId: "p1",
  productId: "prd1",
  parentElementIds,
  type,
  partNumber: "00",
  descriptionSlug: id,
  concepts: [
    {
      id: `${id}-c`,
      conceptCode: "A",
      versions: [
        {
          id: `${id}-v1`,
          majorVersion: 1,
          minorVersion: 0,
          releaseState: "PT",
          createdAt: "2026-01-01T00:00:00.000Z"
        }
      ]
    }
  ]
});

describe("setElementParents", () => {
  it("updates parents for valid candidates", () => {
    const elements: EngineeringElement[] = [
      makeElement("root-a", "HA"),
      makeElement("root-b", "SA"),
      makeElement("leaf", "PA", ["root-a"])
    ];

    const updated = setElementParents(elements, {
      elementId: "leaf",
      parentElementIds: ["root-a", "root-b"]
    });

    expect(updated.find((element) => element.id === "leaf")?.parentElementIds).toEqual([
      "root-a",
      "root-b"
    ]);
  });

  it("prevents cycles", () => {
    const elements: EngineeringElement[] = [
      makeElement("root", "HA"),
      makeElement("child", "SA", ["root"]),
      makeElement("grandchild", "PA", ["child"])
    ];

    const unchanged = setElementParents(elements, {
      elementId: "root",
      parentElementIds: ["grandchild"]
    });

    expect(unchanged.find((element) => element.id === "root")?.parentElementIds).toEqual([]);
  });
});

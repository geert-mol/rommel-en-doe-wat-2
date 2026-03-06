import { describe, expect, it } from "vitest";
import { setElementParent } from "../src/lib/store";
import type { EngineeringElement } from "../src/lib/types";

const makeElement = (
  id: string,
  type: EngineeringElement["type"],
  parentElementId?: string
): EngineeringElement => ({
  id,
  projectId: "p1",
  productId: "prd1",
  parentElementId,
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

describe("setElementParent", () => {
  it("updates parent for valid candidate", () => {
    const elements: EngineeringElement[] = [
      makeElement("root-a", "HA"),
      makeElement("root-b", "SA"),
      makeElement("leaf", "PA", "root-a")
    ];

    const updated = setElementParent(elements, {
      elementId: "leaf",
      parentElementId: "root-b"
    });

    expect(updated.find((element) => element.id === "leaf")?.parentElementId).toBe("root-b");
  });

  it("prevents cycles", () => {
    const elements: EngineeringElement[] = [
      makeElement("root", "HA"),
      makeElement("child", "SA", "root"),
      makeElement("grandchild", "PA", "child")
    ];

    const unchanged = setElementParent(elements, {
      elementId: "root",
      parentElementId: "grandchild"
    });

    expect(unchanged.find((element) => element.id === "root")?.parentElementId).toBeUndefined();
  });
});

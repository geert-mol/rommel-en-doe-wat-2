import { describe, expect, it } from "vitest";
import { buildProjectExportPayload } from "../src/lib/export";
import type { AppState } from "../src/lib/types";

const state: AppState = {
  settings: { defaultRootPath: "D:/Vault" },
  projects: [{ id: "project-1", projectId: "013", name: "Aquaframe" }],
  products: [
    {
      id: "product-1",
      projectId: "project-1",
      productId: "009",
      name: "Balcony Kit",
      folderPath: "D:/Vault/Aquaframe/Balcony Kit/Models"
    },
    {
      id: "product-2",
      projectId: "project-1",
      productId: "010",
      name: "Pump Module",
      folderPath: "D:/Vault/Aquaframe/Pump Module/Models"
    }
  ],
  elements: [
    {
      id: "root-1",
      projectId: "project-1",
      productId: "product-1",
      parentElementIds: [],
      type: "HA",
      partNumber: "00",
      descriptionSlug: "frame",
      concepts: [
        {
          id: "concept-a",
          conceptCode: "A",
          versions: [
            {
              id: "version-2",
              majorVersion: 2,
              minorVersion: 0,
              releaseState: "PR",
              createdAt: "2026-03-06T09:00:00.000Z"
            },
            {
              id: "version-1",
              majorVersion: 1,
              minorVersion: 1,
              releaseState: "PT",
              createdAt: "2026-03-05T09:00:00.000Z"
            }
          ]
        }
      ]
    },
    {
      id: "child-1",
      projectId: "project-1",
      productId: "product-1",
      parentElementIds: ["root-1"],
      type: "PA",
      partNumber: "01",
      descriptionSlug: "bracket",
      concepts: [
        {
          id: "concept-b",
          conceptCode: "B",
          versions: [
            {
              id: "version-b1",
              majorVersion: 1,
              minorVersion: 0,
              releaseState: "RL",
              createdAt: "2026-03-04T09:00:00.000Z"
            }
          ]
        }
      ]
    },
    {
      id: "pump-1",
      projectId: "project-1",
      productId: "product-2",
      parentElementIds: [],
      type: "MM",
      partNumber: "00",
      descriptionSlug: "pump-body",
      concepts: [
        {
          id: "concept-c",
          conceptCode: "A",
          versions: [
            {
              id: "version-c1",
              majorVersion: 1,
              minorVersion: 0,
              releaseState: "PT",
              createdAt: "2026-03-03T09:00:00.000Z"
            }
          ]
        }
      ]
    }
  ],
  selectedProjectId: "project-1",
  selectedProductId: "product-1"
};

describe("buildProjectExportPayload", () => {
  it("includes all products and all versions for the selected project", () => {
    const payload = buildProjectExportPayload(state, "project-1");

    expect(payload?.projectCode).toBe("013");
    expect(payload?.sheets).toHaveLength(2);
    expect(payload?.sheets[0].productCode).toBe("009");
    expect(payload?.sheets[0].rows).toHaveLength(3);
    expect(payload?.sheets[0].rows[0].versionLabel).toBe("v2");
    expect(payload?.sheets[0].rows[1].versionLabel).toBe("v1-1");
    expect(payload?.sheets[0].rows[2].parentLabel).toBe("HA 00 frame");
    expect(payload?.sheets[1].rows[0].filePath).toContain(
      "D:/Vault/Aquaframe/Pump Module/Models/"
    );
  });

  it("returns null when the project does not exist", () => {
    expect(buildProjectExportPayload(state, "missing-project")).toBeNull();
  });
});

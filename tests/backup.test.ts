import { describe, expect, it } from "vitest";
import { parseAppBackup, serializeAppBackup } from "../src/lib/backup";
import type { AppState } from "../src/lib/types";

describe("app backups", () => {
  it("round-trips valid app state through the backup format", () => {
    const state: AppState = {
      settings: { defaultRootPath: "D:/Engineering" },
      projects: [{ id: "project-1", projectId: "001", name: "Bridge" }],
      products: [{ id: "product-1", projectId: "project-1", productId: "001", name: "Deck" }],
      elements: [
        {
          id: "element-1",
          projectId: "project-1",
          productId: "product-1",
          parentElementIds: [],
          type: "HA",
          partNumber: "01",
          descriptionSlug: "main-frame",
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
                  createdAt: "2026-03-06T11:00:00.000Z"
                }
              ]
            }
          ]
        }
      ],
      selectedProjectId: "project-1",
      selectedProductId: "product-1"
    };

    expect(parseAppBackup(serializeAppBackup(state, new Date("2026-03-06T11:30:00.000Z")))).toEqual(
      state
    );
  });

  it("rejects invalid backup payloads", () => {
    expect(() =>
      parseAppBackup(
        JSON.stringify({
          format: "rnd-pdm-backup",
          version: 1,
          createdAt: "2026-03-06T11:30:00.000Z",
          state: { settings: { defaultRootPath: "C:/Engineering" }, projects: "broken" }
        })
      )
    ).toThrow("Backup file contains invalid app data.");
  });
});

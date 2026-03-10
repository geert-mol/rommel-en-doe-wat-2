import { describe, expect, it } from "vitest";
import {
  buildSuggestedFilePath,
  formatVersionLabel,
  generateFileName,
  normalizePartNumber,
  padProjectOrProductId,
  slugify
} from "../src/lib/filename";
import type { EngineeringElement, Product, Project } from "../src/lib/types";

describe("filename tools", () => {
  it("formats ids + slugs", () => {
    expect(padProjectOrProductId("13")).toBe("013");
    expect(normalizePartNumber("8")).toBe("08");
    expect(slugify("Balkon Mini Vijver!")).toBe("balkon-mini-vijver");
  });

  it("renders version labels", () => {
    expect(formatVersionLabel(1, 0)).toBe("v1");
    expect(formatVersionLabel(3, 2)).toBe("v3-2");
  });

  it("generates full name + file path", () => {
    const fileName = generateFileName({
      state: "PT",
      projectCode: "013",
      productCode: "009",
      conceptCode: "A",
      type: "MM",
      partNumber: "00",
      descriptionSlug: "balkon-mini-vijver",
      majorVersion: 1,
      minorVersion: 0
    });
    expect(fileName).toBe("PT_013-009_A_MM_00_balkon-mini-vijver_v1");

    const project: Project = {
      id: "p",
      projectId: "013",
      name: "Aquaframe"
    };
    const product: Product = {
      id: "pr",
      productId: "009",
      projectId: "p",
      name: "Balcony Kit",
      folderPath: "D:/Products/Balcony Kit/Models"
    };
    const element: EngineeringElement = {
      id: "e",
      projectId: "p",
      productId: "pr",
      parentElementIds: [],
      type: "MM",
      partNumber: "00",
      descriptionSlug: "balkon-mini-vijver",
      concepts: []
    };

    expect(buildSuggestedFilePath(fileName, element, project, product, "C:/Engineering")).toBe(
      "D:/Products/Balcony Kit/Models/PT_013-009_A_MM_00_balkon-mini-vijver_v1.sldprt"
    );
  });

  it("falls back to the legacy folder structure when a product has no folder path", () => {
    const project: Project = {
      id: "p",
      projectId: "013",
      name: "Aquaframe"
    };
    const product: Product = {
      id: "pr",
      productId: "009",
      projectId: "p",
      name: "Balcony Kit"
    };
    const element: EngineeringElement = {
      id: "e",
      projectId: "p",
      productId: "pr",
      parentElementIds: [],
      type: "MM",
      partNumber: "00",
      descriptionSlug: "balkon-mini-vijver",
      concepts: []
    };

    expect(
      buildSuggestedFilePath(
        "PT_013-009_A_MM_00_balkon-mini-vijver_v1",
        element,
        project,
        product,
        "C:/Engineering"
      )
    ).toBe(
      "C:/Engineering/0013 - Aquaframe/0009-Balcony Kit/03. Engineering/3D Modellen/PT_013-009_A_MM_00_balkon-mini-vijver_v1.sldprt"
    );
  });
});

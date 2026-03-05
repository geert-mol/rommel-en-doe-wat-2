import { afterEach, describe, expect, it, vi } from "vitest";
import { nextConceptCode, nextVersion } from "../src/lib/versioning";
import type { ElementConcept } from "../src/lib/types";

describe("versioning tools", () => {
  const concept: ElementConcept = {
    id: "concept-1",
    conceptCode: "A",
    versions: [
      {
        id: "v1",
        majorVersion: 1,
        minorVersion: 0,
        releaseState: "PT",
        createdAt: "2025-01-01T10:00:00.000Z"
      },
      {
        id: "v1-1",
        majorVersion: 1,
        minorVersion: 1,
        releaseState: "PR",
        createdAt: "2025-01-03T10:00:00.000Z"
      }
    ]
  };

  it("generates next concept code", () => {
    expect(nextConceptCode(["A", "B", "D"])).toBe("C");
    expect(nextConceptCode("ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""))).toBe("A1");
  });

  it("adds major version", () => {
    vi.stubGlobal("crypto", { randomUUID: () => "new-major" });
    const major = nextVersion(concept, "major", "RL");
    expect(major.majorVersion).toBe(2);
    expect(major.minorVersion).toBe(0);
    expect(major.releaseState).toBe("RL");
  });

  it("adds minor version", () => {
    vi.stubGlobal("crypto", { randomUUID: () => "new-minor" });
    const minor = nextVersion(concept, "minor", "PT");
    expect(minor.majorVersion).toBe(1);
    expect(minor.minorVersion).toBe(2);
    expect(minor.releaseState).toBe("PT");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });
});

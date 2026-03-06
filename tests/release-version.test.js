import { describe, expect, it } from "vitest";
import {
  bumpVersion,
  detectBumpLevel,
  parseVersion
} from "../scripts/release-version.mjs";

describe("parseVersion", () => {
  it("parses strict semantic versions", () => {
    expect(parseVersion("1.2.3")).toEqual({ major: 1, minor: 2, patch: 3 });
  });

  it("rejects invalid versions", () => {
    expect(() => parseVersion("1.2")).toThrow("Invalid semantic version");
  });
});

describe("bumpVersion", () => {
  it("bumps patch, minor, and major correctly", () => {
    expect(bumpVersion("0.1.0", "patch")).toBe("0.1.1");
    expect(bumpVersion("0.1.0", "minor")).toBe("0.2.0");
    expect(bumpVersion("0.1.0", "major")).toBe("1.0.0");
  });
});

describe("detectBumpLevel", () => {
  it("defaults to patch for fix/chore changes", () => {
    expect(detectBumpLevel(["fix: tighten tree column width", "chore: refresh installer"])).toBe(
      "patch"
    );
  });

  it("returns minor when a feat commit exists", () => {
    expect(detectBumpLevel(["fix: tidy sidebar", "feat: add backup restore"])).toBe("minor");
  });

  it("returns major for breaking commits", () => {
    expect(
      detectBumpLevel([
        "feat!: replace storage schema",
        "feat: add migration",
        "BREAKING CHANGE: old backups no longer restore"
      ])
    ).toBe("major");
  });
});

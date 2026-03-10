import { describe, expect, it } from "vitest";
import { buildReleaseNotes, extractCommitEntries } from "../scripts/release-notes.mjs";

describe("extractCommitEntries", () => {
  it("classifies conventional commits into release-note sections", () => {
    expect(extractCommitEntries("feat(ui): add update popup")).toEqual([
      { section: "features", text: "Add update popup" }
    ]);
    expect(extractCommitEntries("fix: tighten popup anchor")).toEqual([
      { section: "fixes", text: "Tighten popup anchor" }
    ]);
  });

  it("emits breaking changes from subject and body", () => {
    expect(
      extractCommitEntries("feat!: replace updater flow\n\nBREAKING CHANGE: old update state is removed")
    ).toEqual([
      { section: "breaking", text: "Replace updater flow" },
      { section: "features", text: "Replace updater flow" },
      { section: "breaking", text: "Old update state is removed" }
    ]);
  });
});

describe("buildReleaseNotes", () => {
  it("groups messages into ordered markdown sections", () => {
    expect(
      buildReleaseNotes([
        "feat: add release notes popup",
        "fix: anchor kebab menu correctly",
        "chore: refresh installer metadata"
      ])
    ).toBe(`## Features
- Add release notes popup

## Fixes
- Anchor kebab menu correctly

## Maintenance
- Refresh installer metadata
`);
  });

  it("falls back to maintenance release notes when there are no commits", () => {
    expect(buildReleaseNotes([])).toBe(`## Maintenance
- Maintenance release.
`);
  });
});

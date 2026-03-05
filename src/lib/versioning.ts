import type { ElementConcept, ElementVersion, ReleaseState } from "./types";

export const byVersionDesc = (a: ElementVersion, b: ElementVersion): number => {
  if (a.majorVersion !== b.majorVersion) return b.majorVersion - a.majorVersion;
  if (a.minorVersion !== b.minorVersion) return b.minorVersion - a.minorVersion;
  return b.createdAt.localeCompare(a.createdAt);
};

export const latestVersion = (concept: ElementConcept): ElementVersion =>
  [...concept.versions].sort(byVersionDesc)[0];

export const nextVersion = (
  concept: ElementConcept,
  kind: "major" | "minor",
  releaseState: ReleaseState
): ElementVersion => {
  const current = latestVersion(concept);
  if (kind === "major") {
    return {
      id: crypto.randomUUID(),
      majorVersion: current.majorVersion + 1,
      minorVersion: 0,
      releaseState,
      createdAt: new Date().toISOString()
    };
  }

  return {
    id: crypto.randomUUID(),
    majorVersion: current.majorVersion,
    minorVersion: current.minorVersion + 1,
    releaseState,
    createdAt: new Date().toISOString()
  };
};

export const nextConceptCode = (codes: string[]): string => {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (const letter of alphabet) {
    if (!codes.includes(letter)) return letter;
  }

  let suffix = 1;
  while (true) {
    for (const letter of alphabet) {
      const candidate = `${letter}${suffix}`;
      if (!codes.includes(candidate)) return candidate;
    }
    suffix += 1;
  }
};

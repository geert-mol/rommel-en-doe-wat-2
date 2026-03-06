export type ReleaseBumpLevel = "patch" | "minor" | "major";

export declare const RELEASE_BUMP_LEVELS: ReleaseBumpLevel[];

export declare const parseVersion: (
  version: string
) => { major: number; minor: number; patch: number };

export declare const bumpVersion: (version: string, level: ReleaseBumpLevel) => string;

export declare const detectBumpLevel: (messages: string[]) => ReleaseBumpLevel;

export declare const readPackageVersion: (cwd: string) => string;

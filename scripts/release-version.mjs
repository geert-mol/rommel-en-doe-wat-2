// @ts-check
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** @typedef {"patch" | "minor" | "major"} ReleaseBumpLevel */

export const RELEASE_BUMP_LEVELS = ["patch", "minor", "major"];

/**
 * @param {string} version
 * @returns {{ major: number; minor: number; patch: number }}
 */
export const parseVersion = (version) => {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version.trim());
  if (!match) {
    throw new Error(`Invalid semantic version: ${version}`);
  }

  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3], 10)
  };
};

/**
 * @param {string} version
 * @param {ReleaseBumpLevel} level
 * @returns {string}
 */
export const bumpVersion = (version, level) => {
  const parsed = parseVersion(version);

  if (level === "major") {
    return `${parsed.major + 1}.0.0`;
  }

  if (level === "minor") {
    return `${parsed.major}.${parsed.minor + 1}.0`;
  }

  if (level === "patch") {
    return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`;
  }

  throw new Error(`Unsupported bump level: ${level}`);
};

/**
 * @param {string[]} messages
 * @returns {ReleaseBumpLevel}
 */
export const detectBumpLevel = (messages) => {
  let hasMinor = false;

  for (const message of messages) {
    const normalized = message.trim();
    if (!normalized) continue;

    if (/(^|\n)BREAKING CHANGE:/m.test(normalized)) {
      return "major";
    }

    const subject = normalized.split(/\r?\n/, 1)[0] ?? "";
    if (/^[a-z]+(\([^)]+\))?!:/.test(subject)) {
      return "major";
    }

    if (/^feat(\([^)]+\))?:/.test(subject)) {
      hasMinor = true;
    }
  }

  return hasMinor ? "minor" : "patch";
};

/**
 * @param {string} cwd
 * @returns {string}
 */
export const readPackageVersion = (cwd) => {
  const packageJsonPath = path.join(cwd, "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  if (typeof packageJson.version !== "string" || packageJson.version.trim().length === 0) {
    throw new Error(`Could not read version from ${packageJsonPath}`);
  }
  return packageJson.version.trim();
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const cwd = process.cwd();
  const currentVersion = readPackageVersion(cwd);
  const logFile = process.argv[2];

  if (!logFile) {
    throw new Error("Usage: node scripts/release-version.mjs <commit-log-file>");
  }

  const commitMessages = fs
    .readFileSync(path.resolve(cwd, logFile), "utf8")
    .split("\u001e")
    .map((value) => value.trim())
    .filter(Boolean);

  const bumpLevel = detectBumpLevel(commitMessages);
  const nextVersion = bumpVersion(currentVersion, bumpLevel);

  process.stdout.write(
    JSON.stringify(
      {
        currentVersion,
        bumpLevel,
        nextVersion
      },
      null,
      2
    )
  );
}

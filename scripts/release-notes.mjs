// @ts-check
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SECTION_ORDER = [
  "breaking",
  "features",
  "fixes",
  "improvements",
  "maintenance",
  "other"
];

const SECTION_TITLES = {
  breaking: "Breaking Changes",
  features: "Features",
  fixes: "Fixes",
  improvements: "Improvements",
  maintenance: "Maintenance",
  other: "Other Changes"
};

const toSentenceCase = (value) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return `${trimmed.slice(0, 1).toUpperCase()}${trimmed.slice(1)}`;
};

const classifyCommitType = (type) => {
  if (type === "feat") return "features";
  if (type === "fix") return "fixes";
  if (type === "perf" || type === "refactor") return "improvements";
  if (type === "build" || type === "ci" || type === "chore" || type === "style" || type === "test") {
    return "maintenance";
  }
  return "other";
};

export const extractCommitEntries = (message) => {
  const normalized = message.trim();
  if (!normalized) return [];

  const [subject, ...bodyLines] = normalized.split(/\r?\n/);
  const entries = [];
  const conventionalMatch = /^(?<type>[a-z]+)(?:\([^)]+\))?(?<breaking>!)?:\s*(?<summary>.+)$/.exec(
    subject ?? ""
  );

  if (conventionalMatch?.groups?.summary) {
    const summary = toSentenceCase(conventionalMatch.groups.summary);
    if (conventionalMatch.groups.breaking === "!") {
      entries.push({ section: "breaking", text: summary });
    }

    entries.push({
      section: classifyCommitType(conventionalMatch.groups.type),
      text: summary
    });
  } else if (subject?.trim()) {
    entries.push({
      section: "other",
      text: toSentenceCase(subject)
    });
  }

  for (const line of bodyLines) {
    const breakingMatch = /^BREAKING CHANGE:\s*(.+)$/.exec(line.trim());
    if (!breakingMatch) continue;
    entries.push({
      section: "breaking",
      text: toSentenceCase(breakingMatch[1])
    });
  }

  return entries;
};

export const buildReleaseNotes = (messages) => {
  /** @type {Record<string, string[]>} */
  const sections = {
    breaking: [],
    features: [],
    fixes: [],
    improvements: [],
    maintenance: [],
    other: []
  };

  for (const message of messages) {
    for (const entry of extractCommitEntries(message)) {
      if (!sections[entry.section].includes(entry.text)) {
        sections[entry.section].push(entry.text);
      }
    }
  }

  const parts = SECTION_ORDER.flatMap((section) => {
    const items = sections[section];
    if (items.length === 0) return [];
    return [
      `## ${SECTION_TITLES[section]}`,
      ...items.map((item) => `- ${item}`),
      ""
    ];
  });

  if (parts.length === 0) {
    return "## Maintenance\n- Maintenance release.\n";
  }

  return `${parts.join("\n").trim()}\n`;
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const cwd = process.cwd();
  const logFile = process.argv[2];

  if (!logFile) {
    throw new Error("Usage: node scripts/release-notes.mjs <commit-log-file>");
  }

  const commitMessages = fs
    .readFileSync(path.resolve(cwd, logFile), "utf8")
    .split("\u001e")
    .map((value) => value.trim())
    .filter(Boolean);

  process.stdout.write(buildReleaseNotes(commitMessages));
}

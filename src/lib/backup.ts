import { parseAppState } from "./persistence";
import type { AppState } from "./types";

const BACKUP_FORMAT = "rnd-pdm-backup";
const BACKUP_VERSION = 1;

interface AppBackupDocument {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  createdAt: string;
  state: AppState;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const buildBackupFileName = (createdAt = new Date()): string =>
  `rommel-en-doe-wat-backup-${createdAt.toISOString().slice(0, 10)}.rndbackup`;

export const serializeAppBackup = (state: AppState, createdAt = new Date()): string => {
  const document: AppBackupDocument = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: createdAt.toISOString(),
    state
  };

  return JSON.stringify(document, null, 2);
};

export const parseAppBackup = (raw: string): AppState => {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Backup file is not valid JSON.");
  }

  if (!isRecord(parsed)) {
    throw new Error("Backup file is invalid.");
  }
  if (parsed.format !== BACKUP_FORMAT) {
    throw new Error("Backup file format is not supported.");
  }
  if (parsed.version !== BACKUP_VERSION) {
    throw new Error("Backup file version is not supported.");
  }
  if (typeof parsed.createdAt !== "string") {
    throw new Error("Backup file is missing its creation date.");
  }

  const restoredState = parseAppState(parsed.state);
  if (!restoredState) {
    throw new Error("Backup file contains invalid app data.");
  }

  return restoredState;
};

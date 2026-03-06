import { app } from "electron";
import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { inspect } from "node:util";

type LogLevel = "INFO" | "ERROR";

const logDirectoryName = "logs";
const logFileName = "main.log";

const getLogDirectory = (): string => {
  const directory = path.join(app.getPath("userData"), logDirectoryName);
  mkdirSync(directory, { recursive: true });
  return directory;
};

export const getLogFilePath = (): string => path.join(getLogDirectory(), logFileName);

const stringifyDetails = (details?: unknown): string => {
  if (details === undefined) return "";
  if (details instanceof Error) {
    return `${details.name}: ${details.message}\n${details.stack ?? ""}`.trim();
  }
  if (typeof details === "string") return details;

  try {
    return JSON.stringify(details, null, 2);
  } catch {
    return inspect(details, { depth: 6, breakLength: 120 });
  }
};

const writeLine = (level: LogLevel, message: string, details?: unknown): void => {
  const lines = [`[${new Date().toISOString()}] [${level}] ${message}`];
  const renderedDetails = stringifyDetails(details);
  if (renderedDetails.length > 0) {
    lines.push(renderedDetails);
  }
  const payload = `${lines.join("\n")}\n`;

  appendFileSync(getLogFilePath(), payload, "utf8");
  if (level === "ERROR") {
    console.error(payload);
    return;
  }
  console.log(payload);
};

export const logInfo = (message: string, details?: unknown): void => {
  writeLine("INFO", message, details);
};

export const logError = (message: string, details?: unknown): void => {
  writeLine("ERROR", message, details);
};

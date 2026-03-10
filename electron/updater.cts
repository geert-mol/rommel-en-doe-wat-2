import { app, BrowserWindow, ipcMain } from "electron";
import { autoUpdater } from "electron-updater";
import { existsSync } from "node:fs";
import https from "node:https";
import path from "node:path";
import { logError, logInfo } from "./logger.cjs";

type UpdateStatus =
  | "unsupported"
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "downloaded"
  | "no-update"
  | "error";

interface UpdateReleaseNote {
  version: string;
  title: string;
  body: string;
  publishedAt?: string;
}

interface UpdateState {
  status: UpdateStatus;
  currentVersion: string;
  availableVersion?: string;
  downloadedVersion?: string;
  releaseNotes?: UpdateReleaseNote[];
  progressPercent?: number;
  transferredBytes?: number;
  totalBytes?: number;
  message?: string;
  checkedAt?: string;
}

interface GitHubReleaseResponse {
  tag_name?: string;
  name?: string;
  body?: string;
  draft?: boolean;
  prerelease?: boolean;
  published_at?: string;
}

const updateChannel = "updater:state-changed";

let currentState: UpdateState = {
  status: "unsupported",
  currentVersion: app.getVersion(),
  message: "Automatic updates only run in packaged Windows builds."
};

let didInitialize = false;
let isChecking = false;
let checkTimer: NodeJS.Timeout | null = null;
let isDownloading = false;

const githubReleasesUrl =
  "https://api.github.com/repos/geert-mol/rommel-en-doe-wat-2/releases?per_page=20";

const getUpdaterConfigPath = (): string => path.join(process.resourcesPath, "app-update.yml");

const hasUpdaterConfig = (): boolean => existsSync(getUpdaterConfigPath());

const supportsAutoUpdates = (): boolean => app.isPackaged && process.platform === "win32" && hasUpdaterConfig();

const getUnsupportedMessage = (): string => {
  if (!app.isPackaged || process.platform !== "win32") {
    return "Automatic updates only run in packaged Windows builds.";
  }

  return `Automatic updates are unavailable because ${getUpdaterConfigPath()} is missing.`;
};

const parseVersion = (version: string): [number, number, number] => {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version.trim());
  if (!match) {
    throw new Error(`Invalid semantic version: ${version}`);
  }

  return [
    Number.parseInt(match[1], 10),
    Number.parseInt(match[2], 10),
    Number.parseInt(match[3], 10)
  ];
};

const compareVersions = (left: string, right: string): number => {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);

  for (let index = 0; index < leftParts.length; index += 1) {
    const delta = leftParts[index] - rightParts[index];
    if (delta !== 0) return delta;
  }

  return 0;
};

const normalizeReleaseVersion = (tagName?: string): string | null => {
  if (!tagName) return null;
  const normalized = tagName.trim().replace(/^v/i, "");
  return /^\d+\.\d+\.\d+$/.test(normalized) ? normalized : null;
};

const requestJson = (url: string): Promise<unknown> =>
  new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": `rommel-en-doe-wat/${app.getVersion()}`
        }
      },
      (response) => {
        const chunks: Buffer[] = [];

        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          const rawBody = Buffer.concat(chunks).toString("utf8");
          if ((response.statusCode ?? 500) < 200 || (response.statusCode ?? 500) >= 300) {
            reject(new Error(`GitHub releases request failed (${response.statusCode ?? "unknown"}).`));
            return;
          }

          try {
            resolve(JSON.parse(rawBody));
          } catch (error) {
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        });
      }
    );

    request.on("error", reject);
  });

const fetchMissedReleaseNotes = async (
  currentVersion: string,
  targetVersion: string
): Promise<UpdateReleaseNote[]> => {
  const response = await requestJson(githubReleasesUrl);
  if (!Array.isArray(response)) {
    throw new Error("Unexpected GitHub releases response.");
  }

  const releases = response
    .filter((release): release is GitHubReleaseResponse => typeof release === "object" && release !== null)
    .filter((release) => !release.draft && !release.prerelease)
    .map<UpdateReleaseNote | null>((release) => {
      const version = normalizeReleaseVersion(release.tag_name);
      if (!version) return null;
      return {
        version,
        title: release.name?.trim() || `v${version}`,
        body: release.body?.trim() || "No release notes.",
        publishedAt: release.published_at
      };
    });

  return releases
    .filter((release): release is UpdateReleaseNote => release !== null)
    .filter(
      (release) =>
        compareVersions(release.version, currentVersion) > 0 &&
        compareVersions(release.version, targetVersion) <= 0
    )
    .sort((left, right) => compareVersions(left.version, right.version));
};

const broadcastState = () => {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(updateChannel, currentState);
  }
};

const setState = (patch: Partial<UpdateState>) => {
  currentState = {
    ...currentState,
    ...patch,
    currentVersion: app.getVersion()
  };
  broadcastState();
};

const scheduleInitialCheck = () => {
  if (checkTimer) return;

  checkTimer = setTimeout(() => {
    checkTimer = null;
    void checkForUpdates();
  }, 4000);
};

const checkForUpdates = async (): Promise<UpdateState> => {
  if (!supportsAutoUpdates()) {
    setState({
      status: "unsupported",
      message: getUnsupportedMessage()
    });
    return currentState;
  }

  if (isChecking) {
    return currentState;
  }

  try {
    isChecking = true;
    setState({
      status: "checking",
      checkedAt: new Date().toISOString(),
      availableVersion: undefined,
      downloadedVersion: undefined,
      releaseNotes: undefined,
      message: "Checking for updates...",
      progressPercent: undefined,
      transferredBytes: undefined,
      totalBytes: undefined
    });
    await autoUpdater.checkForUpdates();
  } catch (error) {
    logError("Update check failed.", error);
    setState({
      status: "error",
      message: error instanceof Error ? error.message : "Update check failed."
    });
  } finally {
    isChecking = false;
  }

  return currentState;
};

const downloadAvailableUpdate = async (): Promise<UpdateState> => {
  if (currentState.status !== "available") {
    return currentState;
  }

  if (isDownloading) {
    return currentState;
  }

  try {
    isDownloading = true;
    await autoUpdater.downloadUpdate();
  } catch (error) {
    logError("Update download failed.", error);
    setState({
      status: "error",
      message: error instanceof Error ? error.message : "Update download failed."
    });
  } finally {
    isDownloading = false;
  }

  return currentState;
};

const installDownloadedUpdate = (): void => {
  if (currentState.status !== "downloaded") {
    return;
  }

  logInfo("Installing downloaded update.", {
    currentVersion: currentState.currentVersion,
    downloadedVersion: currentState.downloadedVersion
  });
  autoUpdater.quitAndInstall(false, true);
};

export const registerUpdaterHandlers = () => {
  ipcMain.handle("updater:get-state", () => currentState);
  ipcMain.handle("updater:check", async () => checkForUpdates());
  ipcMain.handle("updater:download", async () => downloadAvailableUpdate());
  ipcMain.handle("updater:install", () => {
    installDownloadedUpdate();
  });
};

export const initializeAutoUpdater = () => {
  if (didInitialize) {
    scheduleInitialCheck();
    return;
  }

  didInitialize = true;

  if (!supportsAutoUpdates()) {
    setState({
      status: "unsupported",
      message: getUnsupportedMessage()
    });
    return;
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.disableWebInstaller = false;
  autoUpdater.allowPrerelease = false;
  autoUpdater.allowDowngrade = false;
  autoUpdater.logger = {
    info: (message: string) => logInfo(message),
    warn: (message: string) => logInfo(`Updater warning: ${message}`),
    error: (message: string | null, error?: Error) => logError(message ?? "Updater error", error),
    debug: (message: string) => logInfo(`Updater debug: ${message}`)
  };

  autoUpdater.on("checking-for-update", () => {
    logInfo("Checking for app updates.");
    setState({
      status: "checking",
      checkedAt: new Date().toISOString(),
      message: "Checking for updates..."
    });
  });

  autoUpdater.on("update-available", (info) => {
    logInfo("Update available.", info);
    setState({
      status: "available",
      availableVersion: info.version,
      downloadedVersion: undefined,
      releaseNotes: undefined,
      message: `Version ${info.version} available. Review notes and choose when to download.`
    });

    void fetchMissedReleaseNotes(app.getVersion(), info.version)
      .then((releaseNotes) => {
        setState({
          releaseNotes,
          message: `Version ${info.version} available. Review notes and choose when to download.`
        });
      })
      .catch((error) => {
        logError("Could not fetch release notes.", error);
      });
  });

  autoUpdater.on("download-progress", (progress) => {
    setState({
      status: "downloading",
      progressPercent: progress.percent,
      transferredBytes: progress.transferred,
      totalBytes: progress.total,
      message: `Downloading version ${currentState.availableVersion ?? app.getVersion()}...`
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    logInfo("Update downloaded.", info);
    setState({
      status: "downloaded",
      downloadedVersion: info.version,
      availableVersion: info.version,
      progressPercent: 100,
      message: `Version ${info.version} downloaded. Restart to install.`
    });
  });

  autoUpdater.on("update-not-available", (info) => {
    logInfo("No update available.", info);
    setState({
      status: "no-update",
      availableVersion: undefined,
      downloadedVersion: undefined,
      releaseNotes: undefined,
      progressPercent: undefined,
      transferredBytes: undefined,
      totalBytes: undefined,
      message: `Version ${app.getVersion()} is up to date.`
    });
  });

  autoUpdater.on("error", (error) => {
    logError("Updater error.", error);
    setState({
      status: "error",
      releaseNotes: undefined,
      message: error == null ? "Updater error." : error.message
    });
  });

  currentState = {
    status: "idle",
    currentVersion: app.getVersion(),
    message: "Update check will run automatically."
  };
  scheduleInitialCheck();
};

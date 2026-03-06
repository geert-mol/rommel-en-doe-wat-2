import { app, BrowserWindow, ipcMain } from "electron";
import { autoUpdater } from "electron-updater";
import { existsSync } from "node:fs";
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

interface UpdateState {
  status: UpdateStatus;
  currentVersion: string;
  availableVersion?: string;
  downloadedVersion?: string;
  progressPercent?: number;
  transferredBytes?: number;
  totalBytes?: number;
  message?: string;
  checkedAt?: string;
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

const getUpdaterConfigPath = (): string => path.join(process.resourcesPath, "app-update.yml");

const hasUpdaterConfig = (): boolean => existsSync(getUpdaterConfigPath());

const supportsAutoUpdates = (): boolean => app.isPackaged && process.platform === "win32" && hasUpdaterConfig();

const getUnsupportedMessage = (): string => {
  if (!app.isPackaged || process.platform !== "win32") {
    return "Automatic updates only run in packaged Windows builds.";
  }

  return `Automatic updates are unavailable because ${getUpdaterConfigPath()} is missing.`;
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

  autoUpdater.autoDownload = true;
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
      message: `Version ${info.version} available. Downloading now...`
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

import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { existsSync } from "node:fs";
import path from "node:path";
import { getStateDatabasePath, loadState, saveState } from "./db.cjs";
import { getLogFilePath, logError, logInfo } from "./logger.cjs";

const rendererDevUrl = process.env.ELECTRON_RENDERER_URL;

const createMainWindow = (): BrowserWindow => {
  const window = new BrowserWindow({
    width: 1540,
    height: 980,
    minWidth: 1180,
    minHeight: 760,
    backgroundColor: "#f4f2ea",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  window.webContents.on("did-finish-load", () => {
    logInfo("Renderer finished load.");
  });
  window.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
      logError("Renderer failed to load.", {
        errorCode,
        errorDescription,
        validatedUrl,
        isMainFrame
      });
    }
  );
  window.webContents.on("render-process-gone", (_event, details) => {
    logError("Renderer process gone.", details);
  });
  window.webContents.on("preload-error", (_event, preloadPath, error) => {
    logError(`Preload error in ${preloadPath}.`, error);
  });
  window.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    if (level >= 2) {
      logError("Renderer console message.", { level, message, line, sourceId });
      return;
    }

    logInfo("Renderer console message.", { level, message, line, sourceId });
  });

  if (rendererDevUrl) {
    void window.loadURL(rendererDevUrl);
    window.webContents.openDevTools({ mode: "detach" });
    return window;
  }

  void window.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  return window;
};

const normalizeDirectoryChoice = (targetPath: string): string | null => {
  const trimmedPath = targetPath.trim();
  if (trimmedPath.length === 0) return null;

  if (existsSync(trimmedPath)) {
    return trimmedPath;
  }

  const parentDirectory = path.dirname(trimmedPath);
  return existsSync(parentDirectory) ? parentDirectory : null;
};

const registerIpcHandlers = () => {
  ipcMain.handle("storage:load", () => loadState());
  ipcMain.handle("storage:save", (_event, state) => {
    const nextState = state as Parameters<typeof saveState>[0];
    saveState(nextState);
  });
  ipcMain.handle("storage:location", () => getStateDatabasePath());
  ipcMain.handle("log:location", () => getLogFilePath());
  ipcMain.handle("dialog:pick-directory", async (_event, initialPath?: string) => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory"],
      defaultPath: initialPath && initialPath.trim().length > 0 ? initialPath : undefined
    });

    return result.canceled ? null : result.filePaths[0] ?? null;
  });
  ipcMain.handle("shell:open-path", async (_event, targetPath: string) => {
    const fallbackDirectory = normalizeDirectoryChoice(targetPath);
    if (!fallbackDirectory) return `Path not found: ${targetPath}`;

    const resolvedPath = existsSync(targetPath)
      ? path.normalize(targetPath)
      : path.normalize(fallbackDirectory);

    return shell.openPath(resolvedPath);
  });
  ipcMain.handle("shell:reveal-path", (_event, targetPath: string) => {
    const normalizedPath = path.normalize(targetPath);
    if (!existsSync(normalizedPath)) {
      logInfo("Reveal skipped because file does not exist.", { targetPath, normalizedPath });
      return false;
    }

    shell.showItemInFolder(normalizedPath);
    return true;
  });
  ipcMain.on("log:renderer", (_event, payload: { level?: string; message?: string; details?: string }) => {
    if (payload.level === "error") {
      logError(`Renderer: ${payload.message ?? "Unknown error"}`, payload.details);
      return;
    }

    logInfo(`Renderer: ${payload.message ?? "Unknown message"}`, payload.details);
  });
};

app.setAppUserModelId("com.geertmol.rndpdm");

process.on("uncaughtException", (error) => {
  logError("Uncaught exception in main process.", error);
});

process.on("unhandledRejection", (reason) => {
  logError("Unhandled rejection in main process.", reason);
});

void app.whenReady().then(() => {
  logInfo("Electron app ready.", {
    isPackaged: app.isPackaged,
    userData: app.getPath("userData"),
    rendererDevUrl: rendererDevUrl ?? null
  });
  registerIpcHandlers();
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  logInfo("All windows closed.");
  if (process.platform !== "darwin") {
    app.quit();
  }
});

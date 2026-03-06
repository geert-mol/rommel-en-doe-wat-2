import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getStateDatabasePath, loadState, saveState } from "./db.cjs";
import { writeProjectExportWorkbook } from "./exporter.cjs";
import { getLogFilePath, logError, logInfo } from "./logger.cjs";

const rendererDevUrl = process.env.ELECTRON_RENDERER_URL;

const backupExtensions = ["rndbackup", "json"];

const buildBackupFileName = (): string =>
  `rommel-en-doe-wat-backup-${new Date().toISOString().slice(0, 10)}.rndbackup`;

const resolveWindowIconPath = (): string | undefined => {
  const candidatePaths = app.isPackaged
    ? [path.join(process.resourcesPath, "icon.ico")]
    : [path.join(app.getAppPath(), "build", "icon.ico")];

  return candidatePaths.find((candidatePath) => existsSync(candidatePath));
};

const createMainWindow = (): BrowserWindow => {
  const window = new BrowserWindow({
    width: 1540,
    height: 980,
    minWidth: 1180,
    minHeight: 760,
    backgroundColor: "#f4f2ea",
    autoHideMenuBar: true,
    icon: resolveWindowIconPath(),
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
  ipcMain.handle("backup:save", async (_event, payload) => {
    const backupPayload = payload as {
      content: string;
      suggestedFileName?: string;
    };
    const result = await dialog.showSaveDialog({
      title: "Create app backup",
      defaultPath: backupPayload.suggestedFileName?.trim() || buildBackupFileName(),
      filters: [{ name: "Rommel backup", extensions: backupExtensions }]
    });

    if (result.canceled || !result.filePath) {
      return null;
    }

    await writeFile(result.filePath, backupPayload.content, "utf8");
    logInfo("App backup saved.", { path: result.filePath });
    return result.filePath;
  });
  ipcMain.handle("backup:load", async () => {
    const result = await dialog.showOpenDialog({
      title: "Restore app backup",
      properties: ["openFile"],
      filters: [{ name: "Rommel backup", extensions: backupExtensions }]
    });

    if (result.canceled) {
      return null;
    }

    const filePath = result.filePaths[0];
    if (!filePath) {
      return null;
    }

    const content = await readFile(filePath, "utf8");
    logInfo("App backup loaded.", { path: filePath });
    return { path: filePath, content };
  });
  ipcMain.handle("export:project-excel", async (_event, payload) => {
    const exportPayload = payload as {
      projectCode: string;
      projectName: string;
      generatedAt: string;
      sheets: Array<{ productCode: string; productName: string; rows: unknown[] }>;
    };
    const result = await dialog.showSaveDialog({
      title: "Export project to Excel",
      defaultPath: `${exportPayload.projectCode}-${exportPayload.projectName}.xlsx`,
      filters: [{ name: "Excel workbook", extensions: ["xlsx"] }]
    });

    if (result.canceled || !result.filePath) {
      return null;
    }

    await writeProjectExportWorkbook(
      payload as Parameters<typeof writeProjectExportWorkbook>[0],
      result.filePath
    );
    logInfo("Project Excel export created.", {
      path: result.filePath,
      projectCode: exportPayload.projectCode,
      sheets: exportPayload.sheets.length
    });
    return result.filePath;
  });
  ipcMain.handle("shell:open-path", async (_event, targetPath: string) => {
    const normalizedPath = path.normalize(targetPath.trim());
    if (normalizedPath.length === 0 || !existsSync(normalizedPath)) {
      logInfo("Open skipped because path does not exist.", { targetPath, normalizedPath });
      return `Path not found: ${targetPath}`;
    }

    return shell.openPath(normalizedPath);
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

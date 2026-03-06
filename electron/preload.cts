import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("rndDesktop", {
  storage: {
    load: () => ipcRenderer.invoke("storage:load"),
    save: (state: unknown) => ipcRenderer.invoke("storage:save", state),
    location: () => ipcRenderer.invoke("storage:location")
  },
  shell: {
    openPath: (targetPath: string) => ipcRenderer.invoke("shell:open-path", targetPath),
    revealPath: (targetPath: string) => ipcRenderer.invoke("shell:reveal-path", targetPath)
  },
  dialog: {
    pickDirectory: (initialPath?: string) =>
      ipcRenderer.invoke("dialog:pick-directory", initialPath)
  },
  backup: {
    save: (payload: { content: string; suggestedFileName?: string }) =>
      ipcRenderer.invoke("backup:save", payload),
    load: () => ipcRenderer.invoke("backup:load")
  },
  export: {
    projectExcel: (payload: unknown) => ipcRenderer.invoke("export:project-excel", payload)
  },
  updater: {
    getState: () => ipcRenderer.invoke("updater:get-state"),
    check: () => ipcRenderer.invoke("updater:check"),
    install: () => ipcRenderer.invoke("updater:install"),
    subscribe: (listener: (state: unknown) => void) => {
      const wrappedListener = (_event: Electron.IpcRendererEvent, state: unknown) => {
        listener(state);
      };

      ipcRenderer.on("updater:state-changed", wrappedListener);
      return () => {
        ipcRenderer.removeListener("updater:state-changed", wrappedListener);
      };
    }
  },
  log: {
    location: () => ipcRenderer.invoke("log:location"),
    error: (message: string, details?: string) =>
      ipcRenderer.send("log:renderer", { level: "error", message, details })
  }
});

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
  export: {
    projectExcel: (payload: unknown) => ipcRenderer.invoke("export:project-excel", payload)
  },
  log: {
    location: () => ipcRenderer.invoke("log:location"),
    error: (message: string, details?: string) =>
      ipcRenderer.send("log:renderer", { level: "error", message, details })
  }
});

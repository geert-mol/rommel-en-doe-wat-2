/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface DesktopBridge {
  storage: {
    load: () => Promise<import("./lib/types").AppState>;
    save: (state: import("./lib/types").AppState) => Promise<void>;
    location: () => Promise<string>;
  };
  shell: {
    openPath: (targetPath: string) => Promise<string>;
    revealPath: (targetPath: string) => Promise<boolean>;
  };
  dialog: {
    pickDirectory: (initialPath?: string) => Promise<string | null>;
  };
  backup: {
    save: (payload: {
      content: string;
      suggestedFileName?: string;
    }) => Promise<string | null>;
    load: () => Promise<{ path: string; content: string } | null>;
  };
  export: {
    projectExcel: (
      payload: import("./lib/export").ProjectExportPayload
    ) => Promise<string | null>;
  };
  log: {
    location: () => Promise<string>;
    error: (message: string, details?: string) => void;
  };
}

interface Window {
  rndDesktop?: DesktopBridge;
}

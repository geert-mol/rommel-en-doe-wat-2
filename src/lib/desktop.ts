import { coerceAppState, createInitialAppState, STORAGE_KEY } from "./persistence";
import type { AppState } from "./types";

const getDesktopBridge = () =>
  typeof window !== "undefined" && window.rndDesktop ? window.rndDesktop : null;

export const isDesktopApp = (): boolean => getDesktopBridge() !== null;

export const loadAppState = async (): Promise<AppState> => {
  const bridge = getDesktopBridge();
  if (bridge) {
    return coerceAppState(await bridge.storage.load());
  }

  if (typeof window === "undefined") {
    return createInitialAppState();
  }

  const rawState = window.localStorage.getItem(STORAGE_KEY);
  if (!rawState) return createInitialAppState();

  try {
    return coerceAppState(JSON.parse(rawState));
  } catch {
    return createInitialAppState();
  }
};

export const saveAppState = async (state: AppState): Promise<void> => {
  const bridge = getDesktopBridge();
  if (bridge) {
    await bridge.storage.save(state);
    return;
  }

  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
};

export const pickDirectory = async (initialPath?: string): Promise<string | null> => {
  const bridge = getDesktopBridge();
  if (!bridge) return null;
  return bridge.dialog.pickDirectory(initialPath);
};

export const openFilePath = async (targetPath: string): Promise<boolean> => {
  const bridge = getDesktopBridge();
  if (!bridge) {
    await navigator.clipboard.writeText(targetPath);
    return false;
  }

  const result = await bridge.shell.openPath(targetPath);
  return result.length === 0;
};

export const revealFilePath = async (targetPath: string): Promise<boolean> => {
  const bridge = getDesktopBridge();
  if (!bridge) {
    await navigator.clipboard.writeText(targetPath);
    return false;
  }

  return bridge.shell.revealPath(targetPath);
};

export const getStorageLocation = async (): Promise<string | null> => {
  const bridge = getDesktopBridge();
  if (!bridge) return null;
  return bridge.storage.location();
};

import { buildBackupFileName, parseAppBackup, serializeAppBackup } from "./backup";
import type { AppState } from "./types";

const getDesktopBridge = () =>
  typeof window !== "undefined" && window.rndDesktop ? window.rndDesktop : null;

export const exportDesktopBackup = async (state: AppState): Promise<string | null> => {
  const bridge = getDesktopBridge();
  if (!bridge) return null;

  return bridge.backup.save({
    content: serializeAppBackup(state),
    suggestedFileName: buildBackupFileName()
  });
};

export const restoreDesktopBackup = async (): Promise<{ path: string; state: AppState } | null> => {
  const bridge = getDesktopBridge();
  if (!bridge) return null;

  const loaded = await bridge.backup.load();
  if (!loaded) return null;

  return {
    path: loaded.path,
    state: parseAppBackup(loaded.content)
  };
};

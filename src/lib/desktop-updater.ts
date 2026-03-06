export type DesktopUpdateStatus =
  | "unsupported"
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "downloaded"
  | "no-update"
  | "error";

export interface DesktopUpdateState {
  status: DesktopUpdateStatus;
  currentVersion: string;
  availableVersion?: string;
  downloadedVersion?: string;
  progressPercent?: number;
  transferredBytes?: number;
  totalBytes?: number;
  message?: string;
  checkedAt?: string;
}

const getDesktopBridge = () =>
  typeof window !== "undefined" && window.rndDesktop ? window.rndDesktop : null;

export const getDesktopUpdateState = async (): Promise<DesktopUpdateState | null> => {
  const bridge = getDesktopBridge();
  if (!bridge) return null;
  return bridge.updater.getState();
};

export const checkForDesktopUpdates = async (): Promise<DesktopUpdateState | null> => {
  const bridge = getDesktopBridge();
  if (!bridge) return null;
  return bridge.updater.check();
};

export const installDesktopUpdate = async (): Promise<void> => {
  const bridge = getDesktopBridge();
  if (!bridge) return;
  await bridge.updater.install();
};

export const subscribeToDesktopUpdates = (
  listener: (state: DesktopUpdateState) => void
): (() => void) => {
  const bridge = getDesktopBridge();
  if (!bridge) return () => undefined;
  return bridge.updater.subscribe(listener);
};

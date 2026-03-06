import type { ProjectExportPayload } from "./export";

const getDesktopBridge = () =>
  typeof window !== "undefined" && window.rndDesktop ? window.rndDesktop : null;

export const exportProjectExcel = async (
  payload: ProjectExportPayload
): Promise<string | null> => {
  const bridge = getDesktopBridge();
  if (!bridge) return null;
  return bridge.export.projectExcel(payload);
};

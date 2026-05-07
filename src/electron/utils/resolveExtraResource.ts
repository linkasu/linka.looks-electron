import { app } from "electron";
import { join } from "path";

export function resolveExtraResource (...segments: string[]): string {
  const basePath = app.isPackaged
    ? join(process.resourcesPath, "extraResources")
    : join(__dirname, "..", "extraResources");

  return join(basePath, ...segments);
}

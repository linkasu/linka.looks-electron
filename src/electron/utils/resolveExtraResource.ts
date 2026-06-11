import { app } from "electron";
import { join } from "path";

export function resolveExtraResource (...segments: string[]): string {
  if (!app.isPackaged) {
    const [first, second, ...rest] = segments;
    const projectRoot = join(__dirname, "..");

    if (first === "bin" && second === "tobiifree-helper") {
      return join(projectRoot, "node_modules", "@linkasu", "tobii-electron", "tools", "tobiifree-helper", ...rest);
    }

    if (first === "bin" && second === "tobiifree-sdk") {
      return join(projectRoot, "node_modules", "@linkasu", "tobii-electron", "tools", "tobiifree-sdk", ...rest);
    }
  }

  const basePath = app.isPackaged
    ? join(process.resourcesPath, "extraResources")
    : join(__dirname, "..", "extraResources");

  return join(basePath, ...segments);
}

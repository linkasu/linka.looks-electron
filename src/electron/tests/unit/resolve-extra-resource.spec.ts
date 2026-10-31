import { describe, expect, it, vi } from "vitest";
import { join } from "node:path";
import { resolveExtraResource } from "../../utils/resolveExtraResource";

const { app } = vi.hoisted(() => ({ app: { isPackaged: false } }));
vi.mock("electron", () => ({ app }));

describe("extra resource resolution", () => {
  it("uses the installed Windows hardware resources in development", () => {
    for (const file of ["EyeLog.exe", "Tobii.EyeX.Client.dll", "EyeLog.exe.config"]) {
      expect(
        resolveExtraResource("bin", file).endsWith(
          join("node_modules", "@linkasu", "tobii-electron", "extraResources", "bin", file)
        )
      ).toBe(true);
    }
    expect(resolveExtraResource("defaultSets")).toMatch(/extraResources[/\\]defaultSets$/);
    expect(resolveExtraResource("bin", "tobiifree-helper", "helper.js")).toContain(
      join("tobii-electron", "tools", "tobiifree-helper", "helper.js")
    );
  });

  it("keeps packaged resources in process.resourcesPath", () => {
    app.isPackaged = true;
    vi.stubGlobal("process", { ...process, resourcesPath: "/packaged/resources" });
    try {
      expect(resolveExtraResource("bin", "EyeLog.exe")).toBe(
        join("/packaged/resources", "extraResources", "bin", "EyeLog.exe")
      );
    } finally {
      app.isPackaged = false;
      vi.unstubAllGlobals();
    }
  });
});

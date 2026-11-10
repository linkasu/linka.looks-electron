import type { ElectronApplication } from "@playwright/test";
import { afterEach, expect, it, vi } from "vitest";
import { withTestBubbleCleanup } from "../../../../tests/e2e/helpers";

vi.mock("../../bubble/controlChannel", () => ({
  connectBubbleControl: async () => {
    throw Object.assign(new Error("no agent"), { code: "ENOENT" });
  }
}));
afterEach(() => {
  vi.unstubAllGlobals();
});

it("closes a fixture repeatedly without consulting disposed Playwright process metadata", async () => {
  vi.stubGlobal("process", { ...process, platform: "win32" });
  const child = { exitCode: 0, signalCode: null };
  const nativeClose = vi.fn(async () => {});
  const application = {
    evaluate: vi.fn(async () => "/fixture/app"),
    process: vi.fn(() => child),
    close: nativeClose,
    windows: vi.fn(() => [])
  };
  const wrapped = await withTestBubbleCleanup(application as unknown as ElectronApplication, {
    root: "/fixture",
    userDataDir: "/fixture/profile",
    homeDir: "/fixture/home"
  });
  await wrapped.close();
  application.process.mockImplementation(() => {
    throw new Error("disposed _object");
  });
  await expect(wrapped.close()).resolves.toBeUndefined();
  expect(application.process).toHaveBeenCalledTimes(1);
  expect(nativeClose).toHaveBeenCalledTimes(2);
});

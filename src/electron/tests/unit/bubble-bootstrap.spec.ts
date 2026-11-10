import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  app: {
    getPath: vi.fn(() => "/test/profile"),
    setPath: vi.fn(),
    requestSingleInstanceLock: vi.fn(() => true),
    quit: vi.fn(),
    exit: vi.fn()
  },
  read: vi.fn(),
  start: vi.fn(async () => {})
}));
vi.mock("electron", () => ({ app: mocks.app, protocol: { registerSchemesAsPrivileged: vi.fn() } }));
vi.mock("node:fs", () => ({ mkdirSync: vi.fn(), readFileSync: mocks.read }));
vi.mock("../../bubble/client", () => ({
  bubbleInstallationId: () => "installation",
  prepareBubbleUpdate: vi.fn()
}));
vi.mock("../../bubble/agent", () => ({ startBubbleAgent: mocks.start }));
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubGlobal("process", {
    ...process,
    platform: "win32",
    argv: ["electron", "--bubble-resume"],
    env: { ...process.env, IS_TEST: "", PRINT_APP_VERSION: "" }
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("Bubble update resume", () => {
  it.each([null, { installationId: "installation", createdAt: Date.now() - 7200000 }])(
    "does not compete for the agent lock without a current resume ticket: %j",
    async (ticket) => {
      mocks.read.mockImplementation(() => {
        if (!ticket) throw new Error("missing");
        return JSON.stringify(ticket);
      });
      await import("../../main");
      await vi.waitFor(() => expect(mocks.app.quit).toHaveBeenCalled());
      expect(mocks.app.requestSingleInstanceLock).not.toHaveBeenCalled();
      expect(mocks.start).not.toHaveBeenCalled();
    }
  );
  it("acquires the lock and starts only after validating the installation ticket", async () => {
    mocks.read.mockReturnValue(
      JSON.stringify({ installationId: "installation", createdAt: Date.now() })
    );
    await import("../../main");
    await vi.waitFor(() => expect(mocks.start).toHaveBeenCalledTimes(1));
    expect(mocks.app.requestSingleInstanceLock).toHaveBeenCalledTimes(1);
  });
});

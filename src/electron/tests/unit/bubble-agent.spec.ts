import type { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startBubbleAgent } from "../../bubble/agent";
import type { BubbleController } from "../../bubble/controller";

const mocks = vi.hoisted(() => ({
  app: {} as EventEmitter & { quit: ReturnType<typeof vi.fn> },
  serve: vi.fn(),
  save: vi.fn(),
  close: vi.fn(),
  controller: undefined as BubbleController | undefined,
  sources: [] as { request: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }[]
}));

vi.mock("electron", async () => {
  const { EventEmitter } = await import("node:events");
  const app = Object.assign(new EventEmitter(), {
    whenReady: async () => {},
    getPath: () => "/test/bubble",
    getAppPath: () => "/test/looks",
    isPackaged: false,
    getVersion: () => "1.0.0",
    quit: vi.fn()
  });
  mocks.app = app;
  return {
    app,
    screen: { getPrimaryDisplay: () => ({ bounds: { width: 1920, height: 1080 } }) },
    nativeImage: { createFromPath: () => ({ isEmpty: () => false }) },
    Menu: { buildFromTemplate: (items: unknown) => items },
    Tray: class {
      setToolTip = vi.fn();
      on = vi.fn();
      setContextMenu = vi.fn();
      displayBalloon = vi.fn();
      destroy = vi.fn();
    }
  };
});
vi.mock("node:fs/promises", () => ({
  access: async () => {},
  writeFile: async () => {},
  unlink: async () => {}
}));
vi.mock("../../bubble/client", () => ({
  bubbleInstallationId: () => "installation",
  openBubbleSettings: vi.fn()
}));
vi.mock("../../bubble/preferences", () => ({
  BubblePreferencesStore: class {
    load = async () => ({ enabled: true, diameter: 44, brightness: 65, smoothness: 40 });
    save = mocks.save;
  }
}));
vi.mock("../../bubble/controlChannel", () => ({
  assertPrivateBubbleDirectory: async () => {},
  serveBubbleControl: mocks.serve
}));
vi.mock("../../bubble/overlayWindow", async () => {
  const { EventEmitter } = await import("node:events");
  return {
    createBubbleOverlay: async () => ({
      webContents: new EventEmitter(),
      hide: vi.fn(),
      isDestroyed: () => false,
      destroy: vi.fn(),
      isVisible: () => false,
      showInactive: vi.fn()
    })
  };
});
vi.mock("../../bubble/trackerProcess", () => ({
  BubbleTrackerProcess: class {
    constructor() {
      mocks.sources.push(this);
    }
    request = vi.fn(async () => ({ protocol: 1, status: "connecting", errorCode: null }));
    stop = vi.fn(async () => {});
  }
}));

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mocks.sources.length = 0;
  mocks.app.removeAllListeners();
  mocks.serve.mockImplementation(async (_directory, _installation, controller) => {
    mocks.controller = controller;
    return mocks.close;
  });
});
afterEach(async () => {
  mocks.app.emit("before-quit", { preventDefault: vi.fn() });
  await vi.waitFor(() => expect(mocks.app.quit).toHaveBeenCalled());
  mocks.app.removeAllListeners();
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("Bubble agent shutdown", () => {
  it("guards quit before the control endpoint is ready and waits for its owned backend", async () => {
    let ready!: (close: () => Promise<void>) => void;
    mocks.serve.mockImplementation(
      () =>
        new Promise((resolve) => {
          ready = resolve;
        })
    );
    const startup = startBubbleAgent();
    await vi.waitFor(() => expect(mocks.serve).toHaveBeenCalled());
    let stopped!: () => void;
    mocks.sources[0].stop.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          stopped = resolve;
        })
    );
    const event = { preventDefault: vi.fn() };
    mocks.app.emit("before-quit", event);
    await vi.waitFor(() => expect(mocks.sources[0].stop).toHaveBeenCalled());
    expect(event.preventDefault).toHaveBeenCalled();
    expect(mocks.app.quit).not.toHaveBeenCalled();
    stopped();
    await vi.waitFor(() => expect(mocks.app.quit).toHaveBeenCalled());
    ready(mocks.close);
    await startup;
    expect(mocks.close).toHaveBeenCalledTimes(1);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("retains a backend handle after failed stop and never starts a replacement before exit", async () => {
    await startBubbleAgent();
    await vi.waitFor(() => expect(mocks.sources).toHaveLength(1));
    const first = mocks.sources[0];
    first.stop.mockRejectedValueOnce(new Error("timeout"));
    await mocks.controller!.change({ ...mocks.controller!.snapshot(), patch: { enabled: false } });
    await vi.waitFor(() =>
      expect(mocks.controller!.snapshot().errorCode).toBe("BACKEND_STOP_TIMEOUT")
    );
    let stopped!: () => void;
    first.stop.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          stopped = resolve;
        })
    );
    await mocks.controller!.change({ ...mocks.controller!.snapshot(), patch: { enabled: true } });
    await vi.waitFor(() => expect(first.stop).toHaveBeenCalledTimes(2));
    expect(mocks.sources).toHaveLength(1);
    stopped();
    await vi.waitFor(() => expect(mocks.sources).toHaveLength(2));
  });
});

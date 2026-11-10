import { EventEmitter } from "node:events";
import type { BrowserWindow } from "electron";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BubbleClient, registerBubbleClient } from "../../bubble/client";

const ipc = vi.hoisted(() => ({ handle: vi.fn(), removeHandler: vi.fn() }));
vi.mock("electron", () => ({ app: { getPath: () => "/test/profile" }, ipcMain: ipc }));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("Bubble renderer authorization", () => {
  it("normalizes a dev-server URL without admitting a foreign sender or frame", async () => {
    vi.stubGlobal("process", { ...process, platform: "win32" });
    vi.spyOn(BubbleClient.prototype, "connect").mockResolvedValue();
    const getState = vi.spyOn(BubbleClient.prototype, "getState").mockResolvedValue({ ok: true });
    const frame = { url: "http://127.0.0.1:5174/#/settings" };
    const owner = Object.assign(new EventEmitter(), {
      isDestroyed: () => false,
      webContents: { mainFrame: frame, send: vi.fn() }
    });
    registerBubbleClient(owner as unknown as BrowserWindow, "http://127.0.0.1:5174");
    const read = ipc.handle.mock.calls.find(([channel]) => channel === "bubble:getState")![1];
    const valid = { sender: owner.webContents, senderFrame: frame };
    expect(await read(valid)).toEqual({ ok: true });
    expect(getState).toHaveBeenCalledTimes(1);
    expect(await read({ ...valid, sender: {} })).toEqual({ ok: false, code: "UNAUTHORIZED" });
    expect(await read({ ...valid, senderFrame: { ...frame } })).toEqual({
      ok: false,
      code: "UNAUTHORIZED"
    });
    frame.url = "https://example.invalid/#/settings";
    expect(await read(valid)).toEqual({ ok: false, code: "UNAUTHORIZED" });
    owner.emit("closed");
  });
});

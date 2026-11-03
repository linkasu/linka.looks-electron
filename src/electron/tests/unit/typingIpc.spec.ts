import { afterEach, describe, expect, it, vi } from "vitest";
import { app, BrowserWindow, ipcMain } from "electron";
import { registerTypingIpc } from "../../typingIpc";
import { TypingSession } from "../../services/typingSession";

vi.mock("electron", async () => {
  const { EventEmitter } = await import("node:events");
  return {
    app: Object.assign(new EventEmitter(), { isPackaged: false, quit: vi.fn() }),
    BrowserWindow: class extends EventEmitter {
      webContents = Object.assign(new EventEmitter(), {
        mainFrame: { url: "file:///app/index.html#/eye-typing" }
      });
      isDestroyed = () => false;
    },
    ipcMain: Object.assign(new EventEmitter(), {
      handle: vi.fn(),
      removeHandler: vi.fn()
    })
  };
});

const owners: BrowserWindow[] = [];
afterEach(() => {
  owners.splice(0).forEach((owner) => owner.emit("closed"));
  app.removeAllListeners();
  ipcMain.removeAllListeners();
});

function setup() {
  const owner = new BrowserWindow();
  owners.push(owner);
  registerTypingIpc(owner, "file:///app/index.html");
  const event = { sender: owner.webContents, senderFrame: owner.webContents.mainFrame };
  const invoke = (channel: string, ...args: unknown[]) => {
    const handler = vi.mocked(ipcMain.handle).mock.calls.find(([name]) => name === channel)?.[1];
    if (!handler) throw new Error(`Missing handler: ${channel}`);
    return Reflect.apply(handler, undefined, [event, ...args]);
  };
  return { owner, event, invoke };
}

describe("typing IPC in the main window", () => {
  it("accepts the owner main frame and rejects foreign windows, subframes and URLs", async () => {
    const { owner, event, invoke } = setup();
    const input = { text: "hello", caret: 5, language: "en" };
    expect(await invoke("typing:predict", 1, input)).toEqual({ ok: true, value: [] });
    const predict = vi
      .mocked(ipcMain.handle)
      .mock.calls.find(([name]) => name === "typing:predict")![1];
    for (const invalid of [
      { ...event, sender: new BrowserWindow().webContents },
      { ...event, senderFrame: { url: event.senderFrame.url } }
    ]) {
      expect(await Reflect.apply(predict, undefined, [invalid, 2, input])).toEqual({
        ok: false,
        code: "UNAUTHORIZED"
      });
    }
    Object.defineProperty(owner.webContents.mainFrame, "url", {
      value: "https://untrusted.example/#/eye-typing"
    });
    expect(await invoke("typing:predict", 2, input)).toEqual({ ok: false, code: "UNAUTHORIZED" });
  });

  it("disposes on leave, waits before reopening and drops cancelled queued work", async () => {
    const { event, invoke } = setup();
    const input = { text: "hello", caret: 5, language: "en" };
    expect(await invoke("typing:predict", 1, input)).toEqual({ ok: true, value: [] });
    let finish!: () => void;
    const disposal = new Promise<void>((resolve) => (finish = resolve));
    const dispose = vi.spyOn(TypingSession.prototype, "dispose").mockReturnValueOnce(disposal);
    const predict = vi.spyOn(TypingSession.prototype, "predict");
    const closing = invoke("typing:release");
    const cancelled = invoke("typing:predict", 2, input);
    ipcMain.emit("typing:cancel", event, 2);
    await Promise.resolve();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(predict).not.toHaveBeenCalled();
    finish();
    await closing;
    expect(await cancelled).toEqual({ ok: false, code: "CANCELLED" });
    expect(await invoke("typing:predict", 3, input)).toEqual({ ok: true, value: [] });
    expect(await invoke("typing:predict", 3, input)).toEqual({
      ok: false,
      code: "INVALID_REQUEST"
    });
  });

  it("rejects invalid inputs and can predict again after leaving and reentering", async () => {
    const { invoke } = setup();
    expect(await invoke("typing:predict", 0, {})).toEqual({ ok: false, code: "INVALID_REQUEST" });
    expect(await invoke("typing:predict", 1, { text: "🙂", caret: 1, language: "ru" })).toEqual({
      ok: false,
      code: "INVALID_INPUT"
    });
    await invoke("typing:release");
    expect(await invoke("typing:predict", 2, { text: "hi", caret: 2, language: "en" })).toEqual({
      ok: true,
      value: []
    });
  });

  it("does not start a request queued before route leave or renderer reload", async () => {
    const { owner, invoke } = setup();
    const predict = vi.spyOn(TypingSession.prototype, "predict");
    const input = { text: "hello", caret: 5, language: "en" };
    const leaving = invoke("typing:predict", 1, input);
    await invoke("typing:release");
    expect(await leaving).toEqual({ ok: false, code: "CANCELLED" });
    expect(predict).not.toHaveBeenCalled();
    const reloading = invoke("typing:predict", 2, input);
    owner.webContents.emit("did-start-navigation", {}, "file:///app/index.html", false, true);
    expect(await reloading).toEqual({ ok: false, code: "CANCELLED" });
    expect(predict).not.toHaveBeenCalled();
    expect(await invoke("typing:predict", 1, input)).toEqual({ ok: true, value: [] });
  });

  it("waits for owned cleanup before quitting and never starts queued work afterward", async () => {
    const { invoke } = setup();
    const input = { text: "hello", caret: 5, language: "en" };
    await invoke("typing:predict", 1, input);
    let finish!: () => void;
    vi.spyOn(TypingSession.prototype, "dispose").mockReturnValueOnce(
      new Promise<void>((resolve) => (finish = resolve))
    );
    const event = { preventDefault: vi.fn() };
    app.emit("before-quit", event);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(app.quit).not.toHaveBeenCalled();
    const queued = invoke("typing:predict", 2, input);
    finish();
    expect(await queued).toEqual({ ok: false, code: "CANCELLED" });
    expect(app.quit).toHaveBeenCalledOnce();
  });
});

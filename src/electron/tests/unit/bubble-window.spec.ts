import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { createBubbleOverlay } from "../../bubble/overlayWindow";

const mocks = vi.hoisted(() => ({
  options: {} as Record<string, unknown>,
  handle: vi.fn(),
  remove: vi.fn()
}));
vi.mock("electron", async () => {
  const { EventEmitter } = await import("node:events");
  return {
    screen: Object.assign(new EventEmitter(), {
      getPrimaryDisplay: () => ({ bounds: { x: 0, y: 0, width: 1920, height: 1080 } })
    }),
    ipcMain: { handle: mocks.handle, removeHandler: mocks.remove },
    BrowserWindow: class extends EventEmitter {
      constructor(options: Record<string, unknown>) {
        super();
        mocks.options = options;
      }
      webContents = Object.assign(new EventEmitter(), {
        mainFrame: { url: "" },
        setWindowOpenHandler: vi.fn()
      });
      setIgnoreMouseEvents = vi.fn();
      setMenu = vi.fn();
      hide = vi.fn();
      setBounds = vi.fn();
      isDestroyed = () => false;
      loadURL = vi.fn(async (url: string) => {
        this.webContents.mainFrame.url = url;
      });
    }
  };
});

describe("Bubble window safety", () => {
  it("is click-through, non-activating and sandboxed, rejecting foreign frame reads", async () => {
    const frame = vi.fn(async () => null);
    const window = await createBubbleOverlay(frame, vi.fn());
    expect(mocks.options).toMatchObject({
      transparent: true,
      focusable: false,
      frame: false,
      skipTaskbar: true,
      webPreferences: { sandbox: true, nodeIntegration: false, contextIsolation: true }
    });
    expect(window.setIgnoreMouseEvents).toHaveBeenCalledWith(true);
    const handler = mocks.handle.mock.calls.at(-1)![1];
    expect(await handler({ sender: {}, senderFrame: {} })).toBeNull();
    expect(frame).not.toHaveBeenCalled();
    await handler({ sender: window.webContents, senderFrame: window.webContents.mainFrame });
    expect(frame).toHaveBeenCalledTimes(1);
    (window as unknown as EventEmitter).emit("closed");
    expect(mocks.remove).toHaveBeenCalledWith("bubble:frame");
  });
});

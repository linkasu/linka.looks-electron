import { createImageFromText } from "@/electron/utils/ImageFromText";

const mocks = vi.hoisted(() => ({
  ready: vi.fn(),
  loadURL: vi.fn(),
  executeJavaScript: vi.fn(),
  destroy: vi.fn(),
  options: vi.fn()
}));

vi.mock("electron", () => ({
  app: { whenReady: mocks.ready },
  BrowserWindow: class {
    constructor(options: unknown) {
      mocks.options(options);
    }
    loadURL = mocks.loadURL;
    webContents = { executeJavaScript: mocks.executeJavaScript };
    destroy = mocks.destroy;
  }
}));

describe("image from text", () => {
  beforeEach(() => {
    mocks.loadURL.mockResolvedValue(undefined);
    mocks.executeJavaScript.mockResolvedValue("data:image/png;base64,aW1hZ2U=");
  });

  it("uses the sandboxed Canvas path with a square default for older callers", async () => {
    expect(await createImageFromText("Привет")).toEqual(Buffer.from("image"));
    expect(mocks.options).toHaveBeenCalledWith({
      width: 1024,
      height: 1024,
      show: false,
      webPreferences: {
        offscreen: true,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true
      }
    });
    expect(mocks.destroy).toHaveBeenCalledOnce();
  });

  it("preserves the aspect ratio of three merged cells", async () => {
    await createImageFromText("Хочу пить", { width: 900, height: 300 });
    expect(mocks.options.mock.calls[0][0]).toMatchObject({ width: 1024, height: 341 });
  });

  it.each(["", " \r\n\t ", "я".repeat(10001)])("rejects empty or excessive text", async (text) => {
    await expect(createImageFromText(text)).rejects.toThrow();
    expect(mocks.options).not.toHaveBeenCalled();
  });

  it.each([
    { width: 0, height: 20 },
    { width: -1, height: 20 },
    { width: NaN, height: 20 },
    { width: 20, height: Infinity }
  ])("rejects invalid image dimensions", async (size) => {
    await expect(createImageFromText("Привет", size)).rejects.toThrow("размер");
    expect(mocks.options).not.toHaveBeenCalled();
  });

  it("destroys the hidden window when loading fails", async () => {
    mocks.loadURL.mockRejectedValueOnce(new Error("load failed"));
    await expect(createImageFromText("Привет")).rejects.toThrow("load failed");
    expect(mocks.destroy).toHaveBeenCalledOnce();
  });

  it("destroys the hidden window when rendering fails", async () => {
    mocks.executeJavaScript.mockRejectedValueOnce(new Error("render failed"));
    await expect(createImageFromText("Привет")).rejects.toThrow("render failed");
    expect(mocks.destroy).toHaveBeenCalledOnce();
  });

  it("rejects invalid PNG output and destroys the hidden window", async () => {
    mocks.executeJavaScript.mockResolvedValueOnce("not a PNG");
    await expect(createImageFromText("Привет")).rejects.toThrow("PNG");
    expect(mocks.destroy).toHaveBeenCalledOnce();
  });
});

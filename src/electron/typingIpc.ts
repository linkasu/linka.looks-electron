import {
  app,
  ipcMain,
  type BrowserWindow,
  type IpcMainEvent,
  type IpcMainInvokeEvent
} from "electron";
import { join } from "node:path";
import { Predictor, PredictorError } from "../../vendor/predictor/packages/electron/src/index";
import { TypingSession } from "./services/typingSession";
import type { TypingInput } from "../common/typing";

export function registerTypingIpc(owner: BrowserWindow, rendererUrl: string) {
  const url = new URL(rendererUrl);
  url.hash = "";
  let session: TypingSession | undefined;
  let cleanup = Promise.resolve();
  let cleaning = false;
  let stopping = false;
  let generation = 0;
  let latest = 0;
  let pending: { id: number; cancelled: boolean } | undefined;

  function authorized(event: IpcMainEvent | IpcMainInvokeEvent) {
    return (
      !owner.isDestroyed() &&
      event.sender === owner.webContents &&
      event.senderFrame === owner.webContents.mainFrame &&
      event.senderFrame.url.split("#")[0] === url.href
    );
  }

  function release() {
    ++generation;
    latest = 0;
    const closing = session;
    session = undefined;
    if (closing) {
      cleaning = true;
      cleanup = closing.dispose().finally(() => {
        cleaning = false;
        if (owner.isDestroyed()) app.removeListener("before-quit", beforeQuit);
      });
    }
    return cleanup;
  }

  function beforeQuit(event: Electron.Event) {
    if (!session && !cleaning) return;
    event.preventDefault();
    stopping = true;
    app.removeListener("before-quit", beforeQuit);
    void release().finally(() => app.quit());
  }
  app.on("before-quit", beforeQuit);

  ipcMain.handle("typing:predict", async (event, id: unknown, input: TypingInput) => {
    if (!authorized(event)) return { ok: false, code: "UNAUTHORIZED" };
    if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= latest)
      return { ok: false, code: "INVALID_REQUEST" };
    latest = id;
    const request = { id, cancelled: false };
    pending = request;
    const revision = generation;
    const cancelled = () =>
      pending !== request ||
      request.cancelled ||
      revision !== generation ||
      stopping ||
      owner.isDestroyed();
    try {
      await cleanup;
      if (cancelled()) return { ok: false, code: "CANCELLED" };
      if (!session) {
        const root = app.isPackaged ? process.resourcesPath : join(__dirname, "..");
        session = new TypingSession(
          new Predictor({
            executablePath: join(
              root,
              "predictor-resources",
              process.platform === "win32" ? "lp-electron.exe" : "lp-electron"
            ),
            modelPath: join(root, "predictor-resources", "model.lpk")
          })
        );
      }
      const value = await session.predict(id, input);
      return cancelled() ? { ok: false, code: "CANCELLED" } : { ok: true, value };
    } catch (error) {
      return { ok: false, code: error instanceof PredictorError ? error.code : "INVALID_REQUEST" };
    } finally {
      if (pending === request) pending = undefined;
    }
  });
  ipcMain.on("typing:cancel", (event, id: unknown) => {
    if (!authorized(event) || typeof id !== "number" || !Number.isSafeInteger(id)) return;
    if (pending?.id === id) pending.cancelled = true;
    session?.cancel(id);
  });
  ipcMain.handle("typing:release", async (event) => {
    if (!authorized(event)) return { ok: false, code: "UNAUTHORIZED" };
    await release();
    return { ok: true };
  });
  owner.webContents.on("did-start-navigation", (_event, _url, inPlace, mainFrame) => {
    if (mainFrame && !inPlace) void release();
  });
  owner.webContents.on("render-process-gone", () => void release());
  owner.on("closed", () => {
    stopping = true;
    void release();
    if (!cleaning) app.removeListener("before-quit", beforeQuit);
    ipcMain.removeHandler("typing:predict");
    ipcMain.removeHandler("typing:release");
    ipcMain.removeAllListeners("typing:cancel");
  });
}

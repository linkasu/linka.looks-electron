import { app, BrowserWindow, ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from "electron";
import Store from "electron-store";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { BackWatch } from "@linkasu/tobii-electron/main";
import { Predictor, PredictorError } from "../../vendor/predictor/packages/electron/src/index";
import { TypingSession } from "./services/typingSession";
import type { TypingInput } from "../common/typing";
import { normalizeTypingLayout } from "../common/typingLayout";

export function registerTypingWindow(owner: BrowserWindow, tracker: BackWatch) {
  let window: BrowserWindow | undefined;
  let session: TypingSession | undefined;
  let cleanup = Promise.resolve();
  let disposing = false;
  const store = new Store();
  const url = pathToFileURL(join(__dirname, "../dist/typing.html")).href;
  let speechId = 0;
  let speech:
    | { id: number; resolve: (ok: boolean) => void; timer: ReturnType<typeof setTimeout> }
    | undefined;
  function authorized(event: IpcMainEvent | IpcMainInvokeEvent, target = window) {
    return (
      !!target &&
      !target.isDestroyed() &&
      event.sender === target.webContents &&
      event.senderFrame === target.webContents.mainFrame &&
      (target === owner || event.senderFrame.url === url)
    );
  }
  function stopSpeech() {
    owner.webContents.send("typing:speech", ++speechId, null);
    if (speech) {
      clearTimeout(speech.timer);
      speech.resolve(false);
      speech = undefined;
    }
  }
  function disposeSession() {
    const closing = session;
    session = undefined;
    if (closing) {
      disposing = true;
      cleanup = closing.dispose().finally(() => {
        disposing = false;
        if (owner.isDestroyed()) app.removeListener("before-quit", beforeQuit);
      });
    }
    return cleanup;
  }
  function beforeQuit(event: Electron.Event) {
    if (!session && !disposing) return;
    event.preventDefault();
    app.removeListener("before-quit", beforeQuit);
    void disposeSession().finally(() => app.quit());
  }
  app.on("before-quit", beforeQuit);
  ipcMain.handle("typing:speech-result", (event, id: unknown, ok: unknown) => {
    if (!authorized(event, owner) || !speech || id !== speech.id || typeof ok !== "boolean") return;
    clearTimeout(speech.timer);
    speech.resolve(ok);
    speech = undefined;
  });
  ipcMain.handle("typing:open", async (event) => {
    if (!authorized(event, owner)) throw new Error("UNAUTHORIZED");
    await cleanup;
    if (owner.isDestroyed()) throw new Error("DISPOSED");
    if (window) {
      window.show();
      window.focus();
      return;
    }
    const resourceRoot = app.isPackaged ? process.resourcesPath : join(__dirname, "..");
    session = new TypingSession(
      new Predictor({
        executablePath: join(
          resourceRoot,
          "predictor-resources",
          process.platform === "win32" ? "lp-electron.exe" : "lp-electron"
        ),
        modelPath: join(resourceRoot, "predictor-resources", "model.lpk")
      })
    );
    const typingWindow = new BrowserWindow({
      width: 1024,
      height: 768,
      minWidth: 800,
      minHeight: 600,
      show: false,
      webPreferences: {
        preload: join(__dirname, "typingPreload.js"),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        partition: "typing-145"
      }
    });
    window = typingWindow;
    owner.webContents.send("typing:active", true);
    tracker.window = typingWindow;
    tracker.data = undefined;
    typingWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    typingWindow.webContents.session.setPermissionRequestHandler(
      (_contents, _permission, callback) => callback(false)
    );
    typingWindow.webContents.session.setPermissionCheckHandler(() => false);
    typingWindow.webContents.once("render-process-gone", () => typingWindow.destroy());
    typingWindow.webContents.on("will-navigate", (navigation) => navigation.preventDefault());
    typingWindow.webContents.on("will-attach-webview", (attachment) => attachment.preventDefault());
    const refreshGeometry = () => {
      if (tracker.window === typingWindow && tracker.data)
        ipcMain.emit("eye-elements", undefined, tracker.data);
    };
    typingWindow.on("move", refreshGeometry);
    typingWindow.on("resize", refreshGeometry);
    typingWindow.on("closed", () => {
      window = undefined;
      void disposeSession();
      if (!owner.isDestroyed()) {
        stopSpeech();
        tracker.window = owner;
        tracker.data = undefined;
        owner.webContents.send("typing:active", false);
        owner.show();
        owner.focus();
      }
    });
    try {
      await typingWindow.loadURL(url);
      if (typingWindow.isDestroyed()) return;
      // BackWatch exposes its target window; keep one tracker and its calibration.
      owner.hide();
      typingWindow.show();
      typingWindow.focus();
      typingWindow.webContents.send("eye-exit", { id: "" });
    } catch {
      typingWindow.destroy();
      throw new Error("TYPING_LOAD_FAILED");
    }
  });
  ipcMain.on("typing:sync", (event, operation: unknown, value: unknown) => {
    let response: { ok: boolean; value?: unknown } = { ok: false };
    try {
      if (!authorized(event)) return;
      if (operation === "load") response = { ok: true, value: store.get("eyeTypingDraftV1") };
      else if (operation === "save") {
        if (
          !value ||
          typeof value !== "object" ||
          !("text" in value) ||
          typeof value.text !== "string" ||
          value.text.length > 1024 * 1024 ||
          !("caret" in value) ||
          typeof value.caret !== "number" ||
          !Number.isSafeInteger(value.caret) ||
          value.caret < 0 ||
          value.caret > Array.from(value.text).length
        )
          return;
        session?.cancel();
        store.set("eyeTypingDraftV1", { text: value.text, caret: value.caret });
        response = { ok: true };
      } else if (operation === "settings") {
        const defaults = {
          timeout: 1000,
          dwellIndicator: "inward",
          enabled: true,
          eyeSelect: true,
          eyeActivation: true,
          joystickActivation: true,
          keyboardActivation: true,
          borders: 1,
          clickSound: true,
          animation: true
        };
        const button = Object.fromEntries(
          Object.entries(defaults).map(([key, fallback]) => {
            const stored = store.get(`button_${key}`);
            return [
              key,
              key === "enabled" ? true : typeof stored === typeof fallback ? stored : fallback
            ];
          })
        );
        const keyMapping = Object.fromEntries(
          Object.entries({
            up: ["ArrowUp"],
            down: ["ArrowDown"],
            left: ["ArrowLeft"],
            right: ["ArrowRight"],
            enter: ["Enter"]
          }).map(([key, fallback]) => {
            const stored = store.get(`keyMapping_${key}`);
            return [
              key,
              Array.isArray(stored) && stored.every((item) => typeof item === "string")
                ? stored
                : fallback
            ];
          })
        );
        response = {
          ok: true,
          value: {
            button,
            keyMapping,
            typingLayout: normalizeTypingLayout(store.get("typingLayout"))
          }
        };
      }
    } catch {
      response = { ok: false };
    } finally {
      event.returnValue = response;
    }
  });
  ipcMain.handle("typing:predict", async (event, id: number, input: TypingInput) => {
    if (!authorized(event) || !session) return { ok: false, code: "UNAUTHORIZED" };
    try {
      return { ok: true, value: await session.predict(id, input) };
    } catch (error) {
      return { ok: false, code: error instanceof PredictorError ? error.code : "INVALID_REQUEST" };
    }
  });
  ipcMain.on("typing:cancel", (event, id: unknown) => {
    if (authorized(event) && typeof id === "number" && Number.isSafeInteger(id))
      session?.cancel(id);
  });
  ipcMain.on("typing:bounds", (event, data: unknown) => {
    if (
      !authorized(event) ||
      !window ||
      tracker.window !== window ||
      !data ||
      typeof data !== "object" ||
      !("id" in data) ||
      typeof data.id !== "string" ||
      data.id.length > 80 ||
      !("bounds" in data) ||
      !Array.isArray(data.bounds) ||
      data.bounds.length > 256
    )
      return;
    const bounds: unknown[] = data.bounds;
    if (
      !bounds.every(
        (bound) =>
          !!bound &&
          typeof bound === "object" &&
          ["x", "y", "width", "height"].every(
            (key) =>
              key in bound &&
              typeof bound[key as keyof typeof bound] === "number" &&
              Number.isFinite(bound[key as keyof typeof bound]) &&
              Math.abs(Number(bound[key as keyof typeof bound])) <= 100000
          ) &&
          "width" in bound &&
          typeof bound.width === "number" &&
          bound.width >= 0 &&
          "height" in bound &&
          typeof bound.height === "number" &&
          bound.height >= 0
      )
    )
      return;
    // Only validated geometry reaches the existing tracker; no raw channel bridge.
    ipcMain.emit("eye-elements", event, { id: data.id, bounds, elements: [] });
  });
  ipcMain.handle("typing:speak", (event, text: unknown) => {
    if (!authorized(event) || typeof text !== "string" || text.length > 16384) return false;
    stopSpeech();
    const id = ++speechId;
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        if (speech?.id === id) stopSpeech();
      }, 60000);
      speech = { id, resolve, timer };
      owner.webContents.send("typing:speech", id, text);
    });
  });
  ipcMain.on("typing:stop", (event) => {
    if (authorized(event)) stopSpeech();
  });
  ipcMain.on("typing:close", (event) => {
    if (authorized(event)) window?.close();
  });
  owner.on("closed", () => {
    window?.destroy();
    void disposeSession();
    if (!disposing) app.removeListener("before-quit", beforeQuit);
    if (speech) {
      clearTimeout(speech.timer);
      speech.resolve(false);
      speech = undefined;
    }
    for (const channel of ["typing:open", "typing:predict", "typing:speak", "typing:speech-result"])
      ipcMain.removeHandler(channel);
    // These channels belong solely to this window owner.
    for (const channel of [
      "typing:sync",
      "typing:cancel",
      "typing:bounds",
      "typing:stop",
      "typing:close"
    ])
      ipcMain.removeAllListeners(channel);
  });
}

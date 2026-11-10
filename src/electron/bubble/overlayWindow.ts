import { BrowserWindow, ipcMain, screen } from "electron";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { BubbleFrame } from "../../common/bubble/contract";

export async function createBubbleOverlay(frame: () => Promise<BubbleFrame>, reset: () => void) {
  const window = new BrowserWindow({
    ...screen.getPrimaryDisplay().bounds,
    show: false,
    transparent: true,
    frame: false,
    focusable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    resizable: false,
    hasShadow: false,
    webPreferences: {
      preload: join(__dirname, "bubble-preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false
    }
  });
  window.setIgnoreMouseEvents(true);
  window.setMenu(null);
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  const url = process.env.VITE_DEV_SERVER_URL
    ? new URL("bubble.html", process.env.VITE_DEV_SERVER_URL).href
    : pathToFileURL(join(__dirname, "../dist/bubble.html")).href;
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  ipcMain.handle("bubble:frame", (event) => {
    if (
      window.isDestroyed() ||
      event.sender !== window.webContents ||
      event.senderFrame !== window.webContents.mainFrame ||
      event.senderFrame.url !== url
    )
      return null;
    return frame();
  });
  const geometryChanged = () => {
    reset();
    window.hide();
    window.setBounds(screen.getPrimaryDisplay().bounds);
  };
  screen.on("display-metrics-changed", geometryChanged);
  screen.on("display-added", geometryChanged);
  screen.on("display-removed", geometryChanged);
  window.once("closed", () => {
    ipcMain.removeHandler("bubble:frame");
    screen.removeListener("display-metrics-changed", geometryChanged);
    screen.removeListener("display-added", geometryChanged);
    screen.removeListener("display-removed", geometryChanged);
  });
  await window.loadURL(url);
  return window;
}

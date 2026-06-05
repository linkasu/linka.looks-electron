"use strict";
import { app, protocol, BrowserWindow, ipcMain } from "electron";
import installExtension, { VUEJS3_DEVTOOLS } from "electron-devtools-installer";
import { CardsStorage } from "./services/card-storage-service";
import { autoUpdater } from "electron-updater";
import Store from "electron-store";
import { BackWatch } from "./tobii/backWatch";
import { appendFileSync } from "fs";
import { join } from "path";

if (process.env.IS_TEST === "1" && process.env.TEST_USER_DATA_DIR) {
  app.setPath("userData", process.env.TEST_USER_DATA_DIR);
}

Store.initRenderer();

const cardStorage = new CardsStorage();
void cardStorage;

const isDevelopment = process.env.NODE_ENV !== "production";
const isUpdateTestMode = process.env.UPDATE_TEST_MODE === "1";
const updateFeedUrl = process.env.UPDATE_FEED_URL;
const updateLogPath = process.env.UPDATE_LOG_PATH;
const updateStore = new Store({ name: "updater" });
const UPDATE_RESTART_COOLDOWN_MS = 5 * 60 * 1000;
let mainWindow: BrowserWindow | null = null;
let autoUpdaterInitialized = false;
let isDownloadingUpdate = false;
let isQuittingForUpdate = false;
let downloadedVersion: string | null = null;
const updateState = {
  available: false,
  downloaded: false,
  error: "",
  percent: 0
};

ipcMain.handle("app_version", () => ({
  version: app.getVersion(),
  platform: process.platform,
  isPackaged: app.isPackaged
}));
ipcMain.handle("updater:getState", () => updateState);

function logUpdate (message: string, payload?: unknown): void {
  if (!updateLogPath) {
    return;
  }
  const safePayload = payload ? ` ${JSON.stringify(payload)}` : "";
  const line = `[${new Date().toISOString()}] ${message}${safePayload}\n`;
  try {
    appendFileSync(updateLogPath, line);
  } catch (error) {
    console.warn("Failed to write update log:", error);
  }
}
function sendToRenderer (channel: string, payload?: unknown): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindow.webContents.send(channel, payload);
}

function recordUpdateInstallAttempt (version: string | null): void {
  updateStore.set("lastAttemptAt", Date.now());
  if (version) {
    updateStore.set("lastAttemptVersion", version);
  }
}

function clearUpdateAttemptIfSucceeded (): void {
  const lastAttemptVersion = updateStore.get("lastAttemptVersion");
  if (typeof lastAttemptVersion === "string" &&
    lastAttemptVersion &&
    lastAttemptVersion === app.getVersion()) {
    updateStore.delete("lastAttemptAt");
    updateStore.delete("lastAttemptVersion");
  }
}

function shouldSkipUpdateCheck (): boolean {
  if (isUpdateTestMode) {
    return false;
  }
  const lastAttemptAt = updateStore.get("lastAttemptAt");
  if (typeof lastAttemptAt !== "number") {
    return false;
  }
  const elapsed = Date.now() - lastAttemptAt;
  return elapsed < UPDATE_RESTART_COOLDOWN_MS;
}

function setupAutoUpdater (): void {
  if (autoUpdaterInitialized || !app.isPackaged) {
    return;
  }
  autoUpdaterInitialized = true;

  if (updateFeedUrl) {
    autoUpdater.setFeedURL({ provider: "generic", url: updateFeedUrl });
    logUpdate("update_feed_url", { url: updateFeedUrl });
  }

  clearUpdateAttemptIfSucceeded();
  if (shouldSkipUpdateCheck()) {
    console.warn("Skipping update check to avoid restart loop.");
    logUpdate("update_check_skipped");
    return;
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on("error", (error) => {
    isDownloadingUpdate = false;
    const message = error instanceof Error ? error.message : String(error);
    updateState.error = message;
    updateState.available = false;
    updateState.downloaded = false;
    logUpdate("update_error", { message });
    sendToRenderer("update_error", message);
  });

  autoUpdater.on("update-available", (info) => {
    if (isDownloadingUpdate) {
      return;
    }
    isDownloadingUpdate = true;
    downloadedVersion = info.version;
    updateState.available = true;
    updateState.downloaded = false;
    updateState.error = "";
    logUpdate("update_available", info);
    sendToRenderer("update_available", info);
    autoUpdater.downloadUpdate().catch((error) => {
      isDownloadingUpdate = false;
      const message = error instanceof Error ? error.message : String(error);
      logUpdate("update_download_error", { message });
      sendToRenderer("update_error", message);
    });
  });

  autoUpdater.on("update-not-available", () => {
    isDownloadingUpdate = false;
    updateState.available = false;
    logUpdate("update_not_available");
  });

  autoUpdater.on("download-progress", (info) => {
    updateState.percent = info.percent;
    logUpdate("download_progress", info);
    sendToRenderer("update_info", info);
  });

  autoUpdater.on("update-downloaded", (info) => {
    isDownloadingUpdate = false;
    downloadedVersion = info.version;
    updateState.available = false;
    updateState.downloaded = true;
    updateState.error = "";
    logUpdate("update_downloaded", info);
    sendToRenderer("update_downloaded", info);
    if (isUpdateTestMode && !isQuittingForUpdate) {
      isQuittingForUpdate = true;
      recordUpdateInstallAttempt(downloadedVersion);
      logUpdate("update_test_quit_and_install");
      autoUpdater.quitAndInstall(true, false);
    }
  });

  ipcMain.removeAllListeners("restart_app");
  ipcMain.on("restart_app", () => {
    if (isQuittingForUpdate || !downloadedVersion || !updateState.downloaded) {
      return;
    }
    isQuittingForUpdate = true;
    recordUpdateInstallAttempt(downloadedVersion);
    logUpdate("restart_app");
    autoUpdater.quitAndInstall();
  });

  autoUpdater.checkForUpdates().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    updateState.error = message;
    updateState.available = false;
    updateState.downloaded = false;
    logUpdate("update_check_error", { message });
    sendToRenderer("update_error", message);
  });
}

// Scheme must be registered before the app is ready
protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { secure: true, standard: true } }
]);

async function createWindow () {
  // Create the browser window.
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {

      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow = win;
  const backWatch = new BackWatch(win);
  void backWatch;
  win.maximize();
  if (process.env.VITE_DEV_SERVER_URL) {
    await win.loadURL(process.env.VITE_DEV_SERVER_URL);
    if (!process.env.IS_TEST) win.webContents.openDevTools();
  } else {
    await win.loadFile(join(__dirname, "../dist/index.html"));
  }
  setupAutoUpdater();
}

// Quit when all windows are closed.
app.on("window-all-closed", () => {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on("ready", async () => {
  if (process.env.PRINT_APP_VERSION === "1") {
    console.log(app.getVersion());
    app.exit(0);
    return;
  }
  if (isDevelopment && !process.env.IS_TEST) {
    // Install Vue Devtools
    try {
      await installExtension(VUEJS3_DEVTOOLS);
    } catch (e) {
      console.error("Vue Devtools failed to install:", (e as Error).toString());
    }
  }
  createWindow();
});

// Exit cleanly on request from parent process in development mode.
if (isDevelopment) {
  if (process.platform === "win32") {
    process.on("message", (data) => {
      if (data === "graceful-exit") {
        app.quit();
      }
    });
  } else {
    process.on("SIGTERM", () => {
      app.quit();
    });
  }
}

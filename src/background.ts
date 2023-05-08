'use strict'
import { platform } from "os";
import { app, protocol, BrowserWindow, screen, ipcMain } from 'electron'
import { createProtocol } from 'vue-cli-plugin-electron-builder/lib'
import installExtension, { VUEJS3_DEVTOOLS } from 'electron-devtools-installer'
import { join } from "path";
import { TobiiProcess } from "tobiiee";
import { GazeData } from "tobiiee/build/GazeData";
import { CardsStorage } from "./CardsStorage/backend";
import { autoUpdater } from "electron-updater";
import Store from "electron-store";

Store.initRenderer();
new CardsStorage()

const isDevelopment = process.env.NODE_ENV !== 'production'

// Scheme must be registered before the app is ready
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { secure: true, standard: true } }
])

async function createWindow() {
  // Create the browser window.
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {

      // Use pluginOptions.nodeIntegration, leave this alone
      // See nklayman.github.io/vue-cli-plugin-electron-builder/guide/security.html#node-integration for more info
      nodeIntegration: (process.env
        .ELECTRON_NODE_INTEGRATION as unknown) as boolean,
      contextIsolation: !process.env.ELECTRON_NODE_INTEGRATION
    }
  })

  if (platform() === 'win32') {

    const tobii = new TobiiProcess({
      path: join(__dirname, '.\\..\\extraResources\\bin\\GazePointLogger.exe')
    })
    tobii.start();
    let lastSend = 0;
    tobii.on("point", (point) => {
      if ((+new Date) - lastSend < (1000 / 30)) return;
      lastSend = +new Date()
      sendPoint(win, point);
    })
  }
  else if (platform() == 'darwin') {

    setInterval(() => {
      const coords = screen.getCursorScreenPoint()


      sendPoint(win, {
        ...coords,
        ts: +new Date()

      })
    }, 1000 / 30)

  }

  ipcMain.on('app_version', (event) => {
    event.sender.send('app_version', { version: app.getVersion() });
  });

  autoUpdater.on('update-available', () => {
    win.webContents.send('update_available');
  });

  autoUpdater.on('update-downloaded', () => {
    win.webContents.send('update_downloaded');
  });

  ipcMain.on('restart_app', () => {
    autoUpdater.quitAndInstall();
  });
  if (process.env.WEBPACK_DEV_SERVER_URL) {
    // Load the url of the dev server if in development mode
    await win.loadURL(process.env.WEBPACK_DEV_SERVER_URL as string)
    if (!process.env.IS_TEST) win.webContents.openDevTools()
  } else {
    createProtocol('app')
    // Load the index.html when not in development
    win.loadURL('app://./index.html')

  }
}

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', async () => {
  if (isDevelopment && !process.env.IS_TEST) {
    // Install Vue Devtools
    try {
      await installExtension(VUEJS3_DEVTOOLS)
    } catch (e) {
      console.error('Vue Devtools failed to install:', (e as Error).toString())
    }
  }
  createWindow()
})

// Exit cleanly on request from parent process in development mode.
if (isDevelopment) {
  if (process.platform === 'win32') {
    process.on('message', (data) => {
      if (data === 'graceful-exit') {
        app.quit()
      }
    })
  } else {
    process.on('SIGTERM', () => {
      app.quit()
    })
  }
}
function sendPoint(win: BrowserWindow, point: GazeData) {
  if (!win || win.isDestroyed() || !win.isFocused()) return;
  const rect = win.getContentBounds();
  const pointInWindow = {
    x: Math.floor(point.x - rect.x),
    y: Math.floor(point.y - rect.y),
    ts: point.ts
  };
  if (pointInWindow.x > 0 && pointInWindow.x < rect.width && pointInWindow.y > 0 && pointInWindow.y < rect.height) {
    win.webContents.send("eye-point", pointInWindow);
  }
}


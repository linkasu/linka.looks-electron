import { platform } from "os";
import { app, BrowserWindow, dialog, ipcMain, IpcMainEvent, IpcMainInvokeEvent, screen } from "electron";
import type { PageElementsState } from "@/common/interfaces/PageElementsState";
import type { EyeTrackerBound, EyeTrackerProcess } from "./EyeTrackerProcess";
import { EyeLogTrackerProcess } from "./EyeLogTrackerProcess";
import { TobiiFreeTrackerProcess } from "./TobiiFreeTrackerProcess";

export class BackWatch {
  tobii?: EyeTrackerProcess = undefined;
  window?: BrowserWindow;
  hid = "";
  multiplyScale = false;
  data?: PageElementsState = undefined;
  private debugEnabled = false;
  private boundsLogged = false;
  private readonly onEyeElements = (event: IpcMainEvent, data: PageElementsState) => {
    this.hid = data.id;
    this.data = data;
    this.processData();
  };

  private readonly onButtonTimeout = (event: IpcMainEvent, value: number) => {
    this.tobii?.setTimeout(value);
  };

  private readonly onButtonMultiplyScale = (event: IpcMainEvent, value: boolean) => {
    this.multiplyScale = value;
    this.processData();
  };

  private readonly onDebugSetEnabled = (event: IpcMainEvent, value: boolean) => {
    this.debugEnabled = value;
    this.tobii?.setDebugEnabled?.(value);
  };

  private readonly onCalibrationStart = async () => {
    await this.requireCalibrationMethod("startCalibration")();
    return true;
  };

  private readonly onCalibrationAddPoint = async (event: IpcMainInvokeEvent, point: { x: number, y: number }) => {
    if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) {
      throw new Error("Некорректная точка калибровки");
    }
    await this.requireCalibrationMethod("addCalibrationPoint")(point.x, point.y);
    return true;
  };

  private readonly onCalibrationFinish = async () => {
    await this.requireCalibrationMethod("finishCalibration")();
    return true;
  };

  private readonly onCalibrationApplySaved = async () => {
    return await this.requireCalibrationMethod("applySavedCalibration")();
  };

  constructor (win: BrowserWindow) {
    this.window = win;
    win.on("closed", () => this.destroy());
    try {
      this.tobii = this.createTracker();
      this.tobii?.on("enter", (index: number) => this.onEnter(index));
      this.tobii?.on("exit", () => this.onExit());
      this.tobii?.on("click", (index, count) => this.onClick(index, count));
      if (!app.isPackaged) {
        this.tobii?.on("debug", (state) => {
          if (this.debugEnabled) this.window?.webContents.send("tobii:debug", state);
        });
      }
      void this.tobii?.initialize?.()
        .then(() => console.warn("[tobii] tracker initialized"))
        .catch((error) => console.warn("[tobii] tracker initialization failed", error));
      ipcMain.on("eye-elements", this.onEyeElements);
      ipcMain.on("button_timeout", this.onButtonTimeout);
      ipcMain.on("button_multiply_scale", this.onButtonMultiplyScale);
      ipcMain.on("tobii:debug:set-enabled", this.onDebugSetEnabled);
      ipcMain.handle("tobii:calibration:start", this.onCalibrationStart);
      ipcMain.handle("tobii:calibration:add-point", this.onCalibrationAddPoint);
      ipcMain.handle("tobii:calibration:finish", this.onCalibrationFinish);
      ipcMain.handle("tobii:calibration:apply-saved", this.onCalibrationApplySaved);
    } catch {
      dialog
        .showErrorBox("Ошибка запуска обработчика айтрекера", "Для исправления проблемы установите Visual Studio 2012 (VC++ 11.0) с обновлением 4 или свяжитесь с Бакаидовым.");
    }
  }

  private createTracker (): EyeTrackerProcess | undefined {
    if (platform() === "win32") return new EyeLogTrackerProcess();
    if (platform() === "darwin") return new TobiiFreeTrackerProcess();
    return undefined;
  }

  private requireCalibrationMethod<K extends "startCalibration" | "addCalibrationPoint" | "finishCalibration" | "applySavedCalibration"> (method: K): NonNullable<EyeTrackerProcess[K]> {
    const fn = this.tobii?.[method];
    if (!fn) throw new Error("Калибровка Tobii доступна только в экспериментальном macOS-режиме");
    return fn.bind(this.tobii) as NonNullable<EyeTrackerProcess[K]>;
  }

  private processData () {
    if (!this.window || this.window.isDestroyed() || !this.data) return;
    const winBounds = this.window.getContentBounds();
    if (!this.boundsLogged) {
      this.boundsLogged = true;
      const display = screen.getPrimaryDisplay();
      console.warn("[tobiifree-helper] window metrics", {
        windowBounds: this.window.getBounds(),
        contentBounds: winBounds,
        displayBounds: display.bounds,
        displayWorkArea: display.workArea,
        displayScaleFactor: display.scaleFactor,
        firstDomBound: this.data.bounds[0]
      });
    }

    const m = this.multiplyScale ? (screen.getPrimaryDisplay().scaleFactor) : 1;
    this.tobii?.setScaleFactor?.(m);
    this.tobii?.setScreenRect?.(winBounds.x, winBounds.y, winBounds.width, winBounds.height);

    const bounds: EyeTrackerBound[] = this.data.bounds.map((el: DOMRect) => {
      const [x, y, width, height] = [el.x + winBounds.x, el.y + winBounds.y, el.width, el.height].map(el => Math.round(el * m));
      return { x, y, width, height };
    });
    if (bounds.length > 0) {
      this.tobii?.setBounds(bounds);
    }
  }

  private destroy () {
    ipcMain.off("eye-elements", this.onEyeElements);
    ipcMain.off("button_timeout", this.onButtonTimeout);
    ipcMain.off("button_multiply_scale", this.onButtonMultiplyScale);
    ipcMain.off("tobii:debug:set-enabled", this.onDebugSetEnabled);
    ipcMain.removeHandler("tobii:calibration:start");
    ipcMain.removeHandler("tobii:calibration:add-point");
    ipcMain.removeHandler("tobii:calibration:finish");
    ipcMain.removeHandler("tobii:calibration:apply-saved");
    this.tobii?.destroy();
    this.tobii = undefined;
    this.window = undefined;
  }

  onClick (index: number, count: number) {
    if (!this.window?.isFocused()) return;
    this.window?.webContents.send("eye-click", {
      elementIndex: index,
      count,
      id: this.hid
    });
  }

  onExit () {
    this.window?.webContents.send("eye-exit", {
      id: this.hid
    });
  }

  onEnter (index: number) {
    this.window?.webContents.send("eye-enter", {
      elementIndex: index,
      id: this.hid
    });
  }
}

import { platform } from "os";
import { TobiiProcess } from "eyelog/dist/TobiiProcess";
import { BrowserWindow, dialog, ipcMain, IpcMainEvent, screen } from "electron";
import type { PageElementsState } from "@/common/interfaces/PageElementsState";
import { Bound } from "eyelog/dist/bound";
import { resolveExtraResource } from "@/electron/utils/resolveExtraResource";

export class BackWatch {
  tobii?: TobiiProcess = undefined;
  window?: BrowserWindow;
  hid = "";
  multiplyScale = false;
  data?: PageElementsState = undefined;
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

  constructor (win: BrowserWindow) {
    this.window = win;
    win.on("closed", () => this.destroy());
    if (platform() === "win32") {
      try {
        this.tobii = new TobiiProcess(resolveExtraResource("bin", "EyeLog.exe"));
        this.tobii?.on("enter", (index: number) => this.onEnter(index));
        this.tobii?.on("exit", () => this.onExit());
        this.tobii?.on("click", (index, count) => this.onClick(index, count));
        ipcMain.on("eye-elements", this.onEyeElements);
        ipcMain.on("button_timeout", this.onButtonTimeout);
        ipcMain.on("button_multiply_scale", this.onButtonMultiplyScale);
      } catch {
        dialog
          .showErrorBox("Ошибка запуска обработчика айтрекера", "Для исправления проблемы установите Visual Studio 2012 (VC++ 11.0) с обновлением 4 или свяжитесь с Бакаидовым.");
      }
    }
  }

  private processData () {
    if (!this.window || this.window.isDestroyed() || !this.data) return;
    const winBounds = this.window.getContentBounds();

    const m = this.multiplyScale ? (screen.getPrimaryDisplay().scaleFactor) : 1;

    const bounds: Bound[] = this.data.bounds.map((el: DOMRect) => {
      return Bound.fromArray([el.x + winBounds.x, el.y + winBounds.y, el.width, el.height].map(el => Math.round(el * m)));
    });
    if (bounds.length > 0) {
      this.tobii?.setBounds(bounds);
    }
  }

  private destroy () {
    ipcMain.off("eye-elements", this.onEyeElements);
    ipcMain.off("button_timeout", this.onButtonTimeout);
    ipcMain.off("button_multiply_scale", this.onButtonMultiplyScale);
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

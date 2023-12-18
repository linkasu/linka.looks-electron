import { platform } from "os";
import { TobiiProcess } from "eyelog/dist/TobiiProcess";
import { join } from "path";
import { BrowserWindow, dialog, ipcMain, screen } from "electron";
import type { PageElementsState } from "@/common/interfaces/PageElementsState";
import { Bound } from "eyelog/dist/bound";

export class BackWatch {
  tobii?: TobiiProcess = undefined;
  window?: BrowserWindow;
  hid = "";
  multiplyScale = false;
  constructor (win: BrowserWindow) {
    this.window = win;
    if (platform() === "win32") {
      try {
        this.tobii = new TobiiProcess(join(__dirname, ".\\..\\extraResources\\bin\\EyeLog.exe"));
        this.tobii?.on("enter", (index: number) => this.onEnter(index));
        this.tobii?.on("exit", () => this.onExit());
        this.tobii?.on("click", (index, count) => this.onClick(index, count));
        ipcMain.on("eye-elements", (event, data: PageElementsState) => {
          this.hid = data.id;
          const winBounds = win.getContentBounds();

          const m = this.multiplyScale ? (screen.getPrimaryDisplay().scaleFactor) : 1;

          const bounds: Bound[] = data.bounds.map((el: DOMRect) => {
            return Bound.fromArray([el.x + winBounds.x, el.y + winBounds.y, el.width, el.height].map(el => Math.round(el * m)));
          });
          if (bounds.length > 0) {
            this.tobii?.setBounds(bounds);
          }
        });
        ipcMain.on("button_timeout", (event, value) => {
          this.tobii?.setTimeout(value);
        });
        ipcMain.on("button_multiply_scale", (event, value) => {
          this.multiplyScale = value;
        });
      } catch (error) {
        dialog
          .showErrorBox("Ошибка запуска обработчика айтрекера", "Для исправления проблемы установите Visual Studio 2012 (VC++ 11.0) с обновлением 4 или свяжитесь с Бакаидовым.");
      }
    }
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

import { platform } from "os";
import { TobiiProcess } from "eyelog/dist/TobiiProcess";
import { join } from "path";
import { BrowserWindow, ipcMain, screen } from "electron";
import { PageElementsState } from "../interfaces/PageElementsState";
import { Bound } from "eyelog/dist/bound";

let window: BrowserWindow;
let tobii = new TobiiProcess(join(__dirname, '.\\..\\extraResources\\bin\\EyeLog.exe'))

let hid = '';
export class BackWatch {
    constructor(win: BrowserWindow) {
        window = win;
        if (platform() === 'win32') {

            tobii.on('enter', this.onEnter)
            tobii.on('exit', this.onExit)
            tobii.on('click', this.onClick)
            ipcMain.on('eye-elements', (event, data: PageElementsState) => {
                hid = data.id
                const winBounds = win.getContentBounds()
                const bounds: Bound[] = data.bounds.map((el) => {
                    return Bound.fromArray([el.x + winBounds.x, el.y + winBounds.y, el.width, el.height].map(el=>Math.floor(el)))
                })
                tobii.setBounds(bounds)
            })
            ipcMain.on('button_timeout', (event, value)=>{
                tobii.setTimeout(value)
                
            })
                        
        }
    }
    onClick(index: number, count: number) {
        window.webContents.send("eye-click", {
            elementIndex: index,
            count,
            id: hid,
        })
    }
    onExit() {
        window.webContents.send("eye-exit", {
            id: hid
        })
    }
    onEnter(index: number) {
        window.webContents.send("eye-enter", {
            elementIndex: index,
            id: hid,
        })
    }

}


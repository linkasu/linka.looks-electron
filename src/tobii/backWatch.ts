import { platform } from "os";
import { TobiiProcess } from "eyelog/dist/TobiiProcess";
import { join } from "path";
import { BrowserWindow, ipcMain, screen } from "electron";
import { PageElementsState } from "../interfaces/PageElementsState";
import { Bound } from "eyelog/dist/bound";

export class BackWatch {
    tobii?:TobiiProcess = undefined
    window?: BrowserWindow;
    hid = ''
    constructor(win: BrowserWindow) {
        this.window = win;
        if (platform() === 'win32') {
            this.tobii = new TobiiProcess(join(__dirname, '.\\..\\extraResources\\bin\\EyeLog.exe'));
            this.tobii?.on('enter', this.onEnter)
            this.tobii?.on('exit', this.onExit)
            this.tobii?.on('click', this.onClick)
            ipcMain.on('eye-elements', (event, data: PageElementsState) => {
                this.hid = data.id
                const winBounds = win.getContentBounds()
                const scale = screen.getPrimaryDisplay().scaleFactor 
                
                const bounds: Bound[] = data.bounds.map((el) => {
                    return Bound.fromArray([el.x + winBounds.x, el.y + winBounds.y, el.width, el.height].map(el=>Math.round(el*scale)))
                }) 
                
                this.tobii?.setBounds(bounds)
            })
            ipcMain.on('button_timeout', (event, value)=>{
                this.tobii?.setTimeout(value)
                
            })
                        
        }
    }
    onClick(index: number, count: number) {
        if(!this.window?.isFocused()) return
        this.window?.webContents.send("eye-click", {
            elementIndex: index,
            count,
            id: this.hid,
        })
    }
    onExit() {
        this.window?.webContents.send("eye-exit", {
            id: this.hid
        })
    }
    onEnter(index: number) {
        this.window?.webContents.send("eye-enter", {
            elementIndex: index,
            id: this.hid,
        })
    }

}


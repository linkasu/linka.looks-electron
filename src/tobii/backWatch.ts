import { platform } from "os";
import { TobiiProcess } from "tobiiee";
import { join } from "path";
import { BrowserWindow, ipcMain, screen } from "electron";
import { GazeData } from "tobiiee/build/GazeData";
import { PageElementsState } from "../interfaces/PageElementsState";

//const
const SIGNAL_TIMEOUT = 500;
const EXIT_TIMEOUT = 50;


let elements: PageElementsState = {
    id: '',
    bounds: []
};
let lastTS = -1;
let lastElementId = -1
let lastEnterTs = 0
let lastExitTs = 0

let window: BrowserWindow;
export class BackWatch {
    constructor(win: BrowserWindow) {
        window = win;
        if (platform() === 'win32') {

            const tobii = new TobiiProcess({
                path: join(__dirname, '.\\..\\extraResources\\bin\\GazePointLogger.exe')
            })
            tobii.start();
            let lastSend = 0;
            tobii.on("point", (point) => {

                if ((+new Date) - lastSend < (1000 / 30)) return;
                lastSend = +new Date()
                this.onPoint(win, point);
            })
        }
        else if (platform() == 'darwin') {

            setInterval(() => {
                const coords = screen.getCursorScreenPoint()
                this.onPoint(win, {
                    ...coords,
                    ts: +new Date()

                })
            }, 1000 / 30)

        }
        ipcMain.on('eye-elements', (event, data: PageElementsState) => {
            elements = data
            this.reset()
        })
    }
    onPoint(win: BrowserWindow, point: GazeData) {
        if (!win || win.isDestroyed() || !win.isFocused() || !elements) return;
        if (point.ts - lastTS > SIGNAL_TIMEOUT) {
            win.webContents.send("eye-exit", {
                elementIndex: lastElementId,
                id: elements.id,
            })
            lastTS = point.ts
            this.reset();
            return
        }
        lastTS = point.ts
        const rect = win.getContentBounds();
        const pointInWindow = {
            x: Math.floor(point.x - rect.x),
            y: Math.floor(point.y - rect.y),
            ts: point.ts
        };

        const currentRectIndex = this.getElementUnderGaze(elements.bounds, pointInWindow)

        //exit
        if (lastElementId !== -1 && currentRectIndex !== lastElementId){
            if (lastExitTs === 0) {
                lastExitTs = point.ts;
            }
            if (point.ts - lastExitTs > EXIT_TIMEOUT) {
                win.webContents.send("eye-exit", {
                    elementIndex: lastElementId,
                    id: elements.id,
                })
                this.reset()
            }

        }

        //stay
        else if (lastElementId > -1 && lastElementId === currentRectIndex) {

            win.webContents.send("eye-stay", {

                elementIndex: currentRectIndex,
                id: elements.id,
                time: lastTS - lastEnterTs
            })

        }
        //enter
        else if (lastElementId < 0 && currentRectIndex !== null&&lastElementId!==currentRectIndex) {
            win.webContents.send("eye-enter", {
                elementIndex: currentRectIndex,
                id: elements.id

            });
            lastEnterTs = point.ts
            lastElementId = currentRectIndex
        }


        if (pointInWindow.x > 0 && pointInWindow.x < (rect.width) && pointInWindow.y > 0 && pointInWindow.y < rect.height) {
            win.webContents.send("eye-point", pointInWindow);
        }


    }
    private reset() {
        lastExitTs = -1;
        lastEnterTs = -1;
        lastElementId = -1;
    }

    private getElementUnderGaze(elements: DOMRect[], point: GazeData) {
        for (let index = 0; index < elements.length; index++) {

            const rect = elements[index];
            if (point.x > rect.left && point.x < rect.right && point.y > rect.y && point.y < rect.bottom) {
                return index;
            }
        }
        return null;
    }
}


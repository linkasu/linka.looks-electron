    
import { ipcRenderer } from 'electron';
import { GazeData } from "tobiiee/build/GazeData";

export class PageWatcher {
    private static CLASS = 'eye';
    static TIMEOUT: number = 1000;
    static EXIT_TIMEOUT: number = 50;

    private lastElement?: Element;

    private lastTS = 0;
    private enterTs?: number;
    private exitTs?: number;
    constructor() {
        ipcRenderer.on('eye-point', (event, point: GazeData) => {
            this.onGaze(point);
        });
    }

    private onGaze(point: GazeData) {
        if (point.ts - this.lastTS > PageWatcher.TIMEOUT) {
            if(this.lastElement) this.exitWatch(point.ts, true)
            this.reset();
        }
        this.lastTS = point.ts
        const elements = document.getElementsByClassName(PageWatcher.CLASS);
        const el = this.getElementUnderGaze(elements, point);
        if (!this.lastElement && el) {
            this.enterWatch(el, point.ts)
        }
        if (this.lastElement && !el) {
            this.exitWatch(point.ts)
        }
        if (this.lastElement && el) {
            if (this.lastElement !== el) {
                const isExit = this.exitWatch(point.ts)
                if (isExit) {
                    this.enterWatch(el, point.ts)
                }
            } else {
                this.stayWatch(el, point.ts)
            }
        }
    }
    stayWatch(el: Element, ts: number) {
        if(!this.enterTs) return;
        const e = new CustomEvent('eye-stay', { detail: {
            time: ts - this.enterTs
        } })
        el.dispatchEvent(e)
    }
    enterWatch(el: Element, time: number) {
        this.lastElement = el;
        this.enterTs = time;
        const e = new CustomEvent('eye-enter', { detail: {} })
        el.dispatchEvent(e)
    }
    exitWatch(time: number, important = false) {
        if (!this.exitTs && !important) {
            this.exitTs = time;
            return false
        }

        if (important  || (this.exitTs && time - this.exitTs > PageWatcher.EXIT_TIMEOUT)) {
            const e = new CustomEvent('eye-exit', { detail: {} })
            this.lastElement?.dispatchEvent(e)
            this.reset()
            return true
        }
        return false
    }
    reset() {
        this.lastElement = undefined
        this.enterTs = undefined;
        this.exitTs = undefined;
    }

    private getElementUnderGaze(elements: HTMLCollectionOf<Element>, point: GazeData) {
        for (const element of elements) {
            let rect = element.getBoundingClientRect();
            if (point.x > rect.left && point.x < rect.right && point.y > rect.top && point.y < rect.bottom) {
                return element;
            }
        }
        return null;
    }
}
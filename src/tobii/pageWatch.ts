import store from '@/store';
import { Side } from '@/store/LINKaStore';
import { getDistance } from '@/utils/getDistance';
import { ipcRenderer } from 'electron';
import { GazeData } from "tobiiee/build/GazeData";



export class PageWatcher {
    private static CLASS = 'eye';
    static TIMEOUT: number = store.state.button.timeout;
    static EXIT_TIMEOUT: number = 150;

    private lastElement?: Element;

    private lastTS = 0;
    private enterTs?: number;
    private exitTs?: number;
    constructor() {
        ipcRenderer.on('eye-point', (event, point: GazeData) => {
            this.onGaze(point);
        });
        window.addEventListener('keydown', (event) => {
            if (!(event.target instanceof HTMLInputElement)) {
                if (this.onKeyboard(event.code)) {
                    event.preventDefault();
                    return false
                }
            }
        })
    }
    onKeyboard(code: string) {
        if (!store.state.button.keyboardActivation) return;
        const elements = document.getElementsByClassName(PageWatcher.CLASS);
        const map = store.state.keyMapping;
        let action: Side | null = null
        for (const key in map) {
            if (Object.prototype.hasOwnProperty.call(map, key)) {
                const element = map[key as Side];
                if (element.includes(code)) {
                    action = key as Side
                    break

                }

            }
        }
        if (action == null) return false;
        if (this.lastElement?.getBoundingClientRect().width == 0) {
            this.lastElement = undefined
        }
        if (!this.lastElement && elements[0]) {
            this.lastElement = elements[0];
            const e = new CustomEvent('eye-enter', { detail: {} })
            this.lastElement.dispatchEvent(e)
            return true
        }
        if (!this.lastElement) return true;

        if (action !== 'enter') {
            if (!store.state.button.enabled) return;
            let next = this.findNear(elements, action);
            if (!next) return;
            let e = new CustomEvent('eye-exit', { detail: {} })
            this.lastElement.dispatchEvent(e)

            this.lastElement = next

            e = new CustomEvent('eye-enter', { detail: {} })
            this.lastElement.dispatchEvent(e)

        } else {
            let e = new CustomEvent('click', { detail: {} })
            this.lastElement.dispatchEvent(e)


        }
        return true
    }

    private findNear(elements: HTMLCollectionOf<Element>, where: Side, strict = false): Element | null {
        if (!this.lastElement) return null;
        const currentRect = this.lastElement.getBoundingClientRect();
        let distance = Number.MAX_VALUE;
        let next = this.lastElement;
        for (const element of elements) {
            if (this.lastElement == element)
                continue;
            const rect = element.getBoundingClientRect();

            const rx = rect.x + rect.width / 2
            const ry = rect.y + rect.height / 2

            const cx = currentRect.x + currentRect.width / 2
            const cy = currentRect.y + currentRect.height / 2

            switch (where) {
                case 'left':
                    if (rx >= cx)
                        continue;
                    break;
                case 'right':
                    if (rx <= cx)
                        continue;
                    break;
                case 'up':
                    if (ry >= cy)
                        continue;
                    break;
                case 'down':
                    if (ry <= cy)
                        continue;
                    break;
            }
            const v = where != 'left' && where !== 'right'
            const xCoof = v ? 1000 : 1
            const yCoof = !v ? 1000 : 1

            const d = getDistance({ x: rx * xCoof, y: ry * yCoof }, { x: cx * xCoof, y: cy * yCoof });
            if (d < distance) {
                distance = d;
                next = element;
            }
        }
        if (next == this.lastElement && !strict) {
            return this.findNear(elements, where, true)!
        }
        return next;
    }

    private onGaze(point: GazeData) {
        if (point.ts - this.lastTS > PageWatcher.TIMEOUT) {
            if (this.lastElement) this.exitWatch(point.ts, true)
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
        if (!this.enterTs) return;
        const e = new CustomEvent('eye-stay', {
            detail: {
                time: ts - this.enterTs
            }
        })
        el.dispatchEvent(e)
    }
    enterWatch(el: Element, time: number) {
        this.lastElement = el;
        this.enterTs = time;
        const e = new CustomEvent('eye-enter', {
            detail: {
                eye: true
            }
        })
        el.dispatchEvent(e)
    }
    exitWatch(time: number, important = false) {
        if (!this.exitTs && !important) {
            this.exitTs = time;
            return false
        }

        if (important || (this.exitTs && time - this.exitTs > PageWatcher.EXIT_TIMEOUT)) {
            const e = new CustomEvent('eye-exit', {
                detail: {
                    eye: true
                }
            })
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
        for (let index = elements.length - 1; index >= 0; index--   ) {
            const element = elements[index];
            let rect = element.getBoundingClientRect();
            if (point.x > rect.left && point.x < rect.right && point.y > rect.top && point.y < rect.bottom) {
                return element;
            }
        }
        return null;
    }
}
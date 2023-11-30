import { BrowserElementsState, PageElementsState } from "@/common/interfaces/PageElementsState";
import store from "@/frontend/store";
import { Side } from "@/frontend/store/LINKaStore";
import { getDistance } from "@/frontend/utils/getDistance";
import { log } from "console";
import { ipcRenderer } from "electron";
import { GamepadWrapper } from "gamepad-wrapper";
import { uuid } from "uuidv4";

export class PageWatcher {
  private static CLASS = "eye";
  static TIMEOUT: number = store.state.button.timeout;
  static EXIT_TIMEOUT = 150;

  private lastElement?: Element;
  lock = false;

  private elements: BrowserElementsState = {
    id: "",
    elements: [],
    bottom: 0,
    bounds: [] as DOMRect[]
  };

  gamepadButtonsMap = new Map<string, boolean[]>();
  cycle?: NodeJS.Timer;
  static instance: PageWatcher;

  constructor () {
    PageWatcher.instance = this;
    this.watchElementsChange();
    window.addEventListener("resize", () => this.watchElementsChange());
    const observer = new MutationObserver((m) => {
      this.watchElementsChange();
    });

    observer.observe(document, {
      childList: true,
      subtree: true
    });

    ipcRenderer.on("eye-enter", (event, data) => {
      if (data.id != this.elements.id) return;
      const element = this.elements.elements[data.elementIndex];
      this.enterWatch(element);
    });

    ipcRenderer.on("eye-exit", (event, data) => {
      if (data?.id != this.elements.id) {
        return;
      }

      this.exitWatch();
    });
    ipcRenderer.on("eye-click", (event, data) => {
      if (data?.id != this.elements.id) return;

      const element = this.elements.elements[data.elementIndex];
      if (data.count > 1) return;
      if (element !== undefined) {
        this.clickWatch(element, true);
      }
    });

    window.addEventListener("keydown", (event) => {
      if (!(event.target instanceof HTMLInputElement)) {
        if (this.onKeyboard(event.code)) {
          event.preventDefault();
          return false;
        }
      }
    });

    this.joystickCycle();
  }

  joystickCycle () {
    const gamepads = navigator.getGamepads();
    for (const gamepad of gamepads) {
      if (!gamepad) continue;
      const buttons = gamepad.buttons.map(({ value }) => !!value);
      const axes = gamepad.axes;
      // todo

      const lasts = this.gamepadButtonsMap.get(gamepad.id);
      if (lasts) {
        for (let index = 0; index < buttons.length; index++) {
          const element = buttons[index];
          const last = lasts[index];
          if (!last && element) {
            const key = "joy" + index;
            this.onKeyboard(key);
            const e = new KeyboardEvent("keydown", { code: key });
            document.dispatchEvent(e);
          }
        }
      }

      this.gamepadButtonsMap.set(gamepad.id, buttons);
    }
    requestAnimationFrame(() => this.joystickCycle());
  }

  watchElementsChange (force = false) {
    const screenTest = document.getElementById("screen-test");
    if (!screenTest) return;
    const bottom = screenTest.getBoundingClientRect().bottom;

    const eyes = [...document.getElementsByClassName(PageWatcher.CLASS)];
    const bounds = eyes.map((el) => el.getBoundingClientRect());
    if (!force) {
      const equals = bounds.length == this.elements.bounds.length && !bounds.map((b, index) => {
        const a = this.elements.bounds[index];

        return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
      }).includes(false);
      if (equals) return;
    }
    this.elements = {
      elements: eyes,
      bounds,
      bottom,
      id: uuid()
    };
    ipcRenderer.send("eye-elements", JSON.parse(JSON.stringify(this.elements)));
  }

  onKeyboard (code: string) {
    const joy = code.startsWith("joy");
    if ((!joy && !store.state.button.keyboardActivation) || (joy && !store.state.button.joystickActivation)) return;

    const elements = document.getElementsByClassName(PageWatcher.CLASS);
    const map = store.state.keyMapping;
    let action: Side | null = null;
    for (const key in map) {
      if (Object.prototype.hasOwnProperty.call(map, key)) {
        const element = map[key as Side];
        if (element.includes(code)) {
          action = key as Side;
          break;
        }
      }
    }
    if (action == null) return false;
    if (this.lastElement?.getBoundingClientRect().width == 0) {
      this.lastElement = undefined;
    }
    if (!this.lastElement && elements[0]) {
      this.lastElement = elements[0];
      const e = new CustomEvent("eye-enter", { detail: {} });
      this.lastElement.dispatchEvent(e);
      return true;
    }
    if (!this.lastElement) return true;

    if (action !== "enter") {
      if (!store.state.button.enabled) return;
      const next = this.findNear(elements, action);
      if (!next) return;
      let e = new CustomEvent("eye-exit", { detail: {} });
      this.lastElement.dispatchEvent(e);

      this.lastElement = next;

      e = new CustomEvent("eye-enter", { detail: {} });
      this.lastElement.dispatchEvent(e);
    } else {
      this.clickWatch(this.lastElement, false);
    }
    return true;
  }

  clickWatch (el: Element, eye: boolean) {
    if (!el.classList.contains("lock")) {
      if (eye && !store.state.button.eyeActivation) { return; }
      if (!eye && !store.state.button.keyboardActivation) { return; }
    }
    const e = new CustomEvent("click", { detail: {} });
    el?.dispatchEvent(e);
  }

  enterWatch (el: Element) {
    if (!el) return;
    if (!store.state.button.eyeSelect) return;
    this.lastElement = el;

    const e = new CustomEvent("eye-enter", {
      detail: {
        eye: true
      }
    });
    el.dispatchEvent(e);
  }

  exitWatch () {
    const e = new CustomEvent("eye-exit", {
      detail: {
        eye: true
      }
    });
    if (!store.state.button.eyeSelect) return;
    this.lastElement?.dispatchEvent(e);
    this.lastElement = undefined;
  }

  private findNear (elements: HTMLCollectionOf<Element>, where: Side, strict = false): Element | null {
    if (!this.lastElement) return null;
    const currentRect = this.lastElement.getBoundingClientRect();
    let distance = Number.MAX_VALUE;
    let next = this.lastElement;
    for (const element of elements) {
      if (this.lastElement == element) { continue; }
      const rect = element.getBoundingClientRect();

      const rx = rect.x + rect.width / 2;
      const ry = rect.y + rect.height / 2;

      const cx = currentRect.x + currentRect.width / 2;
      const cy = currentRect.y + currentRect.height / 2;

      switch (where) {
        case "left":
          if (rx >= cx) { continue; }
          break;
        case "right":
          if (rx <= cx) { continue; }
          break;
        case "up":
          if (ry >= cy) { continue; }
          break;
        case "down":
          if (ry <= cy) { continue; }
          break;
      }
      const v = where != "left" && where !== "right";
      const xCoof = v ? 1000 : 1;
      const yCoof = !v ? 1000 : 1;

      const d = getDistance({ x: rx * xCoof, y: ry * yCoof }, { x: cx * xCoof, y: cy * yCoof });
      if (d < distance) {
        distance = d;
        next = element;
      }
    }
    if (next == this.lastElement && !strict) {
      return this.findNear(elements, where, true)!;
    }
    return next;
  }
}

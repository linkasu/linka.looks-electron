import { PageWatcher } from "@linkasu/tobii-electron/renderer";
import { watchGazeGeometry } from "@/frontend/utils/watchGazeGeometry";

describe("gaze geometry after final layout", () => {
  let resized: () => void;
  let frames: Map<number, FrameRequestCallback>;
  let frameId: number;
  let stop: (() => void) | undefined;
  let watcher: PageWatcher | undefined;
  const observe = vi.fn();
  const disconnect = vi.fn();

  beforeEach(() => {
    observe.mockClear();
    disconnect.mockClear();
    frames = new Map();
    frameId = 0;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          resized = callback;
        }
        observe = observe;
        disconnect = disconnect;
      }
    );
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback: FrameRequestCallback) => {
        frames.set(++frameId, callback);
        return frameId;
      })
    );
    vi.stubGlobal(
      "cancelAnimationFrame",
      vi.fn((id: number) => frames.delete(id))
    );
    Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => [] });
  });

  afterEach(() => {
    stop?.();
    watcher?.destroy();
    stop = undefined;
    watcher = undefined;
    document.body.replaceChildren();
    Reflect.deleteProperty(navigator, "getGamepads");
    vi.unstubAllGlobals();
  });

  function flushFrame() {
    const pending = [...frames.values()];
    frames.clear();
    for (const callback of pending) callback(0);
  }

  it("refreshes on resize/style/class/hidden changes and batches each mutation burst", async () => {
    const watchElementsChange = vi.fn();
    const target = document.createElement("button");
    target.className = "eye";
    document.body.append(target);
    stop = watchGazeGeometry({ watchElementsChange });
    expect(observe).toHaveBeenCalledWith(document.documentElement);
    expect(observe).toHaveBeenCalledWith(target);
    resized();
    resized();
    expect(frames.size).toBe(1);
    flushFrame();
    expect(watchElementsChange).toHaveBeenCalledOnce();
    for (const change of [
      () => {
        target.style.height = "123px";
      },
      () => {
        target.classList.add("layout-wide");
      },
      () => {
        target.hidden = true;
      }
    ]) {
      change();
      await Promise.resolve();
      resized();
      expect(frames.size).toBe(1);
      flushFrame();
    }
    expect(watchElementsChange).toHaveBeenCalledTimes(4);
    resized();
    stop();
    expect(frames.size).toBe(0);
    expect(cancelAnimationFrame).toHaveBeenCalled();
    expect(disconnect).toHaveBeenCalled();
    target.style.width = "10px";
    await Promise.resolve();
    expect(frames.size).toBe(0);
  });

  it("observes newly mounted targets and releases removed targets", async () => {
    stop = watchGazeGeometry({ watchElementsChange: vi.fn() });
    flushFrame();
    const target = document.createElement("button");
    document.body.append(target);
    await Promise.resolve();
    target.className = "eye";
    await Promise.resolve();
    expect(observe).toHaveBeenCalledWith(target);
    flushFrame();
    observe.mockClear();
    disconnect.mockClear();
    target.remove();
    await Promise.resolve();
    expect(disconnect).toHaveBeenCalled();
    expect(observe).not.toHaveBeenCalledWith(target);
    expect(frames.size).toBe(1);
  });

  it("routes protocol events to a replacement target even when its bounds are identical", async () => {
    const oldTarget = document.createElement("button");
    oldTarget.className = "eye";
    const newTarget = oldTarget.cloneNode() as HTMLButtonElement;
    vi.spyOn(oldTarget, "getBoundingClientRect").mockReturnValue(new DOMRect(10, 20, 100, 50));
    vi.spyOn(newTarget, "getBoundingClientRect").mockReturnValue(new DOMRect(10, 20, 100, 50));
    const oldClick = vi.fn();
    const newClick = vi.fn();
    oldTarget.addEventListener("click", oldClick);
    newTarget.addEventListener("click", newClick);
    document.body.append(oldTarget);
    const on = vi.fn();
    const send = vi.fn();
    watcher = new PageWatcher({ ipcRenderer: { on, off: vi.fn(), send } });
    stop = watchGazeGeometry(watcher);
    flushFrame();
    const oldId = send.mock.calls.at(-1)![1].id;
    oldTarget.replaceWith(newTarget);
    await Promise.resolve();
    flushFrame();
    const payload = send.mock.calls.at(-1)![1];
    const click = on.mock.calls.find(([channel]) => channel === "eye-click")![1];
    expect(payload.id).not.toBe(oldId);
    click({}, { id: oldId, elementIndex: 0, count: 1 });
    expect(newClick).not.toHaveBeenCalled();
    expect(oldClick).not.toHaveBeenCalled();
    click({}, { id: payload.id, elementIndex: 0, count: 1 });
    expect(newClick).toHaveBeenCalledOnce();
    expect(oldClick).not.toHaveBeenCalled();
  });

  it("publishes final synthetic bounds on resize and invalidates targets removed by class", async () => {
    const target = document.createElement("button");
    target.className = "eye";
    const bounds = vi.spyOn(target, "getBoundingClientRect");
    bounds.mockReturnValue(new DOMRect(10, 20, 100, 50));
    document.body.append(target);
    const send = vi.fn();
    watcher = new PageWatcher({ ipcRenderer: { on: vi.fn(), off: vi.fn(), send } });
    stop = watchGazeGeometry(watcher);
    flushFrame();
    send.mockClear();
    bounds.mockReturnValue(new DOMRect(30, 40, 200, 80));
    resized();
    resized();
    flushFrame();
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0][1].bounds).toEqual([
      expect.objectContaining({ x: 30, y: 40, width: 200, height: 80 })
    ]);
    target.classList.remove("eye");
    await Promise.resolve();
    flushFrame();
    expect(send.mock.calls.at(-1)![1].bounds).toEqual([]);
    target.classList.add("eye");
    await Promise.resolve();
    flushFrame();
    expect(send.mock.calls.at(-1)![1].bounds).toHaveLength(1);
  });

  it("does not reattach resize observations for cosmetic mutations or force unchanged targets", async () => {
    const target = document.createElement("button");
    target.className = "eye";
    document.body.append(target);
    const watchElementsChange = vi.fn();
    stop = watchGazeGeometry({ watchElementsChange });
    flushFrame();
    observe.mockClear();
    disconnect.mockClear();
    watchElementsChange.mockClear();
    target.classList.add("hover");
    await Promise.resolve();
    flushFrame();
    expect(disconnect).not.toHaveBeenCalled();
    expect(observe).not.toHaveBeenCalled();
    expect(watchElementsChange).toHaveBeenCalledWith(false);
  });
});

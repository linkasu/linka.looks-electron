import { watchGazeGeometry } from "@/frontend/utils/watchGazeGeometry";

describe("gaze geometry after final layout", () => {
  it("refreshes on target resize and attribute layout changes, coalesces frames and cleans up", async () => {
    let resized: () => void = () => {};
    const observe = vi.fn();
    const disconnect = vi.fn();
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
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback: FrameRequestCallback) => frames.push(callback))
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const watchElementsChange = vi.fn();
    const target = document.createElement("button");
    target.className = "eye";
    document.body.append(target);
    const watcher = { watchElementsChange };
    const stop = watchGazeGeometry(watcher);
    try {
      expect(observe).toHaveBeenCalledWith(target);
      resized();
      resized();
      expect(frames).toHaveLength(1);
      frames.shift()!(0);
      expect(watchElementsChange).toHaveBeenCalledOnce();
      target.style.height = "123px";
      await Promise.resolve();
      expect(frames).toHaveLength(1);
      frames.shift()!(1);
      expect(watchElementsChange).toHaveBeenCalledTimes(2);
      resized();
    } finally {
      stop();
      target.remove();
      expect(cancelAnimationFrame).toHaveBeenCalled();
      expect(disconnect).toHaveBeenCalled();
      vi.unstubAllGlobals();
    }
  });
});

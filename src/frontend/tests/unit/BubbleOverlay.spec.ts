import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BubbleFrame } from "@/common/bubble/contract";

let tick: FrameRequestCallback;
let now: number;
let reply: (value: BubbleFrame) => void;
let nextFrame: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  vi.resetModules();
  now = 0;
  document.body.innerHTML =
    '<svg id="bubble" style="visibility:hidden"><circle id="fill"/><circle id="white"/><circle id="dark"/><circle id="center"/></svg>';
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    tick = callback;
    return 1;
  });
  nextFrame = vi.fn(
    () =>
      new Promise<BubbleFrame>((resolve) => {
        reply = resolve;
      })
  );
  window.bubbleOverlay = { nextFrame };
  await import("@/frontend/bubble/main");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("overlay frame lease", () => {
  const frame = { x: 100, y: 100, remainingMs: 300, diameter: 44, brightness: 65 };
  it("expires independently while main stops responding and never queues requests", async () => {
    tick(now);
    now = 20;
    reply(frame);
    await Promise.resolve();
    expect(document.getElementById("bubble")!.style.visibility).toBe("visible");
    now = 100;
    tick(now);
    now = 150;
    tick(now);
    expect(nextFrame).toHaveBeenCalledTimes(2);
    now = 301;
    tick(now);
    expect(document.getElementById("bubble")!.style.visibility).toBe("hidden");
    expect(nextFrame).toHaveBeenCalledTimes(2);
  });
  it("does not display a delayed response as fresh gaze", async () => {
    tick(now);
    now = 350;
    reply(frame);
    await Promise.resolve();
    expect(document.getElementById("bubble")!.style.visibility).toBe("hidden");
  });
});

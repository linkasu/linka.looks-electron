import { afterEach, describe, expect, it, vi } from "vitest";
import { GazePresentation } from "@/common/bubble/gazePresentation";
import { DEFAULT_BUBBLE_PREFERENCES } from "@/common/bubble/contract";
import type { BubbleFrame } from "@/common/bubble/contract";

const preferences = { ...DEFAULT_BUBBLE_PREFERENCES, enabled: true };
const bounds = { left: -1920, top: 100, width: 1920, height: 1080 };
const size = { width: 1280, height: 720 };
const sample = { x: -960, y: 640, sequence: 1, ageMs: 20 };

describe("gaze presentation", () => {
  it("converts physical coordinates to local DIP and charges sample age and request delay", () => {
    const gaze = new GazePresentation();
    gaze.record(sample, bounds, size, 40, 100);
    expect(gaze.frame(preferences, 150)).toEqual({
      x: 640,
      y: 360,
      remainingMs: 230,
      diameter: 44,
      brightness: 65
    });
    expect(gaze.frame(preferences, 380)).toBeNull();
    gaze.record({ ...sample, x: -1500, sequence: 2, ageMs: 0 }, bounds, size, 100, 400);
    expect(gaze.frame(preferences, 400)?.x).toBe(280);
  });

  it("does not extend a lease for duplicate or out-of-order samples", () => {
    const gaze = new GazePresentation();
    gaze.record(sample, bounds, size, 40, 100);
    gaze.record({ ...sample, ageMs: 0 }, bounds, size, 40, 350);
    gaze.record({ ...sample, sequence: 0, ageMs: 0 }, bounds, size, 40, 370);
    expect(gaze.frame(preferences, 380)).toBeNull();
    gaze.record(sample, bounds, size, 40, 500);
    expect(gaze.frame(preferences, 500)).toBeNull();
    gaze.reset();
    gaze.record(sample, bounds, size, 40, 500);
    expect(gaze.frame(preferences, 500)).not.toBeNull();
  });

  it.each([{ x: NaN }, { x: 0 }, { y: 1180 }, { ageMs: 300 }, { ageMs: -1 }])(
    "hides invalid/offscreen samples and restarts immediately after loss: %j",
    (invalid) => {
      const gaze = new GazePresentation();
      gaze.record(sample, bounds, size, 100, 100);
      gaze.record({ ...sample, ...invalid, sequence: 2 }, bounds, size, 100, 110);
      expect(gaze.frame(preferences, 110)).toBeNull();
      gaze.record({ ...sample, x: -1920, y: 100, sequence: 3 }, bounds, size, 100, 120);
      expect(gaze.frame(preferences, 120)?.x).toBe(0);
    }
  );

  it("uses time-based smoothing and resets when geometry changes", () => {
    const gaze = new GazePresentation();
    gaze.record(sample, bounds, size, 40, 100);
    gaze.record({ ...sample, x: -480, sequence: 2 }, bounds, size, 40, 200);
    expect(gaze.frame(preferences, 200)?.x).toBeCloseTo(640 + 320 * (1 - Math.exp(-0.1 / 0.085)));
    gaze.record({ ...sample, sequence: 3 }, bounds, { width: 640, height: 360 }, 100, 210);
    expect(gaze.frame(preferences, 210)?.x).toBe(320);
    expect(gaze.frame({ ...preferences, enabled: false }, 210)).toBeNull();
  });

  it("invalidates the old geometry even if the backend repeats its last sequence", () => {
    const gaze = new GazePresentation();
    gaze.record(sample, bounds, size, 40, 100);
    gaze.record(sample, bounds, { width: 640, height: 360 }, 40, 110);
    expect(gaze.frame(preferences, 110)).toBeNull();
    gaze.record({ ...sample, sequence: 2 }, bounds, { width: 640, height: 360 }, 40, 120);
    expect(gaze.frame(preferences, 120)?.x).toBe(320);
  });
});

describe("isolated bubble renderer", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("subtracts the full request round trip, expires without another response, and limits concurrency", async () => {
    vi.resetModules();
    document.body.innerHTML =
      '<svg id="bubble" style="visibility:hidden"><circle id="fill" /><circle id="white" /><circle id="dark" /><circle id="center" /></svg>';
    let now = 100;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    let tick!: FrameRequestCallback;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      tick = callback;
      return 1;
    });
    let resolve!: (frame: BubbleFrame) => void;
    const nextFrame = vi.fn(
      () =>
        new Promise<BubbleFrame>((done) => {
          resolve = done;
        })
    );
    window.bubbleOverlay = { nextFrame };
    await import("@/frontend/bubble/main");
    tick(now);
    tick(130);
    expect(nextFrame).toHaveBeenCalledTimes(1);
    now = 200;
    resolve({ x: 100, y: 80, remainingMs: 150, diameter: 44, brightness: 65 });
    await Promise.resolve();
    const bubble = document.getElementById("bubble")!;
    expect(bubble.style.visibility).toBe("visible");
    now = 249;
    tick(now);
    expect(bubble.style.visibility).toBe("visible");
    now = 250;
    tick(now);
    expect(bubble.style.visibility).toBe("hidden");
    expect(nextFrame).toHaveBeenCalledTimes(2);
    now = 450;
    resolve({ x: 100, y: 80, remainingMs: 150, diameter: 44, brightness: 65 });
    await Promise.resolve();
    expect(bubble.style.visibility).toBe("hidden");
  });
});

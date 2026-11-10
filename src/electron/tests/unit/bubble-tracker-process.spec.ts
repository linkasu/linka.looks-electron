import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BubbleTrackerProcess } from "../../bubble/trackerProcess";

const mocks = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn: mocks.spawn }));

function child() {
  const process = new EventEmitter() as EventEmitter & {
    stdout: PassThrough;
    stderr: PassThrough;
    stdin: Writable;
    kill: ReturnType<typeof vi.fn>;
  };
  process.stdout = new PassThrough();
  process.stderr = new PassThrough();
  process.stdin = new Writable({
    write(_data, _encoding, done) {
      done();
    }
  });
  process.kill = vi.fn(() => {
    process.emit("close", 0);
    return true;
  });
  mocks.spawn.mockReturnValue(process);
  return process;
}

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("owned Bubble backend", () => {
  it("frames partial responses, bounds sample age and allows only one pending sample", async () => {
    const process = child();
    const tracker = new BubbleTrackerProcess("owned.exe", vi.fn());
    const request = tracker.request("getLatest");
    await expect(tracker.request("getLatest")).rejects.toThrow("BACKEND_NOT_READY");
    const response = JSON.stringify({
      id: 1,
      protocol: 1,
      status: "tracking",
      errorCode: null,
      sample: { x: 5, y: 6, sequence: 1, ageMs: 10 },
      bounds: { left: 0, top: 0, width: 100, height: 100 }
    });
    process.stdout.write(response.slice(0, 10));
    process.stdout.write(response.slice(10) + "\n");
    expect((await request).sample!.ageMs).toBeGreaterThanOrEqual(10);
    const stop = tracker.stop();
    process.emit("close", 0);
    await stop;
  });

  it("terminates only its child on oversized or invalid samples", async () => {
    const process = child();
    const tracker = new BubbleTrackerProcess("owned.exe", vi.fn());
    const request = tracker.request("hello");
    process.stdout.write("x".repeat(16385));
    await expect(request).rejects.toThrow("BACKEND_PROTOCOL_ERROR");
    expect(process.kill).toHaveBeenCalledTimes(1);
    await tracker.stop();
  });

  it("awaits shutdown and kills a hung owned backend after its graceful deadline", async () => {
    vi.useFakeTimers();
    const process = child();
    const exited = vi.fn();
    const tracker = new BubbleTrackerProcess("owned.exe", exited);
    const stop = tracker.stop();
    expect(process.kill).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2000);
    await stop;
    expect(process.kill).toHaveBeenCalledTimes(1);
    expect(exited).not.toHaveBeenCalled();
  });
});

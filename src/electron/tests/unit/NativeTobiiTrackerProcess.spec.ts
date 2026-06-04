import { expect } from "chai";
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import { join } from "path";
import { NativeTobiiTrackerProcess } from "@/electron/tobii/NativeTobiiTrackerProcess";

type NativeEvent =
  | { type: "ready" }
  | { type: "enter", index: number }
  | { type: "exit" }
  | { type: "click", index: number, count: number }
  | {
    type: "debug",
    state: {
      raw: { x: number, y: number },
      normalized: { x: number, y: number },
      screen: { x: number, y: number },
      screenRect: { x: number, y: number, width: number, height: number },
      boundsCount: number,
      hitIndex: number,
      softwareCalibration: boolean
    }
  }
  | { type: "error", code: string, message: string };

class FakeNativeTobiiTracker {
  static instances: FakeNativeTobiiTracker[] = [];

  start = vi.fn(async () => {
    this.listener({ type: "ready" });
  });
  stop = vi.fn();
  destroy = vi.fn();
  setBounds = vi.fn();
  setTimeout = vi.fn();
  setScaleFactor = vi.fn();
  setScreenRect = vi.fn();
  setDebugEnabled = vi.fn();
  startCalibration = vi.fn(async () => undefined);
  addCalibrationPoint = vi.fn(async () => undefined);
  finishCalibration = vi.fn(async () => Buffer.from("calibration"));
  applyCalibration = vi.fn(async () => undefined);

  constructor (private readonly listener: (event: NativeEvent) => void) {
    FakeNativeTobiiTracker.instances.push(this);
  }

  emit (event: NativeEvent) {
    this.listener(event);
  }
}

const nativeModule = {
  NativeTobiiTracker: FakeNativeTobiiTracker
};

const userDataPath = "/tmp/linka-look-tests";
const calibrationPath = join(userDataPath, "tobiifree-native-calibration.bin");

describe("NativeTobiiTrackerProcess", () => {
  beforeEach(async () => {
    FakeNativeTobiiTracker.instances = [];
    await rm(calibrationPath, { force: true });
  });

  afterEach(async () => {
    await rm(calibrationPath, { force: true });
  });

  it("forwards native gaze events through EyeTrackerProcess events", () => {
    const process = new NativeTobiiTrackerProcess(nativeModule);
    const tracker = FakeNativeTobiiTracker.instances[0];
    const events: Array<string | number> = [];

    process.on("enter", (index) => events.push("enter", index));
    process.on("exit", () => events.push("exit"));
    process.on("click", (index, count) => events.push("click", index, count));
    process.on("debug", (state) => events.push("debug", state.hitIndex));

    tracker.emit({ type: "enter", index: 2 });
    tracker.emit({ type: "click", index: 2, count: 1 });
    tracker.emit({
      type: "debug",
      state: {
        raw: { x: 0.5, y: 0.5 },
        normalized: { x: 0.5, y: 0.5 },
        screen: { x: 50, y: 50 },
        screenRect: { x: 0, y: 0, width: 100, height: 100 },
        boundsCount: 1,
        hitIndex: 2,
        softwareCalibration: false
      }
    });
    tracker.emit({ type: "exit" });

    expect(events).to.deep.equal(["enter", 2, "click", 2, 1, "debug", 2, "exit"]);
  });

  it("passes bounds and settings to the native tracker", () => {
    const process = new NativeTobiiTrackerProcess(nativeModule);
    const tracker = FakeNativeTobiiTracker.instances[0];
    const bounds = [{ x: 1, y: 2, width: 3, height: 4 }];

    process.setBounds(bounds);
    process.setTimeout(1500);
    process.setScaleFactor(2);
    process.setScreenRect(10, 20, 300, 400);
    process.setDebugEnabled(true);

    expect(tracker.setBounds.mock.calls[0]).to.deep.equal([bounds]);
    expect(tracker.setTimeout.mock.calls[0]).to.deep.equal([1500]);
    expect(tracker.setScaleFactor.mock.calls[0]).to.deep.equal([2]);
    expect(tracker.setScreenRect.mock.calls[0]).to.deep.equal([10, 20, 300, 400]);
    expect(tracker.setDebugEnabled.mock.calls[0]).to.deep.equal([true]);
  });

  it("stores and applies native calibration blobs", async () => {
    const process = new NativeTobiiTrackerProcess(nativeModule);
    const tracker = FakeNativeTobiiTracker.instances[0];

    await process.finishCalibration();
    expect(await readFile(calibrationPath, "utf8")).to.equal("calibration");

    const applied = await process.applySavedCalibration();
    expect(applied).to.equal(true);
    expect(tracker.applyCalibration.mock.calls).to.have.length(1);
    const applyCalibrationCalls = tracker.applyCalibration.mock.calls as unknown as [[Buffer]];
    expect(applyCalibrationCalls[0][0].toString()).to.equal("calibration");
  });

  it("returns false when saved native calibration is absent", async () => {
    await mkdir(userDataPath, { recursive: true });
    await writeFile(calibrationPath, "old");
    await rm(calibrationPath, { force: true });

    const process = new NativeTobiiTrackerProcess(nativeModule);

    expect(await process.applySavedCalibration()).to.equal(false);
  });
});

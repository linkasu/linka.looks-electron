import { EventEmitter } from "events";
import { app } from "electron";
import { mkdir, readFile, writeFile } from "fs/promises";
import { createRequire } from "module";
import { join } from "path";
import type { EyeTrackerBound, EyeTrackerDebugState, EyeTrackerProcess } from "./EyeTrackerProcess";

const requireNative = createRequire(__filename);

type NativeTobiiRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type NativeTobiiEvent =
  | { type: "ready" }
  | { type: "enter", index: number }
  | { type: "exit" }
  | { type: "click", index: number, count: number }
  | { type: "debug", state: EyeTrackerDebugState }
  | { type: "error", code: string, message: string };

type NativeTobiiTracker = {
  start(): Promise<void>;
  stop(): void;
  destroy(): void;
  setBounds(bounds: NativeTobiiRect[]): void;
  setTimeout(valueMs: number): void;
  setScaleFactor(value: number): void;
  setScreenRect(x: number, y: number, width: number, height: number): void;
  setDebugEnabled(value: boolean): void;
  startCalibration(): Promise<void>;
  addCalibrationPoint(x: number, y: number): Promise<void>;
  finishCalibration(): Promise<Buffer>;
  applyCalibration(blob: Buffer): Promise<void>;
};

type NativeTobiiModule = {
  NativeTobiiTracker: new (listener: (event: NativeTobiiEvent) => void) => NativeTobiiTracker;
};

type NativeTobiiEvents = {
  enter: [index: number];
  exit: [];
  click: [index: number, count: number];
  debug: [state: EyeTrackerDebugState];
};

type NativeTobiiEventName = keyof NativeTobiiEvents;

export class NativeTobiiTrackerProcess extends EventEmitter implements EyeTrackerProcess {
  private readonly tracker: NativeTobiiTracker;
  private readonly calibrationPath = join(app.getPath("userData"), "tobiifree-native-calibration.bin");

  constructor (nativeModule = loadNativeTobiiModule()) {
    super();

    this.tracker = new nativeModule.NativeTobiiTracker((event) => this.onNativeEvent(event));
  }

  on<K extends NativeTobiiEventName> (event: K, listener: (...args: NativeTobiiEvents[K]) => void): this {
    return super.on(event, listener);
  }

  emit<K extends NativeTobiiEventName> (event: K, ...args: NativeTobiiEvents[K]): boolean {
    return super.emit(event, ...args);
  }

  async initialize () {
    await this.tracker.start();
    await this.applySavedCalibration();
  }

  setBounds (bounds: EyeTrackerBound[]) {
    this.tracker.setBounds(bounds);
  }

  setTimeout (value: number) {
    this.tracker.setTimeout(value);
  }

  setScaleFactor (value: number) {
    this.tracker.setScaleFactor(value);
  }

  setScreenRect (x: number, y: number, width: number, height: number) {
    this.tracker.setScreenRect(x, y, width, height);
  }

  setDebugEnabled (value: boolean) {
    this.tracker.setDebugEnabled(value);
  }

  async startCalibration () {
    await this.tracker.startCalibration();
  }

  async addCalibrationPoint (x: number, y: number) {
    await this.tracker.addCalibrationPoint(x, y);
  }

  async finishCalibration () {
    const blob = await this.tracker.finishCalibration();
    await mkdir(app.getPath("userData"), { recursive: true });
    await writeFile(this.calibrationPath, blob);
  }

  async applySavedCalibration () {
    try {
      const blob = await readFile(this.calibrationPath);
      await this.tracker.applyCalibration(blob);
      return true;
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
      console.warn("[tobiifree-native] could not apply saved calibration", error);
      return false;
    }
  }

  destroy () {
    this.tracker.destroy();
  }

  private onNativeEvent (event: NativeTobiiEvent) {
    if (event.type === "ready") return;
    if (event.type === "enter") {
      this.emit("enter", event.index);
      return;
    }
    if (event.type === "exit") {
      this.emit("exit");
      return;
    }
    if (event.type === "click") {
      this.emit("click", event.index, event.count);
      return;
    }
    if (event.type === "debug") {
      this.emit("debug", event.state);
      return;
    }
    console.warn("[tobiifree-native]", event);
  }
}

function loadNativeTobiiModule (): NativeTobiiModule {
  // createRequire keeps Windows/Linux builds from resolving the macOS-only optional dependency at bundle time.
  return requireNative("@linka/tobiifree-native") as NativeTobiiModule;
}

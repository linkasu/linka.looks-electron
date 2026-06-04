import { EventEmitter } from "events";
import { app, screen } from "electron";
import { spawn, type ChildProcessByStdio } from "child_process";
import { mkdir, readFile, writeFile } from "fs/promises";
import { join } from "path";
import type { Readable, Writable } from "stream";
import { resolveExtraResource } from "@/electron/utils/resolveExtraResource";
import type { EyeTrackerBound, EyeTrackerProcess } from "./EyeTrackerProcess";

type TobiiHelperProcess = ChildProcessByStdio<Writable, Readable, Readable>;
type PendingRequest = {
  resolve: (value?: string) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};
type HelperResponse = {
  type?: string;
  id?: number;
  ok?: boolean;
  error?: string;
  blobBase64?: string;
};

type GazePoint = {
  x: number;
  y: number;
};

type RecentGazePoint = GazePoint & {
  time: number;
};

type SoftwareCalibrationSample = {
  raw: GazePoint;
  target: GazePoint;
};

type SoftwareCalibrationAxis = {
  a: number;
  b: number;
};

type SoftwareCalibration = {
  version: 2;
  x: SoftwareCalibrationAxis;
  y: SoftwareCalibrationAxis;
  samples: SoftwareCalibrationSample[];
};

type TobiiFreeEvents = {
  enter: [index: number];
  exit: [];
  click: [index: number, count: number];
};

type TobiiFreeEventName = keyof TobiiFreeEvents;

export class TobiiFreeTrackerProcess extends EventEmitter implements EyeTrackerProcess {
  private process?: TobiiHelperProcess;
  private helperReady = false;
  private readonly helperReadyPromise: Promise<void>;
  private resolveHelperReady!: () => void;
  private rejectHelperReady!: (error: Error) => void;
  private buffer = "";
  private bounds: EyeTrackerBound[] = [];
  private screenRect = { x: 0, y: 0, width: 1, height: 1 };
  private timeout = 1000;
  private scaleFactor = 1;
  private readonly extraOffsetX = Number(process.env.TOBIIFREE_GAZE_OFFSET_X || 0);
  private readonly extraOffsetY = Number(process.env.TOBIIFREE_GAZE_OFFSET_Y || 0);
  private currentIndex?: number;
  private enteredAt = 0;
  private clicked = false;
  private requestId = 1;
  private gazeSamples = 0;
  private boundsLogged = false;
  private displayLogged = false;
  private pending = new Map<number, PendingRequest>();
  private readonly calibrationPath = join(app.getPath("userData"), "tobiifree-calibration.bin");
  private readonly softwareCalibrationPath = join(app.getPath("userData"), "tobiifree-software-calibration.json");
  private softwareCalibration?: SoftwareCalibration;
  private calibrationSamples: SoftwareCalibrationSample[] = [];
  private recentGazePoints: RecentGazePoint[] = [];

  constructor () {
    super();
    this.helperReadyPromise = new Promise((resolve, reject) => {
      this.resolveHelperReady = resolve;
      this.rejectHelperReady = reject;
    });
    this.startHelper();
  }

  on<K extends TobiiFreeEventName> (event: K, listener: (...args: TobiiFreeEvents[K]) => void): this {
    return super.on(event, listener);
  }

  emit<K extends TobiiFreeEventName> (event: K, ...args: TobiiFreeEvents[K]): boolean {
    return super.emit(event, ...args);
  }

  setBounds (bounds: EyeTrackerBound[]) {
    this.bounds = bounds;
    if (!this.boundsLogged) {
      this.boundsLogged = true;
      console.warn("[tobiifree-helper] bounds received", { count: bounds.length });
    }
  }

  setTimeout (value: number) {
    this.timeout = value;
  }

  setScaleFactor (value: number) {
    this.scaleFactor = value;
  }

  setScreenRect (x: number, y: number, width: number, height: number) {
    this.screenRect = { x, y, width, height };
    this.displayLogged = false;
  }

  async initialize () {
    await this.waitForHelperReady(15000);
  }

  destroy () {
    this.resetTarget(true);
    for (const [, request] of this.pending) {
      clearTimeout(request.timer);
      request.reject(new Error("TobiiFree helper stopped"));
    }
    this.pending.clear();
    this.rejectHelperReady(new Error("TobiiFree helper stopped"));
    this.process?.kill();
    this.process = undefined;
  }

  async startCalibration () {
    this.requireDirectUsbCalibration();
    this.resetTarget(true);
    this.calibrationSamples = [];
    this.softwareCalibration = undefined;
    await this.sendCommand("calibration.start");
  }

  async addCalibrationPoint (x: number, y: number) {
    this.requireDirectUsbCalibration();
    this.rememberSoftwareCalibrationPoint({ x, y });
    await this.sendCommand("calibration.addPoint", { x, y });
  }

  async finishCalibration () {
    this.requireDirectUsbCalibration();
    const blobBase64 = await this.sendCommand("calibration.finish", undefined, 30000);
    if (!blobBase64) return;
    await mkdir(app.getPath("userData"), { recursive: true });
    await writeFile(this.calibrationPath, Buffer.from(blobBase64, "base64"));
    await this.saveSoftwareCalibration();
  }

  async applySavedCalibration () {
    this.requireDirectUsbCalibration();
    try {
      const blob = await readFile(this.calibrationPath);
      await this.sendCommand("calibration.apply", { blobBase64: blob.toString("base64") }, 15000);
      await this.loadSoftwareCalibration();
      return true;
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
      console.warn("[tobiifree-helper] could not apply saved calibration", error);
      return false;
    }
  }

  private startHelper () {
    const helperPath = app.isPackaged
      ? resolveExtraResource("bin", "tobiifree-helper", "index.mjs")
      : join(__dirname, "..", "tools", "tobiifree-helper", "index.mjs");

    const command = process.env.TOBIIFREE_HELPER_COMMAND || "node";
    const args = process.env.TOBIIFREE_HELPER_COMMAND ? [] : [helperPath];

    this.process = spawn(command, args, {
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"]
    });

    this.process.stdout.on("data", (chunk) => this.onStdout(chunk.toString()));
    this.process.stderr.on("data", (chunk) => console.warn("[tobiifree-helper]", chunk.toString().trim()));
    this.process.on("error", (error) => {
      this.rejectHelperReady(error);
      console.warn("[tobiifree-helper] failed to start", error);
    });
    this.process.on("exit", (code, signal) => {
      this.resetTarget(true);
      this.rejectHelperReady(new Error("TobiiFree helper exited before becoming ready. Check that the local TobiiFree SDK is available and Tobii Eye Tracker is connected."));
      for (const [, request] of this.pending) {
        clearTimeout(request.timer);
        request.reject(new Error("TobiiFree helper exited"));
      }
      this.pending.clear();
      console.warn("[tobiifree-helper] exited", { code, signal });
    });
  }

  private onStdout (data: string) {
    this.buffer += data;
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop() || "";

    for (const line of lines) {
      this.onLine(line.trim());
    }
  }

  private onLine (line: string) {
    if (!line) return;
    if (line === "ready") {
      this.helperReady = true;
      this.resolveHelperReady();
      void this.applySavedCalibration().catch((error) => console.warn("[tobiifree-helper] could not auto-apply saved calibration", error));
      return;
    }
    if (line === "invalid") {
      this.resetTarget();
      return;
    }
    if (line.startsWith("{")) {
      this.onJsonLine(line);
      return;
    }
    if (line.startsWith("gaze:")) {
      this.onGaze(line.slice("gaze:".length));
      return;
    }
    if (line.startsWith("error:")) {
      console.warn("[tobiifree-helper]", line);
    }
  }

  private onJsonLine (line: string) {
    let response: HelperResponse;
    try {
      response = JSON.parse(line) as HelperResponse;
    } catch {
      console.warn("[tobiifree-helper] invalid json", line);
      return;
    }
    if (response.type !== "response" || response.id === undefined) return;
    const pending = this.pending.get(response.id);
    if (!pending) return;
    this.pending.delete(response.id);
    clearTimeout(pending.timer);
    if (response.ok) {
      pending.resolve(response.blobBase64);
      return;
    }
    pending.reject(new Error(response.error || "TobiiFree helper command failed"));
  }

  private sendCommand (command: string, payload: Record<string, unknown> = {}, timeoutMs = 10000) {
    return this.waitForHelperReady(timeoutMs).then(() => {
      if (!this.process || this.process.stdin.destroyed || !this.process.stdin.writable) {
        return Promise.reject(new Error("TobiiFree helper is not running"));
      }

      const id = this.requestId++;
      const message = JSON.stringify({ id, command, ...payload }) + "\n";
      return new Promise<string | undefined>((resolve, reject) => {
        const timer = setTimeout(() => {
          this.pending.delete(id);
          reject(new Error(`TobiiFree helper command timed out: ${command}`));
        }, timeoutMs);
        this.pending.set(id, { resolve, reject, timer });
        this.process?.stdin.write(message, (error) => {
          if (!error) return;
          this.pending.delete(id);
          clearTimeout(timer);
          reject(error);
        });
      });
    });
  }

  private waitForHelperReady (timeoutMs: number) {
    if (this.helperReady) return Promise.resolve();
    return Promise.race([
      this.helperReadyPromise,
      new Promise<void>((resolve, reject) => {
        setTimeout(() => reject(new Error("TobiiFree helper is not ready. Check that Tobii Eye Tracker is connected and available.")), timeoutMs);
      })
    ]);
  }

  private requireDirectUsbCalibration () {
    if (!process.env.TOBIIFREE_DAEMON_URL) return;
    throw new Error("Калибровка Tobii недоступна в daemon-режиме. Перезапустите приложение без TOBIIFREE_DAEMON_URL, чтобы helper подключился к устройству напрямую по USB.");
  }

  private onGaze (payload: string) {
    const [x, y] = payload.split(",").map(Number);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      this.resetTarget();
      return;
    }

    const rawPoint = { x, y };
    this.rememberRecentGazePoint(rawPoint);
    const calibratedPoint = this.applySoftwareCalibration(rawPoint);
    const normalizedPoint = {
      x: this.clamp01(calibratedPoint.x),
      y: this.clamp01(calibratedPoint.y)
    };
    const point = this.toScreenPoint(normalizedPoint.x, normalizedPoint.y);
    const index = this.bounds.findIndex((bound) => {
      return point.x >= bound.x && point.x <= bound.x + bound.width &&
        point.y >= bound.y && point.y <= bound.y + bound.height;
    });
    this.gazeSamples += 1;
    if (this.gazeSamples === 1 || this.gazeSamples % 120 === 0) {
      console.warn("[tobiifree-helper] gaze sample", {
        raw: rawPoint,
        normalized: normalizedPoint,
        screen: point,
        bounds: this.bounds.length,
        index,
        softwareCalibration: this.softwareCalibration
      });
    }

    if (index < 0) {
      this.resetTarget();
      return;
    }

    this.enterTarget(index);
    this.clickIfReady(index);
  }

  private toScreenPoint (x: number, y: number) {
    const display = screen.getPrimaryDisplay();
    if (!this.displayLogged) {
      this.displayLogged = true;
      console.warn("[tobiifree-helper] display metrics", {
        bounds: display.bounds,
        workArea: display.workArea,
        scaleFactor: display.scaleFactor,
        screenRect: this.screenRect,
        extraOffset: { x: this.extraOffsetX, y: this.extraOffsetY }
      });
    }
    return {
      x: Math.round((this.screenRect.x + x * this.screenRect.width + this.extraOffsetX) * this.scaleFactor),
      y: Math.round((this.screenRect.y + y * this.screenRect.height + this.extraOffsetY) * this.scaleFactor)
    };
  }

  private rememberRecentGazePoint (point: GazePoint) {
    this.recentGazePoints.push({ ...point, time: Date.now() });
    if (this.recentGazePoints.length > 90) this.recentGazePoints.shift();
  }

  private rememberSoftwareCalibrationPoint (target: GazePoint) {
    const now = Date.now();
    const samples = this.recentGazePoints.filter((point) => now - point.time < 1200);
    if (samples.length === 0) {
      console.warn("[tobiifree-helper] no recent gaze samples for software calibration", { target });
      return;
    }
    const raw = samples.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), { x: 0, y: 0 });
    raw.x /= samples.length;
    raw.y /= samples.length;
    this.calibrationSamples.push({ raw, target });
    console.warn("[tobiifree-helper] software calibration point", { raw, target, samples: samples.length });
  }

  private async saveSoftwareCalibration () {
    if (this.calibrationSamples.length < 2) {
      console.warn("[tobiifree-helper] not enough software calibration points", { count: this.calibrationSamples.length });
      return;
    }
    const calibration = this.fitSoftwareCalibration(this.calibrationSamples);
    this.softwareCalibration = calibration;
    await mkdir(app.getPath("userData"), { recursive: true });
    await writeFile(this.softwareCalibrationPath, JSON.stringify(calibration, undefined, 2));
    console.warn("[tobiifree-helper] software calibration saved", calibration);
  }

  private async loadSoftwareCalibration () {
    try {
      const calibration = JSON.parse(await readFile(this.softwareCalibrationPath, "utf8")) as Partial<SoftwareCalibration>;
      if (calibration.version !== 2 || !calibration.x || !calibration.y || !calibration.samples) {
        console.warn("[tobiifree-helper] ignoring old software calibration", calibration);
        this.softwareCalibration = undefined;
        return;
      }
      this.softwareCalibration = calibration as SoftwareCalibration;
      console.warn("[tobiifree-helper] software calibration loaded", this.softwareCalibration);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
      console.warn("[tobiifree-helper] could not load software calibration", error);
    }
  }

  private fitSoftwareCalibration (samples: SoftwareCalibrationSample[]): SoftwareCalibration {
    return {
      version: 2,
      x: this.fitAxis(samples.map((sample) => ({ raw: sample.raw.x, target: sample.target.x }))),
      y: this.fitAxis(samples.map((sample) => ({ raw: sample.raw.y, target: sample.target.y }))),
      samples
    };
  }

  private fitAxis (samples: Array<{ raw: number, target: number }>): SoftwareCalibrationAxis {
    const rawMean = samples.reduce((sum, sample) => sum + sample.raw, 0) / samples.length;
    const targetMean = samples.reduce((sum, sample) => sum + sample.target, 0) / samples.length;
    const variance = samples.reduce((sum, sample) => sum + Math.pow(sample.raw - rawMean, 2), 0);
    if (variance === 0) return { a: 1, b: 0 };
    const covariance = samples.reduce((sum, sample) => sum + (sample.raw - rawMean) * (sample.target - targetMean), 0);
    const a = covariance / variance;
    return { a, b: targetMean - a * rawMean };
  }

  private applySoftwareCalibration (point: GazePoint): GazePoint {
    if (!this.softwareCalibration) return point;
    return {
      x: this.softwareCalibration.x.a * point.x + this.softwareCalibration.x.b,
      y: this.softwareCalibration.y.a * point.y + this.softwareCalibration.y.b
    };
  }

  private clamp01 (value: number) {
    return Math.max(0, Math.min(1, value));
  }

  private enterTarget (index: number) {
    if (this.currentIndex === index) return;
    this.resetTarget();
    this.currentIndex = index;
    this.enteredAt = Date.now();
    this.clicked = false;
    console.warn("[tobiifree-helper] enter", { index });
    this.emit("enter", index);
  }

  private clickIfReady (index: number) {
    if (this.clicked) return;
    if (Date.now() - this.enteredAt < this.timeout) return;
    this.clicked = true;
    console.warn("[tobiifree-helper] click", { index });
    this.emit("click", index, 1);
  }

  private resetTarget (silent = false) {
    if (this.currentIndex === undefined) return;
    this.currentIndex = undefined;
    this.enteredAt = 0;
    this.clicked = false;
    if (!silent) this.emit("exit");
  }
}

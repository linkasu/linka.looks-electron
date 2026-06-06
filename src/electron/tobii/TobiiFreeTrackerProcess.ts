import { EventEmitter } from "events";
import { app, screen } from "electron";
import { spawn, type ChildProcess } from "child_process";
import { Socket } from "net";
import { tmpdir } from "os";
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import { join } from "path";
import { resolveExtraResource } from "@/electron/utils/resolveExtraResource";
import type { EyeTrackerBound, EyeTrackerDebugState, EyeTrackerProcess, TobiiStatus } from "./EyeTrackerProcess";

type PendingRequest = {
  resolve: (value?: string) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};
type PendingReady = {
  resolve: () => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};
type HelperResponse = {
  type?: "response";
  id?: number;
  ok?: boolean;
  error?: string;
  blobBase64?: string;
  status?: TobiiStatus;
};
type HelperStatusMessage = TobiiStatus & { type: "status" };
type HelperGazeMessage = { type: "gaze", x: number, y: number, timestamp?: number };
type HelperInvalidMessage = { type: "invalid" };
type HelperDiagnosticMessage = { type: "diagnostic", level?: string, message?: string, data?: unknown };
type HelperMessage = HelperResponse | HelperStatusMessage | HelperGazeMessage | HelperInvalidMessage | HelperDiagnosticMessage;

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
  debug: [state: EyeTrackerDebugState];
  status: [status: TobiiStatus];
};

type TobiiFreeEventName = keyof TobiiFreeEvents;

const SERVICE_START_COOLDOWN_MS = 2000;
const SERVICE_RECONNECT_MAX_MS = 5000;

export class TobiiFreeTrackerProcess extends EventEmitter implements EyeTrackerProcess {
  private process?: ChildProcess;
  private socket?: Socket;
  private helperReady = false;
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
  private lastDebugAt = 0;
  private debugEnabled = false;
  private boundsLogged = false;
  private displayLogged = false;
  private destroyed = false;
  private reconnectAttempt = 0;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private lastServiceStartAt = 0;
  private lastAutoApplyAt = 0;
  private pending = new Map<number, PendingRequest>();
  private readyWaiters: PendingReady[] = [];
  private readonly socketPath = process.env.TOBIIFREE_SERVICE_SOCKET || join(tmpdir(), `su.linka.looks.tobiifree.${typeof process.getuid === "function" ? process.getuid() : "user"}.sock`);
  private readonly calibrationPath = join(app.getPath("userData"), "tobiifree-calibration.bin");
  private readonly softwareCalibrationPath = join(app.getPath("userData"), "tobiifree-software-calibration.json");
  private softwareCalibration?: SoftwareCalibration;
  private calibrationSamples: SoftwareCalibrationSample[] = [];
  private recentGazePoints: RecentGazePoint[] = [];
  private status: TobiiStatus = {
    state: "service_starting",
    mode: "socket-service",
    message: "Запуск службы Tobii",
    socketPath: this.socketPath,
    deviceFound: false,
    updatedAt: Date.now()
  };

  constructor () {
    super();
    this.connectToService();
  }

  on<K extends TobiiFreeEventName> (event: K, listener: (...args: TobiiFreeEvents[K]) => void): this {
    return super.on(event, listener);
  }

  emit<K extends TobiiFreeEventName> (event: K, ...args: TobiiFreeEvents[K]): boolean {
    return super.emit(event, ...args);
  }

  getStatus () {
    return this.status;
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

  setDebugEnabled (value: boolean) {
    this.debugEnabled = value;
  }

  async initialize () {
    await this.waitForHelperReady(15000);
  }

  destroy () {
    this.destroyed = true;
    this.resetTarget(true);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.socket?.destroy();
    this.socket = undefined;
    for (const [, request] of this.pending) {
      clearTimeout(request.timer);
      request.reject(new Error("TobiiFree helper stopped"));
    }
    this.pending.clear();
    for (const waiter of this.readyWaiters) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error("TobiiFree helper stopped"));
    }
    this.readyWaiters = [];
  }

  async startCalibration () {
    this.resetTarget(true);
    this.calibrationSamples = [];
    await this.sendCommand("calibration.start");
  }

  async addCalibrationPoint (x: number, y: number) {
    this.rememberSoftwareCalibrationPoint({ x, y });
    await this.sendCommand("calibration.addPoint", { x, y });
  }

  async finishCalibration () {
    const blobBase64 = await this.sendCommand("calibration.finish", undefined, 30000);
    if (!blobBase64) return;
    await mkdir(app.getPath("userData"), { recursive: true });
    await writeFile(this.calibrationPath, Buffer.from(blobBase64, "base64"));
    await this.saveSoftwareCalibration();
  }

  async applySavedCalibration () {
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

  restartService () {
    this.socket?.destroy();
    this.helperReady = false;
    this.rejectPending(new Error("Tobii service restart requested"));
    this.startService(true);
    this.scheduleReconnect("restart requested");
  }

  private connectToService () {
    if (this.destroyed) return;
    this.socket?.destroy();
    this.buffer = "";
    let connected = false;
    const socket = new Socket();
    this.socket = socket;
    this.updateStatus({
      state: this.reconnectAttempt > 0 ? "reconnecting" : "connecting",
      message: this.reconnectAttempt > 0 ? "Переподключение к службе Tobii" : "Подключение к службе Tobii",
      reconnectAttempt: this.reconnectAttempt,
      deviceFound: false
    });
    socket.setEncoding("utf8");
    socket.on("connect", () => {
      connected = true;
      this.helperReady = true;
      this.reconnectAttempt = 0;
      this.resolveReadyWaiters();
      this.updateStatus({ state: "connecting", message: "Служба Tobii подключена", deviceFound: false });
      this.writeSocketCommand({ command: "subscribe.gaze" });
      this.writeSocketCommand({ command: "status.get" });
    });
    socket.on("data", (chunk) => this.onSocketData(chunk.toString()));
    socket.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ECONNREFUSED") {
        void rm(this.socketPath, { force: true });
      }
      console.warn("[tobiifree-helper] socket error", error.message);
      if (!connected) this.startService();
      this.updateStatus({
        state: "service_unavailable",
        message: "Служба Tobii недоступна, пробую запустить",
        lastError: error.message,
        deviceFound: false
      });
    });
    socket.on("close", () => {
      if (this.destroyed) return;
      this.helperReady = false;
      this.resetTarget(true);
      this.rejectPending(new Error("Tobii service disconnected"));
      this.rejectReadyWaiters(new Error("Tobii service disconnected"));
      this.scheduleReconnect("socket closed");
    });
    socket.connect(this.socketPath);
  }

  private startService (force = false) {
    const now = Date.now();
    if (!force && now - this.lastServiceStartAt < SERVICE_START_COOLDOWN_MS) return;
    this.lastServiceStartAt = now;
    const helperPath = app.isPackaged
      ? resolveExtraResource("bin", "tobiifree-helper", "index.mjs")
      : join(__dirname, "..", "tools", "tobiifree-helper", "index.mjs");
    const command = process.env.TOBIIFREE_HELPER_COMMAND || process.execPath;
    const args = process.env.TOBIIFREE_HELPER_COMMAND ? [] : [helperPath, "--service", "--socket", this.socketPath];
    const env = process.env.TOBIIFREE_HELPER_COMMAND
      ? { ...process.env, TOBIIFREE_SERVICE_SOCKET: this.socketPath }
      : { ...process.env, ELECTRON_RUN_AS_NODE: "1", TOBIIFREE_SERVICE_SOCKET: this.socketPath };

    this.updateStatus({ state: "service_starting", message: "Запуск фоновой службы Tobii", deviceFound: false });
    const child = spawn(command, args, {
      env,
      detached: true,
      stdio: "ignore"
    });
    this.process = child;
    child.unref();
    child.on("error", (error) => {
      this.updateStatus({
        state: "service_unavailable",
        message: "Не удалось запустить службу Tobii",
        lastError: error.message,
        deviceFound: false
      });
      console.warn("[tobiifree-helper] failed to start service", error);
    });
    child.on("exit", (code, signal) => {
      if (this.destroyed) return;
      console.warn("[tobiifree-helper] service exited", { code, signal });
      if (!this.helperReady) {
        this.updateStatus({
          state: "service_unavailable",
          message: "Служба Tobii завершилась до подключения",
          lastError: `exit ${code ?? signal ?? "unknown"}`,
          deviceFound: false
        });
      }
    });
  }

  private scheduleReconnect (reason: string) {
    if (this.destroyed || this.reconnectTimer) return;
    this.reconnectAttempt += 1;
    const delay = Math.min(SERVICE_RECONNECT_MAX_MS, 500 * this.reconnectAttempt);
    this.updateStatus({
      state: "reconnecting",
      message: "Переподключение к Tobii",
      reconnectAttempt: this.reconnectAttempt,
      lastError: reason,
      deviceFound: false
    });
    this.startService();
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.connectToService();
    }, delay);
  }

  private onSocketData (data: string) {
    this.buffer += data;
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop() || "";

    for (const line of lines) {
      this.onLine(line.trim());
    }
  }

  private onLine (line: string) {
    if (!line) return;
    if (!line.startsWith("{")) {
      if (line === "invalid") this.resetTarget();
      if (line.startsWith("gaze:")) this.onGaze(line.slice("gaze:".length));
      if (line.startsWith("error:")) console.warn("[tobiifree-helper]", line);
      return;
    }
    this.onJsonLine(line);
  }

  private onJsonLine (line: string) {
    let message: HelperMessage;
    try {
      message = JSON.parse(line) as HelperMessage;
    } catch {
      console.warn("[tobiifree-helper] invalid json", line);
      return;
    }
    if (message.type === "status") {
      const status = this.stripMessageType(message);
      this.updateStatus({ ...status, socketPath: this.socketPath });
      if (status.deviceFound && (status.state === "connected" || status.state === "tracking")) {
        this.maybeAutoApplySavedCalibration();
      }
      return;
    }
    if (message.type === "gaze") {
      this.updateStatus({ lastGazeAt: message.timestamp || Date.now(), deviceFound: true });
      this.onGaze(`${message.x},${message.y}`);
      return;
    }
    if (message.type === "invalid") {
      this.resetTarget();
      return;
    }
    if (message.type === "diagnostic") {
      if (message.level === "error") console.warn("[tobiifree-helper]", message.message, message.data);
      return;
    }
    if (message.type !== "response" || message.id === undefined) return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    clearTimeout(pending.timer);
    if (message.ok) {
      if (message.status) this.updateStatus({ ...this.stripMessageType(message.status), socketPath: this.socketPath });
      pending.resolve(message.blobBase64);
      return;
    }
    pending.reject(new Error(message.error || "TobiiFree helper command failed"));
  }

  private sendCommand (command: string, payload: Record<string, unknown> = {}, timeoutMs = 10000) {
    return this.waitForHelperReady(timeoutMs).then(() => {
      if (!this.socket || this.socket.destroyed || !this.socket.writable) {
        return Promise.reject(new Error("Tobii service is not running"));
      }

      const id = this.requestId++;
      const message = JSON.stringify({ id, command, ...payload }) + "\n";
      return new Promise<string | undefined>((resolve, reject) => {
        const timer = setTimeout(() => {
          this.pending.delete(id);
          reject(new Error(`Tobii service command timed out: ${command}`));
        }, timeoutMs);
        this.pending.set(id, { resolve, reject, timer });
        this.socket?.write(message, (error) => {
          if (!error) return;
          this.pending.delete(id);
          clearTimeout(timer);
          reject(error);
        });
      });
    });
  }

  private writeSocketCommand (payload: Record<string, unknown>) {
    if (!this.socket || this.socket.destroyed || !this.socket.writable) return;
    this.socket.write(`${JSON.stringify(payload)}\n`);
  }

  private waitForHelperReady (timeoutMs: number) {
    if (this.helperReady) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.readyWaiters = this.readyWaiters.filter((waiter) => waiter.timer !== timer);
        reject(new Error("Tobii service is not ready. Check that Tobii service can start."));
      }, timeoutMs);
      this.readyWaiters.push({ resolve, reject, timer });
    });
  }

  private resolveReadyWaiters () {
    for (const waiter of this.readyWaiters) {
      clearTimeout(waiter.timer);
      waiter.resolve();
    }
    this.readyWaiters = [];
  }

  private rejectReadyWaiters (error: Error) {
    for (const waiter of this.readyWaiters) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
    this.readyWaiters = [];
  }

  private rejectPending (error: Error) {
    for (const [, request] of this.pending) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    this.pending.clear();
  }

  private updateStatus (patch: Partial<TobiiStatus>) {
    this.status = {
      ...this.status,
      ...patch,
      mode: patch.mode || "socket-service",
      socketPath: this.socketPath,
      updatedAt: Date.now()
    };
    this.emit("status", this.status);
  }

  private stripMessageType (status: Partial<TobiiStatus> & { type?: string }) {
    const safeStatus = { ...status };
    delete safeStatus.type;
    return safeStatus;
  }

  private maybeAutoApplySavedCalibration () {
    const now = Date.now();
    if (now - this.lastAutoApplyAt < 10000) return;
    this.lastAutoApplyAt = now;
    void this.applySavedCalibration().catch((error) => console.warn("[tobiifree-helper] could not auto-apply saved calibration", error));
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
    this.emitDebugState(rawPoint, normalizedPoint, point, index);
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

  private emitDebugState (raw: GazePoint, normalized: GazePoint, point: GazePoint, hitIndex: number) {
    const now = Date.now();
    if (!this.debugEnabled || now - this.lastDebugAt < 250) return;
    this.lastDebugAt = now;
    this.emit("debug", {
      raw,
      normalized,
      screen: point,
      screenRect: this.screenRect,
      boundsCount: this.bounds.length,
      hitIndex,
      softwareCalibration: !!this.softwareCalibration
    });
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

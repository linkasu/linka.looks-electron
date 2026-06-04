export type NativeTobiiRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type NativeTobiiPoint = {
  x: number;
  y: number;
};

export type NativeTobiiDebugState = {
  raw: NativeTobiiPoint;
  normalized: NativeTobiiPoint;
  screen: NativeTobiiPoint;
  screenRect: NativeTobiiRect;
  boundsCount: number;
  hitIndex: number;
  softwareCalibration: boolean;
};

export type NativeTobiiEvent =
  | { type: "ready" }
  | { type: "enter", index: number }
  | { type: "exit" }
  | { type: "click", index: number, count: number }
  | { type: "debug", state: NativeTobiiDebugState }
  | { type: "error", code: string, message: string };

export class NativeTobiiTracker {
  constructor(listener: (event: NativeTobiiEvent) => void);

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

  _emitTestGaze(x: number, y: number): void;
}

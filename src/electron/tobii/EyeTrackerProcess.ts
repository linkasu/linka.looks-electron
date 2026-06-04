export interface EyeTrackerBound {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EyeTrackerDebugState {
  raw: { x: number, y: number };
  normalized: { x: number, y: number };
  screen: { x: number, y: number };
  screenRect: { x: number, y: number, width: number, height: number };
  boundsCount: number;
  hitIndex: number;
  softwareCalibration: boolean;
}

export interface EyeTrackerProcess {
  on(event: "enter", listener: (index: number) => void): this;
  on(event: "exit", listener: () => void): this;
  on(event: "click", listener: (index: number, count: number) => void): this;
  on(event: "debug", listener: (state: EyeTrackerDebugState) => void): this;
  setBounds(bounds: EyeTrackerBound[]): void;
  setTimeout(value: number): void;
  setScaleFactor?(value: number): void;
  setScreenRect?(x: number, y: number, width: number, height: number): void;
  setDebugEnabled?(value: boolean): void;
  initialize?(): Promise<void>;
  startCalibration?(): Promise<void>;
  addCalibrationPoint?(x: number, y: number): Promise<void>;
  finishCalibration?(): Promise<void>;
  applySavedCalibration?(): Promise<boolean>;
  destroy(): void;
}

// tobiifree-sdk-ts — TypeScript SDK for the Tobii ET5 eye tracker.

export { Tobii } from './tobii.ts';
export type { UsbOptions, DaemonOptions } from './tobii.ts';

export type { Source, Unsubscribe } from './source.ts';
export { UsbSource } from './usb_source.ts';
export type { UsbSourceOptions } from './usb_source.ts';
export { WsSource } from './ws_source.ts';

export type { Transport } from './transport.ts';

export type {
  Vec2, Vec3, GazeSample, RawGazeColumn, GazeColumnKind,
  DisplayArea, DisplayRect, TtpFrame,
} from './protocol.ts';
export { GAZE_COLUMN_LABELS } from './protocol.ts';
export { buildTtpFrameBytes } from './core.ts';

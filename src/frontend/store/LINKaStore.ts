import { ConfigFile, SetPage } from "@/common/interfaces/ConfigFile";
import type { TelemetryConsent } from "@/frontend/utils/TelemetryConsent";
import type { TypingLayout } from "@/common/typingLayout";

interface KeyMap {
  up: string[];
  down: string[];
  left: string[];
  right: string[];
  enter: string[];
}
export type Side = keyof KeyMap;
export type PageTurnMode = "hidden" | "mouseOnly" | "mouseAndEyes";
export type DwellIndicatorMode = "inward" | "circle";
export type SetLoadRequest = string | { file: string; owner: number; withEditor?: boolean };
export interface LINKaStore {
  setLoadRevision: number;
  pcHash: string;
  telemetryConsent: TelemetryConsent;
  popupVersion: number;
  defaultSetsDownloaded: number;
  firstCalibrate: boolean;
  colors: {
    primary: string;
    accent: string;
    secondary: string;
  };
  voiceRu: string;
  voiceEn: string;
  typingLayout: TypingLayout;

  keyMapping: KeyMap;
  selectedKey?: Side;
  button: {
    timeout: number;
    dwellIndicator: DwellIndicatorMode;
    eyeSelect: boolean;
    eyeActivation: boolean;
    joystickActivation: boolean;
    keyboardActivation: boolean;
    mouseActivation: boolean;
    pageTurnMode: PageTurnMode;
    borders: number;
    enabled: boolean;
    clickSound: boolean;
    animation: boolean;
    multiplyScale: boolean;
  };
  ui: {
    gazeSuspended: boolean;
    gazeSuspensions: { tools: boolean; updater: boolean };
    disabled: boolean;
    outputLine: boolean;
    exitButton: boolean;
  };
  editor: {
    current: string;
    temp: string;
    pages: SetPage[];
    page: number;
    quizAutoNext: boolean;
    quizReadQuestion: boolean;
    isDirectSet: boolean;
    isWithoutSpace: boolean;
    description?: string;
    cleanSnapshot?: string;
  };
  layoutSettings: {
    isOpened: boolean;
    hasChanges: boolean;
    fontSize: number;
    fontBold: boolean;
  };
  explorer: {
    config?: ConfigFile;
    page: number;
  };
}

import { ConfigFile, SetPage } from "@/common/interfaces/ConfigFile";
import type { TelemetryConsent } from "@/frontend/utils/TelemetryConsent";

interface KeyMap {
    up: string[]
    down: string[]
    left: string[]
    right: string[]
    enter: string[]
}
export type Side = keyof KeyMap
export type PageTurnMode = "mouseOnly" | "mouseAndEyes"
export interface LINKaStore {
    pcHash: string,
    telemetryConsent: TelemetryConsent,
    popupVersion: number
    defaultSetsDownloaded: number
    firstCalibrate: boolean
    colors: {
        primary: string,
        accent: string,
        secondary: string
    }
    voiceRu: string,
    voiceEn: string,

    keyMapping: KeyMap
    selectedKey?: Side;
    button: {
        timeout: number,
        eyeSelect: boolean,
        eyeActivation: boolean,
        joystickActivation: boolean,
        keyboardActivation: boolean,
        mouseActivation: boolean,
        pageTurnMode: PageTurnMode,
        borders: number;
        enabled: boolean;
        clickSound: boolean;
        animation: boolean,
        multiplyScale: boolean
    },
    ui: {
        disabled: boolean,
        outputLine: boolean,
        exitButton: boolean
    }
    editor: {
        current: string,
        temp: string,
        pages: SetPage[],
        page: number,
        quizAutoNext: boolean,
        quizReadQuestion: boolean;
        isDirectSet: boolean;
        isWithoutSpace: boolean;
        description?: string;
    }
    layoutSettings: {
        isOpened: boolean;
        hasChanges: boolean;
        fontSize: number;
        fontBold: boolean;
    }
    explorer: {
        config?: ConfigFile
        page: number
    }
}

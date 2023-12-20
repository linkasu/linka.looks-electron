import { Card, ConfigFile } from "@/common/interfaces/ConfigFile";

interface KeyMap {
    up: string[]
    down: string[]
    left: string[]
    right: string[]
    enter: string[]
}
export type Side = keyof KeyMap
export interface LINKaStore {
    pcHash: string,
    popupVersion: number
    defaultSetsDownloaded: number
    firstCalibrate: boolean
    colors: {
        primary: string,
        accent: string,
        secondary: string
    }
    voice: string,

    keyMapping: KeyMap
    selectedKey?: Side;
    button: {
        timeout: number,
        eyeSelect: boolean,
        eyeActivation: boolean,
        joystickActivation: boolean,
        keyboardActivation: boolean,
        mouseActivation: boolean,
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
        cards: Card[],
        quiz: boolean,
        questions: string[],
        quizAutoNext: boolean,
        quizReadQuestion: boolean;
        columns: number;
        rows: number;
        isDirectSet: boolean;
        isWithoutSpace: boolean;
        description?: string;
    }
    font: {
        fontSize: number;
        fontBold: boolean;
    }
    explorer:{
        config?: ConfigFile
    }
}

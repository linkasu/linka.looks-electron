import { Card, ConfigFile } from "@/interfaces/ConfigFile"

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
    defaultSetsDownloaded: boolean
    colors: {
        primary: string,
        accent: string,
        secondary: string
    }

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
        clickSound: boolean
    },
    ui: {
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
    explorer:{
        config?: ConfigFile
    }
}
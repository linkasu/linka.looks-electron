import { Card } from "@/interfaces/ConfigFile"

export interface LINKaStore {
    colors: {
        primary: string,
        accent: string,
        secondary: string
    }
    button: {
        timeout: number,
        eyeSelect: boolean,
        eyeActivation: boolean,
        joystickActivation: boolean,
        keyboardActivaton: boolean,
        mouseActivation: boolean,
        borders: number;
        enabled: boolean
    },
    ui: {
        outputLine: boolean
    },
    editor: {
        current: string,
        temp: string,
        cards: Card[],
        columns: number;
        rows: number;
        isDirectSet: boolean;
        isWithoutSpace: boolean
    }
}
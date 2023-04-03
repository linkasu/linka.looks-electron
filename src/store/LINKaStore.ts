import { Card } from "@/interfaces/ConfigFile"

export interface LINKaStore{
    button :{
        timeout: number,
        enabled: boolean    
    },
    ui:{
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
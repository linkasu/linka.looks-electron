import { ConfigFile } from "@/interfaces/ConfigFile";
import { Directory } from "@/interfaces/Directory";


export abstract class ICloudStorage{
    abstract getFiles(path:string): Promise<(Directory | null)>;
    abstract getConfigFile(path: string) :ConfigFile| null| Promise<ConfigFile| null>;
    abstract getDefaultImage(path: string):Buffer| null|Promise<Uint8Array| null>;
    abstract getImage(path: string, entry: string):Buffer| null|Promise<Uint8Array| null>;
    abstract getAudio(path: string, entry: string):Buffer| null|Promise<Uint8Array| null>;
}
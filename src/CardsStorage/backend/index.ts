import { ipcMain, IpcMainEvent, IpcMainInvokeEvent } from "electron";
import { existsSync, mkdirSync, readdirSync, lstatSync, copyFileSync } from "fs";
import { join } from "path";
import { readdir } from "fs/promises";
import AdmZip from "adm-zip";
import { ConfigFile } from "@/interfaces/ConfigFile";
import { Directory } from "@/interfaces/Directory";
import { ICloudStorage } from "../abstract";

const DEFAULT_SETS = join(__dirname, './../extraResources/defaultSets')

const documentsPath = join(require('os').homedir(), 'Documents');
const linkedFolderName = 'LINKa';
const HOME_DIR = join(documentsPath, linkedFolderName);
export class CardsStorage extends ICloudStorage {
    constructor() {
        super()
        this.init()
        ipcMain.handle('storage:getFiles', (_, path) => this.getFiles(path))
        ipcMain.handle('storage:getDefaultImage', (_, path) => this.getDefaultImage(path))
        ipcMain.handle('storage:getConfigFile', (_, path) => this.getConfigFile(path))
        ipcMain.handle('storage:getImage', (_, path, entry) => this.getImage(path, entry))
    }
    init() {

        if (!existsSync(HOME_DIR)) {
            mkdirSync(HOME_DIR);
            this.copyFolderSync(DEFAULT_SETS, HOME_DIR)
        }
    }


    async getFiles(path = ""): Promise<(Directory)>{
        const dir = this.checkPath(path)
        const files = (await readdir(dir)).map((f) => join(dir, f))
        return files.map((file) => {
            if (lstatSync(file).isDirectory()) {

                return {
                    directory: true,
                    set: undefined,
                    file
                }

            } else if (file.endsWith('.linka')) {
                return {
                    directory: false,
                    set: this.getConfigFile(file),
                    file
                }
            }
            return null
        }).filter(f=>f!=null) as Directory
    }

    getConfigFile(path: string) {
        const zip = new AdmZip(this.checkPath(path))
        return JSON.parse(zip.readAsText("config.json")) as ConfigFile
    }

    private checkPath(path: string): string  {
        return path.includes(HOME_DIR) ? path : join(HOME_DIR, path);
    }
    getImage(path: string, entry: string){
        
        const zip = new AdmZip(this.checkPath( path))
        return zip.readFile(entry)
    }

    getDefaultImage(path: string){
        const config = this.getConfigFile(this.checkPath( path))
        const card = config.cards.find((c=>!!c.imagePath))
        if(!card) return null
        const entry = card.imagePath
        if(!entry) return null
        return this.getImage(path, entry)
    }



    copyFolderSync(srcPath: string, destPath: string) {
        mkdirSync(destPath, { recursive: true });
        readdirSync(srcPath).forEach((file: string) => {

            const srcFilePath = join(srcPath, file);
            const destFilePath = join(destPath, file);
            console.log(destFilePath)
            if (lstatSync(srcFilePath).isDirectory()) {
                this.copyFolderSync(srcFilePath, destFilePath);
            } else {
                copyFileSync(srcFilePath, destFilePath);
            }
        });
    };
}


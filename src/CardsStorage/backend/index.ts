import { BrowserWindow, dialog, ipcMain, IpcMainEvent, IpcMainInvokeEvent } from "electron";
import { existsSync, mkdirSync, readdirSync, lstatSync, copyFileSync } from "fs";
import { join, basename, extname } from "path";
import { readdir, unlink, copyFile, readFile } from "fs/promises";
import { tmpdir } from "os";
import { uuid } from "uuidv4";
import AdmZip from "adm-zip";
import { ConfigFile } from "@/interfaces/ConfigFile";
import { Directory } from "@/interfaces/Directory";
import { ICloudStorage } from "../abstract";
import { appendZip } from "@/utils/addToZip";
import { UltimateTextToImage } from "ultimate-text-to-image";
import { tts } from "@/utils/TTSServer";
import delay from "delay";

const DEFAULT_SETS = join(__dirname, './../extraResources/defaultSets')

const documentsPath = join(require('os').homedir(), 'Documents');
const linkedFolderName = 'LINKa';
const HOME_DIR = join(documentsPath, linkedFolderName);
let win: BrowserWindow | null = null;

export class CardsStorage extends ICloudStorage {

    constructor() {
        super()
        this.init()
        ipcMain.handle('storage:getFiles', (_, path) => this.getFiles(path))
        ipcMain.handle('storage:getDefaultImage', (_, path) => this.getDefaultImage(path))
        ipcMain.handle('storage:getConfigFile', (_, path) => this.getConfigFile(path))
        ipcMain.handle('storage:moveToTrash', (_, path) => this.moveToTrash(path))
        ipcMain.handle('storage:getImage', (_, path, entry) => this.getImage(path, entry))
        ipcMain.handle('storage:getAudio', (_, path, entry) => this.getAudio(path, entry))
        ipcMain.handle('storage:copyToTemp', (_, path) => this.copyToTemp(path))
        ipcMain.handle('storage:defaultToTemp', (_, path) => this.defaultToTemp(path))
        ipcMain.handle('storage:createImageFromText', (_, path, text) => this.createImageFromText(path, text))
        ipcMain.handle('storage:createAudioFromText', (_, path, text, voice) => this.createAudioFromText(path, text, voice))
        ipcMain.handle('storage:saveSet', (_, path, location, config) => this.saveSet(path, location, config))
        ipcMain.handle('storage:selectImage', (_, path) => {
            win = BrowserWindow.fromWebContents(_.sender)

            return this.selectImage(path)
        })
        ipcMain.handle('storage:selectAudio', (_, path) => {
            win = BrowserWindow.fromWebContents(_.sender)

            return this.selectAudio(path)
        })
    }
    init() {

        if (!existsSync(HOME_DIR)) {
            mkdirSync(HOME_DIR);
            this.copyFolderSync(DEFAULT_SETS, HOME_DIR)
        }
    }


    async getFiles(path = ""): Promise<(Directory)> {
        const dir = this.checkPath(path)
        const files = (await readdir(dir)).map((f) => join(dir, f))
        return files.map((file) => {
            try {

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

            } catch (error) {
                return null
            }
            return null
        }).filter(f => f != null) as Directory
    }

    getConfigFile(path: string) {
        const zip = new AdmZip(this.checkPath(path))
        return JSON.parse(zip.readAsText("config.json")) as ConfigFile
    }

    private checkPath(path: string): string {
        return (path.includes(HOME_DIR) || path.includes(tmpdir()) ? path : join(HOME_DIR, path)).replace(/§/g, '/');
    }
    getImage(path: string, entry: string) {

        return this.getBuffer(path, entry);
    }
    private getBuffer(path: string, entry: string) {
        const zip = new AdmZip(this.checkPath(path));
        return zip.readFile(entry);
    }

    getAudio(path: string, entry: string) {
        return this.getBuffer(path, entry);

    }

    getDefaultImage(path: string) {
        const config = this.getConfigFile(this.checkPath(path))
        const card = config.cards.find((c => !!c.imagePath))
        if (!card) return null
        const entry = card.imagePath
        if (!entry) return null
        return this.getImage(path, entry)
    }

    public moveToTrash(path: string): Promise<void> {
        return unlink(this.checkPath(path))
    }
    public async copyToTemp(path: string): Promise<string> {
        path = this.checkPath(path)
        const tmp = join(tmpdir(), basename(path));
        await copyFile(path, tmp)
        return tmp
    }

    public async selectImage(path: string) {

        return this.selectFile(path, 'Изображение', ['png', 'jpg', 'jpeg', 'gif'])


    }
    selectAudio(path: string): Promise<string | null> {
        return this.selectFile(path, 'Звук', ['mp3', 'wav', 'ogg'])

    }
    private async selectFile(path: string, name: string, extensions: string[]) {

        if (!win) {
            return null;
        }
        const res = await dialog
            .showOpenDialog(win, {
                filters: [
                    {
                        name,
                        extensions
                    }
                ]
            })
        if (res.canceled) return null;
        path = this.checkPath(path)

        return this.adddFile(path, res.filePaths[0])
    }

    async createAudioFromText(path: string, text: string, voice: string): Promise<string | null> {
        const buff = await tts(text, voice)
        return this.addBuffer(path, buff, '.mp3')
    }

    createImageFromText(path: string, text: string): Promise<string | null> {
        const buffer = new UltimateTextToImage(text,
            {
                width: 400,
                maxWidth: 1000,
                maxHeight: 1000,
                fontFamily: "Arial",
                fontColor: "#000",
                fontSize: 72,
                minFontSize: 10,
                lineHeight: 50,
                autoWrapLineHeightMultiplier: 1.2,
                margin: 20,
                marginBottom: 40,
                align: "center",
                valign: "middle",
            })
            .render()
            .toBuffer('image/png')
        return this.addBuffer(path, buffer, '.png')
    }

    async defaultToTemp(path: string): Promise<string> {
        path = this.checkPath(path)
        const tmp = join(tmpdir(), basename(path));
        const config: ConfigFile = {
            columns: 3,
            rows: 3,
            cards: [],
            withoutSpace: false,
            directSet: false,
            version: '2.0'
        }
        const json = JSON.stringify(config)
        await this.addBuffer(tmp, Buffer.from(json), 'json', 'config')
        await delay(300)

        return tmp;
    }


    async saveSet(path: string, location: string, config: ConfigFile): Promise<void> {
        path = this.checkPath(path)
        location = this.checkPath(location)
        await this.cleanFile(path, config)
        await delay(500)

        const json = JSON.stringify(config)
        await this.addBuffer(path, Buffer.from(json), 'json', 'config')
        await delay(500)
        await copyFile(path, location)
    }
    cleanFile(path: string, config: ConfigFile) {
        const paths = []
        for (const card of config.cards) {
            if (card.cardType === 0) {
                paths.push(card.audioPath)
                paths.push(card.imagePath)
            }
        }
        const zip = new AdmZip(path)
        const entries = zip.getEntries()
        for (const entry of entries) {
            if (!paths.includes(entry.name)) {
                zip.deleteFile(entry)
            }
        }

        return zip.writeZipPromise()

    }

    private async adddFile(path: string, file: string) {
        const buff = await readFile(file)
        path = this.checkPath(path)
        const ext = extname(file)

        return this.addBuffer(path, buff, ext);
    }

    async addBuffer(path: string, buff: Buffer, ext: string, name?: string) {
        if (!name) name = uuid();
        // const zip = new AdmZip(path)
        // zip.addFile(name+'.'+ext, buff);
        // await zip.writeZipPromise()
        const file = name + '.' + ext!
        await appendZip(path, async (a) => {
            a.append(buff, {
                name: file
            })
        })
        return file
    }

    private copyFolderSync(srcPath: string, destPath: string) {
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

